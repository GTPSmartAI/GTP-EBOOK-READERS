"""
Extrator de Arquivos EPUB (Electronic Publication) e HTML
Lê os arquivos na ordem do spine, extrai um parágrafo por bloco (<p>, <h1>, <li>...),
ignora notas de rodapé e usa o sumário (nav.xhtml ou toc.ncx) para nomear os capítulos.
"""

import re
import zipfile
import posixpath
import xml.etree.ElementTree as ET
from urllib.parse import unquote
from typing import List, Dict, Optional, Tuple
from bs4 import BeautifulSoup, NavigableString, Tag, Comment

from text_pipeline import Paragraph, normalize_whitespace

_SKIP_TAGS = {"script", "style", "head", "noscript", "svg", "math", "title", "meta", "link", "img", "figure"}
_HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
_BLOCK_TAGS = {
    "p", "div", "section", "article", "blockquote", "li", "ul", "ol", "dd", "dt", "dl", "pre",
    "table", "tr", "td", "th", "tbody", "thead", "header", "footer", "aside", "nav", "main",
    "figcaption", "hr", "body", "html",
}
_NOTE_TEXT_RE = re.compile(r'^[\s\d\*†‡§\[\]\(\),.ivxlc]+$', re.IGNORECASE)


def _epub_type(tag: Tag) -> str:
    return (tag.get("epub:type") or tag.get("role") or "").lower()


def _is_footnote_container(tag: Tag) -> bool:
    kind = _epub_type(tag)
    return any(k in kind for k in ("footnote", "endnote", "rearnote", "doc-footnote", "doc-endnote"))


def _is_note_reference(tag: Tag) -> bool:
    """Números de nota no meio do texto ("mar¹", "<a href='#n1'>1</a>") não devem ser lidos."""
    if "noteref" in _epub_type(tag):
        return True
    text = tag.get_text("", strip=True)
    if not text or not _NOTE_TEXT_RE.match(text) or len(text) > 6:
        return False
    if tag.name == "sup":
        return True
    return tag.name == "a" and "#" in (tag.get("href") or "")


def extract_html_paragraphs(
    html: str,
    toc_entries: Optional[List[Tuple[Optional[str], str]]] = None,
    headings_as_chapters: bool = False,
) -> List[Paragraph]:
    """
    Converte um documento (X)HTML em parágrafos.
    toc_entries: [(id_do_fragmento ou None, título)] vindos do sumário para este arquivo.
    """
    soup = BeautifulSoup(html, "html.parser")
    root = soup.body or soup

    ids_in_doc = {t.get("id") for t in root.find_all(id=True)}
    fragment_titles: Dict[str, str] = {}
    start_title: Optional[str] = None
    for fragment, title in toc_entries or []:
        if fragment and fragment in ids_in_doc:
            fragment_titles.setdefault(fragment, title)
        elif start_title is None:
            start_title = title  # entrada que aponta para o arquivo (ou âncora inexistente)

    paragraphs: List[Paragraph] = []
    buffer: List[str] = []
    pending_title = start_title
    file_has_chapter = start_title is not None or bool(fragment_titles)

    def flush(heading: bool = False):
        nonlocal pending_title
        text = normalize_whitespace("".join(buffer))
        buffer.clear()
        if not text or not re.search(r'\w', text):
            return
        paragraph = Paragraph(text=text, heading=heading)
        if pending_title:
            paragraph.chapter_title = pending_title
            pending_title = None
        paragraphs.append(paragraph)

    def walk(node: Tag):
        nonlocal pending_title, file_has_chapter
        for child in node.children:
            if isinstance(child, Comment):
                continue
            if isinstance(child, NavigableString):
                buffer.append(str(child))
                continue
            if not isinstance(child, Tag):
                continue

            name = (child.name or "").lower()
            child_id = child.get("id")
            if child_id and child_id in fragment_titles:
                flush()
                pending_title = fragment_titles.pop(child_id)

            if name in _SKIP_TAGS or _is_footnote_container(child) or _is_note_reference(child):
                continue
            if name == "br":
                flush()
                continue
            if name in _HEADING_TAGS:
                flush()
                walk(child)
                before = len(paragraphs)
                flush(heading=True)
                if headings_as_chapters and not file_has_chapter and len(paragraphs) > before and name in ("h1", "h2", "h3"):
                    paragraphs[-1].chapter_title = paragraphs[-1].text
                    file_has_chapter = True
                continue
            if name in _BLOCK_TAGS:
                flush()
                walk(child)
                flush()
                continue
            walk(child)  # elemento inline (<em>, <span>, <a>...): o texto continua no mesmo parágrafo

    walk(root)
    flush()
    return paragraphs


