"""
Extração de Livros (PDF, EPUB, DOCX, TXT, Markdown, HTML)
Cada formato é convertido em parágrafos reais e entregue ao text_pipeline,
que monta frases, trechos de fala/narração e capítulos.
"""

import os
import re
import zipfile
import statistics
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional
from pypdf import PdfReader

from text_pipeline import (
    Paragraph,
    build_book_structure,
    is_chapter_heading,
    join_wrapped_lines,
    normalize_whitespace,
)
from epub_extractor import extract_epub_paragraphs, extract_html_paragraphs


class UnsupportedDocumentError(ValueError):
    """Arquivo que não pode ser convertido em texto (formato não suportado, PDF escaneado, vazio)."""


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

_PAGE_NUMBER_RE = re.compile(
    r'^\s*((p[áa]g(ina)?\.?|page)\s*)?(\d{1,4}|[ivxlcdm]{1,7})\s*$'
    r'|^\s*\d{1,4}\s*(/|de|of)\s*\d{1,4}\s*$',
)
_EDGE_LINES = 2  # linhas do topo e da base de cada página candidatas a cabeçalho/rodapé
_SENTENCE_END_RE = re.compile(r'[.!?…:]["”’»)]*$')


@dataclass
class PdfLine:
    text: str
    x: Optional[float] = None  # posição horizontal do início da linha (pontos)
    y: Optional[float] = None  # posição vertical da linha (pontos, cresce para cima)


def _read_page_lines(page) -> List[PdfLine]:
    """Lê as linhas da página com a posição de cada uma (usada para achar recuo e espaço entre parágrafos)."""
    lines: List[PdfLine] = [PdfLine("")]

    def visit(text, cm, tm, _font, _size):
        x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
        y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
        for j, part in enumerate(text.split("\n")):
            if j > 0:
                lines.append(PdfLine(""))
            if part.strip() and lines[-1].x is None:
                lines[-1].x, lines[-1].y = x, y
            lines[-1].text += part

    try:
        page.extract_text(visitor_text=visit)
    except Exception:
        try:
            return [PdfLine(t) for t in (page.extract_text() or "").split("\n")]
        except Exception:
            return []
    return lines


def _edge_indexes(lines: List[PdfLine]) -> List[int]:
    filled = [i for i, line in enumerate(lines) if line.text.strip()]
    return sorted(set(filled[:_EDGE_LINES] + filled[-_EDGE_LINES:]))


def _boilerplate_key(line: str) -> str:
    return re.sub(r'\d+', '#', line.strip().lower())


def _strip_headers_and_footers(pages: List[List[PdfLine]]) -> List[List[PdfLine]]:
    """Remove número de página e cabeçalhos/rodapés que se repetem (título do livro, nome do autor)."""
    key_pages: Dict[str, set] = defaultdict(set)
    for page_idx, lines in enumerate(pages):
        for i in _edge_indexes(lines):
            key_pages[_boilerplate_key(lines[i].text)].add(page_idx)

    min_repeats = max(3, int(len(pages) * 0.3))
    repeated = {k for k, found_in in key_pages.items() if len(pages) >= 4 and len(found_in) >= min_repeats}

    cleaned_pages = []
    for lines in pages:
        edges = set(_edge_indexes(lines))
        kept = []
        for i, line in enumerate(lines):
            text = line.text
            # "Capítulo 3" no topo da página se repete com números diferentes, mas é título, não cabeçalho
            if i in edges and not is_chapter_heading(text):
                if _PAGE_NUMBER_RE.match(text) and not text.strip().isupper():
                    continue
                looks_like_prose = text.strip()[:1] in "—–\"“«" or bool(re.search(r'[.!?…"”»]$', text.strip()))
                if _boilerplate_key(text) in repeated and not looks_like_prose:
                    continue
            kept.append(line)
        cleaned_pages.append(kept)
    return cleaned_pages


