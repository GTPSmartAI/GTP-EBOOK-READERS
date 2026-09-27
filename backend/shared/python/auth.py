"""
Autenticação do Aedolia

- Senhas: Argon2id (argon2-cffi). Hashes antigos (SHA-256 sem sal) ainda são aceitos uma vez
  e trocados por Argon2id no mesmo login.
- Sessões: token aleatório de 256 bits entregue ao app; no banco fica só o SHA-256 dele
  (tabela user_sessions). Quem ler o banco não consegue entrar na conta. Logout apaga a sessão.
- Tentativas de login: bloqueio temporário por e-mail e por IP (em memória: o gunicorn roda 1 processo).
- Rotas protegidas usam @require_auth; o usuário da requisição fica em flask.g.user.
  O servidor nunca confia em user_id mandado pelo app.
"""

import hashlib
import hmac
import logging
import re
import secrets
import threading
import time
import unicodedata
from datetime import timedelta
from functools import wraps
from typing import Any, Dict, Optional, Tuple

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from flask import g, jsonify, request

from mariadb_client import get_mariadb_client, get_now_br

logger = logging.getLogger("Auth")

SESSION_DAYS = 30
PASSWORD_MIN = 8
PASSWORD_MAX = 256
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,29}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")

_hasher = PasswordHasher()  # Argon2id, 64 MiB, 3 iterações, 4 lanes
# Hash de uma senha qualquer: e-mail inexistente também paga o custo do Argon2 (não dá para descobrir
# quais e-mails têm conta medindo o tempo de resposta)
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


# ------------------------------------------------------------------ senhas

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: Optional[str], password: str) -> Tuple[bool, bool]:
    """Devolve (confere, precisa_rehash)."""
    if not stored_hash:
        _safe_dummy_verify(password)
        return False, False
    if re.fullmatch(r"[0-9a-f]{64}", stored_hash):
        legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy, stored_hash), True
    try:
        _hasher.verify(stored_hash, password)
        return True, _hasher.check_needs_rehash(stored_hash)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, False


def _safe_dummy_verify(password: str) -> None:
    try:
        _hasher.verify(_DUMMY_HASH, password)
    except Exception:
        pass


def password_problem(password: str) -> Optional[str]:
    """Mensagem de erro se a senha não serve, ou None."""
    if not isinstance(password, str) or len(password) < PASSWORD_MIN:
        return f"A senha precisa ter pelo menos {PASSWORD_MIN} caracteres."
    if len(password) > PASSWORD_MAX:
        return "A senha é longa demais."
    if password.lower() == password or password.upper() == password or not re.search(r"\d", password):
        return "Use letras maiúsculas, minúsculas e pelo menos um número."
    return None


# ------------------------------------------------------------------ login com Google

def google_client_ids() -> list:
    """Client IDs OAuth aceitos (GOOGLE_CLIENT_IDS no .env, separados por vírgula). O primeiro é o do site."""
    import os
    return [c.strip() for c in os.getenv("GOOGLE_CLIENT_IDS", "").split(",") if c.strip()]


def verify_google_id_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Confere o ID token do Google (assinatura pelas chaves públicas do Google, validade, emissor
    e destinatário). Devolve {sub, email, name} só se o Google verificou o e-mail.
    """
    if not token or len(token) > 4096:
        return None
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        info = id_token.verify_oauth2_token(token, google_requests.Request(), audience=google_client_ids())
    except Exception as e:
        logger.warning(f"Token do Google recusado: {e}")
        return None
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        return None
    if not info.get("email_verified") or not info.get("email") or not info.get("sub"):
        return None
    return {"sub": str(info["sub"]), "email": str(info["email"]).strip().lower(), "name": info.get("name")}


# ------------------------------------------------------------------ nome de usuário (pasta no MinIO)

def slugify(text: str, max_len: int = 30) -> str:
    """'Alexandre Guterres' -> 'alexandre-guterres' (sem acentos, só a-z 0-9 . _ -)."""
    norm = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower()
    norm = re.sub(r"[^a-z0-9._-]+", "-", norm).strip("-._")
    return norm[:max_len].strip("-._")


def unique_username(base: str) -> str:
    """Nome de usuário livre a partir de uma sugestão (acrescenta -2, -3... se já existir)."""
    db = get_mariadb_client()
    root = slugify(base) or "leitor"
    if len(root) < 3:
        root = (root + "-leitor")[:30]
    candidate = root
    n = 2
    while db.execute_one("SELECT 1 AS x FROM `users` WHERE `username` = %s LIMIT 1", (candidate,)):
        suffix = f"-{n}"
        candidate = root[: 30 - len(suffix)] + suffix
        n += 1
    return candidate


# ------------------------------------------------------------------ sessões

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = get_now_br()
    db = get_mariadb_client()
    db.execute_non_query(
        "INSERT INTO `user_sessions` (`token_hash`, `user_id`, `created_at`, `expires_at`, `last_seen_at`, `user_agent`, `ip`) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (
            _token_hash(token),
            user_id,
            now.strftime("%Y-%m-%d %H:%M:%S"),
            (now + timedelta(days=SESSION_DAYS)).strftime("%Y-%m-%d %H:%M:%S"),
            now.strftime("%Y-%m-%d %H:%M:%S"),
            (request.headers.get("User-Agent") or "")[:255],
            client_ip()[:64],
        ),
    )
    return token


def delete_session(token: str) -> None:
    th = _token_hash(token)
    with _session_cache_lock:
        _session_cache.pop(th, None)
    get_mariadb_client().execute_non_query("DELETE FROM `user_sessions` WHERE `token_hash` = %s", (th,))


def delete_user_sessions(user_id: str) -> None:
    with _session_cache_lock:
        for key in [k for k, (_, u) in _session_cache.items() if u.get("id") == user_id]:
            _session_cache.pop(key, None)
    get_mariadb_client().execute_non_query("DELETE FROM `user_sessions` WHERE `user_id` = %s", (user_id,))


# Cache curto (token -> usuário): o pré-carregamento de voz faz várias chamadas por minuto
_SESSION_CACHE_SECONDS = 60
_session_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_session_cache_lock = threading.Lock()

PUBLIC_USER_FIELDS = ("id", "email", "username", "full_name", "subscription_tier", "subscription_status",
                      "words_read_total", "created_at")


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Dados do usuário que podem ir para o app (nunca o hash da senha)."""
    out = {k: user.get(k) for k in PUBLIC_USER_FIELDS}
    # Só se existe senha / conta Google ligada (para a tela de conta), nunca os valores
    out["has_password"] = bool(user.get("password_hash"))
    out["has_google"] = bool(user.get("google_sub"))
    if out.get("created_at") is not None:
        out["created_at"] = str(out["created_at"])
    return out


