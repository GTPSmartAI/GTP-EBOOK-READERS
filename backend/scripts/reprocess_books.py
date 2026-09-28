"""
Reprocessa livros já enviados com o extrator atual (parágrafos, falas e capítulos).

Para cada livro: pega o arquivo original (uploads/books/ ou a pasta do livro no MinIO), extrai de novo e
atualiza o MariaDB, o cache local (uploads/extracted/) e o texto-extraido.json no MinIO. Sobe o
books.content_rev, para o app trocar a cópia que guardou no aparelho, e ajusta o ponto de leitura
salvo quando a ordem das frases mudou.

O cache local é o do computador onde o script roda. Em produção, rode dentro do container
(docker exec) ou apague uploads/extracted/<id>.* na VPS, senão a API continua entregando a versão antiga.

Uso:
    python scripts/reprocess_books.py --book-id ID [--book-id ID2]   # só estes livros
    python scripts/reprocess_books.py --type epub                    # todos os EPUBs
    python scripts/reprocess_books.py --dry-run ...                  # só mostra o que mudaria
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BASE_DIR / "shared" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "ProcessadorLivros" / "python"))

from config import get_settings
from mariadb_client import get_mariadb_client
from database import ensure_schema
from pdf_extractor import extract_book, UnsupportedDocumentError


def _find_original_file(book: dict, books_dir: Path, tmp_dir: Path):
    local = sorted(books_dir.glob(f"{book['id']}_*"))
    if local:
        return local[0]
    if not book.get("file_key"):
        return None
    from minio_storage import get_minio_client, MINIO_BUCKET
    target = tmp_dir / f"{book['id']}_{book['file_key'].rsplit('/', 1)[-1]}"
    get_minio_client().fget_object(MINIO_BUCKET, book["file_key"], str(target))
    return target


def _remap_index(old_index: int, old_sentences: list, old_chapters: list, new_sentences: list, new_chapters: list) -> int:
    """Leva o ponto de leitura para o mesmo lugar no texto novo: mesmo capítulo (pelo título) e mesma distância do início dele."""
    if old_sentences == new_sentences:
        return old_index
    chapter = None
    for c in old_chapters:
        if c["startIndex"] <= old_index:
            chapter = c
    if chapter:
        match = next((c for c in new_chapters if c["title"] == chapter["title"]), None)
        if match:
            candidate = match["startIndex"] + (old_index - chapter["startIndex"])
            if candidate < len(new_sentences) and new_sentences[candidate] == old_sentences[old_index]:
                return candidate
    # Sem capítulo equivalente: procura a mesma frase no texto novo
    target = old_sentences[old_index] if old_index < len(old_sentences) else None
    if target is not None:
        try:
            return new_sentences.index(target)
        except ValueError:
            pass
    return min(old_index, max(0, len(new_sentences) - 1))


def _json_list(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return []
    return value or []


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--book-id", action="append", help="Reprocessa este livro (pode repetir)")
    parser.add_argument("--type", help="Reprocessa todos os livros deste tipo (ex.: epub)")
    parser.add_argument("--dry-run", action="store_true", help="Não grava nada, só mostra o resultado")
    args = parser.parse_args()
    if not args.book_id and not args.type:
        parser.error("informe --book-id ou --type")

    settings = get_settings()
    db = get_mariadb_client()
    ensure_schema()

    cols = "`id`, `user_id`, `title`, `author`, `type`, `cover_gradient`, `created_at`, `file_key`, `storage_prefix`, `chapters`"
    if args.book_id:
        marks = ", ".join(["%s"] * len(args.book_id))
        books = db.execute_query(f"SELECT {cols} FROM `books` WHERE `id` IN ({marks})", tuple(args.book_id))
    else:
        books = db.execute_query(f"SELECT {cols} FROM `books` WHERE `type` = %s ORDER BY `created_at`", (args.type,))

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
                old_chapters = _json_list(book.get("chapters"))
                summary = f"{len(old_chapters)} -> {len(data['chapters'])} capítulos, {data['total_words']} palavras"
                if args.dry_run:
                    print(f"[DRY-RUN] {label}: {summary}")
                    ok += 1
                    continue

                # Ponto de leitura de cada pessoa, se a ordem das frases mudou
                progress = db.execute_query(
                    "SELECT `id`, `last_sentence_index` FROM `reading_progress` WHERE `book_id` = %s", (book["id"],)
                )
                if progress:
                    old = db.execute_one("SELECT `sentences` FROM `books` WHERE `id` = %s", (book["id"],))
                    old_sentences = _json_list(old.get("sentences") if old else None)
                    for p in progress:
                        new_index = _remap_index(int(p["last_sentence_index"] or 0), old_sentences, old_chapters,
                                                 data["sentences"], data["chapters"])
                        if new_index != p["last_sentence_index"]:
                            db.execute_non_query("UPDATE `reading_progress` SET `last_sentence_index` = %s WHERE `id` = %s",
                                                 (new_index, p["id"]))

                db.execute_non_query(
                    "UPDATE `books` SET `content` = %s, `sentences` = %s, `chapters` = %s, `structure` = %s, "
                    "`total_words` = %s, `duration_minutes` = %s, `content_rev` = `content_rev` + 1 WHERE `id` = %s",
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

                # Cache local (lido primeiro por /api/books/<id>/content); a versão compactada antiga é apagada
                payload = {k: book.get(k) for k in ("id", "user_id", "title", "author", "type", "cover_gradient", "created_at")}
                for key in ("content", "sentences", "chapters", "structure", "total_words", "duration_minutes"):
                    payload[key] = data[key]
                extracted_dir.mkdir(parents=True, exist_ok=True)
                (extracted_dir / f"{book['id']}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8"
                )
                for stale in (f"{book['id']}.content.json.gz", f"{book['id']}.content.json.gz.size"):
                    (extracted_dir / stale).unlink(missing_ok=True)

                if book.get("storage_prefix"):
                    try:
                        from minio_storage import upload_file_to_minio
                        upload_file_to_minio(
                            json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"),
                            f"{book['storage_prefix']}/texto-extraido.json",
                            "application/json",
                        )
                    except Exception as m_err:
                        print(f"[AVISO] {label}: texto-extraido.json não atualizado no MinIO: {m_err}")

                print(f"[OK] {label}: {summary}")
                ok += 1
            except UnsupportedDocumentError as doc_err:
                print(f"[FALHA] {label}: {doc_err}")
                failed += 1
            except Exception as err:
                print(f"[FALHA] {label}: {err}")
                failed += 1

    print(f"\nConcluído: {ok} reprocessados, {failed} com problema.")


if __name__ == "__main__":
    main()
