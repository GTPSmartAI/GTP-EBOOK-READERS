import JSZip from 'jszip';
import { hasWord, normalizeWhitespace, type Paragraph } from './textPipeline';

/**
 * EPUB e HTML: lê os arquivos na ordem do spine, extrai um parágrafo por bloco (<p>, <h1>, <li>...),
 * ignora notas de rodapé e usa o sumário (nav.xhtml ou toc.ncx) para nomear os capítulos.
 * Tradução de servidor-arquivado/backend/components/ProcessadorLivros/python/epub_extractor.py.
 */

const SKIP_TAGS = new Set(['script', 'style', 'head', 'noscript', 'svg', 'math', 'title', 'meta', 'link', 'img', 'figure']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'blockquote', 'li', 'ul', 'ol', 'dd', 'dt', 'dl', 'pre',
  'table', 'tr', 'td', 'th', 'tbody', 'thead', 'header', 'footer', 'aside', 'nav', 'main',
  'figcaption', 'hr', 'body', 'html',
]);
const NOTE_TEXT_RE = /^[\s\d*†‡§[\](),.ivxlc]+$/i;

const htmlParser = () => new DOMParser();

function epubType(el: Element): string {
  return (el.getAttribute('epub:type') || el.getAttribute('role') || '').toLowerCase();
}

function isFootnoteContainer(el: Element): boolean {
  const kind = epubType(el);
  return ['footnote', 'endnote', 'rearnote', 'doc-footnote', 'doc-endnote'].some((k) => kind.includes(k));
}

/** Números de nota no meio do texto ("mar¹", "<a href='#n1'>1</a>") não devem ser lidos. */
function isNoteReference(el: Element): boolean {
  if (epubType(el).includes('noteref')) return true;
  const text = (el.textContent || '').replace(/\s+/g, '');
  if (!text || !NOTE_TEXT_RE.test(text) || text.length > 6) return false;
  const name = el.localName.toLowerCase();
  if (name === 'sup') return true;
  return name === 'a' && (el.getAttribute('href') || '').includes('#');
}

function parseHtml(html: string): Document {
  return htmlParser().parseFromString(html, 'text/html');
}

/**
 * Converte um documento (X)HTML em parágrafos.
 * tocEntries: [(id do fragmento ou null, título)] vindos do sumário para este arquivo.
 */
export function extractHtmlParagraphs(
  html: string,
  tocEntries: [string | null, string][] = [],
  headingsAsChapters = false,
  doc: Document = parseHtml(html)
): Paragraph[] {
  const root: Element = doc.body || doc.documentElement;

  const idsInDoc = new Set(Array.from(root.querySelectorAll('[id]')).map((el) => el.getAttribute('id')));
  const fragmentTitles = new Map<string, string>();
  let startTitle: string | null = null;
  for (const [fragment, title] of tocEntries) {
    if (fragment && idsInDoc.has(fragment)) {
      if (!fragmentTitles.has(fragment)) fragmentTitles.set(fragment, title);
    } else if (startTitle === null) {
      startTitle = title; // entrada que aponta para o arquivo (ou âncora inexistente)
    }
  }

  const paragraphs: Paragraph[] = [];
  const buffer: string[] = [];
  let pendingTitle: string | null = startTitle;
  let fileHasChapter = startTitle !== null || fragmentTitles.size > 0;

  const flush = (heading = false) => {
    const text = normalizeWhitespace(buffer.join(''));
    buffer.length = 0;
    if (!text || !hasWord(text)) return;
    const paragraph: Paragraph = { text, heading };
    if (pendingTitle) {
      paragraph.chapterTitle = pendingTitle;
      pendingTitle = null;
    }
    paragraphs.push(paragraph);
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) continue;
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
        buffer.push(child.nodeValue || '');
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const name = el.localName.toLowerCase();
      const childId = el.getAttribute('id');
      if (childId && fragmentTitles.has(childId)) {
        flush();
        pendingTitle = fragmentTitles.get(childId)!;
        fragmentTitles.delete(childId);
      }

      if (SKIP_TAGS.has(name) || isFootnoteContainer(el) || isNoteReference(el)) continue;
      if (name === 'br') {
        flush();
        continue;
      }
      if (HEADING_TAGS.has(name)) {
        flush();
        walk(el);
        const before = paragraphs.length;
        flush(true);
        if (headingsAsChapters && !fileHasChapter && paragraphs.length > before && ['h1', 'h2', 'h3'].includes(name)) {
          paragraphs[paragraphs.length - 1].chapterTitle = paragraphs[paragraphs.length - 1].text;
          fileHasChapter = true;
        }
        continue;
      }
      if (BLOCK_TAGS.has(name)) {
        flush();
        walk(el);
        flush();
        continue;
      }
      walk(el); // elemento inline (<em>, <span>, <a>...): o texto continua no mesmo parágrafo
    }
  };

  walk(root);
  flush();
  return paragraphs;
}

