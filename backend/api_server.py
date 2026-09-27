"""
Aedolia - Flask API Server
Estrutura modular inspirada no padrão de GTP-TESTE-SISTEMA conectada ao MariaDB e MinIO S3.

Segurança:
- Toda rota com dados de usuário exige sessão (@require_auth, token Bearer). O usuário vem do token,
  nunca de um user_id mandado pelo app.
- Todo livro é privado: só o dono vê, abre, ouve e apaga. Não existe livro público.
- Arquivos ficam num bucket privado do MinIO, em usuarios/<username>/<titulo>_<book_id>/.
"""

import os
import sys
from pathlib import Path
from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

# Adiciona diretórios ao sys.path para resolução limpa de módulos
_BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_BASE_DIR / "shared" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "ProcessadorLivros" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "GestaoAssinaturas" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "SinteseVoz" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "AssistenteIA" / "python"))
sys.path.insert(0, str(_BASE_DIR / "components" / "AlertasErro" / "python"))

from config import get_settings
from database import (
    save_book,
    get_user_books,
    get_book_by_id,
    get_book_meta,
    delete_book_from_db,
    save_reading_progress,
    get_system_counts,
    ensure_schema,
    get_user_for_login,
    set_user_password,
    touch_user,
    username_exists,
    create_user,
    get_user_by_google_sub,
    link_google_account,
    add_reading_stats,
    get_reading_stats_rows,
    get_reading_totals,
    DatabaseUnavailableError
)
from auth import (
    require_auth,
    hash_password,
    verify_password,
    password_problem,
    create_session,
    delete_session,
    delete_user_sessions,
    bearer_token,
    public_user,
    slugify,
    login_blocked_for,
    register_login_failure,
    clear_login_failures,
    unique_username,
    verify_google_id_token,
    google_client_ids,
    EMAIL_RE,
    USERNAME_RE,
)
from subscription_service import process_incoming_payment_webhook
from ai_service import answer_book_question
from pdf_extractor import extract_book, UnsupportedDocumentError

# Origens do app que podem chamar a API: site, app Android (Capacitor) e desenvolvimento local
_DEFAULT_ORIGINS = "https://ebook.iagtp.com.br,https://localhost,capacitor://localhost,http://localhost:5173,http://127.0.0.1:5173"


