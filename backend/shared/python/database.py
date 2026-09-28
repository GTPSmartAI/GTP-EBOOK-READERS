"""
Camada de Banco de Dados MariaDB para Aedolia
Conectado à VPS 2.25.124.5 / Túnel SSH no banco ebook_readers_gtp.
Padrão multi-tabela com DictCursor e fuso de Brasília.
"""

import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from mariadb_client import get_mariadb_client, get_now_br

logger = logging.getLogger("Database")


class DatabaseUnavailableError(RuntimeError):
    """
    MariaDB fora do ar (túnel SSH fechado, VPS inacessível).
    Leituras lançam este erro em vez de devolver vazio, para a API responder 503 e o
    frontend não confundir "banco fora do ar" com "usuário/livro não existe" ou "biblioteca vazia".
    """


def get_user_profile(email: Optional[str] = None, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca o perfil de um usuário por e-mail ou user_id na tabela users do MariaDB."""
    db = get_mariadb_client()
    try:
        if user_id:
            sql = "SELECT * FROM `users` WHERE `id` = %s LIMIT 1"
            return db.execute_one(sql, (user_id,))
        elif email:
            sql = "SELECT * FROM `users` WHERE `email` = %s LIMIT 1"
            return db.execute_one(sql, (email.strip().lower(),))
        return None
    except Exception as e:
        logger.error(f"Erro ao buscar perfil MariaDB (email={email}, user_id={user_id}): {e}")
        raise DatabaseUnavailableError(str(e)) from e

def create_or_update_user(user_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Cria ou atualiza usuário no MariaDB."""
    db = get_mariadb_client()
    try:
        user_id = user_data.get("id") or f"user-{int(datetime.utcnow().timestamp() * 1000)}"
        email = (user_data.get("email") or "").strip().lower()
        full_name = user_data.get("full_name") or email.split("@")[0]
        tier = user_data.get("subscription_tier", "pro")
        status = user_data.get("subscription_status", "active")

        sql = """
        INSERT INTO `users` (`id`, `email`, `full_name`, `subscription_tier`, `subscription_status`, `last_active_at`)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            `full_name` = VALUES(`full_name`),
            `subscription_tier` = VALUES(`subscription_tier`),
            `subscription_status` = VALUES(`subscription_status`),
            `last_active_at` = VALUES(`last_active_at`)
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        db.execute_non_query(sql, (user_id, email, full_name, tier, status, now))
        return get_user_profile(email=email)
    except Exception as e:
        logger.error(f"Erro ao criar/atualizar usuário no MariaDB: {e}")
        return None

def update_user_subscription(email: str, tier: str = "pro", status: str = "active") -> bool:
    """Atualiza o plano e status da assinatura de um usuário no MariaDB."""
    db = get_mariadb_client()
    try:
        sql = """
        UPDATE `users` 
        SET `subscription_tier` = %s, `subscription_status` = %s, `updated_at` = %s 
        WHERE `email` = %s
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        affected = db.execute_non_query(sql, (tier, status, now, email.strip().lower()))
        logger.info(f"Assinatura do usuário {email} atualizada no MariaDB para {tier} ({status})")
        return affected > 0
    except Exception as e:
        logger.error(f"Erro ao atualizar assinatura no MariaDB para {email}: {e}")
        return False

def record_subscription_transaction(
    email: str,
    plan: str,
    amount: float,
    gateway: str,
    transaction_id: str,
    status: str = "paid",
    payload: Optional[Dict[str, Any]] = None
) -> bool:
    """Registra uma transação de assinatura/pagamento vinda de webhook no MariaDB."""
    db = get_mariadb_client()
    try:
        import time
        sub_id = f"sub-{int(time.time() * 1000)}"
        profile = get_user_profile(email=email)
        user_id = profile['id'] if profile else None

        sql = """
        INSERT INTO `subscriptions` (`id`, `user_id`, `email`, `plan`, `amount`, `gateway`, `transaction_id`, `status`, `payload`, `created_at`)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        db.execute_non_query(sql, (
            sub_id,
            user_id,
            email.strip().lower(),
            plan,
            amount,
            gateway,
            transaction_id,
            status,
            json.dumps(payload or {}, ensure_ascii=False),
            now
        ))
        logger.info(f"Transação {transaction_id} gravada no MariaDB para {email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao registrar transação no MariaDB: {e}")
        return False

_EXTRA_COLUMNS = {
    "books": {
        "cover_image_url": "TEXT NULL",
        "is_public": "TINYINT(1) NOT NULL DEFAULT 0",
        "structure": "LONGTEXT NULL",  # JSON {version, paragraph_starts, kinds} gerado pelo text_pipeline
        # Caminhos no MinIO (bucket privado): usuarios/<username>/<titulo>_<book_id>/...
        "storage_prefix": "VARCHAR(512) NULL",
        "file_key": "VARCHAR(768) NULL",
        "cover_key": "VARCHAR(768) NULL",
        # Pasta da estante onde o usuário guardou o livro (book_folders.id); NULL = sem pasta
        "folder_id": "VARCHAR(64) NULL",
        # Sobe a cada reprocessamento do texto: o app troca a cópia guardada no aparelho quando muda
        "content_rev": "INT NOT NULL DEFAULT 0",
    },
    "users": {
        "username": "VARCHAR(64) NULL",
        # Identificador fixo da conta Google (campo "sub" do token), para o login com Google
        "google_sub": "VARCHAR(64) NULL",
    },
}

_NEW_TABLES = {
    # Uma linha por aparelho logado. Só o SHA-256 do token fica salvo.
    "user_sessions": """
        CREATE TABLE IF NOT EXISTS `user_sessions` (
          `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
          `user_id` VARCHAR(64) NOT NULL,
          `created_at` DATETIME NOT NULL,
          `expires_at` DATETIME NOT NULL,
          `last_seen_at` DATETIME NULL,
          `user_agent` VARCHAR(255) NULL,
          `ip` VARCHAR(64) NULL,
          INDEX `idx_sessions_user` (`user_id`),
          INDEX `idx_sessions_expires` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # Leitura real (palavras que a voz leu de fato e tempo ouvindo), somada por dia e por livro
    "reading_stats": """
        CREATE TABLE IF NOT EXISTS `reading_stats` (
          `user_id` VARCHAR(64) NOT NULL,
          `stat_date` DATE NOT NULL,
          `book_id` VARCHAR(64) NOT NULL,
          `words` INT NOT NULL DEFAULT 0,
          `seconds` INT NOT NULL DEFAULT 0,
          `updated_at` DATETIME NULL,
          PRIMARY KEY (`user_id`, `stat_date`, `book_id`),
          INDEX `idx_stats_user_date` (`user_id`, `stat_date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # Pastas que o usuário cria para organizar a estante (só organização: não mexe no MinIO)
    "book_folders": """
        CREATE TABLE IF NOT EXISTS `book_folders` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `user_id` VARCHAR(64) NOT NULL,
          `name` VARCHAR(80) NOT NULL,
          `created_at` DATETIME NOT NULL,
          INDEX `idx_folders_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
}


def ensure_schema() -> None:
    """Cria tabelas e colunas novas (idempotente) e dá nome de usuário a quem ainda não tem."""
    db = get_mariadb_client()
    try:
        for table, ddl in _NEW_TABLES.items():
            db.execute_non_query(ddl)
        for table, columns in _EXTRA_COLUMNS.items():
            rows = db.execute_query(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
                (table,),
            )
            existing = {r["COLUMN_NAME"] for r in rows}
            if not existing:
                continue  # tabela ainda não criada: o schema_mariadb.sql já traz as colunas
            for column, col_ddl in columns.items():
                if column not in existing:
                    db.execute_non_query(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {col_ddl}")
                    logger.info(f"Coluna {table}.{column} criada no MariaDB.")
        indexes = {r["INDEX_NAME"] for r in db.execute_query(
            "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
        )}
        if "uk_users_username" not in indexes:
            _backfill_usernames()
            db.execute_non_query("ALTER TABLE `users` ADD UNIQUE KEY `uk_users_username` (`username`)")
        else:
            _backfill_usernames()
        if "uk_users_google_sub" not in indexes:
            db.execute_non_query("ALTER TABLE `users` ADD UNIQUE KEY `uk_users_google_sub` (`google_sub`)")
        # Livros são sempre privados (a opção de publicar foi removida): nenhum fica marcado como público
        db.execute_non_query("UPDATE `books` SET `is_public` = 0 WHERE `is_public` <> 0")
    except Exception as e:
        logger.error(f"Não foi possível verificar/migrar o schema do banco: {e}")


# Compatibilidade com o nome antigo
ensure_books_schema = ensure_schema


def _backfill_usernames() -> None:
    from auth import unique_username
    db = get_mariadb_client()
    for u in db.execute_query("SELECT `id`, `email`, `full_name` FROM `users` WHERE `username` IS NULL OR `username` = ''"):
        base = (u.get("full_name") or "").split(" ")[0] or (u.get("email") or "").split("@")[0]
        name = unique_username(base)
        db.execute_non_query("UPDATE `users` SET `username` = %s WHERE `id` = %s", (name, u["id"]))
        logger.info(f"Usuário {u['id']} recebeu o nome de usuário '{name}'.")


def save_book(book_data: Dict[str, Any]) -> bool:
    """Salva ou atualiza um livro no MariaDB."""
    db = get_mariadb_client()
    try:
        book_id = book_data.get("id")
        user_id = book_data.get("user_id")
        title = book_data.get("title", "Sem Título")
        author = book_data.get("author", "Autor Desconhecido")
        cover_gradient = book_data.get("cover_gradient", "linear-gradient(135deg, #10b981 0%, #059669 100%)")
        cover_image_url = book_data.get("cover_image_url") or book_data.get("coverImage")
        b_type = book_data.get("type", "pdf")
        content = book_data.get("content", "")
        sentences = book_data.get("sentences", [])
        chapters = book_data.get("chapters", [])
        structure = book_data.get("structure")
        total_words = int(book_data.get("total_words", 0))
        duration_minutes = int(book_data.get("duration_minutes", 0))
        file_url = book_data.get("file_url")

        # Serializa JSON
        sentences_str = json.dumps(sentences, ensure_ascii=False) if isinstance(sentences, (list, dict)) else str(sentences or "[]")
        chapters_str = json.dumps(chapters, ensure_ascii=False) if isinstance(chapters, (list, dict)) else str(chapters or "[]")
        structure_str = json.dumps(structure, ensure_ascii=False) if isinstance(structure, dict) else structure

        is_public = 0  # todo livro é privado

        sql = """
        INSERT INTO `books`
            (`id`, `user_id`, `title`, `author`, `cover_gradient`, `cover_image_url`, `type`, `content`, `sentences`, `chapters`, `structure`, `total_words`, `duration_minutes`, `file_url`, `is_public`, `created_at`,
             `storage_prefix`, `file_key`, `cover_key`)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            `storage_prefix` = VALUES(`storage_prefix`),
            `file_key` = VALUES(`file_key`),
            `cover_key` = VALUES(`cover_key`),
            `title` = VALUES(`title`),
            `author` = VALUES(`author`),
            `cover_gradient` = VALUES(`cover_gradient`),
            `cover_image_url` = VALUES(`cover_image_url`),
            `content` = VALUES(`content`),
            `sentences` = VALUES(`sentences`),
            `chapters` = VALUES(`chapters`),
            `structure` = VALUES(`structure`),
            `total_words` = VALUES(`total_words`),
            `duration_minutes` = VALUES(`duration_minutes`),
            `file_url` = VALUES(`file_url`),
            `is_public` = VALUES(`is_public`)
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        db.execute_non_query(sql, (
            book_id,
            user_id,
            title,
            author,
            cover_gradient,
            cover_image_url,
            b_type,
            content,
            sentences_str,
            chapters_str,
            structure_str,
            total_words,
            duration_minutes,
            file_url,
            is_public,
            now,
            book_data.get("storage_prefix"),
            book_data.get("file_key"),
            book_data.get("cover_key"),
        ))
        logger.info(f"Livro '{title}' ({book_id}) salvo com sucesso no MariaDB.")
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar livro no MariaDB: {e}")
        return False

def get_book_by_id(book_id: str) -> Optional[Dict[str, Any]]:
    """Busca o livro com conteúdo completo pelo ID no MariaDB."""
    db = get_mariadb_client()
    try:
        sql = "SELECT * FROM `books` WHERE `id` = %s LIMIT 1"
        return db.execute_one(sql, (book_id,))
    except Exception as e:
        logger.error(f"Erro ao buscar livro {book_id} no MariaDB: {e}")
        raise DatabaseUnavailableError(str(e)) from e

def get_user_books(user_id: str, include_content: bool = False) -> List[Dict[str, Any]]:
    """
    Livros do usuário logado, com o progresso de leitura dele.
    Todo livro é privado: não existe livro público nem estante compartilhada.
    """
    if not user_id:
        return []
    db = get_mariadb_client()
    try:
        base_cols = "b.`id`, b.`user_id`, b.`title`, b.`author`, b.`cover_gradient`, b.`cover_image_url`, b.`cover_key`, b.`file_key`, b.`storage_prefix`, b.`folder_id`, b.`content_rev`, b.`type`, b.`total_words`, b.`duration_minutes`, b.`file_url`, b.`created_at`, COALESCE(rp.`progress_percentage`, 0) AS `reading_progress`, COALESCE(rp.`last_sentence_index`, 0) AS `last_read_sentence_index`"
        cols = "b.*, COALESCE(rp.`progress_percentage`, 0) AS `reading_progress`, COALESCE(rp.`last_sentence_index`, 0) AS `last_read_sentence_index`" if include_content else base_cols
        join_clause = "LEFT JOIN `reading_progress` rp ON b.`id` = rp.`book_id` AND rp.`user_id` = %s"
        sql = f"SELECT {cols} FROM `books` b {join_clause} WHERE b.`user_id` = %s ORDER BY b.`created_at` DESC"
        return db.execute_query(sql, (user_id, user_id))
    except Exception as e:
        logger.error(f"Erro ao buscar livros no MariaDB (user_id={user_id}): {e}")
        raise DatabaseUnavailableError(str(e)) from e


def get_book_meta(book_id: str) -> Optional[Dict[str, Any]]:
    """Dados leves do livro para checar acesso e achar os arquivos (sem o texto)."""
    db = get_mariadb_client()
    try:
        return db.execute_one(
            "SELECT `id`, `user_id`, `title`, `is_public`, `cover_image_url`, `file_url`, `storage_prefix`, `file_key`, `cover_key` "
            "FROM `books` WHERE `id` = %s LIMIT 1",
            (book_id,),
        )
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def update_book_storage(book_id: str, storage_prefix: str, file_key: Optional[str], cover_key: Optional[str]) -> None:
    """Grava os caminhos novos no MinIO (usado pela migração de pastas)."""
    get_mariadb_client().execute_non_query(
        "UPDATE `books` SET `storage_prefix` = %s, `file_key` = %s, `cover_key` = %s WHERE `id` = %s",
        (storage_prefix, file_key, cover_key, book_id),
    )


def delete_book_from_db(book_id: str, user_id: str) -> bool:
    """Remove um livro do MariaDB (só do dono)."""
    db = get_mariadb_client()
    try:
        sql = "DELETE FROM `books` WHERE `id` = %s AND `user_id` = %s"
        affected = db.execute_non_query(sql, (book_id, user_id))
        return affected > 0
    except Exception as e:
        logger.error(f"Erro ao deletar livro {book_id} do MariaDB: {e}")
        return False

# ------------------------------------------------------------------ pastas da estante

def get_user_folders(user_id: str) -> List[Dict[str, Any]]:
    try:
        return get_mariadb_client().execute_query(
            "SELECT `id`, `name`, `created_at` FROM `book_folders` WHERE `user_id` = %s ORDER BY `name`", (user_id,)
        )
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def get_folder(folder_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """A pasta, só se for deste usuário."""
    try:
        return get_mariadb_client().execute_one(
            "SELECT `id`, `name`, `created_at` FROM `book_folders` WHERE `id` = %s AND `user_id` = %s LIMIT 1",
            (folder_id, user_id),
        )
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def folder_name_taken(user_id: str, name: str, except_id: Optional[str] = None) -> bool:
    row = get_mariadb_client().execute_one(
        "SELECT `id` FROM `book_folders` WHERE `user_id` = %s AND LOWER(`name`) = LOWER(%s) AND `id` <> %s LIMIT 1",
        (user_id, name, except_id or ""),
    )
    return bool(row)


def create_folder(user_id: str, name: str) -> Dict[str, Any]:
    import secrets
    folder_id = f"folder-{secrets.token_hex(8)}"
    get_mariadb_client().execute_non_query(
        "INSERT INTO `book_folders` (`id`, `user_id`, `name`, `created_at`) VALUES (%s, %s, %s, %s)",
        (folder_id, user_id, name, get_now_br().strftime("%Y-%m-%d %H:%M:%S")),
    )
    return get_folder(folder_id, user_id)


def rename_folder(folder_id: str, user_id: str, name: str) -> bool:
    return get_mariadb_client().execute_non_query(
        "UPDATE `book_folders` SET `name` = %s WHERE `id` = %s AND `user_id` = %s", (name, folder_id, user_id)
    ) > 0


def delete_folder(folder_id: str, user_id: str) -> bool:
    """Apaga a pasta. Os livros dela não são apagados: voltam para "sem pasta"."""
    db = get_mariadb_client()
    db.execute_non_query(
        "UPDATE `books` SET `folder_id` = NULL WHERE `folder_id` = %s AND `user_id` = %s", (folder_id, user_id)
    )
    return db.execute_non_query(
        "DELETE FROM `book_folders` WHERE `id` = %s AND `user_id` = %s", (folder_id, user_id)
    ) > 0


def set_book_folder(book_id: str, user_id: str, folder_id: Optional[str]) -> bool:
    """Coloca o livro numa pasta (ou tira de todas, com None). Só o dono."""
    return get_mariadb_client().execute_non_query(
        "UPDATE `books` SET `folder_id` = %s WHERE `id` = %s AND `user_id` = %s", (folder_id, book_id, user_id)
    ) > 0


def save_reading_progress(user_id: str, book_id: str, last_sentence_index: int, progress_percentage: int) -> bool:
    """Salva o progresso de leitura no MariaDB."""
    db = get_mariadb_client()
    try:
        import time
        prog_id = f"prog-{int(time.time() * 1000)}"
        sql = """
        INSERT INTO `reading_progress` (`id`, `user_id`, `book_id`, `last_sentence_index`, `progress_percentage`, `updated_at`)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            `last_sentence_index` = VALUES(`last_sentence_index`),
            `progress_percentage` = VALUES(`progress_percentage`),
            `updated_at` = VALUES(`updated_at`)
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        db.execute_non_query(sql, (prog_id, user_id, book_id, last_sentence_index, progress_percentage, now))
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar progresso no MariaDB: {e}")
        return False

def get_user_for_login(email: str) -> Optional[Dict[str, Any]]:
    """Usuário com o hash da senha (uso interno do login; nunca devolver ao app)."""
    try:
        return get_mariadb_client().execute_one(
            "SELECT * FROM `users` WHERE `email` = %s LIMIT 1", (email.strip().lower(),)
        )
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def set_user_password(user_id: str, password_hash: str) -> None:
    now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
    get_mariadb_client().execute_non_query(
        "UPDATE `users` SET `password_hash` = %s, `updated_at` = %s WHERE `id` = %s", (password_hash, now, user_id)
    )


def get_user_by_google_sub(sub: str) -> Optional[Dict[str, Any]]:
    try:
        return get_mariadb_client().execute_one("SELECT * FROM `users` WHERE `google_sub` = %s LIMIT 1", (sub,))
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def link_google_account(user_id: str, sub: str) -> None:
    get_mariadb_client().execute_non_query("UPDATE `users` SET `google_sub` = %s WHERE `id` = %s", (sub, user_id))


def touch_user(user_id: str) -> None:
    now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
    get_mariadb_client().execute_non_query("UPDATE `users` SET `last_active_at` = %s WHERE `id` = %s", (now, user_id))


def username_exists(username: str) -> bool:
    return bool(get_mariadb_client().execute_one("SELECT 1 AS x FROM `users` WHERE `username` = %s LIMIT 1", (username,)))


def create_user(email: str, password_hash: str, full_name: str, username: str) -> Dict[str, Any]:
    """Cria a conta (plano gratuito). Lança erro se o e-mail ou o nome de usuário já existirem."""
    import secrets
    db = get_mariadb_client()
    user_id = f"user-{secrets.token_hex(8)}"
    now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
    db.execute_non_query(
        "INSERT INTO `users` (`id`, `email`, `username`, `password_hash`, `full_name`, `subscription_tier`, `subscription_status`, "
        "`words_read_total`, `daily_words_read`, `last_active_at`, `created_at`) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (user_id, email.strip().lower(), username, password_hash, full_name, "free", "active", 0, 0, now, now),
    )
    return get_user_profile(user_id=user_id)


# ------------------------------------------------------------------ estatísticas de leitura

def add_reading_stats(user_id: str, book_id: str, words: int, seconds: int) -> None:
    """Soma palavras lidas e segundos ouvindo no dia de hoje (horário de Brasília)."""
    now = get_now_br()
    db = get_mariadb_client()
    db.execute_non_query(
        "INSERT INTO `reading_stats` (`user_id`, `stat_date`, `book_id`, `words`, `seconds`, `updated_at`) "
        "VALUES (%s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE "
        "`words` = `words` + VALUES(`words`), `seconds` = `seconds` + VALUES(`seconds`), `updated_at` = VALUES(`updated_at`)",
        (user_id, now.date().isoformat(), book_id, words, seconds, now.strftime("%Y-%m-%d %H:%M:%S")),
    )
    if words:
        db.execute_non_query(
            "UPDATE `users` SET `words_read_total` = COALESCE(`words_read_total`, 0) + %s WHERE `id` = %s", (words, user_id)
        )


def get_reading_stats_rows(user_id: str, start: str, end: str) -> List[Dict[str, Any]]:
    """Linhas (dia, livro, palavras, segundos) entre start e end (inclusive), com o título do livro."""
    try:
        return get_mariadb_client().execute_query(
            "SELECT s.`stat_date`, s.`book_id`, s.`words`, s.`seconds`, b.`title` FROM `reading_stats` s "
            "LEFT JOIN `books` b ON b.`id` = s.`book_id` "
            "WHERE s.`user_id` = %s AND s.`stat_date` BETWEEN %s AND %s ORDER BY s.`stat_date`",
            (user_id, start, end),
        )
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e


def get_reading_totals(user_id: str) -> Dict[str, Any]:
    """Total de sempre e os dias com leitura (para a sequência de dias seguidos)."""
    try:
        db = get_mariadb_client()
        total = db.execute_one(
            "SELECT COALESCE(SUM(`words`), 0) AS words, COALESCE(SUM(`seconds`), 0) AS seconds FROM `reading_stats` WHERE `user_id` = %s",
            (user_id,),
        ) or {}
        days = db.execute_query(
            "SELECT DISTINCT `stat_date` FROM `reading_stats` WHERE `user_id` = %s AND (`words` > 0 OR `seconds` >= 30) "
            "ORDER BY `stat_date` DESC LIMIT 400",
            (user_id,),
        )
        return {"words": int(total.get("words") or 0), "seconds": int(total.get("seconds") or 0),
                "days": [d["stat_date"] for d in days]}
    except Exception as e:
        raise DatabaseUnavailableError(str(e)) from e

def save_cloned_voice_to_db(voice_data: Dict[str, Any]) -> bool:
    """Salva metadados de voz clonada na tabela cloned_voices do MariaDB."""
    db = get_mariadb_client()
    try:
        sql = """
        INSERT INTO `cloned_voices` 
            (`id`, `user_id`, `name`, `gender`, `style`, `pitch`, `rate`, `cadence`, `base_voice`, `sample_audio_url`, `metadata`, `created_at`)
        VALUES 
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            `name` = VALUES(`name`),
            `pitch` = VALUES(`pitch`),
            `rate` = VALUES(`rate`),
            `cadence` = VALUES(`cadence`),
            `metadata` = VALUES(`metadata`)
        """
        now = get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        db.execute_non_query(sql, (
            voice_data.get("id"),
            voice_data.get("userId") or "system",
            voice_data.get("name", "Voz Personalizada"),
            voice_data.get("gender", "male"),
            voice_data.get("tag", "Personalizado"),
            voice_data.get("pitch", "-5Hz"),
            voice_data.get("rate", "-2%"),
            voice_data.get("cadence", "natural"),
            voice_data.get("edge_voice", "pt-BR-AntonioNeural"),
            voice_data.get("sampleAudioUrl", ""),
            json.dumps(voice_data, ensure_ascii=False),
            now
        ))
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar voz clonada no MariaDB: {e}")
        return False

def get_cloned_voices_from_db(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Busca vozes clonadas no MariaDB."""
    db = get_mariadb_client()
    try:
        if user_id:
            sql = "SELECT * FROM `cloned_voices` WHERE `user_id` = %s OR `user_id` = 'system' ORDER BY `created_at` DESC"
            return db.execute_query(sql, (user_id,))
        else:
            sql = "SELECT * FROM `cloned_voices` ORDER BY `created_at` DESC"
            return db.execute_query(sql)
    except Exception as e:
        logger.error(f"Erro ao buscar vozes no MariaDB: {e}")
        return []

def get_system_counts() -> Dict[str, int]:
    """Retorna estatísticas globais do MariaDB."""
    db = get_mariadb_client()
    try:
        u_res = db.execute_one("SELECT COUNT(*) as count FROM `users`")
        b_res = db.execute_one("SELECT COUNT(*) as count FROM `books`")
        return {
            "users_count": u_res["count"] if u_res else 0,
            "books_count": b_res["count"] if b_res else 0
        }
    except Exception as e:
        logger.error(f"Erro ao obter contagens do MariaDB: {e}")
        return {"users_count": 0, "books_count": 0}

