import type { VoiceOption } from '../types';
import { VOICES } from '../data/voices';
import { BACKEND_URL } from '../config';
import { apiFetch } from './session';
import { audioDiagnostics, AUDIO_DIAGNOSTICS, type AudioOrigin } from './audioDiagnostics';
import { activateOfflineBook, offlineClipUrl, type SynthParams } from './offlineAudio';

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'buffering';

export interface SpeechEngineCallbacks {
  onSentenceChange: (index: number) => void;
  onStatusChange: (status: PlaybackStatus) => void;
  onComplete: () => void;
  onBufferProgress?: (isBuffering: boolean, progressText: string) => void;
  /** Palavras de um trecho que a voz terminou de ler (estatísticas de leitura real) */
  onWordsRead?: (words: number) => void;
  /** Aviso para a tela (ex.: sem internet num trecho que não foi baixado) */
  onNotice?: (message: string) => void;
}

const OFFLINE_MISSING = 'Sem internet: este trecho não foi baixado. Baixe os capítulos em "Capítulos" para ouvir offline.';

// Quantas vezes um trecho é ressintetizado (erro de rede ou áudio expirado no cache do servidor) antes de pular
const MAX_RETRIES = 2;
// Unidades pedidas em cada lote de pré-carregamento
const PREFETCH_BATCH = 12;
// Trechos mantidos prontos adiante em qualquer velocidade (acima de 2.5x cresce junto com a velocidade)
const MIN_LOOKAHEAD = 30;
// Lotes de pré-carregamento que podem correr ao mesmo tempo
const MAX_PARALLEL_BATCHES = 2;
// Espera antes de voltar a pré-carregar depois de um lote que não trouxe nenhum áudio
const PREFETCH_BACKOFF_MS = 3000;
// Pausa extra ao terminar um parágrafo, por cadência da voz (ms em velocidade 1x)
const PARAGRAPH_PAUSE_MS: Record<string, number> = {
  natural: 280,
  rapida: 180,
  dramatica: 450,
  espacosa: 650,
};

// Trecho sem áudio pronto com pelo menos esta quantidade de palavras começa por um pedaço curto,
// que é sintetizado bem mais rápido, enquanto o resto é gerado em paralelo
const SPLIT_MIN_WORDS = 12;
const HEAD_MAX_WORDS = 8;
const HEAD_DEFAULT_WORDS = 6;

/** Divide o início do trecho, de preferência numa pausa natural (vírgula, ponto e vírgula, travessão) */
function splitHead(text: string): [string, string] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < SPLIT_MIN_WORDS) return null;
  let cut = HEAD_DEFAULT_WORDS;
  for (let i = 2; i < HEAD_MAX_WORDS; i++) {
    if (/[,;:—–]$/.test(words[i])) {
      cut = i + 1;
      break;
    }
  }
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

/** Faixa de palavras de um trecho coberta por um áudio: `words` são as palavras dessa faixa */
interface WordSegment {
  start: number;
  words: string[];
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** Parâmetros de síntese próprios de cada voz (cada personagem mantém seu tom e ritmo) */
function voiceSynthesisParams(voice: VoiceOption): SynthParams {
  return {
    voice_id: voice.id,
    cadence: voice.cadence || 'natural',
    pitch_override: voice.pitch ?? null,
    rate_override: voice.rate ?? null,
  };
}

class SpeechEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private preloadedNextAudio: { index: number; audio: HTMLAudioElement } | null = null;
  private audioBuffer: Map<number, string> = new Map(); // index -> audio_url | 'SILENCE'
  // Trechos já pedidos em algum lote que ainda não chegaram (não são pedidos de novo)
  private inFlight: Set<number> = new Set();
  private activeBatches: number = 0;
  private prefetchBackoffUntil: number = 0;
  // Muda a cada troca de livro/voz: lotes antigos são cancelados e o que ainda chegar deles é ignorado
  private bufferVersion: number = 0;
  private bufferAbort: AbortController = new AbortController();
  // Cancela a síntese pedida pela sessão anterior (pausa, pulo, clique repetido no play), liberando a conexão
  private sessionAbort: AbortController = new AbortController();
  // Resto do trecho quando o início foi sintetizado separado para começar a tocar mais rápido
  private splitTail: { index: number; url: Promise<string | null>; abort: AbortController; audio?: HTMLAudioElement; segment: WordSegment } | null = null;
  // Palavras do trecho que o áudio atual cobre (frase inteira, início/resto de frase dividida ou a partir de um clique)
  private currentSegment: WordSegment | null = null;
  private sentences: string[] = [];
  // Livro aberto: procura os trechos baixados para ouvir sem internet
  private bookId: string = '';
  private paragraphStarts: Set<number> = new Set();
  private currentIndex: number = 0;
  private status: PlaybackStatus = 'idle';
  private rate: number = 1.0;
  private emotion: string = 'suspense';
  private voiceOption: VoiceOption = VOICES[0]; // voz padrão do catálogo
  private voiceResolver: ((sentenceIndex: number) => VoiceOption | null) | null = null;
  private callbacks: SpeechEngineCallbacks = {
    onSentenceChange: () => {},
    onStatusChange: () => {},
    onComplete: () => {},
  };
  private playSessionId: number = 0;
  // Medição (só em desenvolvimento): de onde veio o áudio do próximo trecho a tocar
  private diagOrigin: AudioOrigin = 'gerado na hora';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  // Prévia de voz toca num elemento separado e não mexe no estado da leitura do livro
  private previewAudio: HTMLAudioElement | null = null;