def create_app() -> Flask:
    """Fábrica de aplicação Flask com rotas e CORS conectada ao MariaDB."""
    app = Flask(__name__)
    # Atrás do Traefik: o IP real do visitante vem no X-Forwarded-For (usado no limite de tentativas de login)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]
    # X-Content-Size: tamanho descompactado do livro, lido pelo app para mostrar o progresso do download
    CORS(app, resources={r"/api/*": {"origins": origins}}, expose_headers=["X-Content-Size"])

    settings = get_settings()
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB limite para PDFs e EPUBs volumosos
    # Campos de texto do formulário (não arquivos) têm limite próprio, 500 KB por padrão no Flask 3.1.
    # A capa vai em base64 no campo cover_base64 e capas de EPUB passam disso (erro 413).
    app.config['MAX_FORM_MEMORY_SIZE'] = 25 * 1024 * 1024

    # Diretórios de armazenamento de arquivos locais
    books_upload_dir = settings.UPLOAD_DIR / "books"
    books_upload_dir.mkdir(parents=True, exist_ok=True)
    extracted_dir = settings.UPLOAD_DIR / "extracted"
    extracted_dir.mkdir(parents=True, exist_ok=True)

    # Tabelas e colunas novas (sessões, estatísticas, nome de usuário, caminhos no MinIO)
    ensure_schema()

    @app.errorhandler(DatabaseUnavailableError)
    def database_unavailable(_err):
        return jsonify({
            "error": "Banco de dados indisponível no momento. Tente novamente em instantes."
        }), 503

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        if request.path.startswith("/api/auth/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    # 1. Health check
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "online",
            "service": "Aedolia API (Python/Flask)",
            "version": "3.0.0",
        })

    # ------------------------------------------------------------------ 1.1 Contas e sessões
    def _session_response(user: dict, status: int = 200):
        token = create_session(user["id"])
        return jsonify({"success": True, "token": token, "user": public_user(user)}), status

    @app.route("/api/auth/register", methods=["POST"])
    def auth_register():
        data = request.get_json(silent=True) or {}
        email = str(data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        full_name = str(data.get("full_name") or data.get("name") or "").strip()[:120]
        username = str(data.get("username") or "").strip().lower()

        if not EMAIL_RE.match(email):
            return jsonify({"error": "Digite um e-mail válido."}), 400
        if not full_name:
            return jsonify({"error": "Digite seu nome."}), 400
        if not USERNAME_RE.match(username):
            return jsonify({"error": "O nome de usuário precisa ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _."}), 400
        problem = password_problem(password)
        if problem:
            return jsonify({"error": problem}), 400
        if get_user_for_login(email):
            return jsonify({"error": "Este e-mail já tem conta. Entre com sua senha."}), 409
        if username_exists(username):
            return jsonify({"error": "Esse nome de usuário já está em uso. Escolha outro."}), 409

        try:
            user = create_user(email, hash_password(password), full_name, username)
        except Exception as e:
            print(f"[Auth] Falha ao criar conta: {e}")
            return jsonify({"error": "Não foi possível criar a conta. Tente de novo."}), 500
        return _session_response(user, 201)

    @app.route("/api/auth/login", methods=["POST"])
    def auth_login():
        data = request.get_json(silent=True) or {}
        email = str(data.get("email") or "").strip().lower()[:254]
        password = data.get("password") or ""
        if not email or not isinstance(password, str) or not password or len(password) > 256:
            return jsonify({"error": "Digite e-mail e senha."}), 400

        wait = login_blocked_for(email)
        if wait:
            minutes = max(1, round(wait / 60))
            resp = jsonify({"error": f"Muitas tentativas erradas. Tente de novo em {minutes} min."})
            resp.headers["Retry-After"] = str(wait)
            return resp, 429

        user = get_user_for_login(email)
        ok, needs_rehash = verify_password(user.get("password_hash") if user else None, password)
        if not user or not ok:
            register_login_failure(email)
            return jsonify({"error": "E-mail ou senha incorretos."}), 401

        clear_login_failures(email)
        if needs_rehash:
            set_user_password(user["id"], hash_password(password))
        touch_user(user["id"])
        return _session_response(user)

    @app.route("/api/auth/google/config", methods=["GET"])
    def auth_google_config():
        """ID do cliente Google que o app usa no botão (é público; vai no HTML de qualquer site)."""
        ids = google_client_ids()
        return jsonify({"enabled": bool(ids), "client_id": ids[0] if ids else None})

    @app.route("/api/auth/google", methods=["POST"])
    def auth_google():
        """
        Login com Google. O app manda o ID token que o Google entregou; o servidor confere a assinatura,
        o destinatário (nosso client ID) e se o e-mail foi verificado pelo Google.
        Conta nova é criada na hora; conta com o mesmo e-mail é ligada ao Google.
        """
        if not google_client_ids():
            return jsonify({"error": "Login com Google ainda não está configurado."}), 503
        data = request.get_json(silent=True) or {}
        info = verify_google_id_token(str(data.get("id_token") or data.get("credential") or ""))
        if not info:
            return jsonify({"error": "Não foi possível confirmar sua conta Google. Tente de novo."}), 401

        sub, email = info["sub"], info["email"]
        user = get_user_by_google_sub(sub)
        if not user:
            user = get_user_for_login(email)
            if not user:
                full_name = (info.get("name") or email.split("@")[0]).strip()[:120]
                try:
                    user = create_user(email, "", full_name, unique_username(email.split("@")[0]))
                except Exception as e:
                    print(f"[Auth] Falha ao criar conta Google: {e}")
                    return jsonify({"error": "Não foi possível criar a conta. Tente de novo."}), 500
            link_google_account(user["id"], sub)
            user["google_sub"] = sub
        clear_login_failures(user["email"])
        touch_user(user["id"])
        return _session_response(user)

    @app.route("/api/auth/logout", methods=["POST"])
    def auth_logout():
        token = bearer_token()
        if token:
            delete_session(token)
        return jsonify({"success": True})

    @app.route("/api/auth/me", methods=["GET"])
    @require_auth
    def auth_me():
        return jsonify({"user": g.user})

    @app.route("/api/auth/change-password", methods=["POST"])
    @require_auth
    def auth_change_password():
        data = request.get_json(silent=True) or {}
        current = data.get("current_password") or ""
        new = data.get("new_password") or ""
        user = get_user_for_login(g.user["email"])
        # Conta criada pelo Google ainda não tem senha: pode criar uma sem informar a atual
        has_password = bool(user and user.get("password_hash"))
        ok, _ = verify_password(user.get("password_hash") if user else None, current) if has_password else (bool(user), False)
        if not ok:
            return jsonify({"error": "A senha atual está incorreta."}), 400
        problem = password_problem(new)
        if problem:
            return jsonify({"error": problem}), 400
        set_user_password(g.user["id"], hash_password(new))
        # Desconecta todos os aparelhos e devolve uma sessão nova para este
        delete_user_sessions(g.user["id"])
        return _session_response(user)

    # 2. Webhook de Pagamento e Assinaturas (n8n, Kiwify, Asaas, Stripe, Hotmart)
    @app.route("/api/webhooks/payment", methods=["POST"])
    def webhook_payment():
        payload = request.get_json(silent=True) or {}
        success, message, details = process_incoming_payment_webhook(payload)
        status_code = 200 if success else 400
        return jsonify({
            "success": success,
            "message": message,
            "details": details
        }), status_code

    # ------------------------------------------------------------------ livros: acesso e arquivos
    from minio_storage import presigned_url, object_key_from_url

    _INTERNAL_BOOK_FIELDS = ("cover_key", "file_key", "storage_prefix", "file_url", "is_public")

    def _cover_key(book: dict):
        return book.get("cover_key") or object_key_from_url(book.get("cover_image_url"))

    def _book_for_app(book: dict) -> dict:
        """Livro como vai para o app: capa por link assinado, sem caminhos internos."""
        out = {k: v for k, v in book.items() if k not in _INTERNAL_BOOK_FIELDS}
        key = _cover_key(book)
        if key:
            out["cover_image_url"] = presigned_url(key)
        elif str(book.get("cover_image_url") or "").startswith("data:"):
            out["cover_image_url"] = book["cover_image_url"]
        else:
            out["cover_image_url"] = None
        if out.get("created_at") is not None:
            out["created_at"] = str(out["created_at"])
        return out

    def _can_read(meta: dict) -> bool:
        return bool(meta) and meta.get("user_id") == g.user["id"]

    def _book_folder(username: str, title: str, book_id: str) -> str:
        return f"usuarios/{username}/{slugify(title, 60) or 'livro'}_{book_id}"

    # 4. Upload e Extração de PDF/EPUB com persistência no MinIO S3 e MariaDB
    @app.route("/api/books/upload", methods=["POST"])
    @require_auth
    def upload_book():
        if "file" not in request.files:
            return jsonify({"error": "Nenhum arquivo enviado"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "Nome de arquivo inválido"}), 400

        import re
        import time
        import json
        from minio_storage import upload_file_to_minio

        user_id = g.user["id"]
        username = g.user.get("username") or slugify(g.user["email"].split("@")[0])
        title = (request.form.get("title") or file.filename.rsplit(".", 1)[0]).strip()[:250]
        author = (request.form.get("author") or "Autor Desconhecido").strip()[:250]

        book_id = f"book-{int(time.time() * 1000)}"
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename)
        persisted_filename = f"{book_id}_{safe_name}"
        permanent_path = books_upload_dir / persisted_filename
        file.save(str(permanent_path))

        try:
            extracted = extract_book(str(permanent_path))
            cover_bytes = extracted["cover_bytes"]
            cover_mime = extracted["cover_mime"]

            # Se o frontend enviou uma capa renderizada via canvas/pdfjs em multipart ou base64
            if not cover_bytes and "cover_image" in request.files:
                try:
                    c_file = request.files["cover_image"]
                    cover_bytes = c_file.read()
                    cover_mime = c_file.mimetype or "image/jpeg"
                except Exception:
                    pass
            elif not cover_bytes and request.form.get("cover_base64"):
                try:
                    import base64
                    b64_str = request.form.get("cover_base64")
                    if "," in b64_str:
                        b64_str = b64_str.split(",", 1)[1]
                    cover_bytes = base64.b64decode(b64_str)
                    cover_mime = "image/jpeg"
                except Exception:
                    pass

            doc_type = extracted["doc_type"]
            mime_type = {
                "epub": "application/epub+zip",
                "pdf": "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "html": "text/html",
            }.get(doc_type, "text/plain")

            # Pasta do livro no MinIO: usuarios/<username>/<titulo>_<book_id>/
            folder = _book_folder(username, title, book_id)
            ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else doc_type

            cover_key = None
            if cover_bytes:
                cover_ext = "png" if (cover_mime and "png" in cover_mime) else "jpg"
                if upload_file_to_minio(cover_bytes, f"{folder}/capa.{cover_ext}", cover_mime or "image/jpeg"):
                    cover_key = f"{folder}/capa.{cover_ext}"

            file_key = None
            if upload_file_to_minio(permanent_path, f"{folder}/livro.{ext}", mime_type):
                file_key = f"{folder}/livro.{ext}"

            full_data_payload = {
                "id": book_id,
                "user_id": user_id,
                "title": title,
                "author": author,
                "type": doc_type,
                "content": extracted["content"],
                "sentences": extracted["sentences"],
                "chapters": extracted["chapters"],
                "structure": extracted["structure"],
                "total_words": extracted["total_words"],
                "duration_minutes": extracted["duration_minutes"],
                "cover_gradient": "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                "cover_image_url": None,
                "file_url": None,
                "storage_prefix": folder,
                "file_key": file_key,
                "cover_key": cover_key,
            }

            # Cache local estruturado (o conteúdo é servido daqui, compactado)
            with open(extracted_dir / f"{book_id}.json", "w", encoding="utf-8") as ef:
                json.dump(full_data_payload, ef, ensure_ascii=False)

            # Cópia do texto extraído na pasta do livro, para ele ficar completo no MinIO
            try:
                upload_file_to_minio(
                    json.dumps(full_data_payload, ensure_ascii=False).encode("utf-8"),
                    f"{folder}/texto-extraido.json",
                    "application/json",
                )
            except Exception as j_err:
                print(f"[MinIO JSON Sync Warning] {j_err}")

            db_saved = save_book(full_data_payload)
            if not db_saved:
                print(f"[Upload Warning] Livro {book_id} ficou só no cache local: falha ao gravar no MariaDB")

            book_out = _book_for_app({k: v for k, v in full_data_payload.items() if k != "content"})
            return jsonify({"success": True, "book": book_out, "db_saved": db_saved})
        except UnsupportedDocumentError as doc_err:
            return jsonify({"error": str(doc_err)}), 422
        except Exception as err:
            print(f"[Upload Error] Erro no processamento do livro: {err}")
            return jsonify({"error": "Não foi possível processar o arquivo."}), 500

    # 5. Estante: só os livros do usuário logado (todo livro é privado)
    @app.route("/api/books", methods=["GET"])
    @require_auth
    def list_books():
        books = get_user_books(user_id=g.user["id"])
        return jsonify({"books": [_book_for_app(b) for b in books]})

    # 5.1 Deletar Livro (MariaDB + MinIO) — só o dono
    @app.route("/api/books/<book_id>", methods=["DELETE"])
    @require_auth
    def delete_book(book_id):
        from minio_storage import delete_file_from_minio, delete_prefix
        meta = get_book_meta(book_id)
        if not meta or meta.get("user_id") != g.user["id"]:
            return jsonify({"error": "Livro não encontrado na sua estante."}), 404

        try:
            if meta.get("storage_prefix"):
                delete_prefix(meta["storage_prefix"])
            else:
                # Livros enviados antes das pastas por usuário
                for key in (object_key_from_url(meta.get("file_url")), _cover_key(meta), f"extracted/{book_id}.json"):
                    if key:
                        delete_file_from_minio(key)
        except Exception as m_err:
            print(f"Erro ao remover do MinIO: {m_err}")

        delete_book_from_db(book_id, g.user["id"])

        extracted = settings.UPLOAD_DIR / "extracted"
        for leftover in (f"{book_id}.json", f"{book_id}.content.json.gz", f"{book_id}.content.json.gz.size"):
            if (extracted / leftover).exists():
                try:
                    os.remove(str(extracted / leftover))
                except Exception:
                    pass
        for original in books_upload_dir.glob(f"{book_id}_*"):
            try:
                original.unlink()
            except Exception:
                pass

        return jsonify({"success": True})

    def _send_book_content(book: dict, cache_path: Path | None):
        """
        Resposta do conteúdo do livro, compactada em gzip.
        Livros grandes passam de 50 MB em JSON; sem o texto corrido duplicado ("content", que o app
        não usa) e com gzip ficam por volta de 1/7 disso. A versão compactada fica em disco.
        """
        import gzip
        import json
        book = {k: v for k, v in book.items()
                if k not in ("content", "cover_image_url") and k not in _INTERNAL_BOOK_FIELDS}
        if book.get("created_at") is not None:
            book["created_at"] = str(book["created_at"])
        payload = json.dumps({"success": True, "book": book}, ensure_ascii=False).encode("utf-8")
        if cache_path is not None:
            try:
                tmp = cache_path.with_suffix(".tmp")
                with gzip.open(tmp, "wb", compresslevel=6) as gz:
                    gz.write(payload)
                # Tamanho descompactado, para o app mostrar o progresso do download
                (cache_path.parent / (cache_path.name + ".size")).write_text(str(len(payload)))
                os.replace(tmp, cache_path)
                return _send_gzip_file(cache_path, len(payload))
            except Exception as e:
                print(f"[Content Cache Warning] {e}")
        body = gzip.compress(payload, compresslevel=6)
        resp = app.response_class(body, mimetype="application/json")
        resp.headers["Content-Encoding"] = "gzip"
        resp.headers["X-Content-Size"] = str(len(payload))
        return resp

    def _send_gzip_file(path: Path, raw_size: int):
        resp = send_file(path, mimetype="application/json", conditional=False, max_age=0)
        resp.headers["Content-Encoding"] = "gzip"
        resp.headers["Vary"] = "Accept-Encoding"
        resp.headers["X-Content-Size"] = str(raw_size)
        resp.headers["Cache-Control"] = "private, no-store"
        return resp

    # 5.2 Conteúdo Completo de Livro — só o dono
    @app.route("/api/books/<book_id>/content", methods=["GET"])
    @require_auth
    def get_book_full_content(book_id):
        import json
        meta = get_book_meta(book_id)
        if not _can_read(meta):
            return jsonify({"error": "Livro não encontrado."}), 404

        # 1. Cache JSON local (e a versão já compactada dele)
        local_extracted = settings.UPLOAD_DIR / "extracted" / f"{book_id}.json"
        gz_path = settings.UPLOAD_DIR / "extracted" / f"{book_id}.content.json.gz"
        size_path = gz_path.parent / (gz_path.name + ".size")
        if local_extracted.exists():
            try:
                if (
                    gz_path.exists()
                    and size_path.exists()
                    and gz_path.stat().st_mtime >= local_extracted.stat().st_mtime
                ):
                    return _send_gzip_file(gz_path, int(size_path.read_text() or 0))
                with open(local_extracted, "r", encoding="utf-8") as f:
                    return _send_book_content(json.load(f), gz_path)
            except Exception as e:
                print(f"Erro ao ler cache local de {book_id}: {e}")

        # 2. MariaDB com texto e sentenças completas
        book = get_book_by_id(book_id)
        if book:
            for field, empty in (("sentences", []), ("chapters", []), ("structure", None)):
                if isinstance(book.get(field), str):
                    try:
                        book[field] = json.loads(book[field])
                    except Exception:
                        book[field] = empty
            return _send_book_content(book, None)
        return jsonify({"error": "Livro não encontrado."}), 404

    # 5.3 Progresso de Leitura (MariaDB)
    @app.route("/api/reading-progress", methods=["POST"])
    @require_auth
    def update_progress():
        data = request.get_json(silent=True) or {}
        book_id = str(data.get("book_id") or "")
        try:
            sentence_idx = max(0, int(data.get("last_sentence_index", 0)))
            pct = max(0, min(100, int(data.get("progress_percentage", 0))))
        except (TypeError, ValueError):
            return jsonify({"error": "Valores inválidos"}), 400
        if not _can_read(get_book_meta(book_id)):
            return jsonify({"error": "Livro não encontrado."}), 404
        saved = save_reading_progress(g.user["id"], book_id, sentence_idx, pct)
        return jsonify({"success": saved})

    # ------------------------------------------------------------------ 5.4 Estatísticas de leitura
    @app.route("/api/stats/reading", methods=["POST"])
    @require_auth
    def post_reading_stats():
        data = request.get_json(silent=True) or {}
        book_id = str(data.get("book_id") or "")[:64]
        try:
            words = int(data.get("words", 0))
            seconds = int(data.get("seconds", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "Valores inválidos"}), 400
        # Um envio cobre no máximo alguns minutos de leitura; valores fora disso são descartados
        if not book_id or not (0 <= words <= 20000) or not (0 <= seconds <= 3600) or (words == 0 and seconds == 0):
            return jsonify({"error": "Valores inválidos"}), 400
        if not _can_read(get_book_meta(book_id)):
            return jsonify({"error": "Livro não encontrado."}), 404
        add_reading_stats(g.user["id"], book_id, words, seconds)
        return jsonify({"success": True})

    @app.route("/api/stats/reading", methods=["GET"])
    @require_auth
    def get_reading_stats():
        from reading_stats import build_stats
        period = request.args.get("period", "week")
        try:
            offset = min(0, int(request.args.get("offset", 0)))
        except ValueError:
            offset = 0
        return jsonify(build_stats(g.user["id"], period, offset, get_reading_stats_rows, get_reading_totals))

    # ------------------------------------------------------------------ 6. Voz
    from neural_tts import generate_speech_bytes, get_extended_voice_catalog, voice_for_plan, piper_models, DEFAULT_VOICE_ID
    from piper_engine import warm_up
    from voice_cloner import register_cloned_voice
    from collections import OrderedDict
    import threading
    import hashlib
    import json
    import io
    from flask import send_file, Response, send_from_directory

    # Cache efêmero em Memória RAM (LRU). Cada trecho tem ~15-60 KB de MP3; 600 itens ≈ 10-35 MB.
    # Precisa ser bem maior que o buffer adiantado de cada leitor, senão o áudio expira antes de tocar.
    _AUDIO_RAM_CACHE = OrderedDict()
    _CACHE_LOCK = threading.Lock()
    MAX_RAM_ITEMS = 600

    def store_audio_in_ram(key: str, audio_bytes: bytes):
        with _CACHE_LOCK:
            _AUDIO_RAM_CACHE[key] = audio_bytes
            _AUDIO_RAM_CACHE.move_to_end(key)
            while len(_AUDIO_RAM_CACHE) > MAX_RAM_ITEMS:
                _AUDIO_RAM_CACHE.popitem(last=False)

    def get_audio_from_ram(key: str):
        with _CACHE_LOCK:
            if key in _AUDIO_RAM_CACHE:
                _AUDIO_RAM_CACHE.move_to_end(key)
                return _AUDIO_RAM_CACHE[key]
            return None

    def synthesize_to_cache(text: str, voice_id: str, rate: float, pitch_override, rate_override, cadence):
        """
        Sintetiza o trecho (ou reaproveita do cache) e devolve a chave do áudio na RAM.
        A chave depende só do texto e dos parâmetros de voz, então o mesmo trecho pedido
        pelo lote e pelo /synthesize é gerado uma única vez.
        """
        key_source = f"{text}|{voice_id}|{rate}|{pitch_override}|{rate_override}|{cadence}"
        audio_key = hashlib.md5(key_source.encode("utf-8")).hexdigest()
        if get_audio_from_ram(audio_key) is not None:
            return audio_key
        audio_bytes = generate_speech_bytes(
            text=text,
            voice_id=voice_id,
            rate_multiplier=rate,
            pitch_override=pitch_override,
            rate_override=rate_override,
            cadence=cadence,
        )
        if not audio_bytes:
            return None
        store_audio_in_ram(audio_key, audio_bytes)
        return audio_key

    def _allowed_voice(voice_id, text, pitch_override, rate_override):
        """Voz premium sem PRO vira a voz grátis padrão (e perde tom/ritmo próprios da voz pedida)."""
        allowed = voice_for_plan(str(voice_id or ""), g.user.get("subscription_tier"), text)
        if allowed != voice_id:
            return allowed, None, None
        return voice_id, pitch_override, rate_override

    # Vozes Piper: carrega os modelos em segundo plano para o primeiro trecho não esperar
    threading.Thread(target=lambda: warm_up(piper_models()), daemon=True).start()

    # 6. Catálogo de vozes (com vozes clonadas)
    @app.route("/api/voices", methods=["GET"])
    def list_voices():
        return jsonify({"voices": get_extended_voice_catalog()})

    # 6.1 Síntese de Voz Neural em Memória RAM com Range HTTP (206)
    @app.route("/api/tts/synthesize", methods=["POST"])
    @require_auth
    def tts_synthesize():
        data = request.get_json(silent=True) or {}
        text = str(data.get("text", "")).strip()[:3000]
        voice_id = data.get("voice_id", DEFAULT_VOICE_ID)
        rate = float(data.get("rate", 1.0))
        cadence = data.get("cadence")
        pitch_override = data.get("pitch_override")
        rate_override = data.get("rate_override")

        if not text:
            return jsonify({"error": "Texto não fornecido"}), 400

        voice_id, pitch_override, rate_override = _allowed_voice(voice_id, text, pitch_override, rate_override)

        import re
        has_letters = bool(re.search(r'[\w\d]', text))
        if not has_letters:
            return jsonify({
                "success": True,
                "is_silence": True,
                "audio_url": None
            })

        audio_key = synthesize_to_cache(text, voice_id, rate, pitch_override, rate_override, cadence)
        if not audio_key:
            return jsonify({"error": "Falha na síntese neural"}), 500

        return jsonify({
            "success": True,
            "audio_url": f"/api/audio/tts_{audio_key}.mp3",
            "is_silence": False
        })

    # 6.2 Pré-carregamento Contínuo em Lote (Buffer de RAM / Suporte a Elenco Multi-Vozes)
    @app.route("/api/tts/prefetch-batch", methods=["POST"])
    @require_auth
    def tts_prefetch_batch():
        data = request.get_json(silent=True) or {}
        items = data.get("items")
        sentences = data.get("sentences", [])
        voice_id = data.get("voice_id", DEFAULT_VOICE_ID)
        rate = float(data.get("rate", 1.0))
        start_index = int(data.get("start_index", 0))
        cadence = data.get("cadence")
        pitch_override = data.get("pitch_override")
        rate_override = data.get("rate_override")

        # Cada item pode ter voz, tom, velocidade e cadência próprios (personagens do modo teatro)
        task_list = []
        if isinstance(items, list) and len(items) > 0:
            for it in items[:25]:
                if isinstance(it, dict) and "text" in it and "index" in it:
                    task_list.append({
                        "index": int(it["index"]),
                        "text": str(it["text"])[:3000],
                        "voice_id": str(it.get("voice_id") or voice_id),
                        "pitch_override": it["pitch_override"] if "pitch_override" in it else pitch_override,
                        "rate_override": it["rate_override"] if "rate_override" in it else rate_override,
                        "cadence": it["cadence"] if "cadence" in it else cadence,
                    })
        elif sentences:
            for i, sent in enumerate(sentences[:25]):
                task_list.append({
                    "index": start_index + i,
                    "text": str(sent)[:3000],
                    "voice_id": voice_id,
                    "pitch_override": pitch_override,
                    "rate_override": rate_override,
                    "cadence": cadence,
                })

        if not task_list:
            return jsonify({"error": "Nenhuma sentença informada"}), 400

        for t in task_list:
            t["voice_id"], t["pitch_override"], t["rate_override"] = _allowed_voice(
                t["voice_id"], t["text"], t["pitch_override"], t["rate_override"])

        results = []
        from concurrent.futures import ThreadPoolExecutor

        def _synthesize_worker(task):
            idx = task["index"]
            sentence = task["text"]
            import re
            has_letters = bool(re.search(r'[\w\d]', sentence))
            if not has_letters:
                return {
                    "index": idx,
                    "sentence": sentence,
                    "audio_url": None,
                    "is_silence": True
                }

            try:
                audio_key = synthesize_to_cache(
                    sentence,
                    task["voice_id"],
                    rate,
                    task["pitch_override"],
                    task["rate_override"],
                    task["cadence"],
                )
                if audio_key:
                    return {
                        "index": idx,
                        "sentence": sentence,
                        "audio_url": f"/api/audio/tts_{audio_key}.mp3",
                        "is_silence": False
                    }
            except Exception as e:
                print(f"[TTS RAM Worker] Erro no item {idx}: {e}")
            return None

        # stream=true: cada trecho vai para o leitor assim que fica pronto (NDJSON, uma linha por item),
        # sem esperar o trecho mais lento do lote
        if data.get("stream"):
            from concurrent.futures import as_completed

            def _stream_results():
                with ThreadPoolExecutor(max_workers=6) as executor:
                    futures = [executor.submit(_synthesize_worker, t) for t in task_list]
                    for fut in as_completed(futures):
                        r = fut.result()
                        if r is not None:
                            yield json.dumps(r, ensure_ascii=False) + "\n"

            return Response(_stream_results(), mimetype="application/x-ndjson",
                            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

        with ThreadPoolExecutor(max_workers=6) as executor:
            task_results = list(executor.map(_synthesize_worker, task_list))

        for r in task_results:
            if r is not None:
                results.append(r)

        return jsonify({
            "success": True,
            "total_buffered": len(results),
            "items": results
        })

    # 6.3 Áudio gerado, direto da RAM (206 Partial Content para navegador e APK).
    # Aberto: o <audio> não manda cabeçalho de login; a chave é um hash imprevisível do trecho.
    @app.route("/api/audio/<filename>", methods=["GET"])
    def serve_audio(filename):
        key = filename.replace(".mp3", "").replace("tts_", "")
        raw_data = get_audio_from_ram(key)
        if not raw_data:
            return jsonify({"error": "Áudio expirado ou não encontrado na memória RAM"}), 404

        return send_file(
            io.BytesIO(raw_data),
            mimetype="audio/mpeg",
            as_attachment=False,
            conditional=True
        )

    # 6.4 Servir amostra de voz gravada/subida localmente
    from voice_cloner import CLONED_SAMPLES_DIR
    @app.route("/api/audio/sample/<filename>", methods=["GET"])
    def serve_cloned_sample(filename):
        return send_from_directory(str(CLONED_SAMPLES_DIR), filename)

    # 6.5 Duplicador de Voz / Clonagem e Personalização de Voz
    @app.route("/api/voices/clone", methods=["POST"])
    @require_auth
    def clone_voice():
        if "audio" not in request.files and "file" not in request.files:
            return jsonify({"error": "Amostra de áudio não enviada"}), 400

        audio_file = request.files.get("audio") or request.files.get("file")
        voice_name = (request.form.get("voice_name") or "Minha Voz Personalizada")[:80]
        gender = request.form.get("gender") or "female"
        narrative_style = request.form.get("style") or "Dramático & Suspense"
        base_voice = request.form.get("base_voice")
        pitch = request.form.get("pitch")
        cadence = request.form.get("cadence")
        rate = request.form.get("rate")

        audio_bytes = audio_file.read()
        ext = "wav" if "wav" in audio_file.filename.lower() else "mp3"

        cloned_voice = register_cloned_voice(
            user_id=g.user["id"],
            voice_name=voice_name,
            audio_bytes=audio_bytes,
            file_extension=ext,
            gender=gender,
            narrative_style=narrative_style,
            base_voice=base_voice,
            pitch_adjustment=pitch,
            rate_adjustment=rate,
            cadence=cadence
        )

        return jsonify({
            "success": True,
            "message": "Voz duplicada e configurada com sucesso",
            "voice": cloned_voice
        })

    # 7. Assistente de Leitura IA ("Pergunte ao Livro")
    @app.route("/api/ai/ask", methods=["POST"])
    @require_auth
    def ai_ask():
        data = request.get_json(silent=True) or {}
        book_title = data.get("book_title", "Livro Atual")
        question = data.get("question", "")
        current_sentence = data.get("current_sentence", "")

        if not question:
            return jsonify({"error": "Pergunta não informada"}), 400

        result = answer_book_question(
            book_title=book_title,
            question=question,
            current_sentence=current_sentence
        )
        return jsonify(result)

    # 8. Estatísticas do Sistema (MariaDB)
    @app.route("/api/system/stats", methods=["GET"])
    def system_stats():
        counts = get_system_counts()
        return jsonify({
            "users_count": counts.get("users_count", 0),
            "books_count": counts.get("books_count", 0),
            "status": "healthy",
            "version": "3.0.0"
        })

    return app

if __name__ == "__main__":
    app = create_app()
    settings = get_settings()
    print(f"[Aedolia API] Server rodando em http://{settings.HOST}:{settings.PORT}")
    app.run(host=settings.HOST, port=settings.PORT, debug=settings.DEBUG)
