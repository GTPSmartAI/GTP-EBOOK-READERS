import { addReadingStats } from './library';

/**
 * Leitura real para as estatísticas: palavras que a voz terminou de ler e tempo em que ela
 * esteve de fato tocando (relógio real, então 2x conta o tempo que a pessoa passou ouvindo).
 * Pular capítulos ou arrastar a barra não soma nada.
 *
 * Grava no aparelho a cada 30 s e ao pausar.
 */
const FLUSH_MS = 30_000;
// Um intervalo contínuo tocando nunca soma mais que isso (aparelho suspenso, relógio que pulou)
const MAX_STEP_SECONDS = 600;

type Pending = Record<string, { words: number; seconds: number }>;

class ReadingTracker {
  private ownerId: string | null = null;
  private bookId: string | null = null;
  private playingSince: number | null = null;
  private pending: Pending = {};
  private timer: ReturnType<typeof setInterval> | null = null;

  setOwner(ownerId: string | null) {
    if (ownerId === this.ownerId) return;
    this.flush();
    this.ownerId = ownerId;
    if (!ownerId) return;
    if (!this.timer) this.timer = setInterval(() => this.flush(), FLUSH_MS);
    // Leitura que a versão com servidor guardou no aparelho e não chegou a enviar: entra nas estatísticas de hoje
    const legacyKey = `gtp_stats_pending_${ownerId}`;
    try {
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}') as Pending;
      for (const [bookId, data] of Object.entries(legacy || {})) addReadingStats(ownerId, bookId, data.words, data.seconds);
      localStorage.removeItem(legacyKey);
    } catch {
      // ilegível: ignora
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
    if (!this.bookId || !this.ownerId || words <= 0) return;
    this.entry(this.bookId).words += words;
  }

  private entry(bookId: string) {
    if (!this.pending[bookId]) this.pending[bookId] = { words: 0, seconds: 0 };
    return this.pending[bookId];
  }

  /** Soma o tempo tocando até agora e recomeça a contagem */
  private closeInterval() {
    if (this.playingSince === null || !this.bookId || !this.ownerId) return;
    const now = Date.now();
    const seconds = Math.min(MAX_STEP_SECONDS, Math.max(0, (now - this.playingSince) / 1000));
    this.entry(this.bookId).seconds += seconds;
    this.playingSince = now;
  }

  flush() {
    if (!this.ownerId) return;
    this.closeInterval();
    for (const [bookId, data] of Object.entries(this.pending)) {
      const words = Math.floor(data.words);
      const seconds = Math.floor(data.seconds);
      if (words > 0 || seconds > 0) addReadingStats(this.ownerId, bookId, words, seconds);
      data.words -= words;
      data.seconds -= seconds;
      if (data.words <= 0 && data.seconds < 1) delete this.pending[bookId];
    }
  }
}

export const readingTracker = new ReadingTracker();

// App indo para segundo plano: grava o que tiver
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') readingTracker.flush();
  });
}
