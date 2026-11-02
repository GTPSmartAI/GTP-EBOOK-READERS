"""
Vozes próprias do plano gratuito: Piper (modelos ONNX abertos, rodando no nosso servidor, sem serviço externo).

- Modelos em backend/models/piper (local) ou PIPER_MODELS_DIR (no container: /app/models/piper,
  baixados no build da imagem pelo Dockerfile). Cada voz é um par <modelo>.onnx + <modelo>.onnx.json.
- A fonética (espeak-ng) não é segura para várias threads ao mesmo tempo: roda sob uma trava curta.
  A geração do som (onnxruntime) roda em paralelo.
- Saída em MP3 mono 48 kbps (mesmo tamanho dos áudios das outras vozes), pelo lameenc.
"""

import logging
import os
import threading
from pathlib import Path
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger("PiperEngine")

_DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "piper"
MODELS_DIR = Path(os.getenv("PIPER_MODELS_DIR") or _DEFAULT_DIR)

# Pausa entre frases do mesmo trecho
SENTENCE_SILENCE_S = 0.14
MP3_BITRATE = 48

_voices: Dict[str, object] = {}
_load_lock = threading.Lock()
_phonemize_lock = threading.Lock()


def model_available(model: str) -> bool:
    return (MODELS_DIR / f"{model}.onnx").exists() and (MODELS_DIR / f"{model}.onnx.json").exists()


def _voice(model: str):
    voice = _voices.get(model)
    if voice is not None:
        return voice
    with _load_lock:
        voice = _voices.get(model)
        if voice is None:
            from piper import PiperVoice
            path = MODELS_DIR / f"{model}.onnx"
            logger.info(f"Carregando voz Piper {path.name}")
            voice = PiperVoice.load(str(path))
            _voices[model] = voice
    return voice


def warm_up(models) -> None:
    """Carrega os modelos antes do primeiro pedido (cada um leva alguns segundos)."""
    for m in models:
        if model_available(m):
            try:
                synthesize_mp3("Olá.", m)
            except Exception as e:
                logger.warning(f"Falha ao preparar a voz {m}: {e}")


def _encode_mp3(pcm16: np.ndarray, sample_rate: int) -> bytes:
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(MP3_BITRATE)
    enc.set_in_sample_rate(sample_rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm16.tobytes()) + enc.flush())


def synthesize_mp3(text: str, model: str, length_scale: float = 1.0) -> Optional[bytes]:
    """Texto -> MP3. length_scale > 1 fala mais devagar, < 1 mais rápido."""
    if not text or not model_available(model):
        return None
    from piper import SynthesisConfig

    voice = _voice(model)
    with _phonemize_lock:
        sentences = voice.phonemize(text)
    config = SynthesisConfig(length_scale=length_scale)
    sample_rate = voice.config.sample_rate
    silence = np.zeros(int(sample_rate * SENTENCE_SILENCE_S), dtype=np.float32)

    parts = []
    for phonemes in sentences:
        if not phonemes:
            continue
        ids = voice.phonemes_to_ids(phonemes)
        audio = voice.phoneme_ids_to_audio(ids, config)
        if isinstance(audio, tuple):
            audio = audio[0]
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        audio = audio / peak if peak > 1e-8 else np.zeros_like(audio)
        if parts:
            parts.append(silence)
        parts.append(np.clip(audio, -1.0, 1.0).astype(np.float32))
    if not parts:
        return None
    pcm16 = (np.concatenate(parts) * 32767).astype(np.int16)
    return _encode_mp3(pcm16, sample_rate)
