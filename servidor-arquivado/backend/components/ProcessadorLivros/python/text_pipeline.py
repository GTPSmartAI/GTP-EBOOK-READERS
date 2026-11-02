"""
Pipeline de Texto do ProcessadorLivros
Recebe parágrafos já extraídos (PDF, EPUB, DOCX, TXT, HTML) e monta a estrutura de leitura:
- unidades faladas: frases, e dentro delas os trechos de fala e de narração separados
- tipo de cada unidade: narração (n), fala de personagem (d), mensagem entre colchetes (s) ou título (h)
- índice da primeira unidade de cada parágrafo
- capítulos apontando para a unidade onde começam
"""

import re
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

STRUCTURE_VERSION = 4  # 3: trechos entre colchetes (s); 4: 『 』 e 【 】 também. O frontend baixa de novo livros com versão menor.

KIND_NARRATION = "n"
KIND_DIALOGUE = "d"
KIND_HEADING = "h"
KIND_SYSTEM = "s"  # texto entre colchetes [ ] 『 』 【 】: mensagens de sistema/janelas ("[Cenário Principal nº 1]")

# Tamanho máximo de uma unidade enviada ao TTS (frases gigantes sem pontuação são quebradas)
MAX_UNIT_CHARS = 360


@dataclass
class Paragraph:
    text: str
    heading: bool = False
    chapter_title: Optional[str] = None  # quando definido, um capítulo começa neste parágrafo
    page: Optional[int] = None           # página de origem (apenas PDF)


# ---------------------------------------------------------------------------
# Normalização
# ---------------------------------------------------------------------------

_INVISIBLE_CHARS = re.compile(r'[­​‌‍⁠﻿]')


def normalize_whitespace(text: str) -> str:
    """Remove hífens invisíveis e caracteres de largura zero, e colapsa espaços."""
    if not text:
        return ""
    text = _INVISIBLE_CHARS.sub("", text)
    text = text.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    return re.sub(r'\s+', ' ', text).strip()


def join_wrapped_lines(lines: List[str]) -> str:
    """Junta linhas quebradas pelo layout da página desfazendo a hifenização ("ci-" + "dade")."""
    result = ""
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if not result:
            result = line
        elif result.endswith("-") and len(result) > 1 and result[-2].isalpha() and line[:1].islower():
            result = result[:-1] + line
        else:
            result = f"{result} {line}"
    return result


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r'\b\w+\b', text))


# ---------------------------------------------------------------------------
# Títulos de capítulo
# ---------------------------------------------------------------------------

_NUMBER_WORDS = (
    r'um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|'
    r'catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|'
    r'primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|s[ée]tim[oa]|'
    r'oitav[oa]|non[oa]|d[ée]cim[oa]|[úu]ltim[oa]|final|'
    r'one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|last'
)

_NUMBERED_HEADING_RE = re.compile(
    rf'^(cap[íi]tulo|chapter|parte|part|livro|book|ato)\s+([0-9]+|[ivxlcdm]+|{_NUMBER_WORDS})\b',
    re.IGNORECASE,
)
_SECTION_HEADING_RE = re.compile(
    r'^(pr[óo]logo|ep[íi]logo|pref[áa]cio|introdu[çc][ãa]o|conclus[ãa]o|ap[êe]ndice|'
    r'posf[áa]cio|interl[úu]dio|agradecimentos|prologue|epilogue|preface|introduction)\b',
    re.IGNORECASE,
)


def is_chapter_heading(line: str) -> bool:
    """Reconhece linhas como "Capítulo 3", "CAPÍTULO XII – A Fuga", "Prólogo" ou "Parte Dois"."""
    s = line.strip()
    if not s or len(s) > 80 or s.endswith((",", ";")):
        return False
    if _NUMBERED_HEADING_RE.match(s):
        return True
    # Seções nomeadas só contam quando a linha é curta (evita "Introdução ao tema foi...")
    return bool(_SECTION_HEADING_RE.match(s)) and len(s.split()) <= 8 and not s.endswith(".")


# ---------------------------------------------------------------------------
# Divisão em frases
# ---------------------------------------------------------------------------