// ---------------------------------------------------------------------------
// Estrutura do pacote EPUB
// ---------------------------------------------------------------------------

function normPath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}

function unquote(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Resolve um href relativo ao arquivo que o contém. Retorna [caminho no zip, fragmento]. */
function resolveHref(baseFile: string, href: string): [string, string | null] {
  const clean = unquote(href.trim());
  const hash = clean.indexOf('#');
  const path = hash >= 0 ? clean.slice(0, hash) : clean;
  const fragment = hash >= 0 ? clean.slice(hash + 1) : '';
  const resolved = path ? normPath(`${dirname(baseFile)}/${path}`) : baseFile;
  return [resolved, fragment || null];
}

function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

const byLocalName = (doc: Document | Element, name: string) =>
  Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === name);

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  const bytes = await entry.async('uint8array');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

interface ManifestItem {
  path: string;
  media: string;
  props: string;
}

interface EpubPackage {
  opfPath: string | null;
  opf: Document | null;
  manifest: Map<string, ManifestItem>;
  spine: string[];
  ncxPath: string | null;
  navPath: string | null;
}

async function readPackage(zip: JSZip): Promise<EpubPackage> {
  const names = new Set(Object.keys(zip.files));
  let opfPath: string | null = null;
  const container = await readText(zip, 'META-INF/container.xml');
  if (container) {
    const doc = parseXml(container);
    const rootfile = doc ? byLocalName(doc, 'rootfile')[0] : undefined;
    opfPath = rootfile?.getAttribute('full-path') || null;
  }
  if (!opfPath || !names.has(opfPath)) opfPath = [...names].find((n) => n.toLowerCase().endsWith('.opf')) || null;
  const empty: EpubPackage = { opfPath: null, opf: null, manifest: new Map(), spine: [], ncxPath: null, navPath: null };
  if (!opfPath) return empty;

  const opf = parseXml((await readText(zip, opfPath)) || '');
  if (!opf) return empty;
  const manifest = new Map<string, ManifestItem>();
  for (const el of byLocalName(opf, 'item')) {
    const id = el.getAttribute('id');
    const href = el.getAttribute('href');
    if (id && href) {
      manifest.set(id, {
        path: resolveHref(opfPath, href)[0],
        media: el.getAttribute('media-type') || '',
        props: el.getAttribute('properties') || '',
      });
    }
  }

  const spine: string[] = [];
  let ncxPath: string | null = null;
  for (const el of byLocalName(opf, 'spine')) {
    const tocId = el.getAttribute('toc');
    if (tocId && manifest.has(tocId)) ncxPath = manifest.get(tocId)!.path;
  }
  for (const el of byLocalName(opf, 'itemref')) {
    const idref = el.getAttribute('idref');
    if (idref && manifest.has(idref) && (el.getAttribute('linear') || 'yes') !== 'no') spine.push(manifest.get(idref)!.path);
  }

  const items = [...manifest.values()];
  if (!ncxPath) ncxPath = items.find((m) => m.media === 'application/x-dtbncx+xml')?.path || null;
  const navPath = items.find((m) => m.props.split(/\s+/).includes('nav'))?.path || null;
  return { opfPath, opf, manifest, spine, ncxPath, navPath };
}

type TocEntry = [string, string | null, string]; // [arquivo, fragmento, título]

async function tocFromNav(zip: JSZip, navPath: string): Promise<TocEntry[]> {
  const doc = parseHtml((await readText(zip, navPath)) || '');
  const navs = Array.from(doc.querySelectorAll('nav'));
  const nav =
    navs.find((n) => n.getAttribute('epub:type') === 'toc') || navs.find((n) => n.getAttribute('role') === 'doc-toc') || navs[0];
  if (!nav) return [];
  const entries: TocEntry[] = [];
  for (const a of Array.from(nav.querySelectorAll('a[href]'))) {
    const title = normalizeWhitespace(a.textContent || '');
    if (title) {
      const [path, fragment] = resolveHref(navPath, a.getAttribute('href') || '');
      entries.push([path, fragment, title]);
    }
  }
  return entries;
}