def user_from_token(token: str) -> Optional[Dict[str, Any]]:
    if not token or len(token) > 200:
        return None
    th = _token_hash(token)
    now = time.monotonic()
    with _session_cache_lock:
        cached = _session_cache.get(th)
        if cached and now - cached[0] < _SESSION_CACHE_SECONDS:
            return cached[1]
    db = get_mariadb_client()
    try:
        row = db.execute_one(
            "SELECT u.*, s.`expires_at` AS `session_expires_at` FROM `user_sessions` s "
            "JOIN `users` u ON u.`id` = s.`user_id` "
            "WHERE s.`token_hash` = %s AND s.`expires_at` > %s LIMIT 1",
            (th, get_now_br().strftime("%Y-%m-%d %H:%M:%S")),
        )
        if not row:
            return None
        db.execute_non_query(
            "UPDATE `user_sessions` SET `last_seen_at` = %s WHERE `token_hash` = %s",
            (get_now_br().strftime("%Y-%m-%d %H:%M:%S"), th),
        )
    except Exception as e:
        from database import DatabaseUnavailableError
        raise DatabaseUnavailableError(str(e)) from e
    user = public_user(row)
    with _session_cache_lock:
        _session_cache[th] = (now, user)
        if len(_session_cache) > 5000:
            _session_cache.clear()
    return user


def bearer_token() -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def require_auth(view):
    """Rota só para usuário logado. O usuário fica em g.user."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = user_from_token(bearer_token() or "")
        if not user:
            return jsonify({"error": "Sessão expirada. Entre novamente.", "code": "auth_required"}), 401
        g.user = user
        return view(*args, **kwargs)
    return wrapper


def optional_auth(view):
    """Rota aberta que reconhece o usuário quando há sessão (g.user fica None sem sessão)."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        g.user = user_from_token(bearer_token() or "")
        return view(*args, **kwargs)
    return wrapper


def client_ip() -> str:
    # O ProxyFix do api_server já troca remote_addr pelo IP real vindo do Traefik
    return request.remote_addr or "?"


# ------------------------------------------------------------------ limite de tentativas

_WINDOW_SECONDS = 15 * 60
_MAX_FAILS_PER_EMAIL = 5
_MAX_FAILS_PER_IP = 25
_fails: Dict[str, list] = {}
_fails_lock = threading.Lock()


def _recent(key: str, now: float) -> list:
    stamps = [t for t in _fails.get(key, []) if now - t < _WINDOW_SECONDS]
    _fails[key] = stamps
    return stamps


def login_blocked_for(email: str) -> int:
    """Segundos até poder tentar de novo (0 = liberado)."""
    now = time.monotonic()
    with _fails_lock:
        waits = []
        for key, limit in ((f"e:{email}", _MAX_FAILS_PER_EMAIL), (f"i:{client_ip()}", _MAX_FAILS_PER_IP)):
            stamps = _recent(key, now)
            if len(stamps) >= limit:
                waits.append(int(_WINDOW_SECONDS - (now - stamps[-limit])) + 1)
        return max(waits) if waits else 0


def register_login_failure(email: str) -> None:
    now = time.monotonic()
    with _fails_lock:
        for key in (f"e:{email}", f"i:{client_ip()}"):
            _recent(key, now).append(now)
        if len(_fails) > 20000:
            _fails.clear()


def clear_login_failures(email: str) -> None:
    with _fails_lock:
        _fails.pop(f"e:{email}", None)
