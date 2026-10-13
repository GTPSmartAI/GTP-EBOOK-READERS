"""
Vozes do plano grátis: Pocket TTS (modelo aberto de ~100M parâmetros, roda no processador do servidor).

- Um único modelo em português (language="portuguese", versão sem clonagem de voz). Cada voz do catálogo
  escolhe um timbre pronto do modelo ("pocket_voice") e a temperatura ("pocket_temp": maior = entonação
  mais variada; o padrão do modelo é 0.3).
- O modelo não é seguro para várias threads: gera um trecho por vez. A fila tem prioridade: o trecho que o
  leitor precisa tocar agora (urgent=True, rota /api/tts/synthesize) passa na frente do pré-carregamento.
  Sem isso, o pedido do trecho atual esperava os lotes adiantados, estourava o tempo do app e o trecho
  (ou o resto da frase) era pulado.
- Volume: o Pocket sai ~7 dB mais baixo que o Piper (soava "sussurrado"). Cada trecho é normalizado para
  o mesmo nível do Faber (RMS -15 dBFS, pico no máximo -1 dBFS).
- Números viram palavras ("1990" -> "mil novecentos e noventa"): o modelo tende a pular dígitos.
- Modelo e timbres ficam no cache do Hugging Face (HF_HOME; no container: /app/models/hf, baixados no build).
- No Windows, rode o Python com PYTHONUTF8=1: a biblioteca lê arquivos de configuração sem informar UTF-8.
- Saída em MP3 mono 64 kbps.
"""

import logging
import re
import threading
import time
from collections import deque
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger("PocketEngine")

LANGUAGE = "portuguese"
DEFAULT_TEMP = 0.3
MP3_BITRATE = 64
TARGET_RMS_DB = -15.0
MAX_PEAK = 0.89  # -1 dBFS

_model = None
_states: Dict[str, object] = {}
_load_lock = threading.Lock()
_unavailable: Optional[str] = None


class _PriorityLock:
    """
    Uma geração por vez. Quem é urgente entra antes de qualquer pedido de pré-carregamento; os de
    pré-carregamento entram na ordem de chegada (o lote pede os trechos em ordem, então o próximo
    trecho do livro fica pronto primeiro).
    """

    def __init__(self):
        self._cv = threading.Condition()
        self._busy = False
        self._urgent_waiting = 0
        self._queue = deque()

    def acquire(self, urgent: bool):
        with self._cv:
            if urgent:
                self._urgent_waiting += 1
                try:
                    while self._busy:
                        self._cv.wait()
                finally:
                    self._urgent_waiting -= 1
            else:
                ticket = object()
                self._queue.append(ticket)
                try:
                    while self._busy or self._urgent_waiting > 0 or self._queue[0] is not ticket:
                        self._cv.wait()
                finally:
                    self._queue.remove(ticket)
            self._busy = True

    def release(self):
        with self._cv:
            self._busy = False
            self._cv.notify_all()


_gen_lock = _PriorityLock()

# Desempenho recente (para Configurações > Administração)
_stats = deque(maxlen=200)
_stats_lock = threading.Lock()


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
        _gen_lock.acquire(urgent=False)
        try:
            _state(v)
        except Exception as e:
            logger.warning(f"Falha ao preparar a voz Pocket {v}: {e}")
        finally:
            _gen_lock.release()


# ------------------------------------------------------------------ texto

_ORDINAL_RE = re.compile(r"\b(\d{1,3})\s?([ºª°])")
_NUMBER_RE = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?")


def _spell(num_text: str, ordinal_suffix: str = "") -> str:
    from num2words import num2words
    try:
        if ordinal_suffix:
            words = num2words(int(num_text), lang="pt_BR", to="ordinal")
            if ordinal_suffix == "ª":
                words = re.sub(r"o\b", "a", words)
            return words
        clean = num_text.replace(".", "").replace(",", ".")
        value = float(clean) if "." in clean else int(clean)
        return num2words(value, lang="pt_BR").replace(",", "")
    except Exception:
        return num_text


def expand_numbers(text: str) -> str:
    """'No dia 3º de 1990, 2,5 kg' -> palavras (o modelo pula dígitos)."""
    text = _ORDINAL_RE.sub(lambda m: _spell(m.group(1), m.group(2)), text)
    return _NUMBER_RE.sub(lambda m: _spell(m.group(0)), text)


# ------------------------------------------------------------------ áudio

def _normalize(audio: np.ndarray) -> np.ndarray:
    voiced = audio[np.abs(audio) > 0.01]
    if not voiced.size:
        return audio
    rms = float(np.sqrt(np.mean(voiced ** 2)))
    peak = float(np.max(np.abs(audio)))
    gain = 10 ** (TARGET_RMS_DB / 20) / max(rms, 1e-6)
    gain = min(gain, MAX_PEAK / max(peak, 1e-6))
    return audio * gain


def _encode_mp3(pcm16: np.ndarray, sample_rate: int) -> bytes:
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(MP3_BITRATE)
    enc.set_in_sample_rate(sample_rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm16.tobytes()) + enc.flush())


def synthesize_mp3(text: str, voice: str, temp: float = DEFAULT_TEMP, urgent: bool = False) -> Optional[bytes]:
    model = _get_model()
    if model is None or not text.strip():
        return None
    text = expand_numbers(text)
    t_wait = time.monotonic()
    _gen_lock.acquire(urgent)
    t_gen = time.monotonic()
    ok = False
    audio_s = 0.0
    error = None
    try:
        model.temp = temp
        audio = model.generate_audio(_state(voice), text).numpy().astype(np.float32).reshape(-1)
        ok = bool(audio.size)
        audio_s = audio.size / model.sample_rate
    except Exception as e:
        error = str(e)[:200]
        raise
    finally:
        _gen_lock.release()
        with _stats_lock:
            _stats.append({"voice": voice, "ok": ok, "urgent": urgent, "audio_s": audio_s, "error": error,
                           "gen_s": time.monotonic() - t_gen, "wait_s": t_gen - t_wait})
    if not ok:
        return None
    pcm16 = (np.clip(_normalize(audio), -1.0, 1.0) * 32767).astype(np.int16)
    return _encode_mp3(pcm16, model.sample_rate)


def stats() -> Dict[str, object]:
    """Resumo dos últimos trechos gerados: velocidade (x tempo real), espera na fila e falhas por voz."""
    with _stats_lock:
        items = list(_stats)
    done = [s for s in items if s["ok"]]
    urgent = [s for s in items if s["urgent"]]
    audio = sum(s["audio_s"] for s in done)
    gen = sum(s["gen_s"] for s in done)
    failures: Dict[str, int] = {}
    last_error = None
    for s in items:
        if not s["ok"]:
            failures[s["voice"]] = failures.get(s["voice"], 0) + 1
            last_error = s.get("error") or last_error
    return {
        "loaded": _model is not None,
        "unavailable": _unavailable,
        "samples": len(items),
        "speed_x_realtime": round(audio / gen, 2) if gen else None,
        "avg_gen_s": round(gen / len(done), 1) if done else None,
        "avg_wait_urgent_s": round(sum(s["wait_s"] for s in urgent) / len(urgent), 1) if urgent else None,
        "max_wait_urgent_s": round(max(s["wait_s"] for s in urgent), 1) if urgent else None,
        "failures_by_voice": failures,
        "last_error": last_error,
    }
