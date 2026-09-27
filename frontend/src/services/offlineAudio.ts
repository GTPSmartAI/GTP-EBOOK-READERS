import { BACKEND_URL } from '../config';
import { apiFetch } from './session';
import { saveBookFull } from './bookStorage';
import type { Book } from '../types';

/**
 * Capítulos baixados para ouvir sem internet (APK).
 *
 * - O áudio de cada trecho é gerado pelo servidor como na leitura normal e guardado no IndexedDB do
 *   aparelho (store "clips"). A chave junta o livro com um hash do texto e da voz: se o trecho estiver
 *   baixado com a mesma voz, o player usa o arquivo local em vez de pedir ao servidor.
 * - Sem internet, o player aceita o trecho baixado mesmo com outra voz (índice do trecho).
 * - Cada capítulo baixado (store "chapters") vence em 7 dias e é apagado sozinho.
 * - O texto do livro já fica no aparelho (bookStorage); o download garante que ele esteja salvo.
 */

export const OFFLINE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const DB_NAME = 'GTP_OFFLINE_AUDIO';
const DB_VERSION = 1;
const BATCH_SIZE = 20;
const PARALLEL_BATCHES = 2;
const MAX_QUEUE = 30;

export interface SynthParams {
  voice_id: string;
  cadence: string;
  pitch_override: string | null;
  rate_override: string | null;
}

interface ClipRecord {
  key: string;
  bookId: string;
  index: number;
  blob: Blob;
  size: number;
}

