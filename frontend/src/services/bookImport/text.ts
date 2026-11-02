import JSZip from 'jszip';
import { isChapterHeading, joinWrappedLines, normalizeWhitespace, type Paragraph } from './textPipeline';

/** TXT, Markdown e DOCX. Tradução das partes correspondentes de servidor-arquivado/backend/.../pdf_extractor.py. */

/** Texto em UTF-8 (com ou sem BOM); se não for, Windows-1252 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function cleanMarkdownInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imagens
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(?<![\p{L}\p{N}_])[*_](\S[^*_]*\S|\S)[*_](?![\p{L}\p{N}_])/gu, '$1'); // itálico
}

export function extractTextParagraphs(raw: string, markdown = false): Paragraph[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blankLines = lines.filter((l) => !l.trim()).length;
  // Com linhas em branco separando parágrafos, as linhas internas são só quebra de layout
  const wrapped = blankLines >= 2;

  const paragraphs: Paragraph[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) {
      let text = joinWrappedLines(buffer);
      if (markdown) text = cleanMarkdownInline(text);
      paragraphs.push({ text });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    const mdHeading = markdown ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (mdHeading) {
      flush();
      const title = cleanMarkdownInline(mdHeading[2].trim());
      paragraphs.push({ text: title, heading: true, chapterTitle: mdHeading[1].length <= 2 ? title : null });
      continue;
    }
    if (markdown) line = line.replace(/^>\s?/, '').replace(/^[*+]\s+/, '');

    if (isChapterHeading(line) && !(wrapped && buffer.length)) {
      flush();
      paragraphs.push({ text: line, heading: true, chapterTitle: line });
      continue;
    }

    if (!wrapped || '—–'.includes(line[0])) flush();
    buffer.push(line);
    if (!wrapped) flush();
  }
  flush();
  return paragraphs;
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wAttr(el: Element, name: string): string | null {
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`);
}

/** Nome de cada estilo (o documento guarda o id, ex.: "Ttulo1"; o nome é "heading 1") */
async function styleNames(zip: JSZip): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const xml = await zip.file('word/styles.xml')?.async('string');
  if (!xml) return names;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  for (const style of Array.from(doc.getElementsByTagNameNS(W_NS, 'style'))) {
    const id = wAttr(style, 'styleId');
    const nameEl = style.getElementsByTagNameNS(W_NS, 'name')[0];
    const name = nameEl ? wAttr(nameEl, 'val') : null;
    if (id) names.set(id, name || id);
  }
  return names;
}

export async function extractDocxParagraphs(zip: JSZip): Promise<Paragraph[]> {
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Arquivo DOCX sem texto (word/document.xml não encontrado).');
  const styles = await styleNames(zip);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const paragraphs: Paragraph[] = [];
  for (const p of Array.from(doc.getElementsByTagNameNS(W_NS, 'p'))) {
    let raw = '';
    for (const node of Array.from(p.getElementsByTagNameNS(W_NS, '*'))) {
      if (node.localName === 't') raw += node.textContent || '';
      else if (node.localName === 'tab') raw += '\t';
      else if (node.localName === 'br' || node.localName === 'cr') raw += '\n';
    }
    const text = normalizeWhitespace(raw);
    if (!text) continue;

    const styleEl = p.getElementsByTagNameNS(W_NS, 'pStyle')[0];
    const styleId = styleEl ? wAttr(styleEl, 'val') || '' : '';
    const style = (styles.get(styleId) || styleId).toLowerCase();
    const levelMatch = /(\d+)/.exec(style);
    const level = levelMatch ? Number(levelMatch[1]) : 1;
    const isTitle = style === 'title' || style.startsWith('título') || style.startsWith('titulo');
    const isHeading = isTitle || style.startsWith('heading');
    if (isHeading || isChapterHeading(text)) {
      const isChapter = isTitle || (isHeading && level <= 2) || isChapterHeading(text);
      paragraphs.push({ text, heading: true, chapterTitle: isChapter ? text : null });
    } else {
      paragraphs.push({ text });
    }
  }
  return paragraphs;
}

export async function extractDocxCover(zip: JSZip): Promise<Blob | null> {
  const media = Object.keys(zip.files)
    .filter((n) => n.startsWith('word/media/'))
    .sort()[0];
  if (!media) return null;
  const type = /\.png$/i.test(media) ? 'image/png' : 'image/jpeg';
  return new Blob([await zip.file(media)!.async('arraybuffer')], { type });
}
