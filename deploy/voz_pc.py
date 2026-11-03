"""
Aedolia no PC (teste): serve o app compilado (frontend/dist) e gera a voz no próprio computador,
com as vozes Piper (sherpa-onnx local) e Azure Estúdio (edge-tts).

Só atende este computador (127.0.0.1). Não é servidor de internet.
Aberto pelo Aedolia-PC.bat (deploy/rodar-no-pc.ps1).

Rotas:
  GET  /                         app (frontend/dist), com volta para index.html
  POST /local-tts/synthesize     {"text", "model", "lengthScale"} -> áudio (cabeçalhos X-Duration-Ms, X-Cached)
  GET  /local-tts/info           {"models": [...], "stats": {...}}
  POST /local-tts/clear-cache    apaga os áudios guardados
"""

import asyncio
import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import time
import wave
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / ".pc-voz" / "lib"
sys.path.insert(0, str(LIB))

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402

PORT = int(os.environ.get("AEDOLIA_PC_PORT", "5180"))
DIST = ROOT / "frontend" / "dist"
TTS_DIR = ROOT / "frontend" / "android" / "tts-assets" / "tts"
CACHE = ROOT / ".pc-voz" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

# Mesmos valores do LocalTtsEngine.java (celular)
MAX_ENGINES = 3
TARGET_PEAK = 0.89
MAX_GAIN = 6.0
NUM_THREADS = 2  # no PC, 2 threads já dão ~11x o tempo real (medido); mais não acelera

EDGE_MODELS = [
    "pt-BR-FranciscaNeural",
    "pt-BR-AntonioNeural",
    "pt-BR-ThalitaMultilingualNeural",
]

_engines: "OrderedDict[str, sherpa_onnx.OfflineTts]" = OrderedDict()
_lock = threading.Lock()  # um trecho por vez
_stats = {
    "generated": 0,
    "audioSeconds": 0.0,
    "computeSeconds": 0.0,
    "lastRealtimeFactor": 0.0,
    "lastLoadMs": 0,
    "failures": 0,
    "lastError": None,
}


def is_edge_model(model: str) -> bool:
    return model in EDGE_MODELS or (model.startswith("pt-BR-") and "Neural" in model)


def normalize_text_for_speech(text: str) -> str:
    """
    Normaliza o texto antes da síntese:
    garante que reticências, travessões, vírgulas e pontuações especiais
    gerem pausas e respirações reais no motor fonético.
    """
    s = text.strip()
    if not s:
        return ""
    # Remove aspas e colchetes que atrapalham fonética
    s = re.sub(r'["“"”«»]', '', s)
    s = re.sub(r'[\[\]『』【】]', ' ', s)

    # Colapsa pontuações repetidas
    s = re.sub(r'([.?!…])\s*([.?!…])+', r'\1', s)

    # Reticências (...) ou (…) no meio da frase viram vírgula com respiro para forçar pausa
    s = re.sub(r'(\w)\s*(\.{3,}|…)\s*(\w)', r'\1, \3', s)

    # Reticências no final da frase viram ponto final com entonação descendente
    s = re.sub(r'(\.{3,}|…)\s*$', '.', s)

    # Travessão no início da fala: remove
    s = re.sub(r'^[—–-]\s*', '', s)

    # Travessão intercalado no meio da oração: vira vírgula com respiro
    s = re.sub(r'\s*[—–]\s*', ', ', s)

    # Se ficou pontuação forte seguida de vírgula, mantém só a pontuação forte
    s = re.sub(r'([.?!;:])\s*,', r'\1', s)

    # Garante espaço após pontuações se colado em letra
    s = re.sub(r'([,;:])([^\s\d])', r'\1 \2', s)

    # Limpa vírgulas duplicadas ou vírgula no início
    s = re.sub(r'^,\s*', '', s)
    s = re.sub(r',\s*,+', ',', s)

    # Colapsa múltiplos espaços
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def espeak_data_dir() -> str:
    """
    O espeak-ng não abre caminho com acento no Windows (a pasta do projeto é "Criação de pdf Readers"):
    usa uma cópia num caminho só com letras simples.
    """
    src = TTS_DIR / "espeak-ng-data"
    if str(src).isascii():
        return str(src)
    base = Path(os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or "C:\\Temp")
    dest = base / "Aedolia" / "espeak-ng-data"
    if not str(dest).isascii():
        dest = Path("C:\\AedoliaVoz") / "espeak-ng-data"
    marker = dest / ".copiado"
    signature = str(sum(1 for p in src.rglob("*") if p.is_file()))
    if not marker.exists() or marker.read_text() != signature:
        import shutil
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        marker.write_text(signature)
    return str(dest)