# Abreviações que costumam vir antes de nomes próprios ou números ("Sr. Silva", "pág. 12")
_ABBREVIATIONS = {
    "sr", "sra", "srta", "srs", "sras", "dr", "dra", "drs", "dras", "prof", "profa", "profs",
    "exmo", "exma", "sto", "sta", "sr", "d", "dom", "gen", "gal", "cel", "ten", "sgt", "sgto",
    "cap", "maj", "adm", "mons", "pe", "fr", "rev", "av", "r", "jr", "mr", "mrs", "ms", "st",
    "pág", "pag", "págs", "pags", "p", "pp", "n", "nº", "art", "arts", "fig", "figs", "vol",
    "vols", "ed", "tel", "cf", "séc", "sec", "cia", "ltda", "vs", "v", "trad", "coord", "aprox",
}

_BOUNDARY_RE = re.compile(r'([.!?…]+)(["”’»)\]]*)(\s+)')
_OPENING_QUOTES = '"“«‘\'('
_DASHES = "—–"


def _is_abbreviation(text: str, dot_pos: int) -> bool:
    match = re.search(r'([\wºª.]+)$', text[:dot_pos])
    if not match:
        return False
    token = match.group(1)
    if len(token) == 1 and token.isupper():
        return True  # iniciais: "J. R. R. Tolkien"
    lower = token.lower()
    if lower in _ABBREVIATIONS:
        return True
    parts = lower.split(".")
    return len(parts) > 1 and all(len(p) <= 1 for p in parts)  # "a.C", "E.U.A"


def _starts_new_sentence(text: str, pos: int) -> bool:
    """Decide se o texto a partir de `pos` inicia uma nova frase."""
    ch = text[pos]
    if ch in _DASHES or (ch == "-" and text[pos + 1:pos + 2] == " "):
        # "— Quem é? — perguntou Maria": travessão seguido de minúscula continua a mesma frase
        rest = text[pos + 1:].lstrip()
        return bool(rest) and (rest[0].isupper() or rest[0] in _OPENING_QUOTES)
    if ch in _OPENING_QUOTES:
        rest = text[pos:].lstrip(_OPENING_QUOTES + " ")
        return bool(rest) and (rest[0].isupper() or rest[0].isdigit() or rest[0] in "…¿¡")
    return ch.isupper() or ch.isdigit() or ch in "¿¡"


