/**
 * Pipeline de texto: recebe parágrafos já extraídos (PDF, EPUB, DOCX, TXT, HTML) e monta a estrutura de leitura:
 * - unidades faladas: frases, e dentro delas os trechos de fala e de narração separados
 * - tipo de cada unidade: narração (n), fala de personagem (d), mensagem entre colchetes (s) ou título (h)
 * - índice da primeira unidade de cada parágrafo
 * - capítulos apontando para a unidade onde começam
 *
 * Tradução fiel de servidor-arquivado/backend/components/ProcessadorLivros/python/text_pipeline.py: o mesmo livro gera
 * as mesmas unidades, então o ponto de leitura de um livro importado de novo continua valendo.
 */

export const STRUCTURE_VERSION = 4; // 3: trechos entre colchetes (s); 4: 『 』 e 【 】 também

export const KIND_NARRATION = 'n';
export const KIND_DIALOGUE = 'd';
export const KIND_HEADING = 'h';
export const KIND_SYSTEM = 's'; // texto entre colchetes [ ] 『 』 【 】: mensagens de sistema/janelas

// Tamanho máximo de uma unidade enviada à voz (frases gigantes sem pontuação são quebradas)
const MAX_UNIT_CHARS = 360;

export interface Paragraph {
  text: string;
  heading?: boolean;
  chapterTitle?: string | null; // quando definido, um capítulo começa neste parágrafo
  page?: number | null; // página de origem (apenas PDF)
}

export interface BookStructure {
  content: string;
  sentences: string[];
  chapters: { id: string; title: string; startIndex: number }[];
  totalWords: number;
  durationMinutes: number;
  structure: { version: number; paragraphStarts: number[]; kinds: string };
}

type Piece = [string, string]; // (texto, tipo)

// ---------------------------------------------------------------------------
// Caracteres (equivalentes aos métodos de str do Python)
// ---------------------------------------------------------------------------

export const WORD_RE = /[\p{L}\p{N}_]/u;
export const hasWord = (s: string) => WORD_RE.test(s);
export const isUpper = (ch: string) => !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
export const isLower = (ch: string) => !!ch && ch !== ch.toUpperCase() && ch === ch.toLowerCase();
export const isAlpha = (ch: string) => !!ch && /\p{L}/u.test(ch);
export const isDigit = (ch: string) => !!ch && /\p{Nd}/u.test(ch);
export const isSpace = (ch: string) => !!ch && /\s/.test(ch);

