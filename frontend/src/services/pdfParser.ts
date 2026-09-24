import * as pdfjsLib from 'pdfjs-dist';
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
