import type { Book, BookFolder } from '../types';

import { BACKEND_URL } from '../config';
import { apiFetch } from './session';
import type { SessionUser } from './session';

export const BACKEND_API_URL = BACKEND_URL;

// Todas as chamadas vão com a sessão do usuário (apiFetch). O servidor descobre quem é pelo token:
// nenhuma função manda user_id.
export type UserProfile = SessionUser;

/**
 * Livros do usuário logado (todo livro é privado).
 * Retorna null quando o servidor/banco não respondeu (diferente de uma estante vazia).
 */
export async function fetchCloudBooks(): Promise<Book[] | null> {
  try {
    const res = await apiFetch('/api/books');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.books)) {
        return data.books.map(mapDbToBook);
      }
    }
  } catch (err) {
    console.warn('Servidor fora do ar na listagem de livros:', err);
  }
  return null;
}

/** Salva o ponto de leitura no servidor */
export async function syncReadingProgressToCloud(
  bookId: string,
  sentenceIndex: number,
  progressPercentage: number
): Promise<boolean> {
  try {
    const res = await apiFetch('/api/reading-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book_id: bookId,
        last_sentence_index: sentenceIndex,
        progress_percentage: progressPercentage,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Erro ao sincronizar progresso com a nuvem:', err);
    return false;
  }
}

/** Envia o arquivo: o backend extrai o texto e guarda tudo na pasta do usuário no MinIO */
export async function uploadBookReal(
  file: File,
  title: string,
  author: string,
  coverBase64?: string,
  folderId?: string | null
): Promise<Book> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  formData.append('author', author);
  if (coverBase64) {
    formData.append('cover_base64', coverBase64);
  }
  if (folderId) {
    formData.append('folder_id', folderId);
  }

  const response = await apiFetch('/api/books/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    let message = errText;
    try {
      message = JSON.parse(errText).error || errText;
    } catch {
      // resposta não era JSON
    }
    throw new Error(message || `Falha no upload (HTTP ${response.status})`);
  }

  const result = await response.json();
  if (!result.success || !result.book) {
    throw new Error(result.error || 'Erro ao processar livro');
  }

  return mapDbToBook(result.book);
}

/** Remove o livro do banco e a pasta dele no MinIO */
export async function deleteBookReal(bookId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/books/${bookId}`, { method: 'DELETE' });
    return res.ok;
  } catch (e) {
    console.warn('Erro ao deletar livro via backend:', e);
    return false;
  }
}

// ------------------------------------------------------------------ pastas da estante

/** Resposta de uma ação de pasta: o dado, ou a mensagem de erro para mostrar ao usuário */
export type FolderResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function folderRequest<T>(path: string, init: RequestInit, pick: (json: any) => T): Promise<FolderResult<T>> {
  try {
    const res = await apiFetch(path, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: pick(json) };
    return { ok: false, error: json.error || `Erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Sem conexão com o servidor.' };
  }
}

/** Pastas do usuário; null quando o servidor não respondeu */
export async function fetchFolders(): Promise<BookFolder[] | null> {
  const r = await folderRequest('/api/folders', {}, (j) => (j.folders || []) as BookFolder[]);
  return r.ok ? r.data.map((f) => ({ id: f.id, name: f.name })) : null;
}

export function createFolder(name: string) {
  return folderRequest('/api/folders', { method: 'POST', body: JSON.stringify({ name }) },
    (j) => ({ id: j.folder.id, name: j.folder.name }) as BookFolder);
}

