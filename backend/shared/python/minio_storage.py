"""
Módulo de Integração com MinIO (S3 Object Storage)
Conectado à VPS Traefik/Docker Swarm no bucket ebook-readers-gtp.

Organização (bucket PRIVADO, ninguém baixa direto):
  usuarios/<username>/<titulo-do-livro>_<book_id>/livro.<ext>
                                                  /capa.<ext>
                                                  /texto-extraido.json
Capas chegam ao app por link assinado com validade (presigned_url); o backend decide quem pode ver.
Credenciais só pelo .env (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD).
"""

import io
import os
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Union, BinaryIO
from minio import Minio
from minio.commonconfig import CopySource
from minio.error import S3Error

logger = logging.getLogger("MinIOStorage")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "cell-s3.iagtp.com.br")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "ebook-readers-gtp")
MINIO_SECURE = os.getenv("MINIO_SECURE", "true").lower() in ("true", "1", "yes")
# Região fixa: gerar link assinado não precisa consultar o servidor
MINIO_REGION = os.getenv("MINIO_REGION", "us-east-1")

_client_instance: Optional[Minio] = None

def get_minio_client() -> Minio:
    """Retorna cliente singleton MinIO."""
    global _client_instance
    if _client_instance is None:
        if not MINIO_ROOT_USER or not MINIO_ROOT_PASSWORD:
            raise RuntimeError("MINIO_ROOT_USER e MINIO_ROOT_PASSWORD precisam estar no .env")
        _client_instance = Minio(
            endpoint=MINIO_ENDPOINT,
            access_key=MINIO_ROOT_USER,
            secret_key=MINIO_ROOT_PASSWORD,
            secure=MINIO_SECURE,
            region=MINIO_REGION,
        )
    return _client_instance


def object_key_from_url(url: Optional[str]) -> Optional[str]:
    """Caminho do objeto a partir de uma URL antiga https://<endpoint>/<bucket>/<caminho>."""
    if not url or f"/{MINIO_BUCKET}/" not in url:
        return None
    return url.split(f"/{MINIO_BUCKET}/", 1)[1].split("?", 1)[0] or None


def presigned_url(object_key: Optional[str], days: int = 2) -> Optional[str]:
    """
    Link temporário para baixar um objeto do bucket privado.
    A assinatura usa a meia-noite (UTC) do dia como data: o link fica igual o dia todo,
    então o navegador consegue guardar a imagem em cache.
    """
    if not object_key:
        return None
    try:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        return get_minio_client().presigned_get_object(
            MINIO_BUCKET, object_key, expires=timedelta(days=days), request_date=today
        )
    except Exception as e:
        logger.error(f"Não foi possível assinar o link de {object_key}: {e}")
        return None


def copy_object(src_key: str, dst_key: str) -> None:
    get_minio_client().copy_object(MINIO_BUCKET, dst_key, CopySource(MINIO_BUCKET, src_key))


def object_exists(object_key: str) -> bool:
    try:
        get_minio_client().stat_object(MINIO_BUCKET, object_key)
        return True
    except S3Error:
        return False


def delete_prefix(prefix: str) -> int:
    """Apaga todos os objetos de uma pasta (ex.: a pasta de um livro). Devolve quantos apagou."""
    if not prefix or not prefix.startswith("usuarios/") or prefix.count("/") < 2:
        raise ValueError(f"Pasta inválida para apagar: {prefix!r}")
    client = get_minio_client()
    count = 0
    for obj in client.list_objects(MINIO_BUCKET, prefix=prefix.rstrip("/") + "/", recursive=True):
        client.remove_object(MINIO_BUCKET, obj.object_name)
        count += 1
    return count


def make_bucket_private() -> None:
    """Remove o acesso público de leitura do bucket (a política anônima)."""
    get_minio_client().delete_bucket_policy(MINIO_BUCKET)

def ensure_bucket_exists():
    """Garante que o bucket padrão existe (privado; os arquivos saem por link assinado)."""
    client = get_minio_client()
    try:
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)
            logger.info(f"Bucket {MINIO_BUCKET} criado com sucesso.")
    except Exception as e:
        logger.error(f"Erro ao verificar/criar bucket {MINIO_BUCKET}: {e}")

def upload_file_to_minio(
    file_source: Union[str, Path, bytes, BinaryIO],
    object_name: str,
    content_type: str = "application/octet-stream"
) -> Optional[str]:
    """
    Faz upload de arquivo para o MinIO e retorna a URL pública de acesso.
    
    :param file_source: Caminho local do arquivo (str/Path), bytes em memória ou arquivo aberto
    :param object_name: Caminho/nome do arquivo no bucket (ex: books/meu-livro.pdf)
    :param content_type: MIME type (ex: application/pdf, audio/mpeg)
    :return: URL pública https://cell-s3.iagtp.com.br/ebook-readers-gtp/{object_name}
    """
    client = get_minio_client()
    try:
        if isinstance(file_source, (str, Path)):
            file_path = Path(file_source)
            if not file_path.exists():
                logger.error(f"Arquivo local {file_path} não encontrado para upload.")
                return None
            client.fput_object(
                bucket_name=MINIO_BUCKET,
                object_name=object_name,
                file_path=str(file_path),
                content_type=content_type
            )
        elif isinstance(file_source, bytes):
            stream = io.BytesIO(file_source)
            client.put_object(
                bucket_name=MINIO_BUCKET,
                object_name=object_name,
                data=stream,
                length=len(file_source),
                content_type=content_type
            )
        else:
            # BinaryIO / File-like
            file_source.seek(0, os.SEEK_END)
            size = file_source.tell()
            file_source.seek(0)
            client.put_object(
                bucket_name=MINIO_BUCKET,
                object_name=object_name,
                data=file_source,
                length=size,
                content_type=content_type
            )

        protocol = "https" if MINIO_SECURE else "http"
        public_url = f"{protocol}://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}"
        logger.info(f"Upload concluído no MinIO: {public_url}")
        return public_url

    except Exception as e:
        logger.error(f"Falha ao enviar {object_name} para o MinIO: {e}")
        return None

def delete_file_from_minio(object_name: str) -> bool:
    """Remove um objeto do bucket MinIO."""
    client = get_minio_client()
    try:
        client.remove_object(MINIO_BUCKET, object_name)
        logger.info(f"Objeto {object_name} removido do MinIO.")
        return True
    except Exception as e:
        logger.error(f"Erro ao remover {object_name} do MinIO: {e}")
        return False

def get_minio_public_url(object_name: str) -> str:
    """Retorna a URL pública direta para o objeto no MinIO."""
    protocol = "https" if MINIO_SECURE else "http"
    return f"{protocol}://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}"
