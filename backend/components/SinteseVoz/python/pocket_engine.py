"""
Vozes do plano grátis: Pocket TTS (modelo aberto de ~100M parâmetros, roda no processador do servidor).

- Um único modelo em português (language="portuguese", versão sem clonagem de voz). Cada voz do catálogo
  escolhe um timbre pronto do modelo ("pocket_voice") e a temperatura ("pocket_temp": maior = entonação
  mais variada; o padrão do modelo é 0.3).
- O modelo não é seguro para várias threads: a geração roda sob uma trava (um trecho por vez).
  Medido num i3 de 2 núcleos: ~2x mais rápido que o tempo real.
- Modelo e timbres ficam no cache do Hugging Face (HF_HOME; no container: /app/models/hf, baixados no build).
- No Windows, rode o Python com PYTHONUTF8=1: a biblioteca lê arquivos de configuração sem informar UTF-8.
- Saída em MP3 mono 48 kbps, igual às outras vozes.
"""

import logging
import threading
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger("PocketEngine")

LANGUAGE = "portuguese"
DEFAULT_TEMP = 0.3
MP3_BITRATE = 48

_model = None
_states: Dict[str, object] = {}
_load_lock = threading.Lock()
_gen_lock = threading.Lock()
_unavailable: Optional[str] = None


def _get_model():
    global _model, _unavailable
    if _model is not None:
        return _model
    with _load_lock:
        if _model is None and _unavailable is None:
            try:
                from pocket_tts import TTSModel
                logger.info("Carregando o modelo Pocket TTS (português)")
                _model = TTSModel.load_model(language=LANGUAGE)
            except Exception as e:
                _unavailable = str(e)
                logger.error(f"Pocket TTS indisponível: {e}")
    return _model


def _state(voice: str):
    st = _states.get(voice)
    if st is None:
        st = _get_model().get_state_for_audio_prompt(voice)
        _states[voice] = st
    return st


def warm_up(voices) -> None:
    """Carrega o modelo e os timbres antes do primeiro pedido."""
    if _get_model() is None:
        return
    for v in voices:
        try:
            with _gen_lock:
                _state(v)
        except Exception as e:
            logger.warning(f"Falha ao preparar a voz Pocket {v}: {e}")


def _encode_mp3(pcm16: np.ndarray, sample_rate: int) -> bytes:
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(MP3_BITRATE)
    enc.set_in_sample_rate(sample_rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm16.tobytes()) + enc.flush())


def synthesize_mp3(text: str, voice: str, temp: float = DEFAULT_TEMP) -> Optional[bytes]:
    model = _get_model()
    if model is None or not text.strip():
        return None
    with _gen_lock:
        model.temp = temp
        audio = model.generate_audio(_state(voice), text).numpy().astype(np.float32).reshape(-1)
    if not audio.size:
        return None
    peak = float(np.max(np.abs(audio)))
    if peak > 1.0:
        audio = audio / peak
    pcm16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    return _encode_mp3(pcm16, model.sample_rate)
