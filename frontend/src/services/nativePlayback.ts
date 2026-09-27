import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Player do app Android (notificação e tela de bloqueio) e leitura com a tela apagada.
 * Liga o serviço em primeiro plano (PlaybackService.java), que mostra capa, "Livro – Capítulo",
 * a barra de progresso do capítulo e os botões -15s / play / +15s. No navegador não faz nada.
 */
export interface NowPlaying {
  title: string;
  chapter: string;
  coverUrl?: string;
  playing: boolean;
  /** Posição e duração estimadas dentro do capítulo atual */
  positionMs: number;
  durationMs: number;
}

export type PlayerCommand = 'toggle' | 'play' | 'pause' | 'back' | 'forward' | 'seek';

interface BackgroundPlaybackPlugin {
  update(options: NowPlaying): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'command',
    callback: (data: { command: PlayerCommand; positionMs: number }) => void
  ): Promise<PluginListenerHandle>;
}

const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>('BackgroundPlayback');

export const isNativeApp = Capacitor.isNativePlatform();

// Último envio: enquanto toca, o Android anda a barra sozinho; só reenvia quando algo muda
// ou quando a posição real se afasta mais de 4s da que ele está mostrando.
let last: (NowPlaying & { sentAt: number }) | null = null;
const MAX_DRIFT_MS = 4000;

export function updateNowPlaying(info: NowPlaying): void {
  if (!isNativeApp) return;
  const now = Date.now();
  if (
    last &&
    last.playing === info.playing &&
    last.title === info.title &&
    last.chapter === info.chapter &&
    last.coverUrl === info.coverUrl &&
    Math.abs(last.durationMs - info.durationMs) < 1000
  ) {
    const shown = last.positionMs + (last.playing ? now - last.sentAt : 0);
    if (Math.abs(shown - info.positionMs) < MAX_DRIFT_MS) return;
  }
  last = { ...info, sentAt: now };
  BackgroundPlayback.update(info).catch((err) => console.warn('Player do Android indisponível:', err));
}

export function stopNowPlaying(): void {
  if (!isNativeApp || !last) return;
  last = null;
  BackgroundPlayback.stop().catch(() => {});
}

/** Botões do player da notificação, da tela de bloqueio e dos fones */
export function onPlayerCommand(callback: (command: PlayerCommand, positionMs: number) => void): () => void {
  if (!isNativeApp) return () => {};
  const handle = BackgroundPlayback.addListener('command', (data) => callback(data.command, data.positionMs));
  return () => {
    handle.then((h) => h.remove());
  };
}
