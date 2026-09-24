import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { splitIntoSentences, countWords, estimateDurationMinutes } from '../utils/textParser';
import type { Book } from '../types';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs`;
}

export interface ParsedPdfResult {
  fullText: string;
  sentences: string[];
  totalWords: number;
  totalPages: number;
  durationMinutes: number;
  pageTexts: { pageNumber: number; text: string }[];
}

export async function parsePdfFile(file: File): Promise<ParsedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const pageTexts: { pageNumber: number; text: string }[] = [];
  let fullText = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageString = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');

    pageTexts.push({ pageNumber: pageNum, text: pageString });
    fullText += pageString + '\n\n';
  }

  const sentences = splitIntoSentences(fullText);
  const totalWords = countWords(fullText);
  const durationMinutes = estimateDurationMinutes(totalWords);

  return {
    fullText,
    sentences,
    totalWords,
    totalPages,
    durationMinutes,
    pageTexts,
  };
}

export interface ParsedEpubResult {
  fullText: string;
  sentences: string[];
  totalWords: number;
  durationMinutes: number;
  chapters: { id: string; title: string; startIndex: number }[];
}

export async function parseEpubFile(file: File): Promise<ParsedEpubResult> {
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();

  // 1. Achar arquivo .opf a partir do container.xml
  let opfPath: string | null = null;
  const containerXml = zip.file('META-INF/container.xml');
  if (containerXml) {
    try {
      const xmlText = await containerXml.async('text');
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const rootfile = xmlDoc.querySelector('rootfile');
      if (rootfile) {
        opfPath = rootfile.getAttribute('full-path');
      }
    } catch (e) {
      console.warn('Erro ao ler container.xml do epub:', e);
    }
  }

  // 2. Buscar ordem dos arquivos pelo spine no .opf
  const orderedHtmlPaths: string[] = [];
  if (opfPath) {
    const opfFile = zip.file(opfPath);
    if (opfFile) {
      try {
        const opfText = await opfFile.async('text');
        const opfDoc = parser.parseFromString(opfText, 'application/xml');
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        const manifestMap: Record<string, string> = {};
        opfDoc.querySelectorAll('manifest > item').forEach((item) => {
          const id = item.getAttribute('id');
          const href = item.getAttribute('href');
          if (id && href) {
            manifestMap[id] = opfDir + href;
          }
        });

        opfDoc.querySelectorAll('spine > itemref').forEach((itemref) => {
          const idref = itemref.getAttribute('idref');
          if (idref && manifestMap[idref]) {
            orderedHtmlPaths.push(manifestMap[idref]);
          }
        });
      } catch (e) {
        console.warn('Erro ao processar spine do epub:', e);
      }
    }
  }

  // 3. Fallback se spine falhar: listar todos os arquivos xhtml/html
  if (orderedHtmlPaths.length === 0) {
    zip.forEach((relativePath) => {
      const lower = relativePath.toLowerCase();
      if ((lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) && !lower.includes('toc') && !lower.includes('cover')) {
        orderedHtmlPaths.push(relativePath);
      }
    });
    orderedHtmlPaths.sort();
  }

  // 4. Ler cada arquivo HTML e extrair texto e capítulos
  const allSentences: string[] = [];
  const textChunks: string[] = [];
  const chapters: { id: string; title: string; startIndex: number }[] = [];
  let chapterIndex = 1;

  for (const htmlPath of orderedHtmlPaths) {
    const zipEntry = zip.file(htmlPath);
    if (!zipEntry) continue;

    try {
      const rawHtml = await zipEntry.async('text');
      const doc = parser.parseFromString(rawHtml, 'text/html');

      doc.querySelectorAll('script, style, head, noscript, svg').forEach((el) => el.remove());

      const hTag = doc.querySelector('h1, h2, h3, title');
      const chapterTitle = hTag?.textContent?.trim() || `Capítulo ${chapterIndex}`;

      const text = doc.body?.innerText || doc.body?.textContent || '';
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) continue;

      const fileSentences = splitIntoSentences(clean);
      if (fileSentences.length === 0) continue;

      chapters.push({
        id: `ch-${chapterIndex}`,
        title: chapterTitle.length > 50 ? chapterTitle.slice(0, 50) + '...' : chapterTitle,
        startIndex: allSentences.length,
      });
      chapterIndex++;

      allSentences.push(...fileSentences);
      textChunks.push(clean);
    } catch (e) {
      console.warn('Erro ao processar parte de epub:', htmlPath, e);
    }
  }

  const fullText = textChunks.join('\n\n');
  const totalWords = countWords(fullText);
  const durationMinutes = estimateDurationMinutes(totalWords);

  if (chapters.length === 0) {
    chapters.push({
      id: 'ch-1',
      title: 'Início da Leitura',
      startIndex: 0,
    });
  }

  return {
    fullText,
    sentences: allSentences,
    totalWords,
    durationMinutes,
    chapters,
  };
}

export async function parseTextFile(file: File): Promise<{ fullText: string; sentences: string[]; totalWords: number }> {
  const text = await file.text();
  const sentences = splitIntoSentences(text);
  const totalWords = countWords(text);
  return {
    fullText: text,
    sentences,
    totalWords,
  };
}

export function createBookFromUpload(
  title: string,
  author: string,
  type: 'pdf' | 'epub' | 'txt',
  fullText: string,
  sentences: string[],
  totalWords: number,
  durationMinutes: number
): Book {
  const id = 'book-' + Date.now();
  const gradients = [
    'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
    'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
  ];
  const coverGradient = gradients[Math.floor(Math.random() * gradients.length)];

  // Auto-detect chapters by looking for "Capítulo", "Chapter", "Parte" or every ~25 sentences
  const chapters = [];
  let chapterCount = 1;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (/(capítulo|chapter|parte|seção|secao)\s+[0-9ivxlcdm]+/i.test(s) || (i > 0 && i % 30 === 0 && chapters.length < 10)) {
      chapters.push({
        id: `${id}-ch-${chapterCount}`,
        title: s.slice(0, 40) + (s.length > 40 ? '...' : ''),
        startIndex: i,
      });
      chapterCount++;
    }
  }

  if (chapters.length === 0) {
    chapters.push({
      id: `${id}-ch-1`,
      title: 'Início da Leitura',
      startIndex: 0,
    });
  }

  return {
    id,
    title,
    author: author || 'Autor Desconhecido',
    coverGradient,
    type,
    content: fullText,
    sentences,
    chapters,
    totalWords,
    readingProgress: 0,
    lastReadSentenceIndex: 0,
    durationMinutes,
    uploadedAt: 'Hoje',
  };
}
