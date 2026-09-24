"""
ElevenReader - Motor de Automações em Segundo Plano (Python Engine)
Padrão arquitetural GTP-TESTE-SISTEMA com APScheduler, Logging Rotativo e Heartbeat.
"""

import os
import sys
import time
import logging
import logging.handlers
import threading
from datetime import datetime
from pathlib import Path

# Resolução de paths para os módulos de shared e components
_CURRENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_CURRENT_DIR / "shared" / "python"))
sys.path.insert(0, str(_CURRENT_DIR / "components" / "ProcessadorLivros" / "python"))
sys.path.insert(0, str(_CURRENT_DIR / "components" / "GestaoAssinaturas" / "python"))
sys.path.insert(0, str(_CURRENT_DIR / "components" / "SinteseVoz" / "python"))
sys.path.insert(0, str(_CURRENT_DIR / "components" / "AssistenteIA" / "python"))
sys.path.insert(0, str(_CURRENT_DIR / "components" / "AlertasErro" / "python"))

from apscheduler.schedulers.background import BackgroundScheduler
from config import get_settings
from database import record_heartbeat
from error_alerts import run_error_alerts_job
import system_config as SC

# Servidor de API Flask
try:
    from api_server import create_app
    FLASK_AVAILABLE = True
except ImportError as e:
    FLASK_AVAILABLE = False
    print(f"Flask não disponível: {e}")

# Setup de Logging com rotação para o arquivo automation.log
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(threadName)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

file_handler = logging.handlers.RotatingFileHandler(
    _CURRENT_DIR / "automation.log", maxBytes=5 * 1024 * 1024, backupCount=2, encoding="utf-8"
)
file_handler.setFormatter(formatter)

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)

logging.basicConfig(level=logging.INFO, handlers=[file_handler, stream_handler])
logger = logging.getLogger("PythonEngine")

def job_heartbeat():
    """Job periódico de heartbeat."""
    record_heartbeat("PythonAutomationEngine")

def job_maintenance():
    """Job diário de manutenção e limpeza."""
    run_error_alerts_job()

def start_flask_server():
    """Inicia o servidor de API Flask em uma thread dedicada."""
    if FLASK_AVAILABLE:
        settings = get_settings()
        app = create_app()
        logger.info(f"Iniciando API Server em http://{settings.HOST}:{settings.PORT}")
        # Desabilita o reloader no modo thread para evitar duplicidade de scheduler
        app.run(host=settings.HOST, port=settings.PORT, debug=False, use_reloader=False)

def main():
    logger.info("=" * 60)
    logger.info(f"Iniciando {SC.SYSTEM_NAME} v{SC.SYSTEM_VERSION} - Motor de Automações")
    logger.info("=" * 60)

    # Inicializa o Agendador de Tarefas em Background (APScheduler)
    scheduler = BackgroundScheduler(daemon=True)

    # Job 1: Heartbeat a cada 60s
    scheduler.add_job(job_heartbeat, "interval", seconds=SC.INTERVAL_HEARTBEAT_SECONDS, id="job_heartbeat")

    # Job 2: Manutenção e Alertas
    scheduler.add_job(job_maintenance, "interval", seconds=SC.INTERVAL_MAINTENANCE_SECONDS, id="job_maintenance")

    scheduler.start()
    logger.info("APScheduler iniciado com sucesso.")

    # Inicia a API Flask em background thread
    api_thread = threading.Thread(target=start_flask_server, daemon=True, name="API-Server-Thread")
    api_thread.start()

    logger.info("Sistema totalmente operacional. Pressione Ctrl+C para encerrar.")

    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Encerrando motor de automações...")
        scheduler.shutdown()
        logger.info("Finalizado.")

if __name__ == "__main__":
    main()