  public setCallbacks(callbacks: SpeechEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setVoiceResolver(resolver: ((sentenceIndex: number) => VoiceOption | null) | null) {
    this.voiceResolver = resolver;
    this.resetBufferAndRestart();
  }

  /** Livro aberto (carrega os capítulos baixados dele). Chamar antes de setSentences. */
  public setBook(bookId: string) {
    this.bookId = bookId;
    activateOfflineBook(bookId).then(() => {
      // Os trechos baixados passam a valer já no próximo pré-carregamento
      if (this.bookId === bookId) this.prefetchAhead(this.currentIndex, 8);
    });
  }

  /** Voz e parâmetros de síntese de um trecho, como o player usa (para baixar capítulos) */
  public synthesisParamsFor(sentenceIndex: number): SynthParams {
    return voiceSynthesisParams(this.getVoiceForSentence(sentenceIndex));
  }

  /** Áudio baixado do trecho, se existir */
  private offlineUrl(index: number): string | null {
    const text = this.sentences[index] || '';
    return offlineClipUrl(this.bookId, index, text, voiceSynthesisParams(this.getVoiceForSentence(index)));
  }

  /** Áudio do trecho: o baixado vem antes do link do servidor (que pode ter sido pedido antes do download) */
  private bufferedUrl(index: number): string | undefined {
    const buffered = this.audioBuffer.get(index);
    if (buffered === 'SILENCE' || buffered?.startsWith('blob:')) return buffered;
    return this.offlineUrl(index) ?? buffered;
  }

  /** Sem internet e sem o trecho baixado: pausa e avisa (em vez de pular trecho por trecho) */
  private stopForOffline(): boolean {
    if (navigator.onLine) return false;
    this.callbacks.onBufferProgress?.(false, '');
    this.pause();
    this.callbacks.onNotice?.(OFFLINE_MISSING);
    return true;
  }

  public getVoiceForSentence(sentenceIndex: number): VoiceOption {
    if (this.voiceResolver) {
      const resolved = this.voiceResolver(sentenceIndex);
      if (resolved) return resolved;
    }
    return this.voiceOption || VOICES[0];
  }

  public setSentences(sentences: string[], startIndex: number = 0, paragraphStarts?: number[]) {
    this.stop();
    this.sentences = sentences;
    this.paragraphStarts = new Set(paragraphStarts || []);
    this.clearBuffer();
    this.currentIndex = Math.max(0, Math.min(startIndex, sentences.length - 1));

    // Inicia pré-carregamento imediato das primeiras unidades para a leitura começar sem espera
    this.prefetchAhead(this.currentIndex, 8);
  }

  public setVoice(voice: VoiceOption) {
    const changed = this.voiceOption?.id !== voice.id;
    this.voiceOption = voice;
    // Com elenco ativo quem decide a voz é o resolvedor (que é atualizado junto); evita reiniciar duas vezes
    if (changed && !this.voiceResolver) {
      this.resetBufferAndRestart();
    }
  }

  /** Velocidade aplicada só na reprodução (playbackRate): o áudio sintetizado é sempre 1x e segue válido no cache */
  public setRate(rate: number) {
    this.rate = rate;
    if (this.currentAudio) {
      this.currentAudio.playbackRate = rate;
    }
    if (this.preloadedNextAudio) {
      this.preloadedNextAudio.audio.playbackRate = rate;
    }
    // Mais rápido consome o buffer mais rápido: amplia o pré-carregamento na hora
    if (this.status === 'playing' || this.status === 'buffering') {
      this.prefetchAhead(this.currentIndex + 1, this.lookahead());
    }
  }

  public setEmotion(emotion: string) {
    this.emotion = emotion;
    this.resetBufferAndRestart();
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Palavra sendo falada agora, estimada pela posição no áudio: cada palavra ocupa um tempo
   * proporcional ao seu tamanho (+1 pelo espaço). null quando nada está tocando.
   */
  public getSpokenWord(): { sentenceIndex: number; wordIndex: number } | null {
    const audio = this.currentAudio;
    const segment = this.currentSegment;
    if (!audio || !segment || this.status !== 'playing' || !segment.words.length) return null;
    const duration = audio.duration;
    if (!isFinite(duration) || duration <= 0) return null;
    const total = segment.words.reduce((sum, w) => sum + w.length + 1, 0);
    const target = Math.min(1, Math.max(0, audio.currentTime / duration)) * total;
    let acc = 0;
    for (let i = 0; i < segment.words.length; i++) {
      acc += segment.words[i].length + 1;
      if (acc >= target) return { sentenceIndex: this.currentIndex, wordIndex: segment.start + i };
    }
    return { sentenceIndex: this.currentIndex, wordIndex: segment.start + segment.words.length - 1 };
  }

  public getStatus(): PlaybackStatus {
    return this.status;
  }

  /** Voz mudou: descarta o áudio já gerado e, se estiver tocando, recomeça o trecho atual com a voz nova */
  private resetBufferAndRestart() {
    this.clearBuffer();
    if (this.status === 'playing' || this.status === 'buffering') {
      this.speakCurrentSentence();
    } else {
      this.prefetchAhead(this.currentIndex, 8);
    }
  }

  /** Descarta o áudio já gerado e cancela os lotes em andamento, liberando lotes novos na hora */
  private clearBuffer() {
    this.bufferVersion++;
    this.bufferAbort.abort();
    this.bufferAbort = new AbortController();
    this.audioBuffer.clear();
    this.inFlight.clear();
    this.activeBatches = 0;
    this.prefetchBackoffUntil = 0;
    this.preloadedNextAudio = null;
  }

  /** Nova sessão de reprodução: cancela a síntese que a sessão anterior ainda esperava */
  private newSession(): number {
    this.sessionAbort.abort();
    this.sessionAbort = new AbortController();
    return ++this.playSessionId;
  }

  /** Quantos trechos manter pedidos adiante: no mínimo 30; em 3x o áudio acaba 3x mais rápido, então pede mais */
  private lookahead(): number {
    return Math.max(MIN_LOOKAHEAD, Math.ceil(PREFETCH_BATCH * this.rate));
  }

  private buildPrefetchItems(fromIndex: number, count: number) {
    const items: { index: number; text: string; voice_id: string; cadence: string; pitch_override: string | null; rate_override: string | null }[] = [];
    const maxIndex = Math.min(this.sentences.length, fromIndex + count);
    for (let i = fromIndex; i < maxIndex; i++) {
      if (this.audioBuffer.has(i) || this.inFlight.has(i)) continue;
      const text = this.sentences[i] || '';
      if (!/[\w\d]/.test(text)) {
        this.audioBuffer.set(i, 'SILENCE');
        continue;
      }
      const offline = this.offlineUrl(i);
      if (offline) {
        this.audioBuffer.set(i, offline);
        continue;
      }
      items.push({ index: i, text, ...voiceSynthesisParams(this.getVoiceForSentence(i)) });
    }
    return items;
  }

  /**
   * Pede um lote em streaming: cada trecho entra no buffer assim que o servidor termina de gerá-lo,
   * sem esperar o trecho mais lento do lote
   */
  private async fetchBatch(items: ReturnType<SpeechEngine['buildPrefetchItems']>): Promise<number> {
    // Se a voz/livro mudar no meio do lote, ele é cancelado e o que ainda chegar é descartado
    const version = this.bufferVersion;
    const res = await apiFetch('/api/tts/prefetch-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: this.bufferAbort.signal,
      body: JSON.stringify({ items, emotion: this.emotion, rate: 1.0, stream: true }),
    });
    if (!res.ok || !res.body) return 0;

    let received = 0;
    const applyItem = (item: { index: number; is_silence?: boolean; audio_url?: string | null }) => {
      if (version !== this.bufferVersion) return;
      if (item.is_silence) {
        this.audioBuffer.set(item.index, 'SILENCE');
      } else if (item.audio_url) {
        this.audioBuffer.set(item.index, `${BACKEND_URL}${item.audio_url}`);
        if (item.index === this.currentIndex + 1 && !this.preloadedNextAudio) {
          this.primeNextAudioElement(item.index);
        }
      } else {
        return;
      }
      this.inFlight.delete(item.index);
      received++;
    };

    // Backend sem suporte a streaming (versão antiga ainda rodando): o lote vem inteiro num JSON só
    if (!(res.headers.get('Content-Type') || '').includes('ndjson')) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) data.items.forEach(applyItem);
      return received;
    }

