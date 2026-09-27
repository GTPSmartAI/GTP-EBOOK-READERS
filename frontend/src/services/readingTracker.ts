import { postReadingStats } from './api';

/**
 * Leitura real para as estatísticas: palavras que a voz terminou de ler e tempo em que ela
 * esteve de fato tocando (relógio real, então 2x conta o tempo que a pessoa passou ouvindo).
 * Pular capítulos ou arrastar a barra não soma nada.
 *
 * Envia a cada 30 s e ao pausar; sem internet, guarda no aparelho e envia depois.
 */
const FLUSH_MS = 30_000;
// Um intervalo contínuo tocando nunca soma mais que isso (aparelho suspenso, relógio que pulou)
const MAX_STEP_SECONDS = 600;

type Pending = Record<string, { words: number; seconds: number }>;

class ReadingTracker {
  private userId: string | null = null;
  private bookId: string | null = null;
  private playingSince: number | null = null;
  private pending: Pending = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending = false;

  private get storageKey() {
    return `gtp_stats_pending_${this.userId}`;
  }

  /** Troca de usuário (login/logout): o que era de outro usuário fica guardado com ele */
  setUser(userId: string | null) {
    if (userId === this.userId) return;
    this.closeInterval();
    this.save();
    this.userId = userId;
    this.pending = {};
    if (userId) {
      try {
        this.pending = JSON.parse(localStorage.getItem(this.storageKey) || '{}') || {};
      } catch {
        this.pending = {};
      }
      if (!this.timer) this.timer = setInterval(() => this.flush(), FLUSH_MS);
      this.flush();
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setBook(bookId: string | null) {
    if (bookId === this.bookId) return;
    this.closeInterval();
    this.bookId = bookId;
    if (this.playingSince !== null) this.playingSince = Date.now();
  }

  setPlaying(playing: boolean) {
    if (playing && this.playingSince === null) {
      this.playingSince = Date.now();
    } else if (!playing && this.playingSince !== null) {
      this.closeInterval();
      this.playingSince = null;
      this.flush();
    }
  }

  addWords(words: number) {
    if (!this.bookId || !this.userId || words <= 0) return;
    this.entry(this.bookId).words += words;
  }

  private entry(bookId: string) {
    if (!this.pending[bookId]) this.pending[bookId] = { words: 0, seconds: 0 };
    return this.pending[bookId];
  }

  /** Soma o tempo tocando até agora e recomeça a contagem */
  private closeInterval() {
    if (this.playingSince === null || !this.bookId || !this.userId) return;
    const now = Date.now();
    const seconds = Math.min(MAX_STEP_SECONDS, Math.max(0, (now - this.playingSince) / 1000));
    this.entry(this.bookId).seconds += seconds;
    this.playingSince = now;
  }

  private save() {
    if (!this.userId) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.pending));
    } catch {
      // armazenamento cheio: fica só na memória
    }
  }

  async flush() {
    if (!this.userId || this.sending) return;
    this.closeInterval();
    this.save();
    this.sending = true;
    try {
      for (const [bookId, data] of Object.entries(this.pending)) {
        const seconds = Math.floor(data.seconds);
        const words = Math.floor(data.words);
        if (words <= 0 && seconds <= 0) continue;
        // O servidor aceita até 20 mil palavras e 1 hora por envio
        const sendWords = Math.min(words, 20000);
        const sendSeconds = Math.min(seconds, 3600);
        const ok = await postReadingStats(bookId, sendWords, sendSeconds);
        if (!ok) break; // sem internet: tenta no próximo ciclo
        const current = this.pending[bookId];
        if (current) {
          current.words -= sendWords;
          current.seconds -= sendSeconds;
          if (current.words <= 0 && current.seconds < 1) delete this.pending[bookId];
        }
      }
    } finally {
      this.sending = false;
      this.save();
    }
  }
}

export const readingTracker = new ReadingTracker();

// Aba escondida ou app indo para segundo plano: envia o que tiver
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') readingTracker.flush();
  });
}