def available_models():
    models = []
    if TTS_DIR.exists():
        models.extend(sorted(d.name for d in TTS_DIR.iterdir() if (d / "model.onnx").exists()))
    models.extend(EDGE_MODELS)
    return models


def engine(model: str) -> sherpa_onnx.OfflineTts:
    tts = _engines.get(model)
    if tts is not None:
        _engines.move_to_end(model)
        return tts
    folder = TTS_DIR / model
    if not (folder / "model.onnx").exists():
        raise FileNotFoundError(f"A voz {model} não foi baixada (rode deploy\\baixar-motor-voz.ps1)")
    start = time.time()
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(folder / "model.onnx"),
                tokens=str(folder / "tokens.txt"),
                data_dir=espeak_data_dir(),
            ),
            num_threads=NUM_THREADS,
        ),
    )
    tts = sherpa_onnx.OfflineTts(config)
    _stats["lastLoadMs"] = int((time.time() - start) * 1000)
    _engines[model] = tts
    while len(_engines) > MAX_ENGINES:
        _engines.popitem(last=False)
    return tts


def cache_file(model: str, length_scale: float, text: str, ext: str = "wav") -> Path:
    key = hashlib.sha1(f"{model}|{length_scale}|{text}".encode("utf-8")).hexdigest()
    return CACHE / f"{key}.{ext}"


def wav_duration_ms(path: Path) -> int:
    with wave.open(str(path), "rb") as w:
        return int(w.getnframes() * 1000 / w.getframerate())


def mp3_duration_ms(path: Path) -> int:
    # Edge-TTS gera áudio em ~48kbps (6000 bytes/segundo)
    size = path.stat().st_size
    return max(300, int((size / 6000.0) * 1000))


def synthesize_edge(text: str, model: str, length_scale: float):
    out = cache_file(model, length_scale, text, ext="mp3")
    if out.exists() and out.stat().st_size > 500:
        os.utime(out)
        return out, True

    with _lock:
        if out.exists() and out.stat().st_size > 500:
            return out, True

        rate_percent = int(round((1.0 / max(0.5, length_scale) - 1.0) * 100))
        rate_str = f"{rate_percent:+d}%"

        async def _run():
            import edge_tts
            comm = edge_tts.Communicate(text, model, rate=rate_str)
            tmp = out.with_suffix(".tmp")
            await comm.save(str(tmp))
            tmp.replace(out)

        start = time.time()
        asyncio.run(_run())
        compute = time.time() - start
        dur_s = out.stat().st_size / 6000.0

        _stats["generated"] += 1
        _stats["audioSeconds"] += dur_s
        _stats["computeSeconds"] += compute
        _stats["lastRealtimeFactor"] = dur_s / compute if compute else 0
        return out, False