def split_sentences(paragraph: str) -> List[str]:
    """Divide um parágrafo em frases respeitando abreviações, reticências, aspas e travessões."""
    text = paragraph.strip()
    if not text:
        return []

    sentences: List[str] = []
    start = 0
    for match in _BOUNDARY_RE.finditer(text):
        next_pos = match.end()
        if next_pos >= len(text):
            continue
        if not _starts_new_sentence(text, next_pos):
            continue
        if match.group(1) == "." and _is_abbreviation(text, match.start(1)):
            continue
        piece = text[start:match.end(2)].strip()
        if piece:
            sentences.append(piece)
        start = next_pos

    tail = text[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


# ---------------------------------------------------------------------------
# Separação entre fala e narração
# ---------------------------------------------------------------------------

_CLOSING_QUOTES = "”»"
_TRAILING_PUNCT = ",.;:!?…"


def _is_dialogue_dash(text: str, i: int) -> bool:
    """
    Travessão de diálogo: vem no início ou depois de espaço, nunca colado ao fim da palavra ("não—").
    Aceita os dois estilos de edição: "— Sim — disse ele" e "—Sim —disse ele".
    """
    ch = text[i]
    before_ok = i == 0 or text[i - 1].isspace()
    if ch in _DASHES:
        return before_ok
    if ch == "-":
        # hífen só conta isolado por espaços ("- Sim - disse ele"), para não confundir com "-5 graus"
        return before_ok and (i + 1 >= len(text) or text[i + 1].isspace())
    return False


# Colchetes de mensagem de sistema/título de obra: abertura -> fechamento
_SYSTEM_BRACKETS = {"[": "]", "『": "』", "【": "】"}


def _split_quoted(sentence: str, state: Dict[str, Any]) -> List[Tuple[str, str]]:
    """
    Separa trechos entre aspas (fala) e entre colchetes [ ] 『 』 【 】 (mensagem de sistema) do restante (narração).
    O estado de aspas/colchetes abertos atravessa as frases do parágrafo (state é atualizado;
    state["bracket"] guarda o caractere de fechamento esperado).
    Colchetes dentro de uma fala continuam sendo fala.
    """
    pieces: List[Tuple[str, str]] = []
    buf = ""
    i = 0
    n = len(sentence)

    def current_kind() -> str:
        if state["quote"]:
            return KIND_DIALOGUE
        if state["bracket"]:
            return KIND_SYSTEM
        return KIND_NARRATION

    def emit(kind: str):
        nonlocal buf
        if buf.strip():
            pieces.append((buf.strip(), kind))
        buf = ""

    def absorb_trailing_punct():
        # A pontuação colada depois do fechamento ("Sim”, disse / [Aviso]!) fica com o trecho
        nonlocal i, buf
        while i + 1 < n and sentence[i + 1] in _TRAILING_PUNCT:
            i += 1
            buf += sentence[i]

    while i < n:
        ch = sentence[i]
        if state["bracket"] and not state["quote"]:
            buf += ch
            if ch == state["bracket"]:
                absorb_trailing_punct()
                emit(KIND_SYSTEM)
                state["bracket"] = False
        elif state["quote"]:
            if ch in _CLOSING_QUOTES or ch == '"':
                buf += ch
                absorb_trailing_punct()
                emit(KIND_DIALOGUE)
                state["quote"] = False
            else:
                buf += ch
        elif ch in "“«\"":
            emit(KIND_NARRATION)
            state["quote"] = True
            buf = ch
        elif ch in _SYSTEM_BRACKETS:
            emit(KIND_NARRATION)
            state["bracket"] = _SYSTEM_BRACKETS[ch]  # guarda o fechamento esperado
            buf = ch
        else:
            buf += ch
        i += 1

    emit(current_kind())
    return pieces


def _split_dashed(sentence: str, in_dialogue: bool) -> Tuple[List[Tuple[str, str]], bool]:
    """Diálogo com travessão: cada travessão isolado alterna entre fala e narração."""
    pieces: List[Tuple[str, str]] = []
    buf = ""
    for i, ch in enumerate(sentence):
        if _is_dialogue_dash(sentence, i):
            if buf.strip():
                pieces.append((buf.strip(), KIND_DIALOGUE if in_dialogue else KIND_NARRATION))
            buf = ch
            in_dialogue = not in_dialogue
        else:
            buf += ch
    if buf.strip():
        pieces.append((buf.strip(), KIND_DIALOGUE if in_dialogue else KIND_NARRATION))
    return pieces, in_dialogue


def _demote_emphasis_quotes(pieces: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """
    Aspas de destaque no meio da narração (E entre essas "memórias importantes" existe...) não são fala:
    trecho curto entre aspas, com narração antes e a frase continuando em minúscula depois.
    """
    result = list(pieces)
    for i, (text, kind) in enumerate(result):
        if kind != KIND_DIALOGUE or i == 0 or i + 1 >= len(result):
            continue
        prev_text, prev_kind = result[i - 1]
        next_text, next_kind = result[i + 1]
        inner = text.strip(_OPENING_QUOTES + _CLOSING_QUOTES + _TRAILING_PUNCT + " ")
        if (prev_kind == KIND_NARRATION and next_kind == KIND_NARRATION
                and len(inner.split()) <= 4 and next_text[:1].islower()
                and not prev_text.rstrip().endswith((":", ".", "!", "?"))):
            result[i] = (text, KIND_NARRATION)
    return result


def _merge_pieces(pieces: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """Cola trechos sem letras (só pontuação/travessão) no vizinho e une trechos seguidos do mesmo tipo."""
    merged: List[Tuple[str, str]] = []
    pending_prefix = ""
    for text, kind in pieces:
        if not re.search(r'\w', text):
            if merged:
                prev_text, prev_kind = merged[-1]
                merged[-1] = (f"{prev_text} {text}".strip(), prev_kind)
            else:
                pending_prefix = f"{pending_prefix} {text}".strip()
            continue
        if pending_prefix:
            text = f"{pending_prefix} {text}"
            pending_prefix = ""
        if merged and merged[-1][1] == kind:
            merged[-1] = (f"{merged[-1][0]} {text}", kind)
        else:
            merged.append((text, kind))
    if pending_prefix and merged:
        merged[-1] = (f"{merged[-1][0]} {pending_prefix}", merged[-1][1])
    return merged


def _split_long_unit(text: str, max_chars: int = MAX_UNIT_CHARS) -> List[str]:
    """Quebra trechos muito longos em vírgulas/ponto e vírgula para não travar a síntese de voz."""
    if len(text) <= max_chars:
        return [text]
    chunks: List[str] = []
    rest = text
    while len(rest) > max_chars:
        window = rest[:max_chars]
        cut = max(window.rfind("; "), window.rfind(": "), window.rfind(", "))
        if cut < max_chars * 0.4:
            cut = window.rfind(" ")
        if cut <= 0:
            cut = max_chars
        else:
            cut += 1  # mantém a pontuação no pedaço atual
        chunks.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    if rest:
        chunks.append(rest)
    return chunks


def segment_paragraph(text: str) -> List[Tuple[str, str]]:
    """Retorna as unidades faladas do parágrafo como (texto, tipo)."""
    sentences = split_sentences(text)
    dash_mode = bool(re.match(r'^\s*([—–]|-\s)', text))

    units: List[Tuple[str, str]] = []
    quote_state = {"quote": False, "bracket": False}
    in_dash_dialogue = False  # o primeiro travessão do parágrafo abre a fala
    for sentence in sentences:
        if dash_mode:
            pieces, in_dash_dialogue = _split_dashed(sentence, in_dash_dialogue)
        else:
            pieces = _split_quoted(sentence, quote_state)
            pieces = _demote_emphasis_quotes(pieces)
        for piece_text, kind in _merge_pieces(pieces):
            for chunk in _split_long_unit(piece_text):
                units.append((chunk, kind))

    # Frases sem letras (ex.: "…") coladas na anterior para não gerar unidade vazia
    cleaned: List[Tuple[str, str]] = []
    for unit_text, kind in units:
        if not re.search(r'\w', unit_text) and cleaned:
            cleaned[-1] = (f"{cleaned[-1][0]} {unit_text}", cleaned[-1][1])
        else:
            cleaned.append((unit_text, kind))
    return cleaned


# ---------------------------------------------------------------------------
# Estrutura final do livro
# ---------------------------------------------------------------------------

def _clip_title(title: str, limit: int = 70) -> str:
    title = normalize_whitespace(title)
    return title if len(title) <= limit else title[:limit].rstrip() + "..."


def build_book_structure(paragraphs: List[Paragraph]) -> Dict[str, Any]:
    """
    Converte parágrafos na estrutura persistida do livro:
    content, sentences (unidades faladas), chapters, total_words, duration_minutes e
    structure = {version, paragraph_starts, kinds}.
    """
    sentences: List[str] = []
    kinds: List[str] = []
    paragraph_starts: List[int] = []
    chapters: List[Dict[str, Any]] = []
    text_blocks: List[str] = []

    for paragraph in paragraphs:
        text = normalize_whitespace(paragraph.text)
        if not re.search(r'\w', text):
            continue  # separadores de cena ("* * *") e sobras de layout

        if paragraph.heading:
            units = [(chunk, KIND_HEADING) for chunk in _split_long_unit(text)]
        else:
            units = segment_paragraph(text)
        if not units:
            continue

        if paragraph.chapter_title:
            start = len(sentences)
            if chapters and chapters[-1]["startIndex"] == start:
                chapters[-1]["title"] = _clip_title(paragraph.chapter_title)
            else:
                chapters.append({"title": _clip_title(paragraph.chapter_title), "startIndex": start})

        paragraph_starts.append(len(sentences))
        for unit_text, kind in units:
            sentences.append(unit_text)
            kinds.append(kind)
        text_blocks.append(text)

    if not chapters or chapters[0]["startIndex"] > 0:
        chapters.insert(0, {"title": "Início", "startIndex": 0})
    for i, chapter in enumerate(chapters, start=1):
        chapter["id"] = f"ch-{i}"

    full_text = "\n\n".join(text_blocks)
    total_words = count_words(full_text)

    return {
        "content": full_text,
        "sentences": sentences,
        "chapters": [{"id": c["id"], "title": c["title"], "startIndex": c["startIndex"]} for c in chapters],
        "total_words": total_words,
        "duration_minutes": max(1, round(total_words / 150)),
        "structure": {
            "version": STRUCTURE_VERSION,
            "paragraph_starts": paragraph_starts,
            "kinds": "".join(kinds),
        },
    }
