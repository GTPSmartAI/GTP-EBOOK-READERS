"""
Reprocessa livros já enviados com o pipeline de texto novo (parágrafos, falas e capítulos).

Para cada livro, usa o arquivo original salvo em uploads/books/ ou baixa pelo file_url (MinIO),
extrai de novo e atualiza MariaDB, cache JSON local e o JSON espelhado no MinIO.

Uso:
    python scripts/reprocess_books.py                 # todos os livros
    python scripts/reprocess_books.py --book-id ID    # apenas um livro
    python scripts/reprocess_books.py --dry-run       # só mostra o que mudaria
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BASE_DIR / "shared" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "ProcessadorLivros" / "python"))

import requests
from config import get_settings
from mariadb_client import get_mariadb_client
from database import ensure_books_schema
from pdf_extractor import extract_book, UnsupportedDocumentError


# Metadados copiados para o cache JSON local quando ele ainda não existe
_METADATA_COLUMNS = (
    "id", "user_id", "title", "author", "type", "cover_gradient", "cover_image_url", "file_url", "is_public", "created_at",
)


def _find_original_file(book: dict, books_dir: Path, tmp_dir: Path):
    local = sorted(books_dir.glob(f"{book['id']}_*"))
    if local:
        return local[0]

    url = book.get("file_url") or ""
    if not url.startswith("http"):
        return None
    name = url.rsplit("/", 1)[-1] or "arquivo"
    target = tmp_dir / f"{book['id']}_{name}"
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    target.write_bytes(resp.content)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--book-id", help="Reprocessa apenas este livro")
    parser.add_argument("--dry-run", action="store_true", help="Não grava nada, só mostra o resultado")
    args = parser.parse_args()

    settings = get_settings()
    db = get_mariadb_client()
    ensure_books_schema()

    cols = ", ".join(f"`{c}`" for c in _METADATA_COLUMNS)
    if args.book_id:
        books = db.execute_query(f"SELECT {cols} FROM `books` WHERE `id` = %s", (args.book_id,))
    else:
        books = db.execute_query(f"SELECT {cols} FROM `books` ORDER BY `created_at`")

    books_dir = settings.UPLOAD_DIR / "books"
    extracted_dir = settings.UPLOAD_DIR / "extracted"
    ok = failed = 0

    with tempfile.TemporaryDirectory() as tmp:
        for book in books:
            label = f"{book['id']} ({book['title']})"
            try:
                source = _find_original_file(book, books_dir, Path(tmp))
                if source is None:
                    print(f"[PULADO] {label}: arquivo original não encontrado")
                    failed += 1
                    continue

                data = extract_book(str(source))
                summary = (f"{len(data['sentences'])} unidades, "
                           f"{len(data['structure']['paragraph_starts'])} parágrafos, "
                           f"{len(data['chapters'])} capítulos")
                if args.dry_run:
                    print(f"[DRY-RUN] {label}: {summary}")
                    ok += 1
                    continue

                db.execute_non_query(
                    "UPDATE `books` SET `content` = %s, `sentences` = %s, `chapters` = %s, `structure` = %s, "
                    "`total_words` = %s, `duration_minutes` = %s WHERE `id` = %s",
                    (
                        data["content"],
                        json.dumps(data["sentences"], ensure_ascii=False),
                        json.dumps(data["chapters"], ensure_ascii=False),
                        json.dumps(data["structure"], ensure_ascii=False),
                        data["total_words"],
                        data["duration_minutes"],
                        book["id"],
                    ),
                )

                # Cache JSON local (lido primeiro por /api/books/<id>/content, funciona mesmo com o banco fora)
                # e cópia no MinIO. Criado quando ainda não existe.
                cache_file = extracted_dir / f"{book['id']}.json"
                if cache_file.exists():
                    payload = json.loads(cache_file.read_text(encoding="utf-8"))
                else:
                    extracted_dir.mkdir(parents=True, exist_ok=True)
                    payload = {k: book.get(k) for k in _METADATA_COLUMNS}
                for key in _METADATA_COLUMNS:
                    if payload.get(key) is None:
                        payload[key] = book.get(key)
                for key in ("content", "sentences", "chapters", "structure", "total_words", "duration_minutes"):
                    payload[key] = data[key]
                cache_file.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
                try:
                    from minio_storage import upload_file_to_minio
                    upload_file_to_minio(
                        file_source=json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"),
                        object_name=f"extracted/{book['id']}.json",
                        content_type="application/json",
                    )
                except Exception as m_err:
                    print(f"[AVISO] {label}: JSON não sincronizado no MinIO: {m_err}")

                print(f"[OK] {label}: {summary}")
                ok += 1
            except UnsupportedDocumentError as doc_err:
                print(f"[FALHA] {label}: {doc_err}")
                failed += 1
            except Exception as err:
                print(f"[FALHA] {label}: {err}")
                failed += 1

    print(f"\nConcluído: {ok} reprocessados, {failed} com problema.")
    print("Os leitores baixam a versão nova automaticamente na próxima vez que abrirem o livro.")


if __name__ == "__main__":
    main()
