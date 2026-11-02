import JSZip from 'jszip';
import { buildBookStructure, type BookStructure, type Paragraph } from './textPipeline';
import { extractEpubCover, extractEpubParagraphs, extractHtmlParagraphs } from './epub';
import { extractPdfParagraphs, openPdf, renderPdfCover, UnsupportedDocumentError } from './pdf';
import { decodeText, extractDocxCover, extractDocxParagraphs, extractTextParagraphs } from './text';

/**
 * Importa um livro no próprio aparelho (PDF, EPUB, DOCX, TXT, Markdown, HTML): extrai o texto,
 * monta frases/falas/capítulos (textPipeline) e a capa. Antes isso era feito no servidor.
 */

export { UnsupportedDocumentError };

export interface ImportedBook extends BookStructure {
  docType: string;
  coverImage: string | null; // data URL pequena (cabe no armazenamento do aparelho)
  // Livro já processado (.json do servidor antigo): id, título e autor originais
  sourceId?: string;
  title?: string;
  author?: string;
}

type Format = 'pdf' | 'epub' | 'docx' | 'doc' | 'md' | 'txt' | 'html' | 'mobi' | 'json';

/**
 * Livro já processado, no formato do servidor antigo (servidor-arquivado/backend/uploads/extracted/<id>.json):
 * entra direto, com o mesmo id, então o ponto de leitura guardado no aparelho volta a valer.
 */
function fromProcessedJson(raw: string): ImportedBook {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new UnsupportedDocumentError('Este .json não é um livro do Aedolia.');
  }
  const book = data?.book ?? data;
  const sentences = typeof book?.sentences === 'string' ? JSON.parse(book.sentences) : book?.sentences;
  const structure = typeof book?.structure === 'string' ? JSON.parse(book.structure) : book?.structure;
  const chapters = typeof book?.chapters === 'string' ? JSON.parse(book.chapters) : book?.chapters;
  if (!Array.isArray(sentences) || !sentences.length || !structure || typeof structure.kinds !== 'string') {
    throw new UnsupportedDocumentError('Este .json não é um livro do Aedolia (faltam as frases ou a estrutura).');
  }
  return {
    content: book.content || '',
    sentences,
    chapters: Array.isArray(chapters) && chapters.length ? chapters : [{ id: 'ch-1', title: 'Início', startIndex: 0 }],
    totalWords: Number(book.total_words) || 0,
    durationMinutes: Number(book.duration_minutes) || 1,
    structure: {
      version: Number(structure.version) || 0,
      paragraphStarts: structure.paragraph_starts || structure.paragraphStarts || [],
      kinds: structure.kinds,
    },
    docType: book.type || 'epub',
    coverImage: null,
    sourceId: book.id ? String(book.id) : undefined,
    title: book.title,
    author: book.author,
  };
}

function detectFormat(name: string, head: Uint8Array): Format {
  const lower = name.toLowerCase();
  const byExt: [string, Format][] = [
    ['.pdf', 'pdf'], ['.epub', 'epub'], ['.docx', 'docx'], ['.doc', 'doc'],
    ['.md', 'md'], ['.markdown', 'md'], ['.txt', 'txt'],
    ['.html', 'html'], ['.htm', 'html'], ['.xhtml', 'html'],
    ['.mobi', 'mobi'], ['.azw', 'mobi'], ['.azw3', 'mobi'], ['.json', 'json'],
  ];
  for (const [ext, fmt] of byExt) if (lower.endsWith(ext)) return fmt;
  const ascii = String.fromCharCode(...head.slice(0, 4));
  if (ascii === '%PDF') return 'pdf';
  if (ascii.startsWith('PK')) return 'epub';
  return 'txt';
}

/** Reduz a capa para no máximo 400 px de largura (JPEG), para não pesar na estante */
async function toThumbnail(image: Blob | null): Promise<string | null> {
  if (!image) return null;
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, 400 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

/**
 * onProgress recebe de 0 a 1: a leitura do arquivo vai até 0,8; montar as frases, o resto.
 */
export async function importBookFile(file: File, onProgress?: (fraction: number) => void): Promise<ImportedBook> {
  const data = await file.arrayBuffer();
  const fmt = detectFormat(file.name, new Uint8Array(data.slice(0, 8)));
  const readProgress = (f: number) => onProgress?.(Math.min(0.8, f * 0.8));
  if (fmt === 'json') {
    const book = fromProcessedJson(decodeText(new Uint8Array(data)));
    onProgress?.(1);
    return book;
  }

  let paragraphs: Paragraph[];
  let cover: string | null = null;
  if (fmt === 'pdf') {
    const doc = await openPdf(data);
    try {
      cover = await renderPdfCover(doc);
      paragraphs = await extractPdfParagraphs(doc, readProgress);
    } finally {
      doc.loadingTask.destroy();
    }
  } else if (fmt === 'epub') {
    const zip = await JSZip.loadAsync(data);
    paragraphs = await extractEpubParagraphs(zip, readProgress);
    cover = await toThumbnail(await extractEpubCover(zip));
  } else if (fmt === 'docx') {
    const zip = await JSZip.loadAsync(data);
    paragraphs = await extractDocxParagraphs(zip);
    cover = await toThumbnail(await extractDocxCover(zip));
  } else if (fmt === 'html') {
    paragraphs = extractHtmlParagraphs(decodeText(new Uint8Array(data)));
  } else if (fmt === 'txt' || fmt === 'md') {
    paragraphs = extractTextParagraphs(decodeText(new Uint8Array(data)), fmt === 'md');
  } else if (fmt === 'doc') {
    throw new UnsupportedDocumentError('Arquivos .doc antigos não são suportados. Salve como .docx ou PDF e importe de novo.');
  } else {
    throw new UnsupportedDocumentError('Arquivos MOBI/AZW não são suportados. Converta para EPUB (ex.: com o Calibre) e importe de novo.');
  }

  onProgress?.(0.8);
  const structure = await buildBookStructure(paragraphs, (f) => onProgress?.(0.8 + f * 0.2));
  if (!structure.sentences.length) throw new UnsupportedDocumentError('Não foi encontrado texto legível neste arquivo.');
  onProgress?.(1);
  return { ...structure, docType: fmt === 'md' ? 'txt' : fmt, coverImage: cover };
}

/** Só a capa, para a prévia na janela de importar */
export async function extractCoverPreview(file: File): Promise<string | null> {
  try {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const doc = await openPdf(await file.arrayBuffer());
      try {
        return await renderPdfCover(doc);
      } finally {
        doc.loadingTask.destroy();
      }
    }
    if (name.endsWith('.epub')) return await toThumbnail(await extractEpubCover(await JSZip.loadAsync(file)));
    if (name.endsWith('.docx')) return await toThumbnail(await extractDocxCover(await JSZip.loadAsync(file)));
  } catch (err) {
    console.warn('Prévia da capa não pôde ser gerada:', err);
  }
  return null;
}
