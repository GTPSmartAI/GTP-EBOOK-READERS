import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isChapterHeading, isLower, isUpper, joinWrappedLines, normalizeWhitespace, type Paragraph } from './textPipeline';

/**
 * PDF: lê as linhas de cada página com a posição (pdf.js), tira número de página e cabeçalhos/rodapés
 * repetidos e reconstrói os parágrafos pelo recuo e pelo espaço entre linhas. Capítulos vêm dos marcadores do PDF
 * ou de linhas como "Capítulo 3". Tradução de servidor-arquivado/backend/components/ProcessadorLivros/python/pdf_extractor.py.
 */

// Worker empacotado junto com a versão instalada do pdfjs-dist (versões diferentes são rejeitadas pelo pdf.js)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export class UnsupportedDocumentError extends Error {}

interface PdfLine {
  text: string;
  x: number | null; // posição horizontal do início da linha (pontos)
  y: number | null; // posição vertical da linha (pontos, cresce para cima)
}

const PAGE_NUMBER_RE = /^\s*((p[áa]g(ina)?\.?|page)\s*)?(\d{1,4}|[ivxlcdm]{1,7})\s*$|^\s*\d{1,4}\s*(\/|de|of)\s*\d{1,4}\s*$/i;
const EDGE_LINES = 2; // linhas do topo e da base de cada página candidatas a cabeçalho/rodapé
const SENTENCE_END_RE = /[.!?…:]["”’»)]*$/;
const INDENT_MIN_POINTS = 5.0;

export async function openPdf(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
}

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/** Linhas da página com a posição de cada uma */
async function readPageLines(doc: PdfDoc, pageNumber: number): Promise<PdfLine[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const lines: PdfLine[] = [{ text: '', x: null, y: null }];
  let lastY: number | null = null;
  let lastHeight = 0;
  for (const raw of content.items as any[]) {
    if (typeof raw.str !== 'string') continue;
    const x = raw.transform[4];
    const y = raw.transform[5];
    const height = Math.abs(raw.height || raw.transform[3] || 0);
    let line = lines[lines.length - 1];
    // Mudou de altura (outra linha), mesmo sem o fim de linha marcado
    if (line.text.trim() && lastY !== null && Math.abs(y - lastY) > Math.max(2, Math.min(height, lastHeight || height) * 0.5)) {
      line = { text: '', x: null, y: null };
      lines.push(line);
    }
    if (raw.str.trim() && line.x === null) {
      line.x = x;
      line.y = y;
    }
    line.text += raw.str;
    if (raw.str.trim()) {
      lastY = y;
      lastHeight = height;
    }
    if (raw.hasEOL) {
      lines.push({ text: '', x: null, y: null });
    }
  }
  page.cleanup();
  return lines;
}

function edgeIndexes(lines: PdfLine[]): number[] {
  const filled = lines.map((l, i) => (l.text.trim() ? i : -1)).filter((i) => i >= 0);
  return [...new Set([...filled.slice(0, EDGE_LINES), ...filled.slice(-EDGE_LINES)])].sort((a, b) => a - b);
}

/** str.isupper() do Python: tem letra e todas as letras são maiúsculas */
const allCasedUpper = (s: string) => s !== s.toLowerCase() && s === s.toUpperCase();

const boilerplateKey =(line: string) => line.trim().toLowerCase().replace(/\d+/g, '#');

/** Remove número de página e cabeçalhos/rodapés que se repetem (título do livro, nome do autor). */
function stripHeadersAndFooters(pages: PdfLine[][]): PdfLine[][] {
  const keyPages = new Map<string, Set<number>>();
  pages.forEach((lines, pageIdx) => {
    for (const i of edgeIndexes(lines)) {
      const key = boilerplateKey(lines[i].text);
      if (!keyPages.has(key)) keyPages.set(key, new Set());
      keyPages.get(key)!.add(pageIdx);
    }
  });
  const minRepeats = Math.max(3, Math.floor(pages.length * 0.3));
  const repeated = new Set(
    [...keyPages.entries()].filter(([, found]) => pages.length >= 4 && found.size >= minRepeats).map(([k]) => k)
  );

  return pages.map((lines) => {
    const edges = new Set(edgeIndexes(lines));
    return lines.filter((line, i) => {
      const text = line.text;
      // "Capítulo 3" no topo da página se repete com números diferentes, mas é título, não cabeçalho
      if (edges.has(i) && !isChapterHeading(text)) {
        const t = text.trim();
        // Algarismo romano em maiúsculas ("IV") pode ser título; "iv", "12", "pág. 3" e "3/120" são número de página
        if (PAGE_NUMBER_RE.test(text) && !allCasedUpper(t)) return false;
        const looksLikeProse = '—–"“«'.includes(t[0] || '') || /[.!?…"”»]$/.test(t);
        if (repeated.has(boilerplateKey(text)) && !looksLikeProse) return false;
      }
      return true;
    });
  });
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  let best = values[0];
  for (const v of values) {
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > (counts.get(best) || 0)) best = v;
  }
  return best;
}

/** Margem esquerda mais comum e espaçamento típico entre linhas da página. */
function pageGeometry(lines: PdfLine[]): [number | null, number | null] {
  const filled = lines.filter((l) => l.text.trim());
  const xs = filled.filter((l) => l.x !== null).map((l) => Math.round(l.x!));
  const ys = filled.filter((l) => l.y !== null).map((l) => l.y!);
  const gaps: number[] = [];
  for (let i = 0; i + 1 < ys.length; i++) if (ys[i] - ys[i + 1] > 0.5) gaps.push(ys[i] - ys[i + 1]);
  gaps.sort((a, b) => a - b);
  // Quartil inferior: em páginas cheias de diálogo curto há mais espaços entre parágrafos do que entre linhas
  return [mode(xs), gaps.length ? gaps[Math.floor(gaps.length / 4)] : null];
}

/** Para cada linha: a posição dela mostra início de parágrafo (recuo ou espaço vertical maior que o normal)? */
function layoutBreaks(pages: PdfLine[][]): boolean[][] {
  const geometry = pages.map(pageGeometry);
  let indented = 0;
  let filled = 0;
  pages.forEach((lines, p) => {
    const margin = geometry[p][0];
    for (const line of lines) {
      if (line.x !== null && line.text.trim() && margin !== null) {
        filled++;
        if (line.x - margin > INDENT_MIN_POINTS) indented++;
      }
    }
  });
  // Se quase toda linha parece "recuada", as posições não são confiáveis (layout irregular)
  const useIndent = filled > 0 && indented / filled < 0.35;

  return pages.map((lines, p) => {
    const [margin, spacing] = geometry[p];
    let prevY: number | null = null;
    return lines.map((line) => {
      let isBreak = false;
      if (line.x !== null && line.text.trim()) {
        if (useIndent && margin !== null && line.x - margin > INDENT_MIN_POINTS) isBreak = true;
        if (spacing && prevY !== null && line.y !== null && prevY - line.y > spacing * 1.45) isBreak = true;
        prevY = line.y;
      }
      return isBreak;
    });
  });
}

function quantile75(values: number[]): number {
  // statistics.quantiles(n=4)[2] (método "exclusive" do Python)
  const s = [...values].sort((a, b) => a - b);
  const pos = 0.75 * (s.length + 1) - 1;
  const lo = Math.max(0, Math.min(s.length - 1, Math.floor(pos)));
  const hi = Math.max(0, Math.min(s.length - 1, lo + 1));
  return s[lo] + (s[hi] - s[lo]) * (pos - Math.floor(pos));
}

/** Reconstrói parágrafos a partir das linhas visuais das páginas. */
function assembleParagraphs(pages: PdfLine[][], chapterPages: Set<number>, headingsAsChapters: boolean): Paragraph[] {
  const breaks = layoutBreaks(pages);
  const stream: [string, number, boolean][] = [];
  pages.forEach((lines, p) => lines.forEach((line, i) => stream.push([line.text.trim(), p, breaks[p][i]])));
  const lengths = stream.map(([s]) => s.length).filter((n) => n >= 10);
  const typical = lengths.length >= 4 ? quantile75(lengths) : 60;

  const paragraphs: Paragraph[] = [];
  let buffer: string[] = [];
  let bufferPage: number | null = null;
  let lastHeading: Paragraph | null = null;
  let previousPage: number | null = null;

  const flush = () => {
    if (buffer.length) paragraphs.push({ text: joinWrappedLines(buffer), page: bufferPage });
    buffer = [];
    bufferPage = null;
  };

  for (let i = 0; i < stream.length; i++) {
    const [line, pageIdx, startsParagraph] = stream[i];
    if (pageIdx !== previousPage && chapterPages.has(pageIdx)) flush();
    previousPage = pageIdx;

    if (!line) {
      flush();
      continue;
    }
    if (startsParagraph) flush();

    const nextLine = i + 1 < stream.length ? stream[i + 1][0] : '';
    // Título é linha curta e isolada: uma linha cheia que começa com "Parte dois do plano..." é texto corrido
    if (isChapterHeading(line) && line.length < typical * 0.7 && !isLower(nextLine[0] || '')) {
      flush();
      const heading: Paragraph = { text: line, heading: true, chapterTitle: headingsAsChapters ? line : null, page: pageIdx };
      paragraphs.push(heading);
      lastHeading = heading;
      continue;
    }

    // Subtítulo logo abaixo de "Capítulo 1" (ex.: "O Início")
    if (lastHeading && line.length < typical * 0.6 && !SENTENCE_END_RE.test(line) && !line.endsWith(',') && !'—–-'.includes(line[0])) {
      paragraphs.push({ text: line, heading: true, page: pageIdx });
      if (lastHeading.chapterTitle) lastHeading.chapterTitle = `${lastHeading.chapterTitle} — ${line}`;
      lastHeading = null;
      continue;
    }
    lastHeading = null;

    // Toda fala com travessão começa um parágrafo novo
    if ('—–'.includes(line[0]) && buffer.length) flush();

    if (!buffer.length) bufferPage = pageIdx;
    buffer.push(line);

    const endsSentence = SENTENCE_END_RE.test(line);
    if (endsSentence && line.length < typical * 0.75) flush();
    else if (!endsSentence && line.length < typical * 0.5 && isUpper(nextLine[0] || '') && !line.endsWith('-') && !line.endsWith(',')) flush();
  }
  flush();
  return paragraphs;
}

/** Marcadores (sumário) do PDF: [(página, título)] ordenado por página */
async function pdfOutline(doc: PdfDoc): Promise<[number, string][]> {
  let outline: any[] | null = null;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!outline) return [];

  const collect = async (items: any[]): Promise<[number, string][]> => {
    const found: [number, string][] = [];
    for (const item of items) {
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        if (!dest || !dest[0]) continue;
        const page = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
        const title = normalizeWhitespace(String(item.title || ''));
        if (page >= 0 && title) found.push([page, title]);
      } catch {
        // marcador quebrado: ignora
      }
    }
    return found;
  };

  let entries = await collect(outline);
  // Livros com um único marcador raiz ("Sumário") guardam os capítulos no nível seguinte
  if (entries.length <= 1 && outline[0]?.items?.length) entries = entries.concat(await collect(outline[0].items));

  const seen = new Set<number>();
  return entries
    .sort((a, b) => a[0] - b[0])
    .filter(([page]) => (seen.has(page) ? false : (seen.add(page), true)));
}