export interface OfflineChapter {
  id: string; // `${bookId}|${chapterId}`
  userId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  voiceName: string;
  clipKeys: string[];
  missing: number;
  bytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface DownloadJob {
  id: string; // mesmo id do capítulo
  bookId: string;
  bookTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  done: number;
  total: number;
  state: 'queued' | 'downloading' | 'error';
  error?: string;
}

export interface OfflineState {
  chapters: OfflineChapter[];
  jobs: DownloadJob[];
}

// ------------------------------------------------------------------ chave do trecho

/** Hash de 53 bits (cyrb53): rápido e síncrono, suficiente para identificar texto + voz */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function clipKey(bookId: string, text: string, p: SynthParams): string {
  return `${bookId}|${cyrb53(JSON.stringify([text, p.voice_id, p.cadence, p.pitch_override, p.rate_override]))}`;
}

const hasSpeech = (text: string) => /[\w\d]/.test(text);

// ------------------------------------------------------------------ IndexedDB

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clips')) {
          db.createObjectStore('clips', { keyPath: 'key' }).createIndex('bookId', 'bookId');
        }
        if (!db.objectStoreNames.contains('chapters')) {
          db.createObjectStore('chapters', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: 'clips' | 'chapters', mode: IDBTransactionMode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

// ------------------------------------------------------------------ estado e avisos para a tela

let userId = '';
let chaptersCache: OfflineChapter[] = [];
let jobs: DownloadJob[] = [];
const listeners = new Set<(s: OfflineState) => void>();

function emit() {
  const state = getOfflineState();
  listeners.forEach((l) => l(state));
}

export function getOfflineState(): OfflineState {
  return { chapters: chaptersCache.filter((c) => c.userId === userId), jobs: [...jobs] };
}

export function subscribeOffline(listener: (s: OfflineState) => void): () => void {
  listeners.add(listener);
  listener(getOfflineState());
  return () => listeners.delete(listener);
}

async function reloadChapters() {
  try {
    chaptersCache = (await reqPromise((await store('chapters')).getAll())) as OfflineChapter[];
  } catch {
    chaptersCache = [];
  }
  emit();
}

/** Liga o serviço para o usuário logado: apaga o que venceu e carrega a lista de baixados */
export async function initOffline(currentUserId: string) {
  userId = currentUserId;
  try {
    // Pede ao navegador para não apagar os downloads quando faltar espaço
    await navigator.storage?.persist?.();
  } catch {
    // opcional
  }
  await purgeExpired();
}

export async function purgeExpired() {
  await reloadChapters();
  const now = Date.now();
  for (const ch of chaptersCache.filter((c) => c.expiresAt <= now)) {
    await deleteOfflineChapter(ch.id);
  }
}

// ------------------------------------------------------------------ áudio para o player

// Livro aberto no leitor: chave do trecho -> URL local, e índice do trecho -> URL local (uso sem internet)
let activeBookId = '';
let byKey = new Map<string, string>();
let byIndex = new Map<number, string>();

function revokeActive() {
  new Set([...byKey.values(), ...byIndex.values()]).forEach((u) => URL.revokeObjectURL(u));
  byKey = new Map();
  byIndex = new Map();
}

/** Carrega os trechos baixados do livro aberto (os arquivos ficam no disco; só os links vão para a memória) */
export async function activateOfflineBook(bookId: string) {
  if (bookId === activeBookId) return;
  activeBookId = bookId;
  revokeActive();
  if (!bookId) return;
  try {
    const clips = (await reqPromise((await store('clips')).index('bookId').getAll(bookId))) as ClipRecord[];
    if (activeBookId !== bookId) return;
    for (const c of clips) {
      const url = URL.createObjectURL(c.blob);
      byKey.set(c.key, url);
      byIndex.set(c.index, url);
    }
  } catch (e) {
    console.warn('[Offline] Não foi possível ler os capítulos baixados:', e);
  }
}

async function refreshActiveBook(bookId: string) {
  if (bookId !== activeBookId) return;
  activeBookId = '';
  await activateOfflineBook(bookId);
}

/**
 * Áudio baixado para o trecho, ou null. Com internet só vale o áudio da mesma voz;
 * sem internet, qualquer áudio baixado daquele trecho serve.
 */
export function offlineClipUrl(bookId: string, index: number, text: string, p: SynthParams): string | null {
  if (!bookId || bookId !== activeBookId || byKey.size === 0) return null;
  const exact = byKey.get(clipKey(bookId, text, p));
  if (exact) return exact;
  return navigator.onLine ? null : byIndex.get(index) ?? null;
}

// ------------------------------------------------------------------ apagar

export async function deleteOfflineChapter(id: string) {
  const ch = chaptersCache.find((c) => c.id === id);
  if (!ch) return;
  // Trecho repetido em outro capítulo baixado continua guardado
  const stillUsed = new Set(chaptersCache.filter((c) => c.id !== id && c.bookId === ch.bookId).flatMap((c) => c.clipKeys));
  try {
    const clips = await store('clips', 'readwrite');
    for (const key of ch.clipKeys) {
      if (!stillUsed.has(key)) clips.delete(key);
    }
    await reqPromise((await store('chapters', 'readwrite')).delete(id));
  } catch (e) {
    console.warn('[Offline] Falha ao apagar capítulo baixado:', e);
  }
  await reloadChapters();
  await refreshActiveBook(ch.bookId);
}

export async function deleteOfflineBook(bookId: string) {
  for (const ch of chaptersCache.filter((c) => c.bookId === bookId && c.userId === userId)) {
    await deleteOfflineChapter(ch.id);
  }
}

export async function deleteAllOffline() {
  for (const ch of chaptersCache.filter((c) => c.userId === userId)) {
    await deleteOfflineChapter(ch.id);
  }
}

// ------------------------------------------------------------------ baixar

interface PlannedItem {
  index: number;
  text: string;
  params: SynthParams;
  key: string;
}

interface PlannedChapter {
  job: DownloadJob;
  record: Omit<OfflineChapter, 'clipKeys' | 'missing' | 'bytes' | 'createdAt' | 'expiresAt'>;
  items: PlannedItem[];
}

const plans = new Map<string, PlannedChapter>();
let running = false;
const cancelled = new Set<string>();

/**
 * Coloca capítulos na fila de download. `paramsFor` diz a voz de cada trecho (a mesma do player,
 * incluindo personagens do modo teatro). Devolve quantos capítulos entraram na fila.
 */
export async function queueChapterDownloads(
  book: Book,
  chapterIndexes: number[],
  paramsFor: (sentenceIndex: number) => SynthParams,
  voiceName: string,
): Promise<number> {
  // Garante o texto do livro no aparelho (a leitura sem internet precisa dele)
  await saveBookFull(book).catch(() => {});

  let added = 0;
  for (const idx of chapterIndexes) {
    const chapter = book.chapters[idx];
    if (!chapter) continue;
    const id = `${book.id}|${chapter.id}`;
    if (plans.has(id) || jobs.length >= MAX_QUEUE) continue;
    const start = chapter.startIndex;
    const end = book.chapters[idx + 1]?.startIndex ?? book.sentences.length;
    const items: PlannedItem[] = [];
    for (let i = start; i < end; i++) {
      const text = book.sentences[i] || '';
      if (!hasSpeech(text)) continue;
      const params = paramsFor(i);
      items.push({ index: i, text, params, key: clipKey(book.id, text, params) });
    }
    const job: DownloadJob = {
      id,
      bookId: book.id,
      bookTitle: book.title,
      chapterTitle: chapter.title,
      chapterNumber: idx + 1,
      done: 0,
      total: items.length,
      state: 'queued',
    };
    plans.set(id, {
      job,
      items,
      record: {
        id,
        userId,
        bookId: book.id,
        bookTitle: book.title,
        chapterId: chapter.id,
        chapterNumber: idx + 1,
        chapterTitle: chapter.title,
        voiceName,
      },
    });
    cancelled.delete(id);
    jobs.push(job);
    added++;
  }
  emit();
  runQueue();
  return added;
}

export function cancelDownload(id: string) {
  cancelled.add(id);
  plans.delete(id);
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

export function cancelAllDownloads() {
  jobs.forEach((j) => cancelled.add(j.id));
  plans.clear();
  jobs = [];
  emit();
}

async function runQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = jobs.find((j) => j.state === 'queued');
      if (!next) break;
      const plan = plans.get(next.id);
      if (!plan) {
        jobs = jobs.filter((j) => j.id !== next.id);
        continue;
      }
      next.state = 'downloading';
      emit();
      try {
        await downloadChapter(plan);
        jobs = jobs.filter((j) => j.id !== next.id);
        plans.delete(next.id);
      } catch (e: any) {
        if (cancelled.has(next.id)) continue;
        next.state = 'error';
        next.error = e?.message || 'Falha no download.';
        plans.delete(next.id);
        // Sem internet: o resto da fila também falharia
        if (!navigator.onLine) {
          jobs.forEach((j) => {
            if (j.state === 'queued') {
              j.state = 'error';
              j.error = 'Sem internet.';
              plans.delete(j.id);
            }
          });
        }
      }
      emit();
    }
  } finally {
    running = false;
  }
}