async function tocFromNcx(zip: JSZip, ncxPath: string): Promise<TocEntry[]> {
  const doc = parseXml((await readText(zip, ncxPath)) || '');
  if (!doc) throw new Error('toc.ncx ilegível');
  const entries: TocEntry[] = [];
  for (const point of byLocalName(doc, 'navPoint')) {
    let title = '';
    let src: string | null = null;
    for (const child of Array.from(point.children)) {
      if (child.localName === 'navLabel') {
        const textEl = byLocalName(child, 'text').find((t) => t.textContent);
        if (textEl) title = normalizeWhitespace(textEl.textContent || '');
      } else if (child.localName === 'content') {
        src = child.getAttribute('src');
      }
    }
    if (title && src) {
      const [path, fragment] = resolveHref(ncxPath, src);
      entries.push([path, fragment, title]);
    }
  }
  return entries;
}

/** Tira a numeração de lista ("12. ", "3) ") e normaliza para comparar com os títulos do sumário. */
function normalizeTitle(text: string): string {
  return normalizeWhitespace(text).replace(/^\s*\d+\s*[.)\-–]\s*/, '').toLowerCase();
}

/**
 * Página de índice dentro do livro (não deve ser lida em voz alta):
 * quase todo o texto é link, ou a maioria dos parágrafos repete títulos do sumário oficial.
 */
function looksLikeTocPage(doc: Document, paragraphs: Paragraph[], tocTitles: Set<string>): boolean {
  const body = paragraphs.filter((p) => !p.heading);
  if (body.length < 5) return false;

  if (tocTitles.size) {
    const matches = body.filter((p) => tocTitles.has(normalizeTitle(p.text))).length;
    if (matches / body.length > 0.6) return true;
  }

  const root = doc.body || doc.documentElement;
  const links = Array.from(root.querySelectorAll('a[href]'));
  if (links.length < 5) return false;
  const strip = (s: string | null) => (s || '').replace(/[\s\d.]+/g, '');
  const total = strip(root.textContent).length;
  const linked = links.reduce((sum, a) => sum + strip(a.textContent).length, 0);
  return total > 0 && linked / total > 0.6;
}

const CHAPTER_NUMBER_RE = /^\s*(?:cap[ií]tulo|chapter|cap\.?|ch\.?)?\s*(\d{1,5})(?!\d)/i;

/** 'ch_26_split_001.xhtml' -> 'ch_26.xhtml' (pedaços do mesmo capítulo separados pelo Calibre). */
const splitStem = (path: string) => path.replace(/_split_\d+(?=\.\w+$)/, '');

/**
 * Alguns EPUBs são montados com os capítulos em ordem alfabética dos números ("1000, 1001, ..., 553, 554, ...").
 * Só nesse caso exato a ordem de leitura é refeita pela ordem numérica. Em qualquer outro caso vale a ordem do arquivo.
 */
function fixAlphabeticalChapterOrder(spine: string[], toc: TocEntry[]): string[] {
  const firstTitle = new Map<string, string>();
  for (const [path, , title] of toc) if (!firstTitle.has(path)) firstTitle.set(path, title);

  const numbered: [string, number, string][] = [];
  for (const path of spine) {
    if (!firstTitle.has(path)) continue;
    const m = CHAPTER_NUMBER_RE.exec(firstTitle.get(path)!);
    if (!m) return spine;
    numbered.push([path, Number(m[1]), m[1]]);
  }
  const numbers = numbered.map(([, n]) => n);
  const digits = numbered.map(([, , d]) => d);
  const sortedNumbers = [...numbers].sort((a, b) => a - b);
  const sortedDigits = [...digits].sort();
  if (
    numbered.length < 20 ||
    new Set(numbers).size !== numbers.length ||
    numbers.every((n, i) => n === sortedNumbers[i]) ||
    !digits.every((d, i) => d === sortedDigits[i])
  ) {
    return spine;
  }

  // Cada capítulo leva junto os pedaços seguintes dele ("_split_001"...); o resto fica no lugar
  const blocks = new Map<string, string[]>();
  const layout: [boolean, string][] = [];
  let current: string | null = null;
  for (const path of spine) {
    if (firstTitle.has(path)) {
      current = path;
      blocks.set(path, [path]);
      layout.push([true, path]);
    } else if (current && splitStem(path) === splitStem(current)) {
      blocks.get(current)!.push(path);
    } else {
      current = null;
      layout.push([false, path]);
    }
  }

  const numberOf = new Map(numbered.map(([p, n]) => [p, n]));
  const inOrder = [...blocks.keys()].sort((a, b) => numberOf.get(a)! - numberOf.get(b)!);
  let k = 0;
  const fixed: string[] = [];
  for (const [isChapter, path] of layout) fixed.push(...(isChapter ? blocks.get(inOrder[k++])! : [path]));
  console.info(`[EPUB] Capítulos estavam em ordem alfabética dos números; reordenados (${blocks.size} capítulos).`);
  return fixed;
}

