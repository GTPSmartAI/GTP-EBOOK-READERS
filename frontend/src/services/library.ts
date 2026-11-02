import type { BookFolder } from '../types';

/**
 * Biblioteca no próprio aparelho: dono dos dados, pastas e estatísticas de leitura.
 * Antes ficava no servidor (MariaDB); agora tudo fica no armazenamento do app (localStorage + IndexedDB).
 */

// ------------------------------------------------------------------ dono dos dados

export interface LocalOwner {
  id: string;
  name: string;
}

/**
 * Os livros e o progresso já salvos no celular estão marcados com o id da conta antiga (quando havia login).
 * O app continua usando esse id, para achar tudo; aparelho novo usa "local".
 */
export function getLocalOwner(): LocalOwner {
  try {
    const legacy = JSON.parse(localStorage.getItem('gtp_session_user') || 'null');
    if (legacy?.id) return { id: String(legacy.id), name: legacy.full_name || legacy.username || 'Leitor' };
  } catch {
    // sessão antiga ilegível
  }
  return { id: 'local', name: 'Leitor' };
}

// ------------------------------------------------------------------ pastas da estante

/** Resposta de uma ação de pasta: o dado, ou a mensagem de erro para mostrar */
export type FolderResult<T> = { ok: true; data: T } | { ok: false; error: string };

const foldersKey = (ownerId: string) => `gtp_folders_${ownerId}`;

export function loadFolders(ownerId: string): BookFolder[] {
  try {
    const list = JSON.parse(localStorage.getItem(foldersKey(ownerId)) || '[]');
    return Array.isArray(list) ? list.map((f: BookFolder) => ({ id: String(f.id), name: String(f.name) })) : [];
  } catch {
    return [];
  }
}

export function saveFolders(ownerId: string, folders: BookFolder[]) {
  try {
    localStorage.setItem(foldersKey(ownerId), JSON.stringify(folders));
  } catch {
    // armazenamento cheio: as pastas ficam só nesta sessão
  }
}

/** Confere o nome da pasta (vazio, longo demais ou repetido) */
export function validateFolderName(name: string, folders: BookFolder[], ignoreId?: string): FolderResult<string> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return { ok: false, error: 'Dê um nome para a pasta.' };
  if (clean.length > 60) return { ok: false, error: 'Nome muito longo (máximo de 60 letras).' };
  const lower = clean.toLocaleLowerCase('pt-BR');
  if (folders.some((f) => f.id !== ignoreId && f.name.toLocaleLowerCase('pt-BR') === lower)) {
    return { ok: false, error: 'Já existe uma pasta com esse nome.' };
  }
  return { ok: true, data: clean };
}

