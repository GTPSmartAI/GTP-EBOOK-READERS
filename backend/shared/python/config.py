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
    """Configurações centrais do sistema ElevenReader."""
    PORT: int = int(os.getenv("PORT", "5000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Supabase Credentials (lidas de variáveis de ambiente do .env)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # ElevenLabs API Key (Opcional - para síntese de áudio neural avançada no backend)
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")

    # Webhook Secret Token (para autenticar chamadas do n8n ou gateways)
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "elevenreader_secure_token_2026")

    # Uploads dir
    UPLOAD_DIR: Path = _BASE_DIR / "uploads"

_settings_instance = None

def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
        _settings_instance.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return _settings_instance
