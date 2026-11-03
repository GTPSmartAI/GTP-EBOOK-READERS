package br.com.iagtp.ebook;

import android.content.Context;
import android.content.res.AssetManager;
import android.os.SystemClock;
import android.util.Log;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Gera a voz no próprio celular: modelos Piper (VITS) rodando no processador pelo sherpa-onnx.
 *
 * - Os modelos ficam dentro do APK (assets/tts/<voz>/model.onnx) e são lidos direto de lá.
 *   A fonética (espeak-ng) precisa de arquivos de verdade: é copiada uma vez para a memória do app.
 * - Um trecho por vez, numa fila com prioridade: o trecho que vai tocar agora (urgent) passa na frente
 *   do pré-carregamento. Pedido igual a um que já está na fila não é gerado de novo.
 * - Cada trecho vira um WAV no cache do app. O mesmo texto na mesma voz não é gerado duas vezes,
 *   nem depois de fechar o app (até o cache passar de CACHE_MAX_BYTES; os mais antigos saem).
 */
final class LocalTtsEngine {
    private static final String TAG = "LocalTts";

    interface Listener {
        void onDone(File wav, long durationMs, boolean cached);

        void onError(String message);
    }

    private static final String ASSETS_DIR = "tts";
    private static final String ESPEAK_DIR = "espeak-ng-data";
    // Sobe quando o espeak-ng-data dentro do APK mudar (força copiar de novo)
    // (precisa de todos os dicionários: o português troca sozinho para o inglês, e sem o en_dict o espeak encerra o app)
    private static final String ESPEAK_VERSION = "1.13.8-completo";
    // Vozes carregadas ao mesmo tempo (o modo teatro usa até 3: narração, falas e colchetes)
    private static final int MAX_ENGINES = 3;
    private static final long CACHE_MAX_BYTES = 400L * 1024 * 1024;
    private static final long CACHE_TARGET_BYTES = 300L * 1024 * 1024;
    // Volume: cada trecho é levado ao mesmo pico (algumas vozes saem bem mais baixas), sem amplificar ruído demais
    private static final float TARGET_PEAK = 0.89f;
    private static final float MAX_GAIN = 6f;

    private static final class Request {
        final String id;
        final Listener listener;

        Request(String id, Listener listener) {
            this.id = id;
            this.listener = listener;
        }
    }

    private static final class Job {
        final String key;
        final String text;
        final String model;
        final float lengthScale;
        final long seq;
        long urgentSeq = -1; // >= 0: urgente, na ordem em que virou urgente
        final List<Request> requests = new ArrayList<>();

        Job(String key, String text, String model, float lengthScale, long seq) {
            this.key = key;
            this.text = text;
            this.model = model;
            this.lengthScale = lengthScale;
            this.seq = seq;
        }
    }

    private final Context context;
    private final AssetManager assets;
    private final File cacheDir;
    private final int numThreads;

    private final Object lock = new Object();
    private final List<Job> queue = new ArrayList<>();
    private final Map<String, Job> jobsByKey = new HashMap<>();
    private final Map<String, Job> jobsById = new HashMap<>();
    private Job running = null;
    private long seqCounter = 0;
    private Thread worker = null;

    // Só a thread de geração mexe nos modelos carregados
    private final LinkedHashMap<String, OfflineTts> engines = new LinkedHashMap<>(4, 0.75f, true);
    private int generatedSinceCleanup = 0;

    // Desempenho (Configurações > Motor de voz)
    private volatile long statsCount = 0;
    private volatile double statsAudioSeconds = 0;
    private volatile double statsComputeSeconds = 0;
    private volatile double lastRealtimeFactor = 0;
    private volatile long lastLoadMs = 0;
    private volatile long failures = 0;
    private volatile String lastError = null;

    LocalTtsEngine(Context context) {
        this.context = context.getApplicationContext();
        this.assets = this.context.getAssets();
        this.cacheDir = new File(this.context.getCacheDir(), "tts-audio");
        //noinspection ResultOfMethodCallIgnored
        cacheDir.mkdirs();
        int cores = Runtime.getRuntime().availableProcessors();
        // Celulares com 8 núcleos: 4 threads nos núcleos rápidos; mais que isso não acelera (medido no PC: 2 -> 4 threads +6%)
        this.numThreads = cores >= 8 ? 4 : Math.max(1, Math.min(2, cores));
    }

