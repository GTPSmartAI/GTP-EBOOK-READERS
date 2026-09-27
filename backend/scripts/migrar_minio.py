"""
Organiza o MinIO por usuário e fecha o bucket.

Livros enviados antes de 27/09/2026 ficaram em books/<book_id>/ e extracted/<book_id>.json.
Este script copia cada um para a pasta do dono:

    usuarios/<username>/<titulo-do-livro>_<book_id>/livro.<ext>
                                                    /capa.<ext>
                                                    /texto-extraido.json

grava os caminhos novos no banco e só então apaga os objetos antigos.
Com --tornar-privado, também tira o acesso público de leitura do bucket.

Sem --executar, só mostra o que faria (nada muda).

Na VPS, dentro do container da API:
    ssh root@2.25.124.5 'docker exec $(docker ps -q -f name=ebook_api | head -1) python scripts/migrar_minio.py --executar --tornar-privado'
"""

import argparse
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "shared" / "python"))

from auth import slugify  # noqa: E402
from database import ensure_schema, update_book_storage  # noqa: E402
from mariadb_client import get_mariadb_client  # noqa: E402
from minio_storage import (  # noqa: E402
    copy_object,
    delete_file_from_minio,
    make_bucket_private,
    object_exists,
    object_key_from_url,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--executar", action="store_true", help="faz as mudanças (sem isso, só simula)")
    parser.add_argument("--tornar-privado", action="store_true", help="remove o acesso público do bucket no final")
    args = parser.parse_args()

    ensure_schema()
    db = get_mariadb_client()
    books = db.execute_query(
        "SELECT b.`id`, b.`title`, b.`file_url`, b.`cover_image_url`, b.`storage_prefix`, u.`username` "
        "FROM `books` b LEFT JOIN `users` u ON u.`id` = b.`user_id`"
    )
    pending = [b for b in books if not b.get("storage_prefix")]
    print(f"{len(books)} livros no banco, {len(pending)} ainda na organização antiga.")

    failures = 0
    for b in pending:
        book_id = b["id"]
        username = b.get("username") or "sem-dono"
        folder = f"usuarios/{username}/{slugify(b.get('title') or '', 60) or 'livro'}_{book_id}"
        moves = []
        file_key = object_key_from_url(b.get("file_url"))
        if file_key:
            ext = file_key.rsplit(".", 1)[-1].lower() if "." in file_key.rsplit("/", 1)[-1] else "bin"
            moves.append((file_key, f"{folder}/livro.{ext}"))
        cover_key = object_key_from_url(b.get("cover_image_url"))
        if cover_key:
            ext = cover_key.rsplit(".", 1)[-1].lower()
            moves.append((cover_key, f"{folder}/capa.{ext}"))
        moves.append((f"extracted/{book_id}.json", f"{folder}/texto-extraido.json"))

        print(f"\n{book_id} · {b.get('title')} -> {folder}/")
        existing = [(src, dst) for src, dst in moves if object_exists(src)]
        for src, dst in moves:
            print(f"   {'copiar' if (src, dst) in existing else 'não existe'}: {src} -> {dst}")
        if not args.executar:
            continue

        try:
            for src, dst in existing:
                copy_object(src, dst)
                if not object_exists(dst):
                    raise RuntimeError(f"cópia não confirmada: {dst}")
            new_file = next((dst for src, dst in existing if dst.rsplit("/", 1)[-1].startswith("livro.")), None)
            new_cover = next((dst for src, dst in existing if dst.rsplit("/", 1)[-1].startswith("capa.")), None)
            update_book_storage(book_id, folder, new_file, new_cover)
            for src, _ in existing:
                delete_file_from_minio(src)
            print("   ok")
        except Exception as e:
            failures += 1
            print(f"   FALHOU (nada apagado deste livro): {e}")

    if args.executar and args.tornar_privado:
        if failures:
            print("\nHouve falhas: o bucket continua público. Rode de novo depois de corrigir.")
        else:
            make_bucket_private()
            print("\nBucket agora é privado: só o backend lê os arquivos.")
    if not args.executar:
        print("\nSimulação. Rode com --executar para aplicar.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