export async function extractPdfParagraphs(doc: PdfDoc, onProgress?: (fraction: number) => void): Promise<Paragraph[]> {
  let pages: PdfLine[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    pages.push(await readPageLines(doc, p));
    onProgress?.(p / doc.numPages);
  }

  const totalChars = pages.reduce((sum, lines) => sum + lines.reduce((s, l) => s + l.text.trim().length, 0), 0);
  if (totalChars < 20) {
    throw new UnsupportedDocumentError(
      'Este PDF não tem texto selecionável (provavelmente é digitalizado). É preciso passar OCR antes de importar.'
    );
  }

  pages = stripHeadersAndFooters(pages);
  const outline = await pdfOutline(doc);
  const chapterPages = new Set(outline.map(([page]) => page));
  const paragraphs = assembleParagraphs(pages, chapterPages, outline.length === 0);

  for (const [page, title] of outline) {
    const target = paragraphs.find((p) => p.page != null && p.page >= page);
    if (target && !target.chapterTitle) target.chapterTitle = title;
  }
  return paragraphs;
}

/** Capa: a primeira página desenhada como imagem */
export async function renderPdfCover(doc: PdfDoc): Promise<string | null> {
  try {
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);
    const initial = page.getViewport({ scale: 1.0 });
    const scale = Math.min(2.0, Math.max(0.4, 360 / (initial.width || 360)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.warn('Não foi possível gerar a capa do PDF:', err);
    return null;
  }
}
