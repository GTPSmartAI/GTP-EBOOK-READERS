"""
Extrator de Arquivos EPUB (Electronic Publication)
Extrai texto limpo, capítulos ordenados pelo spine e metadados de arquivos .epub.
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Tuple
from bs4 import BeautifulSoup

def clean_html_content(raw_html: str) -> Tuple[str, str]:
    """
    Remove tags desnecessárias e retorna (titulo_capitulo, texto_limpo).
    """
    soup = BeautifulSoup(raw_html, "html.parser")
    
    # Remove scripts, styles e metadados
    for tag in soup(["script", "style", "head", "noscript", "svg"]):
        tag.decompose()
        
    # Tenta obter título do capítulo
    chapter_title = ""
    for header_tag in ["h1", "h2", "h3", "title"]:
        found = soup.find(header_tag)
        if found and found.get_text().strip():
            chapter_title = found.get_text().strip()
            break

    # Obtém texto com quebras adequadas de parágrafo
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return chapter_title, text

def split_text_into_sentences(text: str) -> List[str]:
    """Divide o texto em frases preservando pontuação."""
    if not text:
        return []
    clean = re.sub(r'[\r\n]+', ' ', text)
    clean = re.sub(r'[ \t]{2,}', ' ', clean).strip()
    raw_sentences = re.split(r'(?<=[.!?…])\s+', clean)
    return [s.strip() for s in raw_sentences if len(s.strip()) > 0]

def count_words(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r'\b\w+\b', text))

def extract_text_from_epub(file_path: str) -> Tuple[str, List[str], List[Dict[str, Any]], int, int]:
    """
    Extrai texto, sentenças e capítulos de um arquivo .epub.
    Retorna (full_text, sentences, chapters, total_words, duration_minutes).
    """
    full_text_chunks = []
    chapters = []
    current_sentence_offset = 0

    with zipfile.ZipFile(file_path, "r") as zf:
        namelist = zf.namelist()
        
        # 1. Localiza o arquivo .opf a partir do META-INF/container.xml
        opf_path = None
        if "META-INF/container.xml" in namelist:
            try:
                container_data = zf.read("META-INF/container.xml")
                root = ET.fromstring(container_data)
                for rootfile in root.iter():
                    if rootfile.tag.endswith("rootfile"):
                        opf_path = rootfile.attrib.get("full-path")
                        break
            except Exception:
                pass

        # 2. Se encontrou o .opf, tenta seguir a ordem definida pelo spine
        html_files_order = []
        if opf_path and opf_path in namelist:
            try:
                opf_data = zf.read(opf_path)
                opf_root = ET.fromstring(opf_data)
                opf_dir = os.path.dirname(opf_path)
                
                # Mapeia manifest id -> href
                manifest = {}
                for item in opf_root.iter():
                    if item.tag.endswith("item"):
                        i_id = item.attrib.get("id")
                        i_href = item.attrib.get("href")
                        if i_id and i_href:
                            full_href = os.path.join(opf_dir, i_href).replace("\\", "/") if opf_dir else i_href
                            manifest[i_id] = full_href
                            
                # Segue spine
                for itemref in opf_root.iter():
                    if itemref.tag.endswith("itemref"):
                        idref = itemref.attrib.get("idref")
                        if idref in manifest:
                            target_file = manifest[idref]
                            if target_file in namelist:
                                html_files_order.append(target_file)
            except Exception:
                pass

        # 3. Fallback: se o spine não foi lido ou veio vazio, busca todos os arquivos html/xhtml
        if not html_files_order:
            html_files_order = [
                f for f in namelist 
                if f.lower().endswith((".xhtml", ".html", ".htm")) 
                and not f.lower().endswith(("toc.xhtml", "nav.xhtml", "cover.xhtml"))
            ]
            html_files_order.sort()

        # 4. Processa cada arquivo de conteúdo
        all_sentences = []
        chapter_idx = 1

        for html_file in html_files_order:
            try:
                raw_bytes = zf.read(html_file)
                # Tenta UTF-8 ou fallback com ignore
                try:
                    content_str = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    content_str = raw_bytes.decode("latin-1", errors="ignore")

                title, text_clean = clean_html_content(content_str)
                if not text_clean.strip():
                    continue

                sentences = split_text_into_sentences(text_clean)
                if not sentences:
                    continue

                if not title:
                    title = f"Capítulo {chapter_idx}"

                # Registra o capítulo apontando para a primeira sentença dele
                chapters.append({
                    "id": f"ch-{chapter_idx}",
                    "title": title[:50] + ("..." if len(title) > 50 else ""),
                    "startIndex": len(all_sentences)
                })
                chapter_idx += 1

                all_sentences.extend(sentences)
                full_text_chunks.append(text_clean)
            except Exception as read_err:
                print(f"[EPUB Warning] Falha ao processar arquivo interno {html_file}: {read_err}")

    full_text = "\n\n".join(full_text_chunks)
    total_words = count_words(full_text)
    duration_minutes = max(1, round(total_words / 140))

    if not chapters:
        chapters.append({
            "id": "ch-1",
            "title": "Início da Leitura",
            "startIndex": 0
        })

    return full_text, all_sentences, chapters, total_words, duration_minutes
