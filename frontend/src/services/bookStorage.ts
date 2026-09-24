/**
 * BookStorage Service - IndexedDB Nativo de Alta Capacidade
 * Permite salvar livros de 1MB a 50MB+ (com milhares de sentenças e texto completo)
 * sem restrições ou estouro da cota de 5MB do localStorage.
 */

import type { Book } from '../types';

const DB_NAME = 'GTP_EBOOK_READER_DB';
const DB_VERSION = 1;
const STORE_NAME = 'books_full_data';
const META_KEY = 'gtp_reader_books_meta';

// Memória em cache para acesso instantâneo síncrono
const inMemoryBooks = new Map<string, Book>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado neste navegador'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Salva um livro completo no IndexedDB e em memória
 */
export async function saveBookFull(book: Book): Promise<void> {
  if (!book || !book.id) return;
  inMemoryBooks.set(book.id, book);

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(book);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[BookStorage] Falha ao persistir no IndexedDB, mantido em memória:', err);
  }
}

/**
 * Recupera um livro completo pelo ID (memória ou IndexedDB)
 */
export async function getBookFull(id: string): Promise<Book | null> {
  if (inMemoryBooks.has(id)) {
    return inMemoryBooks.get(id)!;
  }

  try {
    const db = await openDatabase();
    return await new Promise<Book | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const result = req.result as Book | undefined;
        if (result) {
          inMemoryBooks.set(id, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Remove um livro do IndexedDB e memória
 */
export async function deleteBookFull(id: string): Promise<void> {
  inMemoryBooks.delete(id);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignora
  }
}

/**
 * Salva apenas metadados leves no localStorage (evita erro de cota 5MB)
 */
export function saveBooksMetadataSafe(books: Book[]): void {
  try {
    const metaList = books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      type: b.type,
      coverGradient: b.coverGradient,
      totalWords: b.totalWords,
      durationMinutes: b.durationMinutes,
      readingProgress: b.readingProgress,
      lastReadSentenceIndex: b.lastReadSentenceIndex,
      fileUrl: b.fileUrl,
      chapters: b.chapters || [],
      // Não salva content nem as milhares de sentences no localStorage
      sentencesCount: b.sentences?.length || 0,
    }));
    localStorage.setItem(META_KEY, JSON.stringify(metaList));
  } catch (e) {
    console.warn('[BookStorage] Cota de localStorage atingida, metadados preservados em memória:', e);
  }
}

/**
 * Carrega a lista de livros combinando metadados e armazenamento IndexedDB
 */
export async function loadInitialBooks(): Promise<Book[]> {
  const loadedList: Book[] = [];

  // 1. Tenta carregar todos os livros do IndexedDB
  try {
    const db = await openDatabase();
    const allFromDb = await new Promise<Book[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Book[]) || []);
      req.onerror = () => resolve([]);
    });

    if (allFromDb.length > 0) {
      allFromDb.forEach((b) => {
        inMemoryBooks.set(b.id, b);
        loadedList.push(b);
      });
      return loadedList;
    }
  } catch (err) {
    console.warn('[BookStorage] IndexedDB inicial vazio ou falhou:', err);
  }

  // 2. Fallback: lê metadados do localStorage
  try {
    const savedMeta = localStorage.getItem(META_KEY);
    if (savedMeta) {
      const parsed = JSON.parse(savedMeta);
      if (Array.isArray(parsed)) {
        return parsed.map((m: any) => ({
          id: m.id,
          title: m.title,
          author: m.author || 'Autor Desconhecido',
          coverGradient: m.coverGradient || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          type: m.type || 'pdf',
          content: '',
          sentences: [],
          chapters: m.chapters || [{ id: 'ch-1', title: 'Início', startIndex: 0 }],
          totalWords: m.totalWords || 0,
          durationMinutes: m.durationMinutes || 1,
          readingProgress: m.readingProgress || 0,
          lastReadSentenceIndex: m.lastReadSentenceIndex || 0,
          fileUrl: m.fileUrl,
          uploadedAt: m.uploadedAt || new Date().toISOString(),
        }));
      }
    }
  } catch {
    // ignora
  }

  return [];
}