def synthesize(text: str, model: str, length_scale: float):
    text_clean = normalize_text_for_speech(text) or text
    if is_edge_model(model):
        return synthesize_edge(text_clean, model, length_scale)

    out = cache_file(model, length_scale, text_clean, ext="wav")
    if out.exists() and out.stat().st_size > 44:
        os.utime(out)
        return out, True

    with _lock:
        if out.exists() and out.stat().st_size > 44:
            return out, True
        tts = engine(model)
        start = time.time()
        audio = tts.generate(text_clean, sid=0, speed=1.0 / max(0.5, length_scale))
        samples = np.asarray(audio.samples, dtype=np.float32)
        if samples.size == 0:
            raise RuntimeError("A voz não gerou áudio para este trecho")
        compute = time.time() - start
        peak = float(np.abs(samples).max())
        if peak > 1e-6:
            samples = np.clip(samples * min(MAX_GAIN, TARGET_PEAK / peak), -1.0, 1.0)
        tmp = out.with_suffix(".tmp")
        with wave.open(str(tmp), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(audio.sample_rate)
            w.writeframes((samples * 32767).astype("<i2").tobytes())
        tmp.replace(out)
        seconds = samples.size / audio.sample_rate
        _stats["generated"] += 1
        _stats["audioSeconds"] += seconds
        _stats["computeSeconds"] += compute
        _stats["lastRealtimeFactor"] = seconds / compute if compute else 0
        return out, False


def stats():
    cache_bytes = sum(f.stat().st_size for f in CACHE.glob("*.*"))
    rtf = _stats["audioSeconds"] / _stats["computeSeconds"] if _stats["computeSeconds"] else 0
    return {
        "generated": _stats["generated"],
        "audioSeconds": round(_stats["audioSeconds"]),
        "realtimeFactor": round(rtf, 1),
        "lastRealtimeFactor": round(_stats["lastRealtimeFactor"], 1),
        "lastLoadMs": _stats["lastLoadMs"],
        "failures": _stats["failures"],
        "lastError": _stats["lastError"],
        "threads": NUM_THREADS,
        "cores": os.cpu_count() or 0,
        "queued": 0,
        "cacheBytes": cache_bytes,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "AedoliaPC"

    def log_message(self, fmt, *args):
        pass

    def _json(self, status: int, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/local-tts/info":
            return self._json(200, {"models": available_models(), "stats": stats()})
        if path.startswith("/local-tts/"):
            return self._json(404, {"error": "rota desconhecida"})
        self._static(path)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if path == "/local-tts/clear-cache":
            for f in CACHE.glob("*"):
                f.unlink(missing_ok=True)
            return self._json(200, {"ok": True})
        if path != "/local-tts/synthesize":
            return self._json(404, {"error": "rota desconhecida"})
        try:
            req = json.loads(body or b"{}")
            text = str(req.get("text") or "").strip()
            model = str(req.get("model") or "")
            length_scale = float(req.get("lengthScale") or 1.0)
            if not text or not model:
                return self._json(400, {"error": "Pedido de voz incompleto"})
            out, cached = synthesize(text, model, length_scale)
        except Exception as e:  # noqa: BLE001
            _stats["failures"] += 1
            _stats["lastError"] = str(e)
            print(f"[voz] falha: {e}")
            return self._json(500, {"error": str(e)})

        data = out.read_bytes()
        is_mp3 = out.suffix == ".mp3"
        ctype = "audio/mpeg" if is_mp3 else "audio/wav"
        dur_ms = mp3_duration_ms(out) if is_mp3 else wav_duration_ms(out)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Duration-Ms", str(dur_ms))
        self.send_header("X-Cached", "1" if cached else "0")
        self.send_header("Access-Control-Expose-Headers", "X-Duration-Ms, X-Cached")
        self.end_headers()
        self.wfile.write(data)

    def _static(self, path: str):
        rel = path.lstrip("/") or "index.html"
        target = (DIST / rel).resolve()
        if DIST.resolve() not in target.parents and target != DIST.resolve():
            return self._json(403, {"error": "fora do app"})
        if not target.is_file():
            target = DIST / "index.html"  # app de uma página só
        if not target.is_file():
            return self._json(500, {"error": "O app não foi compilado (frontend/dist não existe)"})
        data = target.read_bytes()
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in (".js", ".mjs"):
            ctype = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if target.name == "index.html" else "max-age=3600")
        self.end_headers()
        self.wfile.write(data)


def main():
    models = available_models()
    found = ", ".join(models) if models else "nenhuma (rode deploy\\baixar-motor-voz.ps1)"
    print(f"Vozes encontradas: {found}")
    if models:
        print("Preparando a voz padrão...")
        try:
            synthesize("Olá.", "pt_BR-faber-medium" if "pt_BR-faber-medium" in models else models[0], 1.0)
        except Exception as e:  # noqa: BLE001
            print(f"[voz] não foi possível preparar a voz: {e}")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Aedolia no PC: http://127.0.0.1:{PORT}  (feche esta janela para parar)")
    server.serve_forever()


if __name__ == "__main__":
    main()
