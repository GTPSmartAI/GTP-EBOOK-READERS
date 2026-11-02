"""
Vozes PRO: Google Cloud Text-to-Speech (API oficial, REST com chave de API).

- A chave fica no banco (tabela app_settings, chave "google_tts_api_key"), cadastrada pelo administrador
  em Configurações > Administração. Sem ela, vale GOOGLE_TTS_API_KEY do .env. O api_server liga a leitura
  do banco em set_key_provider() ao iniciar.
- Cada voz do catálogo tem "google_voice" (ex.: pt-BR-Chirp3-HD-Kore). O áudio vem em MP3.
- Falha (sem chave, chave inválida, cota) devolve None: quem chamou cai para a voz grátis padrão.
"""

import base64
import logging
import os
import threading
import time
from typing import Callable, Dict, List, Optional

import requests

logger = logging.getLogger("GoogleTTS")

API_URL = "https://texttospeech.googleapis.com/v1"
SETTING_KEY = "google_tts_api_key"
_KEY_CACHE_S = 60

_key_provider: List[Callable[[], Optional[str]]] = [lambda: None]
_cache = {"key": None, "at": 0.0}
_lock = threading.Lock()
# Último erro do Google (para a tela do administrador)
last_error: Dict[str, Optional[str]] = {"message": None, "at": None}


def set_key_provider(provider: Callable[[], Optional[str]]) -> None:
    _key_provider[0] = provider
    clear_key_cache()


def clear_key_cache() -> None:
    with _lock:
        _cache["at"] = 0.0


def api_key() -> Optional[str]:
    with _lock:
        if time.monotonic() - _cache["at"] < _KEY_CACHE_S:
            return _cache["key"]
    key = None
    try:
        key = (_key_provider[0]() or "").strip() or None
    except Exception as e:
        logger.warning(f"Não foi possível ler a chave do Google no banco: {e}")
    key = key or (os.getenv("GOOGLE_TTS_API_KEY") or "").strip() or None
    with _lock:
        _cache.update(key=key, at=time.monotonic())
    return key


def _error_message(res: requests.Response) -> str:
    try:
        return res.json().get("error", {}).get("message") or res.text[:300]
    except Exception:
        return res.text[:300]


def synthesize_mp3(text: str, voice_name: str, language: str = "pt-BR", speaking_rate: float = 1.0,
                   key: Optional[str] = None, timeout: float = 20) -> Optional[bytes]:
    key = key or api_key()
    if not key or not text.strip():
        return None
    body = {
        "input": {"text": text},
        "voice": {"languageCode": language, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": max(0.25, min(4.0, speaking_rate))},
    }
    try:
        res = requests.post(f"{API_URL}/text:synthesize", params={"key": key}, json=body, timeout=timeout)
    except requests.RequestException as e:
        last_error.update(message=f"Sem conexão com o Google: {e}", at=time.strftime("%d/%m %H:%M"))
        logger.error(last_error["message"])
        return None
    if res.status_code != 200:
        last_error.update(message=f"{res.status_code}: {_error_message(res)}", at=time.strftime("%d/%m %H:%M"))
        logger.error(f"Google TTS falhou na voz {voice_name}: {last_error['message']}")
        return None
    audio = res.json().get("audioContent")
    return base64.b64decode(audio) if audio else None


def list_voices(key: str, language: str = "pt-BR") -> List[str]:
    """Nomes das vozes que a chave enxerga no idioma (para conferir a chave e o catálogo)."""
    res = requests.get(f"{API_URL}/voices", params={"key": key, "languageCode": language}, timeout=15)
    if res.status_code != 200:
        raise RuntimeError(f"{res.status_code}: {_error_message(res)}")
    return sorted(v["name"] for v in res.json().get("voices", []))
