package br.com.iagtp.ebook;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Serviço em primeiro plano da leitura em voz alta.
 * - Sem ele, o Android congela o app quando a tela apaga e a voz para no fim da frase.
 * - Mostra o player de mídia (notificação e tela de bloqueio): capa, "Livro – Capítulo",
 *   barra de progresso do capítulo e os botões -15s / play / +15s. Os fones Bluetooth também controlam.
 * - Enquanto toca, segura o processador (wake lock) e o Wi-Fi para baixar os próximos áudios.
 */
public class PlaybackService extends Service {

    static final String ACTION_UPDATE = "br.com.iagtp.ebook.playback.UPDATE";
    static final String ACTION_TOGGLE = "br.com.iagtp.ebook.playback.TOGGLE";
    static final String ACTION_BACK = "br.com.iagtp.ebook.playback.BACK";
    static final String ACTION_FORWARD = "br.com.iagtp.ebook.playback.FORWARD";

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_CHAPTER = "chapter";
    static final String EXTRA_PLAYING = "playing";
    static final String EXTRA_POSITION = "positionMs";
    static final String EXTRA_DURATION = "durationMs";
    static final String EXTRA_COVER = "coverUrl";

    // Ações enviadas ao site (BackgroundPlaybackPlugin -> nativePlayback.ts)
    static final String CMD_TOGGLE = "toggle";
    static final String CMD_PLAY = "play";
    static final String CMD_PAUSE = "pause";
    static final String CMD_BACK = "back";
    static final String CMD_FORWARD = "forward";
    static final String CMD_SEEK = "seek";

    private static final String CUSTOM_BACK = "back15";
    private static final String CUSTOM_FORWARD = "forward15";
    private static final String CHANNEL_ID = "leitura";
    private static final int NOTIFICATION_ID = 1001;

    interface Listener {
        void onCommand(String command, long positionMs);
    }

