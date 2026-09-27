"""
Motor de Síntese de Voz
Catálogo único em ../voice_catalog.json (também lido pelo frontend).
- Plano grátis (tier "basic"): vozes Piper, modelos abertos rodando no nosso servidor (piper_engine.py).
- PRO (tier "premium"): vozes do Microsoft Edge TTS.
Quem decide o que cada usuário pode usar é voice_for_plan(); a rota de síntese chama antes de gerar.
"""

import asyncio
import re
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
import edge_tts

logger = __import__("logging").getLogger("NeuralTTS")


def prepare_text(text: str) -> str:
    """Tira marcas gráficas que não se falam (travessão de diálogo, aspas, colchetes)."""
    t = text.strip()
    t = re.sub(r'^[—–-]\s*', '', t)
    t = re.sub(r'\s[—–]\s*$', '', t)
    t = re.sub(r'[“”"„«»\[\]『』【】<>]', '', t)
    return re.sub(r'\s{2,}', ' ', t).strip()

_COMPONENT_DIR = Path(__file__).resolve().parent.parent
CATALOG_FILE = _COMPONENT_DIR / "voice_catalog.json"
# Metadados de vozes customizadas/clonadas
CUSTOM_VOICES_FILE = _COMPONENT_DIR.parent.parent / "uploads" / "custom_voices.json"

with open(CATALOG_FILE, "r", encoding="utf-8") as _f:
    _CATALOG = json.load(_f)

VOICE_MAPPING: Dict[str, Dict[str, Any]] = {v["id"]: v for v in _CATALOG["voices"]}
LEGACY_VOICE_IDS: Dict[str, str] = {k: v for k, v in _CATALOG.get("legacy_ids", {}).items() if not k.startswith("_")}

DEFAULT_VOICE_ID = "faber"  # voz grátis padrão
PRO_TIERS = ("pro", "unlimited")

__all__ = [
    "generate_speech_bytes", "get_extended_voice_catalog", "voice_for_plan",
    "get_voice_metadata", "save_custom_voice_entry", "format_narration_text",
]


def voice_for_plan(voice_id: str, subscription_tier: Optional[str], text: str = "") -> str:
    """
    Voz que o usuário pode usar. Voz premium sem plano PRO vira a voz grátis padrão;
    a única exceção é a frase de amostra da própria voz (para ouvir antes de assinar).
    """
    info = get_voice_metadata(voice_id)
    # Só as vozes Piper do catálogo são grátis (vozes personalizadas também são PRO)
    is_free = info.get("engine") == "piper" and info.get("tier") != "premium"
    if is_free or (subscription_tier or "free") in PRO_TIERS:
        return info.get("id", voice_id)
    if text and text.strip() == str(info.get("samplePhrase", "")).strip():
        return info.get("id", voice_id)
    return DEFAULT_VOICE_ID


def format_narration_text(text: str, cadence: str = "natural", emotion: Optional[str] = None) -> str:
    """
    Prepara um trecho para o Edge TTS. Cada trecho já chega separado em fala, narração ou colchetes
    (text_pipeline), então aqui só se limpam marcas gráficas e se aplica a cadência da voz:
    - natural/rápida: texto como está, sem pausas artificiais
    - dramática: respiro curto entre frases do mesmo trecho
    - espaçosa: respiro entre frases e depois de dois-pontos/ponto e vírgula
    O parâmetro emotion é mantido por compatibilidade e não altera a cadência.
    """
    if not text:
        return ""

    formatted = prepare_text(text)

    if cadence == "espacosa":
        formatted = re.sub(r'([.!?…])\s+(?=\S)', r'\1 ... ', formatted)
        formatted = re.sub(r'([:;])\s+', r'\1 ... ', formatted)
    elif cadence == "dramatica":
        formatted = re.sub(r'([.!?…])\s+(?=\S)', r'\1 ... ', formatted)

    # Evita reticências repetidas e espaços duplos
    formatted = re.sub(r'(\s*\.\.\.\s*){2,}', ' ... ', formatted)
    formatted = re.sub(r'\s{2,}', ' ', formatted)
    return formatted.strip()


