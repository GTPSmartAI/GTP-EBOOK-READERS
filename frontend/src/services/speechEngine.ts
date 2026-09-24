import type { VoiceOption } from '../types';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface SpeechEngineCallbacks {
  onSentenceChange: (index: number) => void;
  onStatusChange: (status: PlaybackStatus) => void;
  onComplete: () => void;
  onWaveformTick?: (energyLevels: number[]) => void;
}

const BACKEND_URL = 'http://localhost:4000';

class SpeechEngine {
  private synth: SpeechSynthesis | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioBuffer: Map<number, string> = new Map(); // index -> audio_url
  private isPrefetching: boolean = false;
  private sentences: string[] = [];
  private currentIndex: number = 0;
  private status: PlaybackStatus = 'idle';
  private rate: number = 1.0;
  private pitch: number = 1.0;
  private emotion: string = 'suspense';
  private voiceOption: VoiceOption | null = null;
  private callbacks: SpeechEngineCallbacks = {
    onSentenceChange: () => {},
    onStatusChange: () => {},
    onComplete: () => {},
  };
  private waveformInterval: number | null = null;
  private nativeVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadNativeVoices();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadNativeVoices();
      }
    }
  }

  private loadNativeVoices() {
    if (!this.synth) return;
    this.nativeVoices = this.synth.getVoices();
  }

  public setCallbacks(callbacks: SpeechEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setSentences(sentences: string[], startIndex: number = 0) {
    this.stop();
    this.sentences = sentences;
    this.audioBuffer.clear();
    this.currentIndex = Math.max(0, Math.min(startIndex, sentences.length - 1));
  }

  public setVoice(voice: VoiceOption) {
    const changed = this.voiceOption?.id !== voice.id;
    this.voiceOption = voice;
    if (changed) {
      this.audioBuffer.clear();
      if (this.status === 'playing') {
        this.speakCurrentSentence();
      }
    }
  }

  public setRate(rate: number) {
    this.rate = rate;
    if (this.currentAudio) {
      this.currentAudio.playbackRate = rate;
    }
  }

  public setPitch(pitch: number) {
    this.pitch = pitch;
  }

  public setEmotion(emotion: string) {
    this.emotion = emotion;
    this.audioBuffer.clear();
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getStatus(): PlaybackStatus {
    return this.status;
  }

  public play(index?: number) {
    if (this.sentences.length === 0) return;

    if (index !== undefined) {
      this.currentIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    }

    if (this.status === 'paused' && this.currentAudio) {
      this.currentAudio.play();
      this.setStatus('playing');
      this.startWaveformSimulation();
      return;
    }

    this.speakCurrentSentence();
  }

  public pause() {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
    }
    this.setStatus('paused');
    this.stopWaveformSimulation();
  }

  public stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
    this.setStatus('idle');
    this.stopWaveformSimulation();
  }

  public togglePlayPause() {
    if (this.status === 'playing') {
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
    const validIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.currentIndex = validIndex;
    this.callbacks.onSentenceChange(validIndex);

    if (this.status === 'playing') {
      this.speakCurrentSentence();
    }
  }

  /**
   * Dispara o pré-carregamento contínuo em lote (buffer de 3 a 4 páginas adiante)
   */
  private async triggerContinuousBufferPrefetch(fromIndex: number) {
    if (this.isPrefetching) return;
    this.isPrefetching = true;

    try {
      const nextBatchSentences: string[] = [];
      const batchStartIndex = fromIndex + 1;
      const BATCH_SIZE = 15; // Próximas 15 sentenças (~2-3 páginas)

      for (let i = 0; i < BATCH_SIZE; i++) {
        const targetIdx = batchStartIndex + i;
        if (targetIdx < this.sentences.length && !this.audioBuffer.has(targetIdx)) {
          nextBatchSentences.push(this.sentences[targetIdx]);
        }
      }

      if (nextBatchSentences.length === 0) {
        this.isPrefetching = false;
        return;
      }

      const voiceId = this.voiceOption?.id || 'francisca-dramatica';
      const res = await fetch(`${BACKEND_URL}/api/tts/prefetch-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: nextBatchSentences,
          voice_id: voiceId,
          emotion: this.emotion,
          rate: this.rate,
          start_index: batchStartIndex,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          for (const item of data.items) {
            this.audioBuffer.set(item.index, `${BACKEND_URL}${item.audio_url}`);
          }
        }
      }
    } catch (e) {
      // Falha silenciosa de buffer background
    } finally {
      this.isPrefetching = false;
    }
  }

  private async speakCurrentSentence() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }

    if (this.currentIndex >= this.sentences.length) {
      this.setStatus('idle');
      this.callbacks.onComplete();
      this.stopWaveformSimulation();
      return;
    }

    const currentIdx = this.currentIndex;
    const text = this.sentences[currentIdx];
    this.callbacks.onSentenceChange(currentIdx);
    this.setStatus('playing');
    this.startWaveformSimulation();

    // Inicia pré-carregamento contínuo em background das próximas sentenças
    this.triggerContinuousBufferPrefetch(currentIdx);

    // 1. Verifica se já temos o áudio no buffer contínuo
    const bufferedUrl = this.audioBuffer.get(currentIdx);
    if (bufferedUrl) {
      this.playHtmlAudio(bufferedUrl, currentIdx);
      return;
    }

    // 2. Se não estiver no buffer, sintetiza imediatamente via API Neural
    try {
      const voiceId = this.voiceOption?.id || 'francisca-dramatica';
      const response = await fetch(`${BACKEND_URL}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          emotion: this.emotion,
          rate: this.rate,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.audio_url) {
          const audioUrl = `${BACKEND_URL}${result.audio_url}`;
          this.audioBuffer.set(currentIdx, audioUrl);
          this.playHtmlAudio(audioUrl, currentIdx);
          return;
        }
      }
    } catch (apiErr) {
      console.warn('Backend TTS indisponível, usando fallback nativo do navegador:', apiErr);
    }

    // 3. Fallback: síntese nativa do navegador
    this.speakNative(text, currentIdx);
  }

  private playHtmlAudio(url: string, index: number) {
    if (this.currentIndex !== index || this.status !== 'playing') return;

    const audio = new Audio(url);
    audio.playbackRate = this.rate;
    this.currentAudio = audio;

    audio.onended = () => {
      if (this.status === 'playing' && this.currentIndex === index) {
        this.nextSentence();
      }
    };

    audio.onerror = () => {
      console.warn('Erro ao reproduzir áudio neural, usando fallback...');
      this.speakNative(this.sentences[index], index);
    };

    audio.play().catch((err) => {
      console.warn('Autoplay bloqueado ou erro no áudio:', err);
    });
  }

  private speakNative(text: string, index: number) {
    if (!this.synth) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.max(0.5, Math.min(2.0, this.rate));
    utterance.pitch = Math.max(0.5, Math.min(2.0, this.pitch));

    const targetLang = this.voiceOption?.lang || 'pt-BR';
    const foundVoice = this.nativeVoices.find((v) => v.lang.replace('_', '-').startsWith(targetLang));
    if (foundVoice) {
      utterance.voice = foundVoice;
    }

    utterance.onend = () => {
      if (this.status === 'playing' && this.currentIndex === index) {
        this.nextSentence();
      }
    };

    this.synth.speak(utterance);
  }

  public async previewVoice(voice: VoiceOption) {
    this.stop();
    this.setStatus('playing');
    this.startWaveformSimulation();

    try {
      const res = await fetch(`${BACKEND_URL}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: voice.samplePhrase,
          voice_id: voice.id,
          emotion: 'suspense',
          rate: 1.0,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.audio_url) {
          const audio = new Audio(`${BACKEND_URL}${data.audio_url}`);
          this.currentAudio = audio;
          audio.onended = () => {
            this.setStatus('idle');
            this.stopWaveformSimulation();
          };
          audio.play();
          return;
        }
      }
    } catch (e) {
      console.warn('Fallback preview:', e);
    }

    // Fallback nativo
    if (this.synth) {
      const utt = new SpeechSynthesisUtterance(voice.samplePhrase);
      utt.onend = () => {
        this.setStatus('idle');
        this.stopWaveformSimulation();
      };
      this.synth.speak(utt);
    }
  }

  private setStatus(status: PlaybackStatus) {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private startWaveformSimulation() {
    this.stopWaveformSimulation();
    this.waveformInterval = window.setInterval(() => {
      if (this.status !== 'playing') {
        this.stopWaveformSimulation();
        return;
      }
      const bars = 16;
      const levels: number[] = [];
      for (let i = 0; i < bars; i++) {
        const val = Math.floor(Math.random() * 70) + 20;
        levels.push(val);
      }
      if (this.callbacks.onWaveformTick) {
        this.callbacks.onWaveformTick(levels);
      }
    }, 100);
  }

  private stopWaveformSimulation() {
    if (this.waveformInterval !== null) {
      clearInterval(this.waveformInterval);
      this.waveformInterval = null;
    }
    if (this.callbacks.onWaveformTick) {
      this.callbacks.onWaveformTick(Array(16).fill(15));
    }
  }
}

export const speechEngine = new SpeechEngine();
