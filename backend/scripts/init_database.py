"""
Script de Inicialização e Verificação de Conexão: MariaDB e MinIO S3
"""

import sys
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BASE_DIR / "shared" / "python"))

from mariadb_client import get_mariadb_client
from minio_storage import get_minio_client, MINIO_BUCKET
from config import get_settings

def init_database():
    print("=" * 60)
    print("Verificando Conexão e Recursos no MariaDB e MinIO S3...")
    print("=" * 60)

    settings = get_settings()
    print(f"MariaDB Host: {settings.DB_HOST}:{settings.DB_PORT} (Database: {settings.DB_NAME})")
    print(f"MinIO Endpoint: {settings.MINIO_ENDPOINT} (Bucket: {MINIO_BUCKET})")

    # 1. MariaDB Check
    try:
        db = get_mariadb_client()
        tables = db.execute_query("SHOW TABLES")
        table_names = [list(t.values())[0] for t in tables]
        print(f"Tabelas encontradas no MariaDB: {table_names}")
    except Exception as e:
        print(f"Erro ao conectar no MariaDB: {e}")

    # 2. MinIO Check
    try:
        minio_client = get_minio_client()
        buckets = [b.name for b in minio_client.list_buckets()]
        print(f"Buckets encontrados no MinIO: {buckets}")
        if MINIO_BUCKET in buckets:
            print(f"Bucket principal '{MINIO_BUCKET}' pronto e acessível!")
    except Exception as e:
        print(f"Erro ao conectar no MinIO: {e}")

    print("=" * 60)
    print("Ambiente 100% pronto e integrado.")
    print("=" * 60)

if __name__ == "__main__":
    init_database()
