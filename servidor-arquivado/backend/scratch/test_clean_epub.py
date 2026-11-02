import urllib.request, zipfile, io
from bs4 import BeautifulSoup
import re

url = 'https://cell-s3.iagtp.com.br/ebook-readers-gtp/books/book-1790371442504/Omniscient_Reader_s_Viewpoint__Sequencia_.epub'
print('Baixando EPUB...')
with urllib.request.urlopen(url) as resp:
    epub_bytes = resp.read()

with zipfile.ZipFile(io.BytesIO(epub_bytes)) as zf:
    raw = zf.read('OEBPS/ch_1.xhtml')
    
    # Decodificação inteligente: se contiver sequências UTF-8 duplas ou CP1252
    try:
        text_utf8 = raw.decode('utf-8')
        # Testa se há mojibake (ex: \xc3\xa9 lido como caracteres especiais)
        if 'você' not in text_utf8 and ('voc\xc3\xaa' in text_utf8 or 'voc' in text_utf8):
            text_decoded = raw.decode('cp1252')
        else:
            text_decoded = text_utf8
    except Exception:
        text_decoded = raw.decode('cp1252', errors='ignore')

    soup = BeautifulSoup(text_decoded, 'html.parser')
    for tag in soup(['script', 'style', 'head']):
        tag.decompose()

    # Extrai parágrafos
    paragraphs = []
    for p in soup.find_all(['p', 'h1', 'h2', 'h3', 'div']):
        p_text = p.get_text().strip()
        if p_text and p_text not in paragraphs:
            paragraphs.append(p_text)

    print(f"Total de paragrafos extraidos em ch_1: {len(paragraphs)}")
    for i, p in enumerate(paragraphs):
        if 'Nesse sentido' in p:
            for j in range(max(0, i-2), min(len(paragraphs), i+6)):
                print(f"P[{j}]: {paragraphs[j]}")
            break
