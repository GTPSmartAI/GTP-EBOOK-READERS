import logging
from typing import Dict, Any, Tuple
from database import update_user_subscription, record_subscription_transaction, get_user_profile

logger = logging.getLogger("SubscriptionService")

def process_incoming_payment_webhook(payload: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Processa webhooks de pagamento de múltiplas plataformas (Kiwify, Hotmart, Asaas, Stripe, n8n).
    Retorna (sucesso, mensagem, detalhes).
    """
    try:
        # Extração de e-mail com múltiplos fallbacks
        email = (
            payload.get("email") or
            payload.get("customer", {}).get("email") or
            payload.get("data", {}).get("customer", {}).get("email") or
            payload.get("buyer", {}).get("email") or
            payload.get("customer_email")
        )

        if not email:
            return False, "E-mail do cliente não encontrado no payload do webhook", {}

        email = email.strip().lower()

        # Determinação do plano e valor
        plan = payload.get("plan") or payload.get("product_name") or "pro"
        amount = float(payload.get("amount") or payload.get("value") or 29.90)
        gateway = payload.get("gateway") or payload.get("origin") or "n8n_webhook"
        transaction_id = str(payload.get("transaction_id") or payload.get("order_id") or payload.get("id") or f"tx_{int(__import__('time').time())}")
        status = str(payload.get("status") or "paid").lower()

        # Status considerados como pagamento aprovado
        approved_statuses = {"paid", "approved", "active", "completed", "succeeded", "pago"}

        is_approved = status in approved_statuses
        tier = "pro" if is_approved else "free"
        subscription_status = "active" if is_approved else "canceled"

        # 1. Atualizar ou verificar perfil no Supabase
        profile = get_user_profile(email=email)
        user_updated = False
        if profile:
            user_updated = update_user_subscription(email=email, tier=tier, status=subscription_status)

        # 2. Gravar histórico na tabela de subscriptions do Supabase
        record_subscription_transaction(
            email=email,
            plan=plan,
            amount=amount,
            gateway=gateway,
            transaction_id=transaction_id,
            status=status,
            payload=payload
        )

        msg = f"Plano {tier} ativado com sucesso para {email}" if is_approved else f"Status {status} registrado para {email}"
        return True, msg, {
            "email": email,
            "tier": tier,
            "status": subscription_status,
            "transaction_id": transaction_id,
            "user_found_in_db": bool(profile),
            "updated_in_db": user_updated
        }

    except Exception as e:
        logger.error(f"Erro ao processar webhook de assinatura: {e}", exc_info=True)
        return False, str(e), {}
