#!/bin/bash
set -e

echo "=== Iniciando Aedolia Backend ==="

# Um único processo: o cache de áudio em RAM e o limite de tentativas de login ficam na memória do processo.
# Várias threads atendem downloads de áudio, uploads e o pré-carregamento em streaming ao mesmo tempo.
# (main.py, com os jobs de heartbeat/alertas, não sobe: importa record_heartbeat, que não existe em database.py)
exec gunicorn \
    --workers 1 \
    --worker-class gthread \
    --threads 32 \
    --bind "0.0.0.0:${PORT:-5000}" \
    --timeout 600 \
    --graceful-timeout 30 \
    --access-logfile - \
    "api_server:create_app()"