/** str.strip(chars) do Python */
export function stripChars(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

/** str.lstrip(chars) do Python */
function lstripChars(s: string, chars: string): string {
  let a = 0;
  while (a < s.length && chars.includes(s[a])) a++;
  return s.slice(a);
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

const INVISIBLE_CHARS = /[­​‌‍⁠﻿]/g;

/** Remove hífens invisíveis e caracteres de largura zero, e colapsa espaços. */
export function normalizeWhitespace(text: string): string {
  if (!text) return '';
  return text
    .replace(INVISIBLE_CHARS, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junta linhas quebradas pelo layout da página desfazendo a hifenização ("ci-" + "dade"). */
export function joinWrappedLines(lines: string[]): string {
  let result = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!result) result = line;
    else if (result.endsWith('-') && result.length > 1 && isAlpha(result[result.length - 2]) && isLower(line[0])) {
      result = result.slice(0, -1) + line;
    } else {
      result = `${result} ${line}`;
    }
  }
  return result;
}

export function countWords(text: string): number {
  if (!text) return 0;
  return (text.match(/[\p{L}\p{N}_]+/gu) || []).length;
}

// ---------------------------------------------------------------------------
// Títulos de capítulo
// ---------------------------------------------------------------------------

const NUMBER_WORDS =
  'um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|' +
  'catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|' +
  'primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|s[ée]tim[oa]|' +
  'oitav[oa]|non[oa]|d[ée]cim[oa]|[úu]ltim[oa]|final|' +
  'one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|last';

// \b do Python (Unicode): fim da palavra = não segue letra/número
const NUMBERED_HEADING_RE = new RegExp(
  `^(cap[íi]tulo|chapter|parte|part|livro|book|ato)\\s+([0-9]+|[ivxlcdm]+|${NUMBER_WORDS})(?![\\p{L}\\p{N}_])`,
  'iu'
);
const SECTION_HEADING_RE =
  /^(pr[óo]logo|ep[íi]logo|pref[áa]cio|introdu[çc][ãa]o|conclus[ãa]o|ap[êe]ndice|posf[áa]cio|interl[úu]dio|agradecimentos|prologue|epilogue|preface|introduction)(?![\p{L}\p{N}_])/iu;

/** Reconhece linhas como "Capítulo 3", "CAPÍTULO XII – A Fuga", "Prólogo" ou "Parte Dois". */
export function isChapterHeading(line: string): boolean {
  const s = line.trim();
  if (!s || s.length > 80 || s.endsWith(',') || s.endsWith(';')) return false;
  if (NUMBERED_HEADING_RE.test(s)) return true;
  // Seções nomeadas só contam quando a linha é curta (evita "Introdução ao tema foi...")
  return SECTION_HEADING_RE.test(s) && s.split(/\s+/).length <= 8 && !s.endsWith('.');
}

// ---------------------------------------------------------------------------
// Divisão em frases
// ---------------------------------------------------------------------------

// Abreviações que costumam vir antes de nomes próprios ou números ("Sr. Silva", "pág. 12")
const ABBREVIATIONS = new Set([
  'sr', 'sra', 'srta', 'srs', 'sras', 'dr', 'dra', 'drs', 'dras', 'prof', 'profa', 'profs',
  'exmo', 'exma', 'sto', 'sta', 'd', 'dom', 'gen', 'gal', 'cel', 'ten', 'sgt', 'sgto',
  'cap', 'maj', 'adm', 'mons', 'pe', 'fr', 'rev', 'av', 'r', 'jr', 'mr', 'mrs', 'ms', 'st',
  'pág', 'pag', 'págs', 'pags', 'p', 'pp', 'n', 'nº', 'art', 'arts', 'fig', 'figs', 'vol',
  'vols', 'ed', 'tel', 'cf', 'séc', 'sec', 'cia', 'ltda', 'vs', 'v', 'trad', 'coord', 'aprox',
]);

const BOUNDARY_RE = /([.!?…]+)(["”’»)\]]*)(\s+)/g;
const OPENING_QUOTES = '"“«‘\'(';
const DASHES = '—–';

function isAbbreviation(text: string, dotPos: number): boolean {
  const match = /([\p{L}\p{N}_ºª.]+)$/u.exec(text.slice(0, dotPos));
  if (!match) return false;
  const token = match[1];
  if (token.length === 1 && isUpper(token)) return true; // iniciais: "J. R. R. Tolkien"
  const lower = token.toLowerCase();
  if (ABBREVIATIONS.has(lower)) return true;
  const parts = lower.split('.');
  return parts.length > 1 && parts.every((p) => p.length <= 1); // "a.C", "E.U.A"
}

/** Decide se o texto a partir de `pos` inicia uma nova frase. */
function startsNewSentence(text: string, pos: number): boolean {
  const ch = text[pos];
  if (DASHES.includes(ch) || (ch === '-' && text[pos + 1] === ' ')) {
    // "— Quem é? — perguntou Maria": travessão seguido de minúscula continua a mesma frase
    const rest = text.slice(pos + 1).trimStart();
    return Boolean(rest) && (isUpper(rest[0]) || OPENING_QUOTES.includes(rest[0]));
  }
  if (OPENING_QUOTES.includes(ch)) {
    const rest = lstripChars(text.slice(pos), OPENING_QUOTES + ' ');
    return Boolean(rest) && (isUpper(rest[0]) || isDigit(rest[0]) || '…¿¡'.includes(rest[0]));
  }
  return isUpper(ch) || isDigit(ch) || '¿¡'.includes(ch);
}

/** Divide um parágrafo em frases respeitando abreviações, reticências, aspas e travessões. */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.trim();
  if (!text) return [];

  const sentences: string[] = [];
  let start = 0;
  BOUNDARY_RE.lastIndex = 0;
  for (const match of text.matchAll(BOUNDARY_RE)) {
    const matchStart = match.index!;
    const nextPos = matchStart + match[0].length;
    if (nextPos >= text.length) continue;
    if (!startsNewSentence(text, nextPos)) continue;
    if (match[1] === '.' && isAbbreviation(text, matchStart)) continue;
    const end2 = matchStart + match[1].length + match[2].length;
    const piece = text.slice(start, end2).trim();
    if (piece) sentences.push(piece);
    start = nextPos;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

// ---------------------------------------------------------------------------
// Separação entre fala e narração
// ---------------------------------------------------------------------------

const CLOSING_QUOTES = '”»';
const TRAILING_PUNCT = ',.;:!?…';

/**
 * Travessão de diálogo: vem no início ou depois de espaço, nunca colado ao fim da palavra ("não—").
 * Aceita os dois estilos de edição: "— Sim — disse ele" e "—Sim —disse ele".
 */
function isDialogueDash(text: string, i: number): boolean {
  const ch = text[i];
  const beforeOk = i === 0 || isSpace(text[i - 1]);
  if (DASHES.includes(ch)) return beforeOk;
  if (ch === '-') {
    // hífen só conta isolado por espaços ("- Sim - disse ele"), para não confundir com "-5 graus"
    return beforeOk && (i + 1 >= text.length || isSpace(text[i + 1]));
  }
  return false;
}

// Colchetes de mensagem de sistema/título de obra: abertura -> fechamento
const SYSTEM_BRACKETS: Record<string, string> = { '[': ']', '『': '』', '【': '】' };

interface QuoteState {
  quote: boolean;
  bracket: string | false; // caractere de fechamento esperado
}

/**
 * Separa trechos entre aspas (fala) e entre colchetes (mensagem de sistema) do restante (narração).
 * O estado de aspas/colchetes abertos atravessa as frases do parágrafo. Colchetes dentro de uma fala continuam sendo fala.
 */
function splitQuoted(sentence: string, state: QuoteState): Piece[] {
  const pieces: Piece[] = [];
  let buf = '';
  let i = 0;
  const n = sentence.length;

  const currentKind = () => (state.quote ? KIND_DIALOGUE : state.bracket ? KIND_SYSTEM : KIND_NARRATION);
  const emit = (kind: string) => {
    if (buf.trim()) pieces.push([buf.trim(), kind]);
    buf = '';
  };
  // A pontuação colada depois do fechamento ("Sim”, disse / [Aviso]!) fica com o trecho
  const absorbTrailingPunct = () => {
    while (i + 1 < n && TRAILING_PUNCT.includes(sentence[i + 1])) {
      i++;
      buf += sentence[i];
    }
  };

  while (i < n) {
    const ch = sentence[i];
    if (state.bracket && !state.quote) {
      buf += ch;
      if (ch === state.bracket) {
        absorbTrailingPunct();
        emit(KIND_SYSTEM);
        state.bracket = false;
      }
    } else if (state.quote) {
      if (CLOSING_QUOTES.includes(ch) || ch === '"') {
        buf += ch;
        absorbTrailingPunct();
        emit(KIND_DIALOGUE);
        state.quote = false;
      } else {
        buf += ch;
      }
    } else if ('“«"'.includes(ch)) {
      emit(KIND_NARRATION);
      state.quote = true;
      buf = ch;
    } else if (ch in SYSTEM_BRACKETS) {
      emit(KIND_NARRATION);
      state.bracket = SYSTEM_BRACKETS[ch];
      buf = ch;
    } else {
      buf += ch;
    }
    i++;
  }

  emit(currentKind());
  return pieces;
}

/** Diálogo com travessão: cada travessão isolado alterna entre fala e narração. */
function splitDashed(sentence: string, inDialogue: boolean): [Piece[], boolean] {
  const pieces: Piece[] = [];
  let buf = '';
  for (let i = 0; i < sentence.length; i++) {
    const ch = sentence[i];
    if (isDialogueDash(sentence, i)) {
      if (buf.trim()) pieces.push([buf.trim(), inDialogue ? KIND_DIALOGUE : KIND_NARRATION]);
      buf = ch;
      inDialogue = !inDialogue;
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) pieces.push([buf.trim(), inDialogue ? KIND_DIALOGUE : KIND_NARRATION]);
  return [pieces, inDialogue];
}

/**
 * Aspas de destaque no meio da narração (E entre essas "memórias importantes" existe...) não são fala:
 * trecho curto entre aspas, com narração antes e a frase continuando em minúscula depois.
 */
function demoteEmphasisQuotes(pieces: Piece[]): Piece[] {
  const result = pieces.map((p) => [...p] as Piece);
  for (let i = 0; i < result.length; i++) {
    const [text, kind] = result[i];
    if (kind !== KIND_DIALOGUE || i === 0 || i + 1 >= result.length) continue;
    const [prevText, prevKind] = result[i - 1];
    const [nextText, nextKind] = result[i + 1];
    const inner = stripChars(text, OPENING_QUOTES + CLOSING_QUOTES + TRAILING_PUNCT + ' ');
    const prevTrim = prevText.trimEnd();
    if (
      prevKind === KIND_NARRATION &&
      nextKind === KIND_NARRATION &&
      inner.split(/\s+/).filter(Boolean).length <= 4 &&
      isLower(nextText[0]) &&
      ![':', '.', '!', '?'].some((p) => prevTrim.endsWith(p))
    ) {
      result[i] = [text, KIND_NARRATION];
    }
  }
  return result;
}

/** Cola trechos sem letras (só pontuação/travessão) no vizinho e une trechos seguidos do mesmo tipo. */
function mergePieces(pieces: Piece[]): Piece[] {
  const merged: Piece[] = [];
  let pendingPrefix = '';
  for (let [text, kind] of pieces) {
    if (!hasWord(text)) {
      if (merged.length) {
        const [prevText, prevKind] = merged[merged.length - 1];
        merged[merged.length - 1] = [`${prevText} ${text}`.trim(), prevKind];
      } else {
        pendingPrefix = `${pendingPrefix} ${text}`.trim();
      }
      continue;
    }
    if (pendingPrefix) {
      text = `${pendingPrefix} ${text}`;
      pendingPrefix = '';
    }
    if (merged.length && merged[merged.length - 1][1] === kind) {
      merged[merged.length - 1] = [`${merged[merged.length - 1][0]} ${text}`, kind];
    } else {
      merged.push([text, kind]);
    }
  }
  if (pendingPrefix && merged.length) {
    const last = merged[merged.length - 1];
    merged[merged.length - 1] = [`${last[0]} ${pendingPrefix}`, last[1]];
  }
  return merged;
}

/** Quebra trechos muito longos em vírgulas/ponto e vírgula para não travar a voz. */
function splitLongUnit(text: string, maxChars = MAX_UNIT_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = Math.max(window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
    if (cut < maxChars * 0.4) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = maxChars;
    else cut += 1; // mantém a pontuação no pedaço atual
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Unidades faladas do parágrafo como (texto, tipo). */
export function segmentParagraph(text: string): Piece[] {
  const sentences = splitSentences(text);
  const dashMode = /^\s*([—–]|-\s)/.test(text);

  const units: Piece[] = [];
  const quoteState: QuoteState = { quote: false, bracket: false };
  let inDashDialogue = false; // o primeiro travessão do parágrafo abre a fala
  for (const sentence of sentences) {
    let pieces: Piece[];
    if (dashMode) {
      [pieces, inDashDialogue] = splitDashed(sentence, inDashDialogue);
    } else {
      pieces = demoteEmphasisQuotes(splitQuoted(sentence, quoteState));
    }
    for (const [pieceText, kind] of mergePieces(pieces)) {
      for (const chunk of splitLongUnit(pieceText)) units.push([chunk, kind]);
    }
  }

  // Frases sem letras (ex.: "…") coladas na anterior para não gerar unidade vazia
  const cleaned: Piece[] = [];
  for (const [unitText, kind] of units) {
    if (!hasWord(unitText) && cleaned.length) {
      const last = cleaned[cleaned.length - 1];
      cleaned[cleaned.length - 1] = [`${last[0]} ${unitText}`, last[1]];
    } else {
      cleaned.push([unitText, kind]);
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Estrutura final do livro
// ---------------------------------------------------------------------------

function clipTitle(title: string, limit = 70): string {
  const t = normalizeWhitespace(title);
  return t.length <= limit ? t : t.slice(0, limit).trimEnd() + '...';
}

/** Dá uma folga à tela a cada tantos parágrafos (livros grandes levam segundos no celular) */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Converte parágrafos na estrutura do livro (frases, tipos, parágrafos e capítulos). */
export async function buildBookStructure(paragraphs: Paragraph[], onProgress?: (fraction: number) => void): Promise<BookStructure> {
  const sentences: string[] = [];
  const kinds: string[] = [];
  const paragraphStarts: number[] = [];
  const chapters: { id?: string; title: string; startIndex: number }[] = [];
  const textBlocks: string[] = [];

  for (let p = 0; p < paragraphs.length; p++) {
    if (p % 2000 === 1999) {
      onProgress?.(p / paragraphs.length);
      await yieldToUi();
    }
    const paragraph = paragraphs[p];
    const text = normalizeWhitespace(paragraph.text);
    if (!hasWord(text)) continue; // separadores de cena ("* * *") e sobras de layout

    const units: Piece[] = paragraph.heading
      ? splitLongUnit(text).map((chunk) => [chunk, KIND_HEADING] as Piece)
      : segmentParagraph(text);
    if (!units.length) continue;

    if (paragraph.chapterTitle) {
      const start = sentences.length;
      if (chapters.length && chapters[chapters.length - 1].startIndex === start) {
        chapters[chapters.length - 1].title = clipTitle(paragraph.chapterTitle);
      } else {
        chapters.push({ title: clipTitle(paragraph.chapterTitle), startIndex: start });
      }
    }

    paragraphStarts.push(sentences.length);
    for (const [unitText, kind] of units) {
      sentences.push(unitText);
      kinds.push(kind);
    }
    textBlocks.push(text);
  }

  if (!chapters.length || chapters[0].startIndex > 0) chapters.unshift({ title: 'Início', startIndex: 0 });

  const content = textBlocks.join('\n\n');
  const totalWords = countWords(content);
  return {
    content,
    sentences,
    chapters: chapters.map((c, i) => ({ id: `ch-${i + 1}`, title: c.title, startIndex: c.startIndex })),
    totalWords,
    durationMinutes: Math.max(1, Math.round(totalWords / 150)),
    structure: { version: STRUCTURE_VERSION, paragraphStarts, kinds: kinds.join('') },
  };
}
