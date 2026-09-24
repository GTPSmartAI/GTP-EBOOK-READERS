import re
from typing import List, Dict, Any, Tuple
from pypdf import PdfReader

def split_text_into_sentences(text: str) -> List[str]:
    """Divide o texto em frases preservando pontuação."""
    if not text:
        return []
    clean = re.sub(r'[\r\n]+', ' ', text)
    clean = re.sub(r'[ \t]{2,}', ' ', clean).strip()
    
    # Divide por ponto, exclamação ou interrogação seguido de espaço
    raw_sentences = re.split(r'(?<=[.!?…])\s+', clean)
    return [s.strip() for s in raw_sentences if len(s.strip()) > 0]

def count_words(text: str) -> int:
    """Conta a quantidade de palavras no texto."""
    if not text:
        return 0
    return len(re.findall(r'\b\w+\b', text))

from epub_extractor import extract_text_from_epub

def extract_text_from_pdf(file_path: str) -> Tuple[str, List[str], List[Dict[str, Any]], int, int]:
    """
    Extrai texto de um arquivo PDF, EPUB ou texto simples.
    Retorna (full_text, sentences, chapters, total_words, duration_minutes).
    """
    if file_path.lower().endswith(".epub"):
        return extract_text_from_epub(file_path)

    full_text = ""
    if file_path.lower().endswith(".txt"):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            full_text = f.read()
    else:
        try:
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_str = page.extract_text() or ""
                full_text += page_str + "\n\n"
        except Exception:
            # Se falhou e for um zip disfarçado, tenta como epub
            try:
                import zipfile
                if zipfile.is_zipfile(file_path):
                    return extract_text_from_epub(file_path)
            except Exception:
                pass

            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                full_text = f.read()

    sentences = split_text_into_sentences(full_text)
    total_words = count_words(full_text)
    # Média de 140 palavras por minuto faladas
    duration_minutes = max(1, round(total_words / 140))

    # Detecção automática de capítulos
    chapters = []
    chapter_count = 1
    for i, s in enumerate(sentences):
        if re.search(r'\b(cap[íi]tulo|chapter|parte|se[çc][ãa]o)\b\s+([0-9ivxlcdm]+|\w+)', s, re.IGNORECASE) or (i > 0 and i % 30 == 0 and len(chapters) < 15):
            title = s[:45] + ("..." if len(s) > 45 else "")
            chapters.append({
                "id": f"ch-{chapter_count}",
                "title": title,
                "startIndex": i
            })
            chapter_count += 1

    if not chapters:
        chapters.append({
            "id": "ch-1",
            "title": "Início da Leitura",
            "startIndex": 0
        })

    return full_text, sentences, chapters, total_words, duration_minutes