def _page_geometry(lines: List[PdfLine]) -> Tuple[Optional[float], Optional[float]]:
    """Margem esquerda mais comum e espaçamento típico entre linhas da página."""
    xs = [round(l.x) for l in lines if l.x is not None and l.text.strip()]
    ys = [l.y for l in lines if l.y is not None and l.text.strip()]
    margin = statistics.mode(xs) if xs else None
    gaps = sorted(a - b for a, b in zip(ys, ys[1:]) if a - b > 0.5)
    # Quartil inferior: em páginas cheias de diálogo curto há mais espaços entre parágrafos do que entre linhas
    spacing = gaps[len(gaps) // 4] if gaps else None
    return margin, spacing


def _pdf_outline(reader: PdfReader) -> List[Tuple[int, str]]:
    """Lê os marcadores (sumário) do PDF: [(página, título)] ordenado por página."""
    try:
        outline = reader.outline
    except Exception:
        return []

    def collect(items) -> List[Tuple[int, str]]:
        found = []
        for item in items:
            if isinstance(item, list):
                continue
            try:
                page = reader.get_destination_page_number(item)
                title = normalize_whitespace(str(item.title or ""))
                if page is not None and page >= 0 and title:
                    found.append((page, title))
            except Exception:
                continue
        return found

    entries = collect(outline)
    if len(entries) <= 1:
        # Livros com um único marcador raiz ("Sumário") guardam os capítulos no nível seguinte
        nested = [item for item in outline if isinstance(item, list)]
        if nested:
            entries = entries + collect(nested[0])

    seen_pages = set()
    unique = []
    for page, title in sorted(entries, key=lambda e: e[0]):
        if page not in seen_pages:
            seen_pages.add(page)
            unique.append((page, title))
    return unique


_INDENT_MIN_POINTS = 5.0


def _layout_breaks(pages: List[List[PdfLine]]) -> List[List[bool]]:
    """
    Para cada linha, indica se a posição dela mostra início de parágrafo:
    recuo de primeira linha ou espaço vertical maior que o normal em relação à linha anterior.
    """
    geometry = [_page_geometry(lines) for lines in pages]

    indented_total = filled_total = 0
    for lines, (margin, _) in zip(pages, geometry):
        for line in lines:
            if line.x is not None and line.text.strip() and margin is not None:
                filled_total += 1
                if line.x - margin > _INDENT_MIN_POINTS:
                    indented_total += 1
    # Se quase toda linha parece "recuada", as posições não são confiáveis (layout irregular)
    use_indent = filled_total > 0 and indented_total / filled_total < 0.35

    breaks: List[List[bool]] = []
    for lines, (margin, spacing) in zip(pages, geometry):
        page_breaks = []
        prev_y: Optional[float] = None
        for line in lines:
            is_break = False
            if line.x is not None and line.text.strip():
                if use_indent and margin is not None and line.x - margin > _INDENT_MIN_POINTS:
                    is_break = True
                if spacing and prev_y is not None and line.y is not None and (prev_y - line.y) > spacing * 1.45:
                    is_break = True
                prev_y = line.y
            page_breaks.append(is_break)
        breaks.append(page_breaks)
    return breaks


def _assemble_pdf_paragraphs(pages: List[List[PdfLine]], chapter_pages: set, headings_as_chapters: bool) -> List[Paragraph]:
    """Reconstrói parágrafos a partir das linhas visuais das páginas."""
    layout_breaks = _layout_breaks(pages)
    stream = [
        (line.text.strip(), page_idx, layout_breaks[page_idx][line_idx])
        for page_idx, lines in enumerate(pages)
        for line_idx, line in enumerate(lines)
    ]
    lengths = [len(s) for s, _, _ in stream if len(s) >= 10]
    typical = statistics.quantiles(lengths, n=4)[2] if len(lengths) >= 4 else 60

    paragraphs: List[Paragraph] = []
    buffer: List[str] = []
    buffer_page: Optional[int] = None
    last_heading: Optional[Paragraph] = None
    previous_page: Optional[int] = None

    def flush():
        nonlocal buffer, buffer_page
        if buffer:
            paragraphs.append(Paragraph(text=join_wrapped_lines(buffer), page=buffer_page))
        buffer = []
        buffer_page = None

    for i, (line, page_idx, starts_paragraph) in enumerate(stream):
        if page_idx != previous_page and page_idx in chapter_pages:
            flush()
        previous_page = page_idx

        if not line:
            flush()
            continue
        if starts_paragraph:
            flush()

        next_line = stream[i + 1][0] if i + 1 < len(stream) else ""
        # Título é linha curta e isolada: uma linha cheia que começa com "Parte dois do plano..." é texto corrido
        if is_chapter_heading(line) and len(line) < typical * 0.7 and not next_line[:1].islower():
            flush()
            heading = Paragraph(
                text=line,
                heading=True,
                chapter_title=line if headings_as_chapters else None,
                page=page_idx,
            )
            paragraphs.append(heading)
            last_heading = heading
            continue

        # Subtítulo logo abaixo de "Capítulo 1" (ex.: "O Início")
        if last_heading is not None and len(line) < typical * 0.6 and not _SENTENCE_END_RE.search(line) \
                and not line.endswith(",") and line[:1] not in "—–-":
            paragraphs.append(Paragraph(text=line, heading=True, page=page_idx))
            if last_heading.chapter_title:
                last_heading.chapter_title = f"{last_heading.chapter_title} — {line}"
            last_heading = None
            continue
        last_heading = None

        # Toda fala com travessão começa um parágrafo novo
        if line[:1] in "—–" and buffer:
            flush()

        if not buffer:
            buffer_page = page_idx
        buffer.append(line)

        ends_sentence = bool(_SENTENCE_END_RE.search(line))
        if ends_sentence and len(line) < typical * 0.75:
            flush()
        elif not ends_sentence and len(line) < typical * 0.5 and next_line[:1].isupper() and not line.endswith(("-", ",")):
            flush()

    flush()
    return paragraphs


def extract_pdf_paragraphs(file_path: str) -> List[Paragraph]:
    reader = PdfReader(file_path)
    pages = [_read_page_lines(page) for page in reader.pages]

    total_chars = sum(len(line.text.strip()) for lines in pages for line in lines)
    if total_chars < 20:
        raise UnsupportedDocumentError(
            "Este PDF não tem texto selecionável (provavelmente é digitalizado). É preciso passar OCR antes de enviar."
        )

    pages = _strip_headers_and_footers(pages)
    outline = _pdf_outline(reader)
    chapter_pages = {page for page, _ in outline}
    paragraphs = _assemble_pdf_paragraphs(pages, chapter_pages, headings_as_chapters=not outline)

    for page, title in outline:
        target = next((p for p in paragraphs if p.page is not None and p.page >= page), None)
        if target is not None and not target.chapter_title:
            target.chapter_title = title
    return paragraphs


def extract_pdf_cover(file_path: str) -> Tuple[Optional[bytes], Optional[str]]:
    """Extrai a maior imagem da primeira página do PDF como capa."""
    try:
        reader = PdfReader(file_path)
        if reader.pages:
            page0 = reader.pages[0]
            if hasattr(page0, 'images') and page0.images:
                largest_img = None
                largest_size = 0
                for img in page0.images:
                    if len(img.data) > largest_size:
                        largest_size = len(img.data)
                        largest_img = img
                if largest_img and largest_size > 2048:
                    ext = largest_img.name.split('.')[-1].lower() if '.' in largest_img.name else 'jpeg'
                    mime = "image/png" if ext == "png" else "image/jpeg"
                    return largest_img.data, mime
    except Exception as e:
        print(f"[PDF Cover Extract Warning] {e}")
    return None, None


# ---------------------------------------------------------------------------
# EPUB (capa)
# ---------------------------------------------------------------------------

def extract_epub_cover(file_path: str) -> Tuple[Optional[bytes], Optional[str]]:
    """Extrai a imagem de capa de um arquivo EPUB."""
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            namelist = zf.namelist()
            opf_path = None
            if "META-INF/container.xml" in namelist:
                root = ET.fromstring(zf.read("META-INF/container.xml"))
                for rf in root.iter():
                    if rf.tag.endswith("rootfile"):
                        opf_path = rf.attrib.get("full-path")
                        break

            if opf_path and opf_path in namelist:
                opf_root = ET.fromstring(zf.read(opf_path))
                opf_dir = os.path.dirname(opf_path)
                cover_id = None
                for meta in opf_root.iter():
                    if meta.tag.endswith("meta") and meta.attrib.get("name") == "cover":
                        cover_id = meta.attrib.get("content")
                for item in opf_root.iter():
                    if item.tag.endswith("item"):
                        props = item.attrib.get("properties", "")
                        iid = item.attrib.get("id", "")
                        href = item.attrib.get("href", "")
                        media = item.attrib.get("media-type", "")
                        is_cover = "cover-image" in props or iid == cover_id or iid.lower() in ("cover", "cover-image", "coverimage")
                        if is_cover and media.startswith("image/"):
                            target = os.path.join(opf_dir, href).replace("\\", "/") if opf_dir else href
                            if target in namelist:
                                return zf.read(target), media

            for f in namelist:
                fl = f.lower()
                if fl.endswith((".jpg", ".jpeg", ".png", ".webp")) and ("cover" in fl or "capa" in fl):
                    ext = f.split('.')[-1].lower()
                    return zf.read(f), "image/png" if ext == "png" else "image/jpeg"
    except Exception as e:
        print(f"[EPUB Cover Extract Warning] {e}")
    return None, None


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------

def extract_docx_paragraphs(file_path: str) -> List[Paragraph]:
    import docx

    doc = docx.Document(file_path)
    paragraphs: List[Paragraph] = []
    for p in doc.paragraphs:
        text = normalize_whitespace(p.text)
        if not text:
            continue
        style = (p.style.name if p.style is not None else "").lower()
        level_match = re.search(r'(\d+)', style)
        level = int(level_match.group(1)) if level_match else 1
        is_title = style == "title" or style.startswith("título") or style.startswith("titulo")
        is_heading = is_title or style.startswith("heading")
        if is_heading or is_chapter_heading(text):
            is_chapter = is_title or (is_heading and level <= 2) or is_chapter_heading(text)
            paragraphs.append(Paragraph(text=text, heading=True, chapter_title=text if is_chapter else None))
        else:
            paragraphs.append(Paragraph(text=text))
    return paragraphs


def extract_docx_cover(file_path: str) -> Tuple[Optional[bytes], Optional[str]]:
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            for name in sorted(zf.namelist()):
                if name.startswith("word/media/"):
                    ext = name.split(".")[-1].lower()
                    return zf.read(name), "image/png" if ext == "png" else "image/jpeg"
    except Exception:
        pass
    return None, None


# ---------------------------------------------------------------------------
# TXT / Markdown
# ---------------------------------------------------------------------------

def _read_text_file(file_path: str) -> str:
    with open(file_path, "rb") as f:
        raw = f.read()
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="ignore")


