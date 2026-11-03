import { Capacitor, registerPlugin } from '@capacitor/core';
import type { VoiceOption } from '../types';
import { normalizeTextForSpeech } from '../utils/textSpeechNormalize';

/**
 * Voz gerada no próprio celular (plugin LocalTts: LocalTtsEngine.java, modelos Piper no sherpa-onnx).
 *
 * - Um trecho por vez no aparelho, numa fila com prioridade: `urgent` (o trecho que vai tocar agora)
 *   passa na frente do pré-carregamento.
 * - O mesmo texto na mesma voz pedido duas vezes (pré-carregamento e depois o player) vira um pedido só;
 *   o segundo, se urgente, promove o primeiro na fila.
 * - Cada áudio fica salvo no cache do app (WAV): ouvir de novo não gera de novo.
 *
 * No PC (Aedolia-PC.bat ou npm run dev) as mesmas vozes vêm do ajudante local deploy/voz_pc.py,
 * em /local-tts no mesmo endereço do app. Sem ele, devolve silêncio do tamanho do trecho, só para testar a tela.
 */

interface LocalTtsPlugin {
  synthesize(options: { id: string; text: string; model: string; lengthScale: number; urgent: boolean }): Promise<{
    path: string;
    durationMs: number;
    cached: boolean;
  }>;
  promote(options: { id: string }): Promise<void>;
  cancel(options: { ids: string[] }): Promise<void>;
  cancelAll(): Promise<void>;
  info(): Promise<{ models: string[]; stats: LocalTtsStats }>;
  clearCache(): Promise<void>;
}

export interface LocalTtsStats {
  generated: number; // trechos gerados desde que o app abriu
  audioSeconds: number;
  realtimeFactor: number; // segundos de fala por segundo de processamento (média)
  lastRealtimeFactor: number;
  lastLoadMs: number; // tempo para carregar a última voz
  failures: number;
  lastError: string | null;
  threads: number;
  cores: number;
  queued: number;
  cacheBytes: number;
}

export interface SynthResult {
  url: string;
  durationMs: number;
  cached: boolean;
}

const LocalTts = registerPlugin<LocalTtsPlugin>('LocalTts');

export const hasLocalEngine = Capacitor.isNativePlatform();

interface Pending {
  id: string;
  promise: Promise<SynthResult | null>;
  waiters: number;
  urgent: boolean;
}

const pending = new Map<string, Pending>();
let seq = 0;
let lastError: string | null = null;

/** Mensagem da última falha do motor (não conta pedidos cancelados) */
export function lastSynthesisError(): string | null {
  return lastError;
}

function keyFor(text: string, voice: VoiceOption) {
  return `${voice.model}|${voice.lengthScale}|${text}`;
}

/**
 * Gera o áudio do texto na voz. Devolve null se falhou ou se `signal` cancelou o pedido
 * (o motor desiste do trecho se ninguém mais estiver esperando por ele).
 */
export function synthesize(
  text: string,
  voice: VoiceOption,
  options: { urgent?: boolean; signal?: AbortSignal } = {}
): Promise<SynthResult | null> {
  const { urgent = false, signal } = options;
  if (signal?.aborted) return Promise.resolve(null);
  const speechText = normalizeTextForSpeech(text) || text;
  const key = keyFor(speechText, voice);

  let entry = pending.get(key);
  if (!entry) {
    const id = `t${++seq}`;
    const created: Pending = { id, waiters: 0, urgent, promise: Promise.resolve(null) };
    created.promise = request(id, speechText, voice, urgent).finally(() => {
      if (pending.get(key) === created) pending.delete(key);
    });
    entry = created;
    pending.set(key, entry);
  } else if (urgent && !entry.urgent) {
    entry.urgent = true;
    if (hasLocalEngine) LocalTts.promote({ id: entry.id }).catch(() => {});
  }

  const current = entry;
  current.waiters++;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: SynthResult | null) => {
      if (settled) return;
      settled = true;
      current.waiters--;
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => {
      finish(null);
      if (current.waiters <= 0 && pending.get(key) === current) {
        pending.delete(key);
        if (hasLocalEngine) LocalTts.cancel({ ids: [current.id] }).catch(() => {});
      }
    };
    signal?.addEventListener('abort', onAbort);
    current.promise.then(finish);
  });
}

async function request(id: string, text: string, voice: VoiceOption, urgent: boolean): Promise<SynthResult | null> {
  if (!hasLocalEngine) return pcSynthesize(text, voice);
  try {
    const r = await LocalTts.synthesize({ id, text, model: voice.model, lengthScale: voice.lengthScale || 1, urgent });
    lastError = null;
    return { url: Capacitor.convertFileSrc(r.path), durationMs: r.durationMs, cached: r.cached };
  } catch (err) {
    const message = (err as Error)?.message || String(err);
    if (message !== 'cancelado') {
      lastError = message;
      console.warn('[LocalTts] Falha ao gerar a voz:', message);
    }
    return null;
  }
}

/** Desiste de tudo o que ainda está na fila do motor */
export function cancelAllSynthesis() {
  pending.clear();
  if (hasLocalEngine) LocalTts.cancelAll().catch(() => {});
}

export async function engineInfo(): Promise<{ models: string[]; stats: LocalTtsStats } | null> {
  try {
    if (hasLocalEngine) return await LocalTts.info();
    const res = await fetch(`${PC_TTS}/info`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function clearAudioCache(): Promise<void> {
  if (hasLocalEngine) await LocalTts.clearCache();
  else await fetch(`${PC_TTS}/clear-cache`, { method: 'POST' }).catch(() => {});
}

// ------------------------------------------------------------------ PC (teste no navegador)

const PC_TTS = '/local-tts';
let pcHelperMissing = false;

/** Voz pelo ajudante do PC (deploy/voz_pc.py); sem ele, silêncio */
async function pcSynthesize(text: string, voice: VoiceOption): Promise<SynthResult | null> {
  if (!pcHelperMissing) {
    try {
      const res = await fetch(`${PC_TTS}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: voice.model, lengthScale: voice.lengthScale || 1 }),
      });
      if (res.ok && (res.headers.get('Content-Type') || '').includes('audio')) {
        const blob = await res.blob();
        lastError = null;
        return {
          url: URL.createObjectURL(blob),
          durationMs: Number(res.headers.get('X-Duration-Ms')) || 0,
          cached: res.headers.get('X-Cached') === '1',
        };
      }
      if (res.status === 404 || !(res.headers.get('Content-Type') || '').includes('json')) {
        pcHelperMissing = true; // não há ajudante neste endereço
      } else {
        lastError = (await res.json().catch(() => ({}))).error || `Erro ${res.status}`;
        return null;
      }
    } catch {
      pcHelperMissing = true;
    }
  }
  return silentPreview(text);
}

let warnedNoEngine = false;

function silentPreview(text: string): Promise<SynthResult> {
  if (!warnedNoEngine) {
    warnedNoEngine = true;
    console.warn('[LocalTts] Sem motor de voz (abra pelo Aedolia-PC.bat para ouvir no PC): tocando silêncio no lugar da voz.');
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(0.4, words / 2.4);
  const sampleRate = 8000;
  const samples = Math.round(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return new Promise((resolve) => setTimeout(() => resolve({ url, durationMs: seconds * 1000, cached: false }), 150));
}