    /** Vozes que vieram dentro do APK (pastas em assets/tts com model.onnx) */
    List<String> availableModels() {
        List<String> models = new ArrayList<>();
        try {
            String[] dirs = assets.list(ASSETS_DIR);
            if (dirs == null) return models;
            for (String dir : dirs) {
                if (ESPEAK_DIR.equals(dir)) continue;
                String[] files = assets.list(ASSETS_DIR + "/" + dir);
                if (files != null && Arrays.asList(files).contains("model.onnx")) models.add(dir);
            }
        } catch (IOException e) {
            Log.w(TAG, "Não foi possível listar as vozes", e);
        }
        return models;
    }

    private String resolveModel(String model) {
        if ("pt-BR-FranciscaNeural".equals(model) || "azure-francisca".equals(model)) {
            return "pt_BR-dii-high";
        }
        if ("pt-BR-AntonioNeural".equals(model) || "azure-antonio".equals(model)) {
            return "pt_BR-miro-high";
        }
        if ("pt-BR-ThalitaMultilingualNeural".equals(model) || "azure-thalita".equals(model)) {
            return "pt_BR-dii-high";
        }
        return model;
    }

    private static String normalizeText(String text) {
        if (text == null || text.isEmpty()) return "";
        String s = text.trim();
        s = s.replaceAll("[\"“”«»]", "");
        s = s.replaceAll("[\\[\\]『』【】]", " ");
        s = s.replaceAll("([.?!…])\\s*([.?!…])+", "$1");
        s = s.replaceAll("(\\w)\\s*(\\.{3,}|…)\\s*(\\w)", "$1, $3");
        s = s.replaceAll("(\\.{3,}|…)\\s*$", ".");
        s = s.replaceAll("^[—–-]\\s*", "");
        s = s.replaceAll("\\s*[—–]\\s*", ", ");
        s = s.replaceAll("([.?!;:])\\s*,", "$1");
        s = s.replaceAll("([,;:])([^\\s\\d])", "$1 $2");
        s = s.replaceAll("^,\\s*", "");
        s = s.replaceAll(",\\s*,+", ",");
        s = s.replaceAll("\\s+", " ");
        return s.trim();
    }

    void synthesize(String id, String text, String model, float lengthScale, boolean urgent, Listener listener) {
        String resolvedModel = resolveModel(model);
        String cleanText = normalizeText(text);
        if (cleanText.isEmpty()) cleanText = text;
        String key = cacheKey(resolvedModel, lengthScale, cleanText);
        File out = new File(cacheDir, key + ".wav");
        if (out.exists() && out.length() > 44) {
            //noinspection ResultOfMethodCallIgnored
            out.setLastModified(System.currentTimeMillis());
            listener.onDone(out, wavDurationMs(out), true);
            return;
        }
        synchronized (lock) {
            Job job = jobsByKey.get(key);
            if (job == null) {
                job = new Job(key, cleanText, resolvedModel, lengthScale, seqCounter++);
                jobsByKey.put(key, job);
                queue.add(job);
            }
            if (urgent && job.urgentSeq < 0) job.urgentSeq = seqCounter++;
            job.requests.add(new Request(id, listener));
            jobsById.put(id, job);
            ensureWorker();
            lock.notifyAll();
        }
    }

    /** O trecho pedido no pré-carregamento vai tocar agora: passa na frente da fila */
    void promote(String id) {
        synchronized (lock) {
            Job job = jobsById.get(id);
            if (job != null && job.urgentSeq < 0) job.urgentSeq = seqCounter++;
        }
    }

    /** Desiste dos pedidos (pausa, salto, troca de voz). Trecho que já está sendo gerado termina e fica no cache. */
    void cancel(List<String> ids) {
        List<Request> cancelled = new ArrayList<>();
        synchronized (lock) {
            for (String id : ids) {
                Job job = jobsById.remove(id);
                if (job == null) continue;
                Iterator<Request> it = job.requests.iterator();
                while (it.hasNext()) {
                    Request r = it.next();
                    if (r.id.equals(id)) {
                        cancelled.add(r);
                        it.remove();
                    }
                }
                if (job.requests.isEmpty() && job != running) {
                    queue.remove(job);
                    jobsByKey.remove(job.key);
                }
            }
        }
        for (Request r : cancelled) r.listener.onError("cancelado");
    }

    void cancelAll() {
        List<String> ids;
        synchronized (lock) {
            ids = new ArrayList<>(jobsById.keySet());
        }
        cancel(ids);
    }