    static Listener listener;
    static boolean running;

    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final ExecutorService coverLoader = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private String title = "";
    private String chapter = "";
    private boolean playing = false;
    private long positionMs = 0;
    private long durationMs = 0;
    private String coverUrl = null;
    private Bitmap cover = null;

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSessionCompat(this, "EbookReadersGTP");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { send(CMD_PLAY, 0); }
            @Override public void onPause() { send(CMD_PAUSE, 0); }
            @Override public void onStop() { send(CMD_PAUSE, 0); }
            @Override public void onRewind() { send(CMD_BACK, 0); }
            @Override public void onFastForward() { send(CMD_FORWARD, 0); }
            // Botões "anterior/próxima" dos fones também voltam/avançam 15s
            @Override public void onSkipToPrevious() { send(CMD_BACK, 0); }
            @Override public void onSkipToNext() { send(CMD_FORWARD, 0); }
            @Override public void onSeekTo(long pos) { send(CMD_SEEK, pos); }
            @Override public void onCustomAction(String action, android.os.Bundle extras) {
                if (CUSTOM_BACK.equals(action)) send(CMD_BACK, 0);
                else if (CUSTOM_FORWARD.equals(action)) send(CMD_FORWARD, 0);
            }
            // Teclas dos fones (Bluetooth ou com fio). "Próxima/anterior" chegam como tecla de mídia; o player não
            // anuncia pular faixa (senão o Android troca os botões -15/+15 da notificação), então são tratadas aqui.
            @Override public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
                KeyEvent key = mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (key != null) {
                    switch (key.getKeyCode()) {
                        case KeyEvent.KEYCODE_MEDIA_NEXT:
                        case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                        case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD:
                        case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD:
                            if (key.getAction() == KeyEvent.ACTION_DOWN && key.getRepeatCount() == 0) send(CMD_FORWARD, 0);
                            return true;
                        case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                        case KeyEvent.KEYCODE_MEDIA_REWIND:
                        case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD:
                        case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD:
                            if (key.getAction() == KeyEvent.ACTION_DOWN && key.getRepeatCount() == 0) send(CMD_BACK, 0);
                            return true;
                        default:
                            break;
                    }
                }
                return super.onMediaButtonEvent(mediaButtonEvent);
            }
        });
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, immutableFlag() | PendingIntent.FLAG_UPDATE_CURRENT));
        session.setActive(true);
    }

    private void send(String command, long pos) {
        if (listener != null) listener.onCommand(command, pos);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_TOGGLE.equals(action)) { send(CMD_TOGGLE, 0); return START_NOT_STICKY; }
        if (ACTION_BACK.equals(action)) { send(CMD_BACK, 0); return START_NOT_STICKY; }
        if (ACTION_FORWARD.equals(action)) { send(CMD_FORWARD, 0); return START_NOT_STICKY; }

        if (intent != null) {
            title = orEmpty(intent.getStringExtra(EXTRA_TITLE));
            chapter = orEmpty(intent.getStringExtra(EXTRA_CHAPTER));
            playing = intent.getBooleanExtra(EXTRA_PLAYING, true);
            positionMs = Math.max(0, intent.getLongExtra(EXTRA_POSITION, 0));
            durationMs = Math.max(0, intent.getLongExtra(EXTRA_DURATION, 0));
            String newCover = intent.getStringExtra(EXTRA_COVER);
            if (newCover != null && !newCover.isEmpty() && !newCover.equals(coverUrl)) {
                coverUrl = newCover;
                cover = null;
                loadCover(newCover);
            }
        }

        ensureChannel();
        updateSession();
        Notification notification = buildNotification();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (Exception e) {
            // Já em primeiro plano: só atualiza a notificação
            notifyNotification(notification);
        }
        running = true;
        setLocks(playing);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        setLocks(false);
        session.setActive(false);
        session.release();
        coverLoader.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ------------------------------------------------------------------ player (MediaSession)

    // O player do sistema mostra o título numa linha só e corta o resto (não dá para fazer o texto correr).
    // Por isso o capítulo fica no título e o livro na linha de baixo: o capítulo aparece mesmo com livro de nome longo.
    private String displayTitle() {
        if (!chapter.isEmpty()) return chapter;
        return title.isEmpty() ? "Aedolia" : title;
    }

    private String displaySubtitle() {
        return chapter.isEmpty() || title.isEmpty() ? "Aedolia" : title;
    }

    private void updateSession() {
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, displayTitle())
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, displayTitle())
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, displaySubtitle())
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, displaySubtitle())
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, title)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (cover != null) meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cover);
        session.setMetadata(meta.build());

        // Posição do capítulo: o sistema anda a barra sozinho a partir daqui enquanto está tocando
        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY
                        | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE
                        | PlaybackStateCompat.ACTION_SEEK_TO
                        | PlaybackStateCompat.ACTION_REWIND
                        | PlaybackStateCompat.ACTION_FAST_FORWARD)
                .addCustomAction(CUSTOM_BACK, "Voltar 15s", R.drawable.ic_player_back15)
                .addCustomAction(CUSTOM_FORWARD, "Avançar 15s", R.drawable.ic_player_forward15)
                .setState(
                        playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        Math.min(positionMs, durationMs > 0 ? durationMs : positionMs),
                        playing ? 1f : 0f,
                        SystemClock.elapsedRealtime())
                .build();
        session.setPlaybackState(state);
    }

    private Notification buildNotification() {
        int flags = immutableFlag() | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent back = PendingIntent.getService(this, 2, new Intent(this, PlaybackService.class).setAction(ACTION_BACK), flags);
        PendingIntent toggle = PendingIntent.getService(this, 1, new Intent(this, PlaybackService.class).setAction(ACTION_TOGGLE), flags);
        PendingIntent forward = PendingIntent.getService(this, 3, new Intent(this, PlaybackService.class).setAction(ACTION_FORWARD), flags);

        // Android 12 ou mais antigo usa estes botões; do 13 em diante o sistema monta o player pela MediaSession
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_player_play)
                .setContentTitle(displayTitle())
                .setContentText(displaySubtitle())
                .setContentIntent(session.getController().getSessionActivity())
                .addAction(R.drawable.ic_player_back15, "Voltar 15s", back)
                .addAction(playing ? R.drawable.ic_player_pause : R.drawable.ic_player_play, playing ? "Pausar" : "Continuar", toggle)
                .addAction(R.drawable.ic_player_forward15, "Avançar 15s", forward)
                .setStyle(new MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (cover != null) builder.setLargeIcon(cover);
        return builder.build();
    }

    private void notifyNotification(Notification notification) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification);
    }

    /** Baixa a capa (URL do MinIO ou data: base64) fora da thread principal */
    private void loadCover(String url) {
        coverLoader.execute(() -> {
            Bitmap bitmap = null;
            try {
                if (url.startsWith("data:")) {
                    byte[] bytes = android.util.Base64.decode(url.substring(url.indexOf(',') + 1), android.util.Base64.DEFAULT);
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                } else {
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(15000);
                    try (InputStream in = conn.getInputStream()) {
                        bitmap = BitmapFactory.decodeStream(in);
                    } finally {
                        conn.disconnect();
                    }
                }
                if (bitmap != null && Math.max(bitmap.getWidth(), bitmap.getHeight()) > 512) {
                    float scale = 512f / Math.max(bitmap.getWidth(), bitmap.getHeight());
                    bitmap = Bitmap.createScaledBitmap(bitmap, Math.round(bitmap.getWidth() * scale), Math.round(bitmap.getHeight() * scale), true);
                }
            } catch (Exception ignored) {
                // Sem capa: o player aparece sem imagem
            }
            final Bitmap loaded = bitmap;
            mainHandler.post(() -> {
                if (loaded == null || !url.equals(coverUrl) || !running) return;
                cover = loaded;
                updateSession();
                notifyNotification(buildNotification());
            });
        });
    }

    // ------------------------------------------------------------------ auxiliares

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    private static int immutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private void setLocks(boolean hold) {
        if (hold) {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ebook:leitura");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ebook:leitura");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        } else {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Leitura em voz alta", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