    const applyLine = (line: string) => {
      if (!line.trim()) return;
      try {
        applyItem(JSON.parse(line));
      } catch {
        // linha incompleta/inválida: ignora
      }
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(applyLine);
    }
    applyLine(pending + decoder.decode());
    return received;
  }

  /**
   * Pede adiantado os trechos de [fromIndex, fromIndex + count) que ainda não têm áudio nem estão a caminho,
   * em lotes paralelos, respeitando a voz de cada trecho/personagem
   */
  private prefetchAhead(fromIndex: number, count: number) {
    if (this.sentences.length === 0 || Date.now() < this.prefetchBackoffUntil) return;
    const items = this.buildPrefetchItems(fromIndex, count);
    if (!navigator.onLine) return; // os baixados já entraram no buffer; o resto espera a internet
    while (items.length > 0 && this.activeBatches < MAX_PARALLEL_BATCHES) {
      this.runBatch(items.splice(0, PREFETCH_BATCH));
    }
  }

  private async runBatch(items: ReturnType<SpeechEngine['buildPrefetchItems']>) {
    const version = this.bufferVersion;
    items.forEach((it) => this.inFlight.add(it.index));
    this.activeBatches++;
    let received = 0;
    try {
      received = await this.fetchBatch(items);
    } catch (e) {
      // Buffer em background resiliente: o trecho é sintetizado na hora se faltar
      if ((e as Error)?.name !== 'AbortError') console.warn('[Buffer] Falha temporária no pré-carregamento:', e);
    }
    if (version !== this.bufferVersion) return;
    this.activeBatches--;
    // Os que falharam saem da lista e podem ser pedidos de novo, mas não na hora:
    // lote vazio indica servidor falhando ou sobrecarregado, e repedir a cada trecho só piora
    items.forEach((it) => this.inFlight.delete(it.index));
    if (received === 0) this.prefetchBackoffUntil = Date.now() + PREFETCH_BACKOFF_MS;
    // Lendo e o lote rendeu algo: emenda o próximo para o buffer não esvaziar (sem insistir se o servidor está falhando)
    if (received > 0 && (this.status === 'playing' || this.status === 'buffering')) {
      this.prefetchAhead(this.currentIndex + 1, this.lookahead());
    }
  }

  public async play(index?: number) {
    if (this.sentences.length === 0) return;
    this.stopPreview();

    if (index !== undefined) {
      this.currentIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
      this.preloadedNextAudio = null;
    }

    // Se estiver pausado no meio de um trecho, retoma do ponto exato
    if (this.status === 'paused' && index === undefined) {
      if (this.currentAudio && !this.currentAudio.ended && this.currentAudio.currentTime > 0) {
        try {
          const sessionId = this.newSession();
          this.attachAudioHandlers(this.currentAudio, this.currentIndex, sessionId, 0);
          await this.currentAudio.play();
          this.setStatus('playing');
          return;
        } catch (e) {
          console.warn('[Audio] Erro ao retomar elemento pausado, reiniciando trecho:', e);
        }
      }
    }

    this.speakCurrentSentence();
  }

  public pause() {
    this.newSession();
    audioDiagnostics.reset();
    this.clearSilenceTimer();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {}
    }
    this.setStatus('paused');
  }

  public stop() {
    this.newSession();
    audioDiagnostics.reset();
    this.clearSilenceTimer();
    this.discardCurrentAudio(true);
    this.setStatus('idle');
  }

  public togglePlayPause() {
    if (this.status === 'playing' || this.status === 'buffering') {
      this.pause();
    } else {
      this.play();
    }
  }

  public nextSentence() {
    if (this.currentIndex < this.sentences.length - 1) {
      this.jumpToSentence(this.currentIndex + 1);
    } else {
      this.stop();
      this.callbacks.onComplete();
    }
  }

  public prevSentence() {
    if (this.currentIndex > 0) {
      this.jumpToSentence(this.currentIndex - 1);
    }
  }

  public jumpToSentence(index: number) {
    const wasActive = this.status === 'playing' || this.status === 'buffering';
    this.newSession();
    this.clearSilenceTimer();
    this.discardCurrentAudio();

    // O áudio pré-carregado é mantido: no avanço normal ele é exatamente o próximo trecho
    // (playHtmlAudio só o usa se índice e URL baterem, então num salto ele é simplesmente ignorado)
    const validIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.currentIndex = validIndex;
    this.callbacks.onSentenceChange(validIndex);

    // Pausado e o usuário navegou: continua "pausado" (o player do Android e os fones seguem ligados).
    // O áudio antigo foi descartado, então o próximo play começa do trecho novo.
    if (wasActive) {
      this.speakCurrentSentence();
    }
  }

  /**
   * Muda o ponto de leitura sem tocar e sem avisar como leitura nova
   * (ponto que veio de outro aparelho). Só com a leitura parada.
   */
  public setPosition(index: number) {
    if (this.status === 'playing' || this.status === 'buffering' || this.sentences.length === 0) return;
    this.newSession();
    this.clearSilenceTimer();
    this.discardCurrentAudio();
    this.currentIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.preloadedNextAudio = null;
    this.prefetchAhead(this.currentIndex, 8);
  }

  public getBookId(): string {
    return this.bookId;
  }

  /**
   * Começa a ler a partir de uma palavra dentro do trecho (clique na palavra), tocando ou pausado
   */
  public jumpToSentenceFromWord(sentenceIndex: number, wordIndex: number) {
    this.stopPreview();
    this.newSession();
    this.clearSilenceTimer();
    this.discardCurrentAudio();

    const validIndex = Math.max(0, Math.min(sentenceIndex, this.sentences.length - 1));
    this.currentIndex = validIndex;
    this.preloadedNextAudio = null;
    this.callbacks.onSentenceChange(validIndex);

    const words = (this.sentences[validIndex] || '').split(/\s+/).filter(Boolean);
    if (wordIndex <= 0 || wordIndex >= words.length) {
      this.speakCurrentSentence();
      return;
    }
    this.speakTextSlice(validIndex, words.slice(wordIndex).join(' '), wordIndex);
  }

  /**
   * Fala o restante de um trecho a partir da palavra clicada, com a voz do trecho
   */
  private async speakTextSlice(sentenceIndex: number, sliceText: string, startWord: number) {
    const sessionId = this.newSession();
    this.setStatus('buffering');
    this.callbacks.onBufferProgress?.(true, 'Sintonizando voz neural...');

    const split = splitHead(sliceText);
    if (split) {
      const started = await this.playSplit(sentenceIndex, split, sessionId, MAX_RETRIES, startWord);
      if (!started && this.playSessionId === sessionId && this.currentIndex === sentenceIndex) {
        this.speakCurrentSentence();
      }
      return;
    }

    const url = await this.synthesize(sliceText, this.getVoiceForSentence(sentenceIndex), this.sessionAbort.signal);
    if (this.playSessionId !== sessionId || this.currentIndex !== sentenceIndex) return;

    if (url) {
      // O trecho parcial não entra no buffer: ao voltar para este índice, a frase inteira é lida
      this.diagOrigin = 'gerado na hora (clique em palavra)';
      this.playHtmlAudio(url, sentenceIndex, sessionId, MAX_RETRIES, false, undefined, { start: startWord, words: wordsOf(sliceText) });
    } else {
      this.speakCurrentSentence();
    }
  }

  /** Sintetiza um texto avulso e devolve a URL do áudio (ou null). `cancel` interrompe o pedido. */
  private async synthesize(text: string, voice: VoiceOption, cancel?: AbortSignal, timeoutMs = 15000): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onCancel = () => controller.abort();
    if (cancel?.aborted) return null;
    cancel?.addEventListener('abort', onCancel);
    try {
      const response = await apiFetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text, emotion: this.emotion, rate: 1.0, ...voiceSynthesisParams(voice) }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (result.is_silence) return 'SILENCE';
      return result.success && result.audio_url ? `${BACKEND_URL}${result.audio_url}` : null;
    } catch (err) {
      if (!cancel?.aborted) console.warn('[SpeechEngine] Falha na síntese:', err);
      return null;
    } finally {
      clearTimeout(timeoutId);
      cancel?.removeEventListener('abort', onCancel);
    }
  }

  private async speakCurrentSentence(retryCount: number = 0) {
    const sessionId = this.newSession();
    this.clearSilenceTimer();
    this.discardCurrentAudio();

    if (this.currentIndex >= this.sentences.length) {
      this.setStatus('idle');
      this.callbacks.onComplete();
      return;
    }

    const currentIdx = this.currentIndex;
    const text = this.sentences[currentIdx] || '';
    this.callbacks.onSentenceChange(currentIdx);

    // Pré-carregamento contínuo dos próximos trechos
    this.prefetchAhead(currentIdx + 1, this.lookahead());

    let url = this.bufferedUrl(currentIdx);
    if (!url && !/[\w\d]/.test(text)) url = 'SILENCE';
    this.diagOrigin = url ? 'pronto no servidor, baixado na hora' : 'gerado na hora';

    if (!url && this.stopForOffline()) return;

    if (!url) {
      this.setStatus('buffering');
      this.callbacks.onBufferProgress?.(true, 'Carregando voz neural...');

      const split = splitHead(text);
      if (split) {
        const started = await this.playSplit(currentIdx, split, sessionId, retryCount);
        if (!started) this.handlePlaybackFailure(currentIdx, sessionId, retryCount);
        return;
      }

      url = (await this.synthesize(text, this.getVoiceForSentence(currentIdx), this.sessionAbort.signal)) ?? undefined;
      if (this.playSessionId !== sessionId || this.currentIndex !== currentIdx) return;
    }

    if (url === 'SILENCE') {
      this.audioBuffer.set(currentIdx, 'SILENCE');
      this.setStatus('playing');
      this.silenceTimer = setTimeout(() => {
        if (this.currentIndex === currentIdx && this.playSessionId === sessionId) {
          this.nextSentence();
        }
      }, Math.max(300, Math.round(700 / this.rate)));
      return;
    }

    if (url) {
      this.audioBuffer.set(currentIdx, url);
      this.playHtmlAudio(url, currentIdx, sessionId, retryCount, true);
      return;
    }

    this.handlePlaybackFailure(currentIdx, sessionId, retryCount);
  }

  /**
   * Toca o início curto do trecho assim que ele fica pronto; o resto, pedido ao mesmo tempo, toca em seguida.
   * Devolve false se o início não pôde ser sintetizado (quem chamou decide o que fazer).
   */
  private async playSplit(index: number, [head, tail]: [string, string], sessionId: number, retryCount: number,
                          startWord = 0): Promise<boolean> {
    const headWords = wordsOf(head);
    const voice = this.getVoiceForSentence(index);
    // O resto tem cancelamento próprio: pausar durante o início não pode perdê-lo
    const tailAbort = new AbortController();
    const tailUrl = this.synthesize(tail, voice, tailAbort.signal);
    const headUrl = await this.synthesize(head, voice, this.sessionAbort.signal);
    if (this.playSessionId !== sessionId || this.currentIndex !== index) {
      tailAbort.abort();
      return true;
    }
    if (!headUrl || headUrl === 'SILENCE') {
      tailAbort.abort();
      return false;
    }

    const pendingTail: NonNullable<SpeechEngine['splitTail']> = {
      index,
      url: tailUrl,
      abort: tailAbort,
      segment: { start: startWord + headWords.length, words: wordsOf(tail) },
    };
    this.splitTail = pendingTail;
    tailUrl.then((url) => {
      if (this.splitTail === pendingTail && url && url !== 'SILENCE') {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.playbackRate = this.rate;
        pendingTail.audio = audio;
      }
    });

    this.diagOrigin = 'gerado na hora (início dividido)';
    this.playHtmlAudio(headUrl, index, sessionId, retryCount, false, undefined, { start: startWord, words: headWords });
    return true;
  }

  /** O início terminou: toca o resto do trecho (esperando a síntese, se ainda não chegou) */
  private async playSplitTail(index: number, sessionId: number) {
    const tail = this.splitTail;
    this.splitTail = null;
    if (!tail) return;

    let url = tail.audio?.src ?? null;
    if (!url) {
      this.setStatus('buffering');
      url = await tail.url;
      if (this.playSessionId !== sessionId || this.currentIndex !== index) return;
    }
    if (!url || url === 'SILENCE') {
      this.advanceAfter(index, sessionId);
      return;
    }
    // Se o resto falhar ao tocar, avança para o próximo trecho em vez de repetir o início
    this.playHtmlAudio(url, index, sessionId, MAX_RETRIES, false, tail.audio, tail.segment);
  }

  /** Erro de rede ou áudio expirado: ressintetiza algumas vezes e, se continuar falhando, pula o trecho */
  private handlePlaybackFailure(index: number, sessionId: number, retryCount: number) {
    if (this.playSessionId !== sessionId || this.currentIndex !== index) return;
    this.audioBuffer.delete(index);

    // A internet caiu no meio: não adianta repetir nem pular
    if (this.offlineUrl(index) === null && this.stopForOffline()) return;

    if (retryCount < MAX_RETRIES) {
      console.log(`[SpeechEngine] Tentando novamente o trecho ${index} (tentativa ${retryCount + 1})...`);
      setTimeout(() => {
        if (this.playSessionId === sessionId && this.currentIndex === index) {
          this.speakCurrentSentence(retryCount + 1);
        }
      }, 400);
      return;
    }

    // NUNCA cai para voz do Windows/Browser. Se falhar após as tentativas, avança para o próximo trecho
    console.warn(`[SpeechEngine] Não foi possível carregar áudio para o trecho ${index}, avançando.`);
    this.callbacks.onBufferProgress?.(false, '');
    this.nextSentence();
  }

  private primeNextAudioElement(nextIndex: number) {
    if (nextIndex >= this.sentences.length) return;
    const nextUrl = this.bufferedUrl(nextIndex);
    if (nextUrl && nextUrl !== 'SILENCE') {
      try {
        const nextAudio = new Audio(nextUrl);
        nextAudio.preload = 'auto';
        nextAudio.playbackRate = this.rate;
        this.preloadedNextAudio = { index: nextIndex, audio: nextAudio };
      } catch {
        // ignora
      }
    }
  }

  /** Terminou um trecho: avança, com uma pausa curta quando o próximo trecho abre um novo parágrafo */
  private advanceAfter(index: number, sessionId: number) {
    if (this.currentIndex !== index || this.playSessionId !== sessionId) return;
    const next = index + 1;
    if (next < this.sentences.length && this.paragraphStarts.has(next)) {
      const cadence = this.getVoiceForSentence(index).cadence || 'natural';
      const pause = Math.round((PARAGRAPH_PAUSE_MS[cadence] ?? PARAGRAPH_PAUSE_MS.natural) / this.rate);
      audioDiagnostics.setPlannedPause(pause);
      this.silenceTimer = setTimeout(() => {
        if (this.currentIndex === index && this.playSessionId === sessionId) this.nextSentence();
      }, pause);
      return;
    }
    this.nextSentence();
  }

  private attachAudioHandlers(audio: HTMLAudioElement, index: number, sessionId: number, retryCount: number) {
    audio.onended = () => {
      audioDiagnostics.markEnded();
      // Estatísticas: só conta o que a voz leu até o fim (pular trechos não soma palavras)
      if (this.currentAudio === audio && this.currentSegment?.words.length) {
        this.callbacks.onWordsRead?.(this.currentSegment.words.length);
      }
      if (this.splitTail?.index === index) {
        this.playSplitTail(index, sessionId);
      } else {
        this.advanceAfter(index, sessionId);
      }
    };
    audio.onerror = () => {
      console.warn('[Audio] Erro ao carregar o áudio do trecho (expirado ou indisponível). Ressintetizando...');
      this.handlePlaybackFailure(index, sessionId, retryCount);
    };
  }

  private playHtmlAudio(url: string, index: number, sessionId: number, retryCount: number, usePreloaded: boolean,
                        ready?: HTMLAudioElement, segment?: WordSegment) {
    if (this.currentIndex !== index || this.playSessionId !== sessionId) return;
    this.currentSegment = segment ?? { start: 0, words: wordsOf(this.sentences[index] || '') };

    let audio: HTMLAudioElement;
    let origin = this.diagOrigin;
    // Se já estiver pré-carregado em memória, utiliza a instância pronta
    if (ready) {
      audio = ready;
      origin = 'resto da frase dividida';
    } else if (usePreloaded && this.preloadedNextAudio && this.preloadedNextAudio.index === index && this.preloadedNextAudio.audio.src === url) {
      audio = this.preloadedNextAudio.audio;
      origin = 'pré-carregado';
    } else {
      audio = new Audio(url);
    }
    this.preloadedNextAudio = null;

    if (AUDIO_DIAGNOSTICS) {
      let readyAhead = 0;
      for (let i = index + 1; i <= index + this.lookahead(); i++) {
        if (this.audioBuffer.has(i)) readyAhead++;
      }
      audioDiagnostics.track(audio, url, { index, origin, rate: this.rate, readyAhead });
    }

    audio.playbackRate = this.rate;
    this.currentAudio = audio;
    this.attachAudioHandlers(audio, index, sessionId, retryCount);

    // Pré-instancia o próximo áudio para transição contínua
    this.primeNextAudioElement(index + 1);

    audio.play()
      .then(() => {
        if (this.currentIndex === index && this.playSessionId === sessionId) {
          this.setStatus('playing');
          this.callbacks.onBufferProgress?.(false, '');
        }
      })
      .catch((err) => {
        // AbortError acontece quando o usuário pausa/navega antes do áudio começar
        if (err?.name !== 'AbortError') {
          console.warn('[Audio] Reprodução interrompida:', err);
        }
      });
  }

  private discardCurrentAudio(rewind: boolean = false) {
    this.splitTail?.abort.abort();
    this.splitTail = null;
    this.currentSegment = null;
    if (!this.currentAudio) return;
    try {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      if (rewind) this.currentAudio.currentTime = 0;
    } catch {}
    this.currentAudio = null;
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Toca a amostra de uma voz. Se o livro estiver tocando, ele é pausado (pode ser retomado depois).
   * A promessa termina quando a amostra acaba ou falha.
   */
  public async previewVoice(voice: VoiceOption): Promise<void> {
    this.stopPreview();
    if (this.status === 'playing' || this.status === 'buffering') {
      this.pause();
    }

    let url: string | null = null;
    if (voice.sampleAudioUrl) {
      url = voice.sampleAudioUrl.startsWith('http') ? voice.sampleAudioUrl : `${BACKEND_URL}${voice.sampleAudioUrl}`;
    }

    const playUrl = (src: string) =>
      new Promise<boolean>((resolve) => {
        const audio = new Audio(src);
        this.previewAudio = audio;
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.onpause = () => resolve(true); // stopPreview()
        audio.play().catch(() => resolve(false));
      });

    if (url && (await playUrl(url))) {
      this.previewAudio = null;
      return;
    }

    const synthesized = await this.synthesize(voice.samplePhrase, voice);
    if (synthesized && synthesized !== 'SILENCE') {
      await playUrl(synthesized);
    }
    this.previewAudio = null;
  }

  public stopPreview() {
    if (this.previewAudio) {
      try {
        this.previewAudio.pause();
      } catch {}
      this.previewAudio = null;
    }
  }

  private setStatus(status: PlaybackStatus) {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }
}

export const speechEngine = new SpeechEngine();