    Map<String, Object> stats() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("generated", statsCount);
        s.put("audioSeconds", Math.round(statsAudioSeconds));
        s.put("realtimeFactor", statsComputeSeconds > 0 ? Math.round(statsAudioSeconds / statsComputeSeconds * 10) / 10.0 : 0);
        s.put("lastRealtimeFactor", Math.round(lastRealtimeFactor * 10) / 10.0);
        s.put("lastLoadMs", lastLoadMs);
        s.put("failures", failures);
        s.put("lastError", lastError);
        s.put("threads", numThreads);
        s.put("cores", Runtime.getRuntime().availableProcessors());
        synchronized (lock) {
            s.put("queued", queue.size());
        }
        s.put("cacheBytes", cacheBytes());
        return s;
    }

    void clearCache() {
        File[] files = cacheDir.listFiles();
        if (files == null) return;
        for (File f : files) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    // ------------------------------------------------------------------ fila

    private void ensureWorker() {
        if (worker != null) return;
        worker = new Thread(this::workLoop, "aedolia-tts");
        // Abaixo da interface, mas acima do normal: a voz não pode atrasar enquanto a tela rola
        worker.setPriority(Thread.NORM_PRIORITY + 1);
        worker.start();
    }

    /** Urgentes primeiro (na ordem em que ficaram urgentes); depois o pré-carregamento, na ordem de chegada */
    private Job nextJob() {
        Job best = null;
        for (Job j : queue) {
            if (best == null) {
                best = j;
            } else if ((j.urgentSeq >= 0) != (best.urgentSeq >= 0)) {
                if (j.urgentSeq >= 0) best = j;
            } else if (j.urgentSeq >= 0 ? j.urgentSeq < best.urgentSeq : j.seq < best.seq) {
                best = j;
            }
        }
        return best;
    }

    private void workLoop() {
        cleanupCache();
        while (true) {
            Job job;
            synchronized (lock) {
                while (queue.isEmpty()) {
                    try {
                        lock.wait();
                    } catch (InterruptedException e) {
                        return;
                    }
                }
                job = nextJob();
                queue.remove(job);
                running = job;
            }

            File out = new File(cacheDir, job.key + ".wav");
            String error = null;
            long durationMs = 0;
            try {
                durationMs = generate(job, out);
            } catch (Throwable t) {
                failures++;
                error = t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName();
                lastError = error;
                Log.e(TAG, "Falha ao gerar a voz " + job.model, t);
            }

            List<Request> done;
            synchronized (lock) {
                running = null;
                jobsByKey.remove(job.key);
                done = new ArrayList<>(job.requests);
                for (Request r : done) jobsById.remove(r.id);
            }
            for (Request r : done) {
                if (error == null) r.listener.onDone(out, durationMs, false);
                else r.listener.onError(error);
            }

            if (++generatedSinceCleanup >= 40) {
                generatedSinceCleanup = 0;
                cleanupCache();
            }
        }
    }

    // ------------------------------------------------------------------ geração

    private long generate(Job job, File out) throws IOException {
        OfflineTts tts = engine(job.model);
        long start = SystemClock.elapsedRealtime();
        // speed = 1 / length_scale (length_scale > 1 fala mais devagar)
        GeneratedAudio audio = tts.generate(job.text, 0, 1f / Math.max(0.5f, job.lengthScale));
        float[] samples = audio.getSamples();
        int sampleRate = audio.getSampleRate();
        if (samples == null || samples.length == 0) throw new IOException("A voz não gerou áudio para este trecho");
        double compute = (SystemClock.elapsedRealtime() - start) / 1000.0;
        double seconds = samples.length / (double) sampleRate;

        normalize(samples);
        File tmp = new File(cacheDir, job.key + ".tmp");
        writeWav(tmp, samples, sampleRate);
        if (!tmp.renameTo(out)) throw new IOException("Não foi possível salvar o áudio gerado");

        statsCount++;
        statsAudioSeconds += seconds;
        statsComputeSeconds += compute;
        lastRealtimeFactor = compute > 0 ? seconds / compute : 0;
        return Math.round(seconds * 1000);
    }

    private OfflineTts engine(String model) throws IOException {
        OfflineTts tts = engines.get(model);
        if (tts != null) return tts;

        String base = ASSETS_DIR + "/" + model;
        String[] files = assets.list(base);
        if (files == null || !Arrays.asList(files).contains("model.onnx")) {
            throw new IOException("A voz " + model + " não está instalada neste aplicativo");
        }
        File espeak = ensureEspeakData();

        long start = SystemClock.elapsedRealtime();
        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(base + "/model.onnx");
        vits.setTokens(base + "/tokens.txt");
        vits.setDataDir(espeak.getAbsolutePath());
        vits.setLexicon("");
        vits.setDictDir("");

        OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
        modelConfig.setVits(vits);
        modelConfig.setNumThreads(numThreads);
        modelConfig.setDebug(false);
        modelConfig.setProvider("cpu");

        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(modelConfig);

        // Modelo lido de dentro do APK (assets); a fonética, da cópia em arquivos
        tts = new OfflineTts(assets, config);
        lastLoadMs = SystemClock.elapsedRealtime() - start;

        engines.put(model, tts);
        while (engines.size() > MAX_ENGINES) {
            Iterator<Map.Entry<String, OfflineTts>> it = engines.entrySet().iterator();
            Map.Entry<String, OfflineTts> eldest = it.next();
            it.remove();
            try {
                eldest.getValue().release();
            } catch (Throwable ignored) {
            }
        }
        return tts;
    }

    /** O espeak-ng lê os dados do disco: copia de dentro do APK uma vez (e de novo se a versão mudar) */
    private File ensureEspeakData() throws IOException {
        File dir = new File(context.getFilesDir(), ESPEAK_DIR);
        File marker = new File(dir, ".versao");
        if (marker.exists() && ESPEAK_VERSION.equals(readSmall(marker))) return dir;
        deleteRecursive(dir);
        copyAssetDir(ASSETS_DIR + "/" + ESPEAK_DIR, dir);
        try (OutputStream os = new FileOutputStream(marker)) {
            os.write(ESPEAK_VERSION.getBytes(StandardCharsets.UTF_8));
        }
        return dir;
    }

    private void copyAssetDir(String assetPath, File dest) throws IOException {
        String[] children = assets.list(assetPath);
        if (children == null || children.length == 0) {
            //noinspection ResultOfMethodCallIgnored
            dest.getParentFile().mkdirs();
            try (InputStream in = assets.open(assetPath); OutputStream os = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        dest.mkdirs();
        for (String child : children) copyAssetDir(assetPath + "/" + child, new File(dest, child));
    }

    private static void normalize(float[] samples) {
        float peak = 0;
        for (float v : samples) peak = Math.max(peak, Math.abs(v));
        if (peak < 1e-6f) return;
        float gain = Math.min(MAX_GAIN, TARGET_PEAK / peak);
        for (int i = 0; i < samples.length; i++) {
            samples[i] = Math.max(-1f, Math.min(1f, samples[i] * gain));
        }
    }

    private static void writeWav(File file, float[] samples, int sampleRate) throws IOException {
        int dataBytes = samples.length * 2;
        ByteBuffer buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN);
        buf.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + dataBytes);
        buf.put("WAVE".getBytes(StandardCharsets.US_ASCII));
        buf.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16)
                .putShort((short) 1).putShort((short) 1) // PCM, mono
                .putInt(sampleRate).putInt(sampleRate * 2)
                .putShort((short) 2).putShort((short) 16);
        buf.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(dataBytes);
        for (float v : samples) buf.putShort((short) Math.round(v * 32767f));
        try (OutputStream os = new FileOutputStream(file)) {
            os.write(buf.array());
        }
    }

    private static long wavDurationMs(File file) {
        try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
            byte[] header = new byte[44];
            raf.readFully(header);
            int sampleRate = ByteBuffer.wrap(header, 24, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
            if (sampleRate <= 0) return 0;
            return (file.length() - 44) * 1000 / (sampleRate * 2L);
        } catch (IOException e) {
            return 0;
        }
    }

    // ------------------------------------------------------------------ cache

    private long cacheBytes() {
        long total = 0;
        File[] files = cacheDir.listFiles();
        if (files != null) for (File f : files) total += f.length();
        return total;
    }

    /** Cache acima do limite: apaga os áudios usados há mais tempo */
    private void cleanupCache() {
        File[] files = cacheDir.listFiles();
        if (files == null) return;
        long total = 0;
        for (File f : files) {
            if (f.getName().endsWith(".tmp")) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
                continue;
            }
            total += f.length();
        }
        if (total <= CACHE_MAX_BYTES) return;
        Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (File f : files) {
            if (total <= CACHE_TARGET_BYTES) break;
            long len = f.length();
            if (f.delete()) total -= len;
        }
    }

    private static String cacheKey(String model, float lengthScale, String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] hash = md.digest((model + "|" + lengthScale + "|" + text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString((model + "|" + lengthScale + "|" + text).hashCode());
        }
    }

    private static String readSmall(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] buf = new byte[64];
            int n = in.read(buf);
            return n > 0 ? new String(buf, 0, n, StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            return "";
        }
    }

    private static void deleteRecursive(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