export function renameFolder(folderId: string, name: string) {
  return folderRequest(`/api/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify({ name }) },
    (j) => ({ id: j.folder.id, name: j.folder.name }) as BookFolder);
}

/** Apaga a pasta; os livros dela voltam para "sem pasta" */
export function deleteFolder(folderId: string) {
  return folderRequest(`/api/folders/${folderId}`, { method: 'DELETE' }, () => true);
}

export function moveBookToFolder(bookId: string, folderId: string | null) {
  return folderRequest(`/api/books/${bookId}/folder`, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }) },
    () => true);
}

// ------------------------------------------------------------------ estatísticas de leitura

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export interface ReadingStats {
  period: StatsPeriod;
  offset: number;
  start: string;
  end: string;
  today: string;
  totals: { words: number; seconds: number; active_days: number; books: number; words_per_day: number };
  series: { key: string; words: number; seconds: number; future: boolean }[];
  books: { book_id: string; title: string; words: number; seconds: number }[];
  lifetime: { words: number; seconds: number };
  streak_days: number;
}

export async function fetchReadingStats(period: StatsPeriod, offset = 0): Promise<ReadingStats | null> {
  try {
    const res = await apiFetch(`/api/stats/reading?period=${period}&offset=${offset}`);
    if (res.ok) return (await res.json()) as ReadingStats;
  } catch (err) {
    console.warn('Erro ao carregar estatísticas de leitura:', err);
  }
  return null;
}

/** Soma leitura real (palavras que a voz leu e segundos ouvindo) no dia de hoje */
export async function postReadingStats(bookId: string, words: number, seconds: number): Promise<boolean> {
  try {
    const res = await apiFetch('/api/stats/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, words, seconds }),
      keepalive: true,
    });
    // 4xx (livro apagado, valor inválido): não adianta reenviar
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401);
  } catch {
    return false;
  }
}

/**
 * Busca o conteúdo completo do livro (sentenças, estrutura e capítulos) sob demanda.
 * Livros grandes têm dezenas de MB: onProgress recebe a fração baixada (0 a 1) quando o
 * servidor informa o tamanho (cabeçalho X-Content-Size, tamanho já descompactado).
 */
export async function fetchBookFullContent(
  bookId: string,
  onProgress?: (fraction: number) => void
): Promise<Book | null> {
  try {
    const res = await apiFetch(`/api/books/${bookId}/content`);
    if (!res.ok) return null;

    const total = Number(res.headers.get('X-Content-Size')) || 0;
    let text: string;
    if (res.body && total > 0 && onProgress) {
      const reader = res.body.getReader();
      const buffer = new Uint8Array(total);
      const extra: Uint8Array[] = [];
      let received = 0;
      let lastReported = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.length <= total) buffer.set(value, received);
        else extra.push(value);
        received += value.length;
        const pct = Math.floor((Math.min(received, total) / total) * 100);
        if (pct !== lastReported) {
          lastReported = pct;
          onProgress(pct / 100);
        }
      }
      const decoder = new TextDecoder();
      text = extra.length
        ? decoder.decode(buffer, { stream: true }) + extra.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode()
        : decoder.decode(buffer.subarray(0, received));
    } else {
      text = await res.text();
    }

    const data = JSON.parse(text);
    if (data.success && data.book) {
      return mapDbToBook(data.book);
    }
  } catch (err) {
    console.warn('Erro ao carregar conteúdo completo do livro:', err);
  }
  return null;
}

function mapDbToBook(row: any): Book {
  let sentencesArr: string[] = [];
  if (Array.isArray(row.sentences)) {
    sentencesArr = row.sentences;
  } else if (typeof row.sentences === 'string') {
    try {
      sentencesArr = JSON.parse(row.sentences);
    } catch {
      sentencesArr = [];
    }
  }

  let chaptersArr: any[] = [];
  if (Array.isArray(row.chapters)) {
    chaptersArr = row.chapters;
  } else if (typeof row.chapters === 'string') {
    try {
      chaptersArr = JSON.parse(row.chapters);
    } catch {
      chaptersArr = [];
    }
  }

  let structure: any = row.structure;
  if (typeof structure === 'string') {
    try {
      structure = JSON.parse(structure);
    } catch {
      structure = null;
    }
  }
  const hasStructure =
    structure &&
    Array.isArray(structure.paragraph_starts) &&
    typeof structure.kinds === 'string' &&
    structure.kinds.length === sentencesArr.length;

  return {
    id: row.id,
    title: row.title,
    author: row.author || 'Autor Desconhecido',
    coverGradient: row.cover_gradient || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    coverImage: row.cover_image_url || row.coverImage || row.cover_image || undefined,
    type: (row.type as any) || 'pdf',
    content: row.content || '',
    sentences: sentencesArr,
    paragraphStarts: hasStructure ? structure.paragraph_starts : undefined,
    sentenceKinds: hasStructure ? structure.kinds : undefined,
    structureVersion: hasStructure ? Number(structure.version) || 0 : undefined,
    chapters: chaptersArr,
    totalWords: row.total_words || 0,
    durationMinutes: row.duration_minutes || Math.max(1, Math.ceil((row.total_words || 0) / 140)),
    readingProgress: row.reading_progress || 0,
    lastReadSentenceIndex: row.last_read_sentence_index || 0,
    uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : 'Hoje',
    fileUrl: row.file_url,
    userId: row.user_id || row.userId,
    folderId: row.folder_id ?? null,
    contentRev: Number(row.content_rev) || 0,
  };
}