# ---------------------------------------------------------------------------
# Estrutura do pacote EPUB
# ---------------------------------------------------------------------------

def _resolve(base_file: str, href: str) -> Tuple[str, Optional[str]]:
    """Resolve um href relativo ao arquivo que o contém. Retorna (caminho no zip, fragmento)."""
    href = unquote(href.strip())
    path, _, fragment = href.partition("#")
    if not path:
        resolved = base_file
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(base_file), path))
    return resolved, (fragment or None)


def _read_package(zf: zipfile.ZipFile):
    """Lê o container.xml e o .opf: retorna (opf_path, manifest, spine, ncx_path, nav_path)."""
    namelist = set(zf.namelist())
    opf_path = None
    if "META-INF/container.xml" in namelist:
        try:
            root = ET.fromstring(zf.read("META-INF/container.xml"))
            for el in root.iter():
                if el.tag.endswith("rootfile"):
                    opf_path = el.attrib.get("full-path")
                    break
        except ET.ParseError:
            pass
    if not opf_path or opf_path not in namelist:
        opf_path = next((n for n in namelist if n.lower().endswith(".opf")), None)
    if not opf_path:
        return None, {}, [], None, None

    opf_root = ET.fromstring(zf.read(opf_path))
    manifest: Dict[str, Dict[str, str]] = {}
    for el in opf_root.iter():
        if el.tag.endswith("item") and el.attrib.get("id") and el.attrib.get("href"):
            path, _ = _resolve(opf_path, el.attrib["href"])
            manifest[el.attrib["id"]] = {
                "path": path,
                "media": el.attrib.get("media-type", ""),
                "props": el.attrib.get("properties", ""),
            }

    spine: List[str] = []
    ncx_path = None
    for el in opf_root.iter():
        if el.tag.endswith("spine"):
            toc_id = el.attrib.get("toc")
            if toc_id and toc_id in manifest:
                ncx_path = manifest[toc_id]["path"]
        if el.tag.endswith("itemref"):
            idref = el.attrib.get("idref")
            if idref in manifest and el.attrib.get("linear", "yes") != "no":
                spine.append(manifest[idref]["path"])

    if not ncx_path:
        ncx_path = next((m["path"] for m in manifest.values() if m["media"] == "application/x-dtbncx+xml"), None)
    nav_path = next((m["path"] for m in manifest.values() if "nav" in m["props"].split()), None)
    return opf_path, manifest, spine, ncx_path, nav_path


def _toc_from_nav(zf: zipfile.ZipFile, nav_path: str) -> List[Tuple[str, Optional[str], str]]:
    soup = BeautifulSoup(zf.read(nav_path).decode("utf-8", errors="ignore"), "html.parser")
    nav = soup.find("nav", attrs={"epub:type": "toc"}) or soup.find("nav", attrs={"role": "doc-toc"}) or soup.find("nav")
    if not nav:
        return []
    entries = []
    for a in nav.find_all("a", href=True):
        title = normalize_whitespace(a.get_text(" ", strip=True))
        if title:
            path, fragment = _resolve(nav_path, a["href"])
            entries.append((path, fragment, title))
    return entries


