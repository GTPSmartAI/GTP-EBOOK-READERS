import logging
import requests
from typing import List, Dict, Any, Optional
from config import get_settings

logger = logging.getLogger("VoiceService")

VOICE_CATALOG = [
    {
        "id": "vitoria-pt",
        "name": "Vitória",
        "gender": "female",
        "lang": "pt-BR",
        "accent": "Brasil (Natural)",
        "tag": "Narrativa & Audiobook",
        "description": "Voz brasileira suave, expressiva e envolvente. Perfeita para romances, poesia e não-ficção.",
        "stability": 0.75,
        "clarity": 0.85
    },
    {
        "id": "thiago-pt",
        "name": "Thiago",
        "gender": "male",
        "lang": "pt-BR",
        "accent": "Brasil (Profundo)",
        "tag": "Documentário & Negócios",
        "description": "Tom grave, confiante e cinematográfico. Excelente para livros de estratégia, negócios e biografias.",
        "stability": 0.82,
        "clarity": 0.90
    },
    {
        "id": "rachel-en",
        "name": "Rachel",
        "gender": "female",
        "lang": "en-US",
        "accent": "EUA (Calma & Cristalina)",
        "tag": "Clássica ElevenLabs",
        "description": "A voz assinatura da ElevenLabs. Extremamente flexível, acolhedora e agradável para longas sessões.",
        "stability": 0.70,
        "clarity": 0.88
    },
    {
        "id": "adam-en",
        "name": "Adam",
        "gender": "male",
        "lang": "en-US",
        "accent": "EUA (Dinâmico & Firme)",
        "tag": "Narrativa Dramática",
        "description": "Voz marcante e envolvente com nuances profundas, amplamente utilizada em ficção e aventura.",
        "stability": 0.78,
        "clarity": 0.86
    },
    {
        "id": "george-uk",
        "name": "George",
        "gender": "male",
        "lang": "en-GB",
        "accent": "Britânico (Elegante)",
        "tag": "Clássicos & Filosofia",
        "description": "Sotaque britânico clássico com dicção refinada. Ideal para literatura clássica e artigos acadêmicos.",
        "stability": 0.85,
        "clarity": 0.92
    },
    {
        "id": "domi-en",
        "name": "Domi",
        "gender": "female",
        "lang": "en-US",
        "accent": "EUA (Jovem & Vibrante)",
        "tag": "Conversacional & Moderno",
        "description": "Cadência ágil, entusiasmada e moderna, ideal para artigos rápidos, newsletters e tecnologia.",
        "stability": 0.65,
        "clarity": 0.80
    }
]

def get_available_voices() -> List[Dict[str, Any]]:
    """Retorna o catálogo de vozes configuradas."""
    return VOICE_CATALOG

def synthesize_elevenlabs_speech(text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM") -> Optional[bytes]:
    """Gera áudio usando a API oficial da ElevenLabs se a chave estiver configurada."""
    api_key = get_settings().ELEVENLABS_API_KEY
    if not api_key:
        logger.info("Chave ELEVENLABS_API_KEY não configurada no .env. Utilizando síntese nativa do leitor.")
        return None

    try:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json"
        }
        body = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.75,
                "similarity_boost": 0.85
            }
        }
        resp = requests.post(url, json=body, headers=headers, timeout=20)
        if resp.status_code == 200:
            return resp.content
        else:
            logger.error(f"Erro na API da ElevenLabs: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Falha ao chamar ElevenLabs: {e}")
        return None
