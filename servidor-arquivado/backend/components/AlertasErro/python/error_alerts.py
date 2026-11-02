import os
import logging
from datetime import datetime

logger = logging.getLogger("AlertasErro")

def run_error_alerts_job():
    """Verifica arquivos de log e monitora integridade do sistema."""
    logger.debug("[Job] Verificação de saúde e integridade do sistema executada.")
    log_file = "automation.log"
    if os.path.exists(log_file):
        size_mb = os.path.getsize(log_file) / (1024 * 1024)
        if size_mb > 10:
            logger.warning(f"Arquivo automation.log atingiu {size_mb:.2f}MB. Rotação necessária.")
