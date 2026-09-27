"""
Cliente MariaDB / MySQL para Aedolia
Compatível com a skill mariadb-crm-patterns, com DictCursor, reconexão automática e fuso de Brasília.
"""

import json
import logging
import pymysql
import pymysql.cursors
from datetime import datetime
import pytz
from typing import Optional, Dict, Any, List
from config import get_settings

logger = logging.getLogger("MariaDBClient")

def get_now_br() -> datetime:
    """Retorna datetime no fuso de Brasília (America/Sao_Paulo)."""
    tz = pytz.timezone('America/Sao_Paulo')
    return datetime.now(tz)

class MariaDBClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MariaDBClient, cls).__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        self.settings = get_settings()

    def get_connection(self):
        """Abre conexão direta com o MariaDB/MySQL na VPS."""
        return pymysql.connect(
            host=self.settings.DB_HOST,
            port=self.settings.DB_PORT,
            user=self.settings.DB_USER,
            password=self.settings.DB_PASSWORD,
            database=self.settings.DB_NAME,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
            connect_timeout=8
        )

    def execute_query(self, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        """Executa SELECT e retorna lista de dicionários com retry automático."""
        import time
        last_err = None
        for attempt in range(2):
            conn = None
            try:
                conn = self.get_connection()
                with conn.cursor() as cursor:
                    cursor.execute(query, params or ())
                    rows = cursor.fetchall()
                    for row in rows:
                        for k, v in list(row.items()):
                            if isinstance(v, str) and (v.startswith('{') or v.startswith('[')):
                                try:
                                    row[k] = json.loads(v)
                                except Exception:
                                    pass
                    return list(rows)
            except Exception as e:
                last_err = e
                logger.warning(f"[MariaDB Query Retry {attempt+1}] {e}")
                time.sleep(0.3)
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        logger.error(f"[MariaDB Query Error] {query} -> {last_err}")
        raise last_err

    def execute_one(self, query: str, params: tuple = None) -> Optional[Dict[str, Any]]:
        """Executa SELECT e retorna apenas uma linha ou None."""
        rows = self.execute_query(query, params)
        return rows[0] if rows else None

    def execute_non_query(self, query: str, params: tuple = None) -> int:
        """Executa INSERT, UPDATE ou DELETE e retorna linhas afetadas com retry automático."""
        import time
        last_err = None
        for attempt in range(2):
            conn = None
            try:
                conn = self.get_connection()
                with conn.cursor() as cursor:
                    affected = cursor.execute(query, params or ())
                    return affected
            except Exception as e:
                last_err = e
                logger.warning(f"[MariaDB Exec Retry {attempt+1}] {e}")
                time.sleep(0.3)
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        logger.error(f"[MariaDB Exec Error] {query} -> {last_err}")
        raise last_err

_mariadb_client_instance = None

def get_mariadb_client() -> MariaDBClient:
    global _mariadb_client_instance
    if _mariadb_client_instance is None:
        _mariadb_client_instance = MariaDBClient()
    return _mariadb_client_instance
