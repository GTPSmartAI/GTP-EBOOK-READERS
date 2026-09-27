FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Vozes do plano grátis (Piper, modelos abertos, ~60 MB cada). Camada própria: o Docker reaproveita
# nos próximos builds e só baixa de novo se esta lista mudar.
ENV PIPER_MODELS_DIR=/app/models/piper
RUN mkdir -p $PIPER_MODELS_DIR && cd $PIPER_MODELS_DIR && \
    for v in faber cadu jeff; do \
      for ext in onnx onnx.json; do \
        curl -fsSL --retry 3 -o "pt_BR-$v-medium.$ext" \
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/$v/medium/pt_BR-$v-medium.$ext"; \
      done; \
    done && ls -la

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0

COPY . .

# Arquivos editados no Windows podem vir com CRLF, que quebra o bash
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