def _clean_markdown_inline(text: str) -> str:
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)          # imagens
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)       # links
    text = re.sub(r'(\*\*|__|`)', '', text)
    text = re.sub(r'(?<!\w)[*_](\S[^*_]*\S|\S)[*_](?!\w)', r'\1', text)  # itálico
    return text


def extract_text_paragraphs(file_path: str, markdown: bool = False) -> List[Paragraph]:
    raw = _read_text_file(file_path).replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.split("\n")
    blank_lines = sum(1 for line in lines if not line.strip())
    # Com linhas em branco separando parágrafos, as linhas internas são só quebra de layout
    wrapped = blank_lines >= 2

    paragraphs: List[Paragraph] = []
    buffer: List[str] = []

    def flush():
        nonlocal buffer
        if buffer:
            text = join_wrapped_lines(buffer)
            if markdown:
                text = _clean_markdown_inline(text)
            paragraphs.append(Paragraph(text=text))
        buffer = []

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            flush()
            continue

        md_heading = re.match(r'^(#{1,6})\s+(.*)$', line) if markdown else None
        if md_heading:
            flush()
            title = _clean_markdown_inline(md_heading.group(2).strip())
            level = len(md_heading.group(1))
            paragraphs.append(Paragraph(text=title, heading=True, chapter_title=title if level <= 2 else None))
            continue
        if markdown:
            line = re.sub(r'^>\s?', '', line)
            line = re.sub(r'^[*+]\s+', '', line)

        if is_chapter_heading(line) and not (wrapped and buffer):
            flush()
            paragraphs.append(Paragraph(text=line, heading=True, chapter_title=line))
            continue

        if not wrapped or line[:1] in "—–":
            flush()
        buffer.append(line)
        if not wrapped:
            flush()

    flush()
    return paragraphs