export const newFolderId = () => `pasta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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

/** Leitura por dia: { "2026-11-02": { idDoLivro: { w: palavras, s: segundos } } } */
type StatsStore = Record<string, Record<string, { w: number; s: number }>>;

const statsKey = (ownerId: string) => `gtp_reading_stats_${ownerId}`;

function loadStats(ownerId: string): StatsStore {
  try {
    const data = JSON.parse(localStorage.getItem(statsKey(ownerId)) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Data local do aparelho (AAAA-MM-DD) */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const parseIso = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Soma leitura real (palavras que a voz leu e segundos ouvindo) no dia de hoje */
export function addReadingStats(ownerId: string, bookId: string, words: number, seconds: number) {
  if (!bookId || (words <= 0 && seconds <= 0)) return;
  const store = loadStats(ownerId);
  const day = isoDate(new Date());
  const entry = ((store[day] ||= {})[bookId] ||= { w: 0, s: 0 });
  entry.w += Math.max(0, Math.round(words));
  entry.s += Math.max(0, Math.round(seconds));
  try {
    localStorage.setItem(statsKey(ownerId), JSON.stringify(store));
  } catch {
    // armazenamento cheio: perde só esta soma
  }
}

/** Títulos dos livros da estante (o livro apagado aparece como "Livro removido") */
function bookTitles(ownerId: string): Map<string, string> {
  try {
    const meta = JSON.parse(localStorage.getItem(`gtp_reader_books_meta_${ownerId}`) || '[]');
    return new Map(Array.isArray(meta) ? meta.map((b: { id: string; title: string }) => [b.id, b.title]) : []);
  } catch {
    return new Map();
  }
}

/**
 * Períodos (calendário do aparelho), com offset para navegar para trás (0 = atual, -1 = anterior):
 * day = o dia, gráfico com os 7 dias até ele; week = segunda a domingo; month = o mês; year = o ano, gráfico por mês.
 */
export function computeReadingStats(ownerId: string, period: StatsPeriod, offset = 0): ReadingStats {
  const store = loadStats(ownerId);
  const today = parseIso(isoDate(new Date()));

  let start: Date;
  let end: Date;
  let chartStart: Date;
  let grain: 'day' | 'month' = 'day';
  if (period === 'day') {
    start = end = addDays(today, offset);
    chartStart = addDays(start, -6);
  } else if (period === 'month') {
    start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    chartStart = start;
  } else if (period === 'year') {
    start = new Date(today.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear(), 11, 31);
    chartStart = start;
    grain = 'month';
  } else {
    const weekday = (today.getDay() + 6) % 7; // segunda = 0
    start = addDays(today, -weekday + offset * 7);
    end = addDays(start, 6);
    chartStart = start;
  }

  const series: ReadingStats['series'] = [];
  if (grain === 'day') {
    for (let d = chartStart; d <= end; d = addDays(d, 1)) series.push({ key: isoDate(d), words: 0, seconds: 0, future: d > today });
  } else {
    for (let m = 0; m < 12; m++) {
      const first = new Date(start.getFullYear(), m, 1);
      series.push({ key: isoDate(first).slice(0, 7), words: 0, seconds: 0, future: first > today });
    }
  }
  const byKey = new Map(series.map((p) => [p.key, p]));

  const titles = bookTitles(ownerId);
  const totals = { words: 0, seconds: 0 };
  const activeDays = new Set<string>();
  const books = new Map<string, ReadingStats['books'][number]>();
  const lifetime = { words: 0, seconds: 0 };
  const daysWithReading = new Set<string>();

  for (const [day, perBook] of Object.entries(store)) {
    const date = parseIso(day);
    for (const [bookId, { w, s }] of Object.entries(perBook)) {
      lifetime.words += w;
      lifetime.seconds += s;
      if (w > 0 || s > 0) daysWithReading.add(day);
      const point = byKey.get(grain === 'day' ? day : day.slice(0, 7));
      if (point) {
        point.words += w;
        point.seconds += s;
      }
      if (date >= start && date <= end) {
        totals.words += w;
        totals.seconds += s;
        if (w > 0 || s >= 30) activeDays.add(day);
        const b = books.get(bookId) || { book_id: bookId, title: titles.get(bookId) || 'Livro removido', words: 0, seconds: 0 };
        b.words += w;
        b.seconds += s;
        books.set(bookId, b);
      }
    }
  }

  // Dias seguidos com leitura, terminando hoje (ou ontem, se hoje ainda não leu)
  let cursor = daysWithReading.has(isoDate(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (daysWithReading.has(isoDate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const elapsedDays = start <= today ? Math.max(1, Math.round(((end < today ? end : today).getTime() - start.getTime()) / 86400000) + 1) : 1;
  return {
    period,
    offset,
    start: isoDate(start),
    end: isoDate(end),
    today: isoDate(today),
    totals: {
      words: totals.words,
      seconds: totals.seconds,
      active_days: activeDays.size,
      books: [...books.values()].filter((b) => b.words > 0 || b.seconds > 0).length,
      words_per_day: Math.round(totals.words / elapsedDays),
    },
    series,
    books: [...books.values()].sort((a, b) => b.seconds - a.seconds || b.words - a.words).slice(0, 5),
    lifetime,
    streak_days: streak,
  };
}
