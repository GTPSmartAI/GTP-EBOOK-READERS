"""
ElevenReader - Flask API Server
Estrutura modular inspirada no padrão de GTP-TESTE-SISTEMA conectada ao Supabase.
"""

import os
import sys
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

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
    get_user_profile, 
    update_user_subscription, 
    get_supabase_admin,
    save_book,
    get_user_books
)
from subscription_service import process_incoming_payment_webhook
from voice_service import get_available_voices
from ai_service import answer_book_question
from pdf_extractor import extract_text_from_pdf

def create_app() -> Flask:
    """Fábrica de aplicação Flask com rotas e CORS."""
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    settings = get_settings()

    # 1. Health check
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "online",
            "service": "ElevenReader Backend API (Python/Flask)",
            "version": "2.0.0",
            "supabase_connected": True
        })

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

    # 3. Consulta de Status do Usuário
    @app.route("/api/users/<email>/status", methods=["GET"])
    def user_status(email):
        profile = get_user_profile(email=email.strip().lower())
        if not profile:
            return jsonify({"error": "Perfil não encontrado no Supabase"}), 404
        return jsonify({"profile": profile})

    # 4. Upload e Extração de PDF com persistência no Supabase Storage
    @app.route("/api/books/upload", methods=["POST"])
    def upload_book():
        if "file" not in request.files:
            return jsonify({"error": "Nenhum arquivo enviado"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "Nome de arquivo inválido"}), 400

        import re
        import time

        user_id = request.form.get("user_id")
        title = request.form.get("title") or file.filename.rsplit(".", 1)[0]
        author = request.form.get("author") or "Autor Desconhecido"

        temp_path = settings.UPLOAD_DIR / file.filename
        file.save(str(temp_path))

        try:
            full_text, sentences, chapters, total_words, duration_minutes = extract_text_from_pdf(str(temp_path))
            
            # Realiza upload para o Supabase Storage no bucket 'pdf-uploads'
            storage_url = None
            try:
                admin = get_supabase_admin()
                safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename)
                storage_filename = f"uploads/{int(time.time())}_{safe_name}"
                
                fname_lower = file.filename.lower()
                if fname_lower.endswith(".epub"):
                    content_type = "application/epub+zip"
                    doc_type = "epub"
                elif fname_lower.endswith(".pdf"):
                    content_type = "application/pdf"
                    doc_type = "pdf"
                else:
                    content_type = "text/plain"
                    doc_type = "txt"

                with open(temp_path, "rb") as f_bytes:
                    admin.storage.from_("pdf-uploads").upload(
                        path=storage_filename,
                        file=f_bytes.read(),
                        file_options={"content-type": content_type, "upsert": "true"}
                    )
                
                storage_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/pdf-uploads/{storage_filename}"
            except Exception as st_err:
                print(f"[Storage Warning] Falha ao enviar para Supabase Storage: {st_err}")

            book_id = f"book-{int(time.time() * 1000)}"
            book_data = {
                "id": book_id,
                "user_id": user_id,
                "title": title,
                "author": author,
                "type": doc_type,
                "content": full_text,
                "sentences": sentences,
                "chapters": chapters,
                "total_words": total_words,
                "duration_minutes": duration_minutes,
                "cover_gradient": "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                "file_url": storage_url
            }

            if user_id:
                save_book(book_data)

            return jsonify({
                "success": True,
                "book": book_data,
                "storage_url": storage_url
            })
        finally:
            if temp_path.exists():
                os.remove(str(temp_path))

    # 5. Listagem de Livros do Usuário
    @app.route("/api/books", methods=["GET"])
    def list_books():
        user_id = request.args.get("user_id")
        if not user_id:
            # Retorna todos os livros se não especificar user_id
            admin = get_supabase_admin()
            try:
                res = admin.from_('books').select('*').order('created_at', desc=True).execute()
                return jsonify({"books": res.data or []})
            except Exception as e:
                return jsonify({"books": [], "error": str(e)})

        books = get_user_books(user_id)
        return jsonify({"books": books})

    # 5.1 Deletar Livro
    @app.route("/api/books/<book_id>", methods=["DELETE"])
    def delete_book(book_id):
        admin = get_supabase_admin()
        try:
            # Busca info do livro para remover arquivo do storage se existir
            res = admin.from_('books').select('file_url').eq('id', book_id).maybe_single().execute()
            if res and res.data and res.data.get('file_url'):
                try:
                    file_url = res.data['file_url']
                    if 'pdf-uploads/' in file_url:
                        path_in_bucket = file_url.split('pdf-uploads/')[-1]
                        admin.storage.from_('pdf-uploads').remove([path_in_bucket])
                except Exception as rem_err:
                    print(f"Erro ao remover arquivo do storage: {rem_err}")

            admin.from_('books').delete().eq('id', book_id).execute()
            return jsonify({"success": True, "message": "Livro removido"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    from flask import send_from_directory
    from neural_tts import generate_speech_file, get_extended_voice_catalog, AUDIO_CACHE_DIR
    from voice_cloner import register_cloned_voice

    # 6. Catálogo Estendido de Vozes Neurais (com suporte a vozes clonadas)
    @app.route("/api/voices", methods=["GET"])
    def list_voices():
        return jsonify({"voices": get_extended_voice_catalog()})

    # 6.1 Síntese de Voz Neural com Entonação e Suspense
    @app.route("/api/tts/synthesize", methods=["POST"])
    def tts_synthesize():
        data = request.get_json(silent=True) or {}
        text = data.get("text", "").strip()
        voice_id = data.get("voice_id", "francisca-dramatica")
        emotion = data.get("emotion", "suspense")
        rate = float(data.get("rate", 1.0))

        if not text:
            return jsonify({"error": "Texto não fornecido"}), 400

        audio_file = generate_speech_file(
            text=text,
            voice_id=voice_id,
            emotion=emotion,
            rate_multiplier=rate
        )

        if not audio_file:
            return jsonify({"error": "Falha na síntese neural"}), 500

        return jsonify({
            "success": True,
            "audio_url": f"/api/audio/{audio_file}",
            "filename": audio_file
        })

    # 6.2 Pré-carregamento Contínuo em Lote (Buffer de 3 a 4 páginas de leitura)
    @app.route("/api/tts/prefetch-batch", methods=["POST"])
    def tts_prefetch_batch():
        data = request.get_json(silent=True) or {}
        sentences = data.get("sentences", [])
        voice_id = data.get("voice_id", "francisca-dramatica")
        emotion = data.get("emotion", "suspense")
        rate = float(data.get("rate", 1.0))
        start_index = int(data.get("start_index", 0))

        if not sentences:
            return jsonify({"error": "Nenhuma sentença informada"}), 400

        # Limita o lote em até 40 sentenças por requisição (equivalente a 3-4 páginas)
        batch = sentences[:40]
        results = []

        for i, sentence in enumerate(batch):
            idx = start_index + i
            audio_file = generate_speech_file(
                text=sentence,
                voice_id=voice_id,
                emotion=emotion,
                rate_multiplier=rate
            )
            if audio_file:
                results.append({
                    "index": idx,
                    "sentence": sentence,
                    "audio_url": f"/api/audio/{audio_file}"
                })

        return jsonify({
            "success": True,
            "total_buffered": len(results),
            "items": results
        })

    # 6.3 Servir arquivo de áudio sintetizado
    @app.route("/api/audio/<filename>", methods=["GET"])
    def serve_audio(filename):
        return send_from_directory(str(AUDIO_CACHE_DIR), filename, mimetype="audio/mpeg")

    # 6.4 Duplicador de Voz / Clonagem de Voz de Assinante
    @app.route("/api/voices/clone", methods=["POST"])
    def clone_voice():
        if "audio" not in request.files and "file" not in request.files:
            return jsonify({"error": "Amostra de áudio não enviada"}), 400

        audio_file = request.files.get("audio") or request.files.get("file")
        voice_name = request.form.get("voice_name") or "Minha Voz Clonada"
        gender = request.form.get("gender") or "male"
        narrative_style = request.form.get("style") or "Dramático & Suspense"
        user_id = request.form.get("user_id") or "anonymous_pro"

        audio_bytes = audio_file.read()
        ext = "wav" if "wav" in audio_file.filename.lower() else "mp3"

        cloned_voice = register_cloned_voice(
            user_id=user_id,
            voice_name=voice_name,
            audio_bytes=audio_bytes,
            file_extension=ext,
            gender=gender,
            narrative_style=narrative_style
        )

        return jsonify({
            "success": True,
            "message": "Voz duplicada com sucesso",
            "voice": cloned_voice
        })

    # 7. Assistente de Leitura IA ("Pergunte ao Livro")
    @app.route("/api/ai/ask", methods=["POST"])
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

    # 8. Estatísticas do Sistema
    @app.route("/api/system/stats", methods=["GET"])
    def system_stats():
        admin = get_supabase_admin()
        try:
            users_res = admin.auth.admin.list_users()
            users_count = len(users_res) if hasattr(users_res, '__len__') else 0
        except Exception:
            users_count = 0

        return jsonify({
            "users_count": users_count,
            "status": "healthy",
            "version": "2.0.0"
        })

    return app

if __name__ == "__main__":
    app = create_app()
    settings = get_settings()
    print(f"🚀 ElevenReader API Server rodando em http://{settings.HOST}:{settings.PORT}")
    app.run(host=settings.HOST, port=settings.PORT, debug=settings.DEBUG)
