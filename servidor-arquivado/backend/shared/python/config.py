import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega o .env localizado na raiz de backend/
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BASE_DIR / ".env"

if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH)
else:
    load_dotenv()

class Settings:
    """Configurações centrais do sistema Aedolia."""
    PORT: int = int(os.getenv("PORT", "5000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Senhas e chaves vêm só do .env (backend/.env local; na VPS, backend.env). Nunca escrever no código.

    # MariaDB (VPS 2.25.124.5 / túnel SSH)
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT: int = int(os.getenv("DB_PORT", "3306"))
    DB_USER: str = os.getenv("DB_USER", "")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "")

    # MinIO S3 (VPS Traefik)
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "cell-s3.iagtp.com.br")
    MINIO_ROOT_USER: str = os.getenv("MINIO_ROOT_USER", "")
    MINIO_ROOT_PASSWORD: str = os.getenv("MINIO_ROOT_PASSWORD", "")
    MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "ebook-readers-gtp")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "true").lower() == "true"

    # Token do webhook de pagamento (n8n ou gateway)
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "")

    # Uploads dir
    UPLOAD_DIR: Path = _BASE_DIR / "uploads"

_settings_instance = None

def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
        _settings_instance.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return _settings_instance
