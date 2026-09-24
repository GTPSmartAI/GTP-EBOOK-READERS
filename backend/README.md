# 🐍 ElevenReader - Backend Python

Motor de backend e automações para o **ElevenReader**, construído no padrão arquitetural modular de `GTP-TESTE-SISTEMA` com banco de dados **Supabase**.

---

## 🚀 Como Iniciar Localmente

```bash
# 1. Entrar na pasta do backend
cd backend

# 2. Instalar as dependências
pip install -r requirements.txt

# 3. Iniciar o motor de automações + API Server
python main.py
```

O servidor iniciará automaticamente:
* 🌐 **API Server:** `http://localhost:5000`
* ⏱️ **Motor APScheduler:** Monitoramento e automações em background
* 📝 **Logs:** Gerados automaticamente em `automation.log` com rotação preventiva

---

## 🔗 Integração com n8n & Gateways de Pagamento

Quando um cliente conclui uma compra em qualquer plataforma (Kiwify, Hotmart, Asaas, Stripe, Mercado Pago), configure o webhook para:
* **URL:** `http://seu-dominio.com/api/webhooks/payment`
* **Método:** `POST`
* **Payload:** `{ "email": "usuario@exemplo.com", "plan": "pro", "status": "paid" }`

O backend atualiza instantaneamente o usuário no Supabase para assinante **PRO** ativo.