/** Todos os parágrafos do EPUB na ordem de leitura, com capítulos vindos do sumário. */
export async function extractEpubParagraphs(zip: JSZip, onProgress?: (fraction: number) => void): Promise<Paragraph[]> {
  const names = new Set(Object.keys(zip.files));
  const pkg = await readPackage(zip);
  let spine = pkg.spine;
  if (!spine.length) {
    spine = [...names]
      .filter((n) => /\.(xhtml|html|htm)$/i.test(n) && !/(toc|nav|cover)\.xhtml$/i.test(n))
      .sort();
  }

  let toc: TocEntry[] = [];
  try {
    if (pkg.navPath && names.has(pkg.navPath)) toc = await tocFromNav(zip, pkg.navPath);
    if (!toc.length && pkg.ncxPath && names.has(pkg.ncxPath)) toc = await tocFromNcx(zip, pkg.ncxPath);
  } catch (err) {
    console.warn('[EPUB] Sumário ilegível, usando títulos do texto:', err);
    toc = [];
  }

  spine = fixAlphabeticalChapterOrder(spine, toc);
  const tocTitles = new Set(toc.map(([, , title]) => normalizeTitle(title)));
  const tocByFile = new Map<string, [string | null, string][]>();
  for (const [path, fragment, title] of toc) {
    if (!tocByFile.has(path)) tocByFile.set(path, []);
    tocByFile.get(path)!.push([fragment, title]);
  }

  const paragraphs: Paragraph[] = [];
  // Título do sumário que apontava para um arquivo sem texto (ex.: imagem de abertura do capítulo separada
  // do texto): passa para o próximo arquivo com texto, senão o capítulo some da lista.
  let carriedTitle: string | null = null;
  for (let i = 0; i < spine.length; i++) {
    const htmlPath = spine[i];
    onProgress?.(i / spine.length);
    if (htmlPath === pkg.navPath || !names.has(htmlPath)) continue; // o sumário em si não é lido em voz alta
    try {
      const html = (await readText(zip, htmlPath)) || '';
      const entries = [...(tocByFile.get(htmlPath) || [])];
      const ownStart = entries.find(([f]) => !f)?.[1] ?? null;
      if (carriedTitle && ownStart === null) entries.unshift([null, carriedTitle]);
      const doc = parseHtml(html);
      const fileParagraphs = extractHtmlParagraphs(html, entries, toc.length === 0, doc);
      if (!fileParagraphs.length) {
        carriedTitle = ownStart || carriedTitle;
        continue;
      }
      carriedTitle = null;
      if (looksLikeTocPage(doc, fileParagraphs, tocTitles)) continue;
      paragraphs.push(...fileParagraphs);
    } catch (err) {
      console.warn(`[EPUB] Falha ao processar arquivo interno ${htmlPath}:`, err);
    }
  }
  return paragraphs;
}

/** Imagem de capa do EPUB (ou null) */
export async function extractEpubCover(zip: JSZip): Promise<Blob | null> {
  const names = Object.keys(zip.files);
  const pkg = await readPackage(zip);
  if (pkg.opf && pkg.opfPath) {
    let coverId: string | null = null;
    for (const meta of byLocalName(pkg.opf, 'meta')) {
      if (meta.getAttribute('name') === 'cover') coverId = meta.getAttribute('content');
    }
    for (const el of byLocalName(pkg.opf, 'item')) {
      const props = el.getAttribute('properties') || '';
      const id = el.getAttribute('id') || '';
      const media = el.getAttribute('media-type') || '';
      const isCover = props.includes('cover-image') || id === coverId || ['cover', 'cover-image', 'coverimage'].includes(id.toLowerCase());
      if (isCover && media.startsWith('image/')) {
        const target = resolveHref(pkg.opfPath, el.getAttribute('href') || '')[0];
        const entry = zip.file(target);
        if (entry) return new Blob([await entry.async('arraybuffer')], { type: media });
      }
    }
  }
  const fallback = names.find((f) => /\.(jpe?g|png|webp)$/i.test(f) && /cover|capa/i.test(f));
  if (fallback) {
    const type = /\.png$/i.test(fallback) ? 'image/png' : 'image/jpeg';
    return new Blob([await zip.file(fallback)!.async('arraybuffer')], { type });
  }
  return null;
}
