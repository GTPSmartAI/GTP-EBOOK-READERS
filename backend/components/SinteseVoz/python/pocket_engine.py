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
- Texto ajustado antes do modelo (prepare_for_model), conferido ouvindo com reconhecimento de fala:
  - números viram palavras ("1990" -> "mil novecentos e noventa"): o modelo tende a pular dígitos;
  - MAIÚSCULAS: o modelo não lê ("POV ARTHUR LEWIN" saía mudo ou "o povo"). Palavras viram "Arthur",
    siglas de até 3 letras são soletradas ("TV" -> "tê vê") e "POV" vira "Ponto de vista de";
  - títulos em inglês com Iniciais Maiúsculas ("The Beginning After The End") perdiam palavras; em minúsculas
    o modelo fala todas (com sotaque: ele só sabe português).
- Cada trecho gera 3 quadros (240 ms) depois do fim previsto da fala; o padrão do modelo (1) cortava a última palavra.
- Lotes abandonados pelo leitor são cancelados na fila (cancel), e um trecho já na fila que o leitor precisa
  agora é promovido (promote) em vez de gerado de novo.
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
FRAMES_AFTER_EOS = 3

_model = None
_states: Dict[str, object] = {}
_load_lock = threading.Lock()
_unavailable: Optional[str] = None


class Cancelled(Exception):
    """O pedido saiu da fila antes de gerar (o lote foi abandonado pelo leitor)."""


class Ticket:
    """Lugar na fila de um trecho. Pode virar urgente (promote) ou ser cancelado enquanto espera."""
    __slots__ = ("urgent", "cancelled")

    def __init__(self, urgent: bool = False):
        self.urgent = urgent
        self.cancelled = False


class _PriorityLock:
    """
    Uma geração por vez. Os urgentes entram antes de qualquer pré-carregamento; dentro de cada grupo,
    ordem de chegada (o lote pede os trechos em ordem, e o início de uma frase dividida chega antes do resto).
    """

    def __init__(self):
        self._cv = threading.Condition()
        self._busy = False
        self._queue = deque()

    def _next(self):
        first = None
        for t in self._queue:
            if t.cancelled:
                continue
            if t.urgent:
                return t
            if first is None:
                first = t
        return first

    def acquire(self, ticket: Ticket) -> bool:
        with self._cv:
            self._queue.append(ticket)
            try:
                while not ticket.cancelled and (self._busy or self._next() is not ticket):
                    self._cv.wait()
            finally:
                self._queue.remove(ticket)
                self._cv.notify_all()
            if ticket.cancelled:
                return False
            self._busy = True
            return True

    def release(self):
        with self._cv:
            self._busy = False
            self._cv.notify_all()

    def promote(self, ticket: Ticket):
        with self._cv:
            ticket.urgent = True
            ticket.cancelled = False
            self._cv.notify_all()

    def cancel(self, tickets):
        """Tira da fila os que ainda esperam (urgentes ficam: alguém está esperando para tocar)."""
        with self._cv:
            for t in tickets:
                if not t.urgent:
                    t.cancelled = True
            self._cv.notify_all()


_gen_lock = _PriorityLock()
promote = _gen_lock.promote
cancel = _gen_lock.cancel

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
        _gen_lock.acquire(Ticket())
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


# Letras faladas, para siglas curtas em maiúsculas ("POV" -> "pê ó vê")
_LETTER_NAMES = {
    "A": "á", "B": "bê", "C": "cê", "D": "dê", "E": "é", "F": "éfe", "G": "gê", "H": "agá", "I": "i",
    "J": "jota", "K": "cá", "L": "éle", "M": "ême", "N": "ene", "O": "ó", "P": "pê", "Q": "quê", "R": "érre",
    "S": "ésse", "T": "tê", "U": "u", "V": "vê", "W": "dáblio", "X": "xis", "Y": "ípsilon", "Z": "zê",
}
# Siglas que se leem como palavra
_ACRONYM_WORDS = {"OK": "ok", "ONU": "onu", "OTAN": "otan", "NASA": "nasa", "FIFA": "fifa", "UNESCO": "unesco"}
# Palavras que só existem em inglês: marcam um trecho em inglês ("The Beginning After The End")
_EN_MARKERS = {
    "the", "of", "and", "with", "my", "your", "is", "are", "was", "were", "this", "that", "you", "after",
    "before", "from", "his", "her", "their", "our", "it", "its", "into", "who", "what", "how", "why", "where",
    "when", "be", "been", "will", "can", "i'm", "don't", "it's", "end", "beginning", "world", "king", "lord",
}
_UPPER_WORD_RE = re.compile(r"\b[A-ZÀ-Ý]{2,}\b")
_TITLE_WORD_RE = re.compile(r"[A-Z][a-z']*")