# ---------------------------------------------------------------------------
# Ponto de entrada
# ---------------------------------------------------------------------------

def _detect_format(file_path: str) -> str:
    name = file_path.lower()
    for ext, fmt in (
        (".pdf", "pdf"), (".epub", "epub"), (".docx", "docx"), (".doc", "doc"),
        (".md", "md"), (".markdown", "md"), (".txt", "txt"),
        (".html", "html"), (".htm", "html"), (".xhtml", "html"),
        (".mobi", "mobi"), (".azw", "mobi"), (".azw3", "mobi"),
    ):
        if name.endswith(ext):
            return fmt
    with open(file_path, "rb") as f:
        head = f.read(8)
    if head.startswith(b"%PDF"):
        return "pdf"
    if zipfile.is_zipfile(file_path):
        return "epub"
    return "txt"


def extract_book(file_path: str) -> Dict[str, Any]:
    """
    Extrai o livro em qualquer formato suportado e devolve:
    content, sentences, chapters, total_words, duration_minutes, structure,
    cover_bytes, cover_mime e doc_type.
    """
    fmt = _detect_format(file_path)
    cover_bytes: Optional[bytes] = None
    cover_mime: Optional[str] = None

    if fmt == "pdf":
        paragraphs = extract_pdf_paragraphs(file_path)
        cover_bytes, cover_mime = extract_pdf_cover(file_path)
    elif fmt == "epub":
        paragraphs = extract_epub_paragraphs(file_path)
        cover_bytes, cover_mime = extract_epub_cover(file_path)
    elif fmt == "docx":
        paragraphs = extract_docx_paragraphs(file_path)
        cover_bytes, cover_mime = extract_docx_cover(file_path)
    elif fmt == "html":
        paragraphs = extract_html_paragraphs(_read_text_file(file_path))
    elif fmt in ("txt", "md"):
        paragraphs = extract_text_paragraphs(file_path, markdown=(fmt == "md"))
    elif fmt == "doc":
        raise UnsupportedDocumentError("Arquivos .doc antigos não são suportados. Salve como .docx ou PDF e envie novamente.")
    else:
        raise UnsupportedDocumentError("Arquivos MOBI/AZW não são suportados. Converta para EPUB (ex.: com o Calibre) e envie novamente.")

    book = build_book_structure(paragraphs)
    if not book["sentences"]:
        raise UnsupportedDocumentError("Não foi encontrado texto legível neste arquivo.")

    book["cover_bytes"] = cover_bytes
    book["cover_mime"] = cover_mime
    book["doc_type"] = "txt" if fmt == "md" else fmt
    return book
