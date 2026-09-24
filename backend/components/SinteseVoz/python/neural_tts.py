"""
Motor Neural de Síntese de Voz (Neural TTS & Voice Cloning)
Suporte a vozes neurais ultra-realistas com entonação dramática/suspense
e integração com edge-tts e ElevenLabs.
"""

import asyncio
import os
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
import edge_tts
from config import get_settings

logger = __import__("logging").getLogger("NeuralTTS")

# Diretório para cache de áudios sintetizados
AUDIO_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

VOICE_MAPPING = {
    # Vozes Neurais Português Brasil (Microsoft Azure Neural / Edge-TTS)
    "francisca-dramatica": {
        "edge_voice": "pt-BR-FranciscaNeural",
        "name": "Francisca",
        "gender": "female",
        "lang": "pt-BR",
        "accent": "Brasil (Narrativa & Drama)",
        "tag": "Cinematográfica & Suspense",
        "description": "Voz rica em nuances emocionais e cadência dramática. Ideal para audiolivros, suspense e romances.",
        "samplePhrase": "A noite estava densa e silenciosa... Um pressentimento sombrio pairava no ar.",
        "avatarColor": "linear-gradient(135deg, #10b981 0%, #047857 100%)",
        "pitch": "+0Hz",
        "rate": "-3%"
    },
    "antonio-suspense": {
        "edge_voice": "pt-BR-AntonioNeural",
        "name": "Antônio",
        "gender": "male",
        "lang": "pt-BR",
        "accent": "Brasil (Grave & Misterioso)",
        "tag": "Suspense & Narração Profunda",
        "description": "Tom grave, profundo e imersivo. Traz tensão dramática, mistério e autoridade para qualquer história.",
        "samplePhrase": "Passos ecoavam pelo corredor vazio. Não havia para onde fugir.",
        "avatarColor": "linear-gradient(135deg, #059669 0%, #0f172a 100%)",
        "pitch": "-4Hz",
        "rate": "-5%"
    },
    "thalita-expressiva": {
        "edge_voice": "pt-BR-ThalitaNeural",
        "name": "Thalita",
        "gender": "female",
        "lang": "pt-BR",
        "accent": "Brasil (Expressiva & Clara)",
        "tag": "Storyteller & Envolvente",
        "description": "Dicção impecável, calorosa e fluida. Perfeita para ficção moderna, crônicas e desenvolvimento pessoal.",
        "samplePhrase": "Cada página deste livro guarda um segredo que você está prestes a desvendar.",
        "avatarColor": "linear-gradient(135deg, #34d399 0%, #059669 100%)",
        "pitch": "+0Hz",
        "rate": "+0%"
    },
    "manuela-literaria": {
        "edge_voice": "pt-BR-ManuelaNeural",
        "name": "Manuela",
        "gender": "female",
        "lang": "pt-BR",
        "accent": "Brasil (Clássica & Suave)",
        "tag": "Audiolivro Clássico",
        "description": "Ritmo suave com entonação refinada. Excelente para literatura clássica e ensaios profundos.",
        "samplePhrase": "No princípio, todas as respostas pareciam distantes, até que a primeira revelação aconteceu.",
        "avatarColor": "linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)",
        "pitch": "+1Hz",
        "rate": "-2%"
    },
    "brian-cinema": {
        "edge_voice": "en-US-ChristopherNeural",
        "name": "Brian (Cinema)",
        "gender": "male",
        "lang": "en-US",
        "accent": "EUA (Dramatic Narrator)",
        "tag": "Cinematic & Blockbuster",
        "description": "Voz lendária de trailer cinematográfico com impacto emocional de suspense e aventura.",
        "samplePhrase": "In a world where silence meant danger, one man dared to speak the truth.",
        "avatarColor": "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
        "pitch": "-5Hz",
        "rate": "-4%"
    },
    "rachel-crystal": {
        "edge_voice": "en-US-JennyNeural",
        "name": "Rachel (Crystal)",
        "gender": "female",
        "lang": "en-US",
        "accent": "EUA (Crystal Clear)",
        "tag": "Signature Audio",
        "description": "Dicção cristalina e acolhedora para longas sessões de leitura sem fadiga auditiva.",
        "samplePhrase": "Welcome. Sit back and let us explore the wonders written within this chapter.",
        "avatarColor": "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
        "pitch": "+0Hz",
        "rate": "+0%"
    }
}

def format_suspense_text(text: str, emotion: str = "suspense") -> str:
    """
    Enriquece o texto com pontuações de pausa para aumentar o suspense e a dramaticidade.
    """
    if not text:
        return ""
    
    formatted = text
    # Aumenta pausas em reticências e travessões
    formatted = re.sub(r'\.{3,}', '... ', formatted)
    formatted = re.sub(r'—', ', ', formatted)
    return formatted

async def _synthesize_edge_tts(
    text: str, 
    voice_name: str, 
    output_path: str, 
    rate: str = "+0%", 
    pitch: str = "+0Hz"
) -> bool:
    try:
        communicate = edge_tts.Communicate(text, voice_name, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        return True
    except Exception as e:
        logger.error(f"Erro no edge-tts para a voz {voice_name}: {e}")
        return False

def generate_speech_file(
    text: str, 
    voice_id: str = "francisca-dramatica", 
    emotion: str = "suspense",
    rate_multiplier: float = 1.0
) -> Optional[str]:
    """
    Sintetiza áudio com entonação neural e salva no cache de áudio.
    Retorna o nome do arquivo gerado ou None.
    """
    voice_info = VOICE_MAPPING.get(voice_id, VOICE_MAPPING["francisca-dramatica"])
    edge_voice = voice_info.get("edge_voice", "pt-BR-FranciscaNeural")
    
    # Prepara entonação e pausas
    processed_text = format_suspense_text(text, emotion)
    
    # Ajusta velocidade e tom
    base_rate = int((rate_multiplier - 1.0) * 100)
    rate_str = f"{'+' if base_rate >= 0 else ''}{base_rate}%"
    pitch_str = voice_info.get("pitch", "+0Hz")
    
    import hashlib
    hash_key = hashlib.md5(f"{processed_text}_{voice_id}_{rate_str}_{pitch_str}".encode()).hexdigest()
    filename = f"tts_{hash_key}.mp3"
    file_path = AUDIO_CACHE_DIR / filename
    
    if file_path.exists() and file_path.stat().st_size > 0:
        return filename
        
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        success = loop.run_until_complete(_synthesize_edge_tts(
            text=processed_text,
            voice_name=edge_voice,
            output_path=str(file_path),
            rate=rate_str,
            pitch=pitch_str
        ))
        loop.close()
        return filename if success else None
    except Exception as e:
        logger.error(f"Falha ao gerar síntese neural: {e}")
        return None

def get_extended_voice_catalog() -> List[Dict[str, Any]]:
    """Retorna o catálogo completo de vozes com metadados de entonação."""
    catalog = []
    for vid, v in VOICE_MAPPING.items():
        catalog.append({
            "id": vid,
            "name": v["name"],
            "gender": v["gender"],
            "lang": v["lang"],
            "accent": v["accent"],
            "tag": v["tag"],
            "description": v["description"],
            "samplePhrase": v["samplePhrase"],
            "avatarColor": v["avatarColor"],
            "stability": 0.85,
            "clarity": 0.95,
            "speed": 1.0,
            "isNeural": True,
            "supportsSuspense": True
        })
    return catalog
