# 🌐 Endpoints da API - Aedolia

Base URL padrão: `http://localhost:4000`

---

## 1. Verificação de Saúde
* **Rota:** `GET /api/health`
* **Descrição:** Retorna status operacional da API e conexão com o MariaDB.
* **Exemplo de Resposta:**
```json
{
  "status": "online",
  "service": "Aedolia API (Python/Flask)",
  "version": "2.0.0",
  "database": "MariaDB (ebook_readers_gtp)",
  "mariadb_connected": true
}
```

---

## 2. Webhook de Pagamento e Assinaturas
* **Rota:** `POST /api/webhooks/payment`
* **Descrição:** Recebe eventos de checkout (n8n, Kiwify, Asaas, Stripe, etc.) e ativa o plano do usuário no MariaDB.
* **Corpo da Requisição (JSON):**
```json
{
  "email": "cliente@email.com",
  "plan": "pro_monthly",
  "amount": 29.90,
  "status": "paid",
  "gateway": "kiwify",
  "order_id": "ord_123456"
}
```

---

## 3. Status do Usuário
* **Rota:** `GET /api/users/<email>/status`
* **Descrição:** Retorna plano e detalhes de leitura do usuário no MariaDB.

---

## 4. Upload e Extração de Livros (PDF/EPUB)
* **Rota:** `POST /api/books/upload`
* **Form-Data:**
  * `file`: Arquivo `.pdf` ou `.epub`
  * `title`: Título do livro (opcional)
  * `author`: Autor (opcional)
  * `user_id`: ID do usuário no MariaDB (opcional)
* **Resposta:** Objeto com texto completo, capítulos detectados, frases divididas, tempo estimado e storage_url no MinIO S3.

---

## 5. Assistente de Leitura IA
* **Rota:** `POST /api/ai/ask`
* **JSON:**
```json
{
  "book_title": "O Pequeno Príncipe",
  "question": "Faça um resumo dos 3 pontos principais"
}
```

---

## 6. Catálogo de Vozes
* **Rota:** `GET /api/voices`
* **Descrição:** Retorna lista de vozes neurais e suas características.