async function storedKeys(keys: string[]): Promise<Set<string>> {
  const clips = await store('clips');
  const found = new Set<string>();
  await Promise.all(
    keys.map(async (k) => {
      const count = await reqPromise(clips.count(k));
      if (count > 0) found.add(k);
    }),
  );
  return found;
}

async function downloadChapter(plan: PlannedChapter) {
  const { job, items, record } = plan;
  const unique = new Map(items.map((it) => [it.key, it]));
  const have = await storedKeys([...unique.keys()]);
  const todo = [...unique.values()].filter((it) => !have.has(it.key));
  job.done = items.length - todo.length;
  emit();

  let bytes = 0;
  const failed: PlannedItem[] = [];

  const runBatch = async (batch: PlannedItem[]) => {
    if (cancelled.has(job.id)) throw new Error('cancelado');
    const res = await apiFetch('/api/tts/prefetch-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: batch.map((it) => ({ index: it.index, text: it.text, ...it.params })),
        rate: 1.0,
      }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'Sessão expirada. Entre de novo.' : 'O servidor não respondeu.');
    const data = await res.json();
    const urlByIndex = new Map<number, string>();
    for (const r of data.items || []) if (r.audio_url) urlByIndex.set(r.index, r.audio_url);

    await Promise.all(
      batch.map(async (it) => {
        const url = urlByIndex.get(it.index);
        if (!url) return failed.push(it);
        try {
          const audio = await fetch(`${BACKEND_URL}${url}`);
          if (!audio.ok) return failed.push(it);
          const blob = await audio.blob();
          const rec: ClipRecord = { key: it.key, bookId: record.bookId, index: it.index, blob, size: blob.size };
          await reqPromise((await store('clips', 'readwrite')).put(rec));
          bytes += blob.size;
          job.done++;
          emit();
        } catch {
          failed.push(it);
        }
      }),
    );
  };

  const batches: PlannedItem[][] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));
  while (batches.length) {
    if (!navigator.onLine) throw new Error('Sem internet.');
    await Promise.all(batches.splice(0, PARALLEL_BATCHES).map(runBatch));
  }

  // Uma segunda tentativa para o que falhou (áudio que saiu do cache do servidor, falha de rede momentânea)
  if (failed.length) {
    const retry = failed.splice(0);
    for (let i = 0; i < retry.length; i += BATCH_SIZE) await runBatch(retry.slice(i, i + BATCH_SIZE));
  }
  if (cancelled.has(job.id)) throw new Error('cancelado');
  if (failed.length > items.length * 0.1) throw new Error('Muitos trechos falharam. Tente de novo.');

  // Tamanho total inclui trechos que já estavam baixados
  const reused = [...have];
  if (reused.length) {
    const clips = await store('clips');
    const found = await Promise.all(reused.map((k) => reqPromise(clips.get(k)) as Promise<ClipRecord | undefined>));
    found.forEach((c) => (bytes += c?.size || 0));
  }

  const now = Date.now();
  const failedKeys = new Set(failed.map((f) => f.key));
  const chapter: OfflineChapter = {
    ...record,
    clipKeys: [...unique.keys()].filter((k) => !failedKeys.has(k)),
    missing: failed.length,
    bytes,
    createdAt: now,
    expiresAt: now + OFFLINE_DAYS * DAY_MS,
  };
  await reqPromise((await store('chapters', 'readwrite')).put(chapter));
  await reloadChapters();
  await refreshActiveBook(record.bookId);
}

// ------------------------------------------------------------------ formatação

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
}
