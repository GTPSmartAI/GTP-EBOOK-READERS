/**
 * Medição das trocas de trecho durante a leitura (só em desenvolvimento, `npm run dev`).
 * Para cada trecho mostra no console:
 * - de onde veio o áudio (já pré-carregado, pronto no servidor mas baixado na hora, ou gerado na hora)
 * - quanto tempo a leitura ficou parada esperando entre o fim do trecho anterior e o início deste
 * - quanto silêncio vem embutido no começo e no fim do próprio MP3
 * A cada 20 trechos imprime um resumo. `window.__audioDiag()` imprime o resumo na hora.
 */

export const AUDIO_DIAGNOSTICS = import.meta.env.DEV;

export type AudioOrigin =
  | 'pré-carregado'
  | 'pronto no servidor, baixado na hora'
  | 'gerado na hora'
  | 'gerado na hora (início dividido)'
  | 'resto da frase dividida'
  | 'gerado na hora (clique em palavra)';

interface Silence {
  leadMs: number;
  trailMs: number;
  durationMs: number;
}

interface Sample {
  index: number;
  origin: AudioOrigin;
  rate: number;
  waitMs: number | null; // null = começo de leitura (play/salto), não é troca contínua
  leadMs: number | null;
  prevTrailMs: number | null;
  readyAhead: number;
}

const SILENCE_THRESHOLD = 0.01;
const SUMMARY_EVERY = 20;

class AudioDiagnostics {
  private endedAt = 0;
  private plannedPauseMs = 0;
  private prevTrailMs: number | null = null;
  private samples: Sample[] = [];
  private silenceCache = new Map<string, Promise<Silence | null>>();
  private decoder: OfflineAudioContext | null = null;

  constructor() {
    if (AUDIO_DIAGNOSTICS && typeof window !== 'undefined') {
      (window as unknown as { __audioDiag: () => void }).__audioDiag = () => this.printSummary(this.samples);
    }
  }

  /** Um áudio de trecho terminou de tocar */
  markEnded() {
    if (!AUDIO_DIAGNOSTICS) return;
    this.endedAt = performance.now();
    this.plannedPauseMs = 0;
  }

  /** Pausa proposital entre parágrafos (não conta como engasgo) */
  setPlannedPause(ms: number) {
    if (!AUDIO_DIAGNOSTICS) return;
    this.plannedPauseMs = ms;
  }

  /** Leitura parou/foi interrompida pelo usuário: a próxima troca não é contínua */
  reset() {
    this.endedAt = 0;
    this.plannedPauseMs = 0;
    this.prevTrailMs = null;
  }

  track(audio: HTMLAudioElement, url: string, info: { index: number; origin: AudioOrigin; rate: number; readyAhead: number }) {
    if (!AUDIO_DIAGNOSTICS) return;
    const endedAt = this.endedAt;
    const planned = this.plannedPauseMs;
    const prevTrail = endedAt ? this.prevTrailMs : null;
    this.endedAt = 0;
    this.plannedPauseMs = 0;

    const silence = this.analyze(url);
    audio.addEventListener(
      'playing',
      () => {
        const now = performance.now();
        const waitMs = endedAt && now - endedAt < 30000 ? Math.max(0, Math.round(now - endedAt - planned)) : null;
        silence.then((sil) => {
          this.prevTrailMs = sil ? sil.trailMs : null;
          const sample: Sample = {
            ...info,
            waitMs,
            leadMs: sil ? sil.leadMs : null,
            prevTrailMs: prevTrail,
          };
          this.samples.push(sample);
          this.logSample(sample, planned);
          if (this.samples.length % SUMMARY_EVERY === 0) {
            this.printSummary(this.samples.slice(-SUMMARY_EVERY));
          }
        });
      },
      { once: true }
    );
  }

  private logSample(s: Sample, plannedPauseMs: number) {
    const r = s.rate;
    const parts = [`[Áudio] trecho ${s.index} (${r}x)`, s.origin];
    if (s.waitMs === null) {
      parts.push('início de leitura');
    } else {
      parts.push(`parado esperando: ${s.waitMs}ms${plannedPauseMs ? ` (+${plannedPauseMs}ms de pausa de parágrafo, proposital)` : ''}`);
    }
    if (s.leadMs !== null) {
      const embedded = (s.prevTrailMs ?? 0) + s.leadMs;
      parts.push(
        `silêncio embutido no MP3: fim do anterior ${s.prevTrailMs ?? '?'}ms + começo deste ${s.leadMs}ms` +
          ` = ${Math.round(embedded / r)}ms ouvidos em ${r}x`
      );
      if (s.waitMs !== null) {
        parts.push(`SILÊNCIO TOTAL NA TROCA ≈ ${Math.round(s.waitMs + embedded / r)}ms`);
      }
    }
    parts.push(`prontos adiante: ${s.readyAhead}`);
    const slow = s.waitMs !== null && s.waitMs > 150;
    (slow ? console.warn : console.log)(parts.join(' | '));
  }

  private printSummary(samples: Sample[]) {
    const transitions = samples.filter((s) => s.waitMs !== null);
    if (transitions.length === 0) {
      console.log('[Áudio] Resumo: ainda sem trocas contínuas de trecho para medir.');
      return;
    }
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const waits = transitions.map((s) => s.waitMs as number);
    const embedded = transitions
      .filter((s) => s.leadMs !== null && s.prevTrailMs !== null)
      .map((s) => ((s.prevTrailMs as number) + (s.leadMs as number)) / s.rate);
    const byOrigin: Record<string, number> = {};
    transitions.forEach((s) => (byOrigin[s.origin] = (byOrigin[s.origin] || 0) + 1));

    console.log(`[Áudio] ===== Resumo das últimas ${transitions.length} trocas de trecho =====`);
    console.table({
      'parado esperando o áudio (média, ms)': avg(waits),
      'parado esperando o áudio (pior, ms)': Math.max(...waits),
      'trocas paradas mais de 150ms': waits.filter((w) => w > 150).length,
      'silêncio embutido nos MP3 por troca (média, ms na velocidade atual)': avg(embedded),
      'silêncio total por troca (média, ms)': avg(waits) + avg(embedded),
    });
    console.table(byOrigin);
  }

  /** Mede o silêncio no começo e no fim do MP3 (o áudio vem do cache do servidor, é barato) */
  private analyze(url: string): Promise<Silence | null> {
    const cached = this.silenceCache.get(url);
    if (cached) return cached;
    const job = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        this.decoder ??= new OfflineAudioContext(1, 1, 44100);
        const buffer = await this.decoder.decodeAudioData(data);
        const ch = buffer.getChannelData(0);
        let first = 0;
        while (first < ch.length && Math.abs(ch[first]) < SILENCE_THRESHOLD) first++;
        let last = ch.length - 1;
        while (last > first && Math.abs(ch[last]) < SILENCE_THRESHOLD) last--;
        const toMs = (samples: number) => Math.round((samples / buffer.sampleRate) * 1000);
        return { leadMs: toMs(first), trailMs: toMs(ch.length - 1 - last), durationMs: toMs(ch.length) };
      } catch {
        return null;
      }
    })();
    this.silenceCache.set(url, job);
    return job;
  }
}

export const audioDiagnostics = new AudioDiagnostics();