def load_custom_voices() -> Dict[str, Dict[str, Any]]:
    """Carrega vozes clonadas ou personalizadas salvas pelo usuário."""
    if not CUSTOM_VOICES_FILE.exists():
        return {}
    try:
        with open(CUSTOM_VOICES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Erro ao carregar custom_voices.json: {e}")
        return {}


def save_custom_voice_entry(voice_id: str, voice_data: Dict[str, Any]):
    """Salva uma nova voz customizada/clonada no arquivo persistente."""
    current = load_custom_voices()
    current[voice_id] = voice_data
    try:
        CUSTOM_VOICES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CUSTOM_VOICES_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Erro ao salvar voz customizada: {e}")


def get_voice_metadata(voice_id: str) -> Dict[str, Any]:
    """Retorna a voz do catálogo (aceita IDs antigos) ou a voz personalizada salva."""
    voice_id = LEGACY_VOICE_IDS.get(voice_id, voice_id)
    if voice_id in VOICE_MAPPING:
        return VOICE_MAPPING[voice_id]

    custom = load_custom_voices().get(voice_id)
    if custom:
        return {**custom, "engine": "edge"}

    return VOICE_MAPPING[DEFAULT_VOICE_ID]


async def _synthesize_edge_tts_bytes(text: str, voice_name: str, rate: str = "+0%", pitch: str = "+0Hz") -> Optional[bytes]:
    """Sintetiza áudio 100% em memória RAM utilizando edge_tts.stream()"""
    try:
        communicate = edge_tts.Communicate(text, voice_name, rate=rate, pitch=pitch)
        out = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                out.extend(chunk["data"])
        return bytes(out) if len(out) > 0 else None
    except Exception as e:
        logger.error(f"Erro no edge-tts stream para a voz {voice_name}: {e}")
        return None


def _edge_rate(base: str, rate_multiplier: float) -> str:
    try:
        base_val = int(str(base).replace("%", "").replace("+", ""))
    except ValueError:
        base_val = 0
    total = max(-50, min(100, base_val + int((rate_multiplier - 1.0) * 100)))
    return f"{'+' if total >= 0 else ''}{total}%"


def _generate_edge(text: str, voice_info: Dict[str, Any], rate_multiplier: float,
                   pitch_override: Optional[str], rate_override: Optional[str], cadence: Optional[str]) -> Optional[bytes]:
    processed = format_narration_text(text, cadence=cadence or voice_info.get("cadence", "natural"))
    if not re.search(r'\w', processed):
        return None
    rate_str = rate_override or _edge_rate(voice_info.get("rate", "+0%"), rate_multiplier)
    pitch_str = pitch_override or voice_info.get("pitch", "+0Hz")
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_synthesize_edge_tts_bytes(
                processed, voice_info.get("edge_voice", "pt-BR-AntonioNeural"), rate_str, pitch_str
            ))
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Falha ao gerar síntese Edge: {e}")
        return None


def generate_speech_bytes(
    text: str,
    voice_id: str = DEFAULT_VOICE_ID,
    emotion: str = "",
    rate_multiplier: float = 1.0,
    pitch_override: Optional[str] = None,
    rate_override: Optional[str] = None,
    cadence: Optional[str] = None,
) -> Optional[bytes]:
    """Sintetiza o trecho em memória e retorna os bytes do MP3."""
    voice_info = get_voice_metadata(voice_id)
    if voice_info.get("engine") == "piper":
        return _generate_piper(text, voice_info, rate_multiplier)
    return _generate_edge(text, voice_info, rate_multiplier, pitch_override, rate_override, cadence)


def _generate_piper(text: str, voice_info: Dict[str, Any], rate_multiplier: float) -> Optional[bytes]:
    from piper_engine import synthesize_mp3
    processed = prepare_text(text)
    if not re.search(r'\w', processed):
        return None
    length_scale = float(voice_info.get("length_scale", 1.0)) / max(0.5, min(2.0, rate_multiplier or 1.0))
    try:
        return synthesize_mp3(processed, voice_info["piper_model"], length_scale)
    except Exception as e:
        logger.error(f"Falha na voz Piper {voice_info.get('id')}: {e}")
        return None


def piper_models() -> List[str]:
    return [v["piper_model"] for v in VOICE_MAPPING.values() if v.get("engine") == "piper"]


_PUBLIC_FIELDS = ("id", "name", "gender", "lang", "accent", "tag", "category", "description",
                  "samplePhrase", "avatarColor", "cadence", "tier", "engine")


def get_extended_voice_catalog() -> List[Dict[str, Any]]:
    """Retorna o catálogo completo de vozes (padrão + customizadas/clonadas)."""
    catalog = [{k: v.get(k) for k in _PUBLIC_FIELDS} for v in VOICE_MAPPING.values()]
    for vid, cv in load_custom_voices().items():
        if vid not in VOICE_MAPPING:
            catalog.append(cv)
    return catalog