_POV_RE = re.compile(r"\bPOV\b\s*[:\-–—]?\s*(?=\w)", re.IGNORECASE)


def _fix_caps(text: str) -> str:
    """O modelo não lê palavras em MAIÚSCULAS (som nenhum ou "povo" para "POV ARTHUR")."""
    # Cabeçalho de romance: "POV ARTHUR LEWIN" -> "Ponto de vista de Arthur Lewin" (medido: lido inteiro)
    text = _POV_RE.sub("Ponto de vista de ", text)

    def repl(m):
        w = m.group(0)
        if w in _ACRONYM_WORDS:
            return _ACRONYM_WORDS[w]
        if len(w) <= 3 and all(c in _LETTER_NAMES for c in w):
            return " ".join(_LETTER_NAMES[c] for c in w)
        return w.capitalize()
    return _UPPER_WORD_RE.sub(repl, text)


def _fix_english(text: str) -> str:
    """
    Trecho em inglês com Iniciais Maiúsculas: o modelo (só português) trata cada palavra como nome próprio
    e engole algumas ("até beijininha fe"). Em minúsculas ele fala todas, com sotaque.
    """
    tokens = text.split(" ")
    core = [re.sub(r"^\W+|\W+$", "", t) for t in tokens]

    def in_title(w):
        return bool(w) and (bool(_TITLE_WORD_RE.fullmatch(w)) or w in _EN_MARKERS)

    i = 0
    while i < len(tokens):
        j = i
        while j < len(tokens) and in_title(core[j]):
            j += 1
            # pontuação no fim da palavra fecha o título ("The End, disse ele")
            if re.search(r"[.,;:!?)]$", tokens[j - 1]):
                break
        run = range(i, j)
        if j - i >= 2 and any(core[k].lower() in _EN_MARKERS for k in run):
            for k in run:
                if core[k] != "I":
                    tokens[k] = tokens[k].lower()
        i = max(j, i + 1)
    return " ".join(tokens)


def prepare_for_model(text: str) -> str:
    """Ajusta o texto para o modelo não pular palavras: números, MAIÚSCULAS e títulos em inglês."""
    text = expand_numbers(text)
    text = _fix_caps(text)
    return _fix_english(text)


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


def synthesize_mp3(text: str, voice: str, temp: float = DEFAULT_TEMP, urgent: bool = False,
                   ticket: Optional[Ticket] = None) -> Optional[bytes]:
    """ticket: lugar na fila criado por quem chamou (para poder promover ou cancelar). Levanta Cancelled."""
    model = _get_model()
    if model is None or not text.strip():
        return None
    text = prepare_for_model(text)
    ticket = ticket or Ticket(urgent)
    t_wait = time.monotonic()
    if not _gen_lock.acquire(ticket):
        raise Cancelled()
    urgent = ticket.urgent
    t_gen = time.monotonic()
    ok = False
    audio_s = 0.0
    error = None
    try:
        model.temp = temp
        # O padrão do modelo para frases com 5+ palavras é 1 quadro (80 ms) depois do fim previsto: às vezes
        # cortava a última palavra
        audio = model.generate_audio(_state(voice), text, frames_after_eos=FRAMES_AFTER_EOS)
        audio = audio.numpy().astype(np.float32).reshape(-1)
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