def _toc_from_ncx(zf: zipfile.ZipFile, ncx_path: str) -> List[Tuple[str, Optional[str], str]]:
    root = ET.fromstring(zf.read(ncx_path))
    entries = []
    for point in root.iter():
        if not point.tag.endswith("navPoint"):
            continue
        title, src = "", None
        for child in point:
            if child.tag.endswith("navLabel"):
                for text_el in child.iter():
                    if text_el.tag.endswith("text") and text_el.text:
                        title = normalize_whitespace(text_el.text)
                        break
            elif child.tag.endswith("content"):
                src = child.attrib.get("src")
        if title and src:
            path, fragment = _resolve(ncx_path, src)
            entries.append((path, fragment, title))
    return entries


def _normalize_title(text: str) -> str:
    """Tira a numeração de lista ("12. ", "3) ") e normaliza para comparar com os títulos do sumário."""
    return re.sub(r'^\s*\d+\s*[.)\-–]\s*', '', normalize_whitespace(text)).lower()


def _looks_like_toc_page(html: str, paragraphs: List[Paragraph], toc_titles: set) -> bool:
    """
    Página de índice dentro do livro (não deve ser lida em voz alta):
    quase todo o texto é link, ou a maioria dos parágrafos repete títulos do sumário oficial.
    """
    body_paragraphs = [p for p in paragraphs if not p.heading]
    if len(body_paragraphs) < 5:
        return False

    if toc_titles:
        matches = sum(1 for p in body_paragraphs if _normalize_title(p.text) in toc_titles)
        if matches / len(body_paragraphs) > 0.6:
            return True

    soup = BeautifulSoup(html, "html.parser")
    body = soup.body or soup
    links = body.find_all("a", href=True)
    if len(links) < 5:
        return False
    total = len(re.sub(r'[\s\d.]+', '', body.get_text(" ", strip=True)))
    linked = sum(len(re.sub(r'[\s\d.]+', '', a.get_text(" ", strip=True))) for a in links)
    return total > 0 and linked / total > 0.6


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="ignore")


def extract_epub_paragraphs(file_path: str) -> List[Paragraph]:
    """Extrai todos os parágrafos do EPUB na ordem de leitura, com capítulos vindos do sumário."""
    with zipfile.ZipFile(file_path, "r") as zf:
        namelist = set(zf.namelist())
        _, _, spine, ncx_path, nav_path = _read_package(zf)

        if not spine:
            spine = sorted(
                n for n in namelist
                if n.lower().endswith((".xhtml", ".html", ".htm"))
                and not n.lower().endswith(("toc.xhtml", "nav.xhtml", "cover.xhtml"))
            )

        toc: List[Tuple[str, Optional[str], str]] = []
        try:
            if nav_path and nav_path in namelist:
                toc = _toc_from_nav(zf, nav_path)
            if not toc and ncx_path and ncx_path in namelist:
                toc = _toc_from_ncx(zf, ncx_path)
        except Exception as toc_err:
            print(f"[EPUB Warning] Sumário ilegível, usando títulos do texto: {toc_err}")
            toc = []

        toc_titles = {_normalize_title(title) for _, _, title in toc}
        toc_by_file: Dict[str, List[Tuple[Optional[str], str]]] = {}
        for path, fragment, title in toc:
            toc_by_file.setdefault(path, []).append((fragment, title))

        paragraphs: List[Paragraph] = []
        for html_path in spine:
            if html_path == nav_path or html_path not in namelist:
                continue  # o sumário em si não é lido em voz alta
            try:
                html = _decode(zf.read(html_path))
                file_paragraphs = extract_html_paragraphs(
                    html,
                    toc_entries=toc_by_file.get(html_path),
                    headings_as_chapters=not toc,
                )
                if _looks_like_toc_page(html, file_paragraphs, toc_titles):
                    continue
                paragraphs.extend(file_paragraphs)
            except Exception as read_err:
                print(f"[EPUB Warning] Falha ao processar arquivo interno {html_path}: {read_err}")

    return paragraphs
