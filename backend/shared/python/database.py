import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from supabase import create_client, Client
from config import get_settings

logger = logging.getLogger("Database")

_supabase_admin: Optional[Client] = None
_supabase_public: Optional[Client] = None

def get_supabase_admin() -> Client:
    """Retorna o cliente Supabase com permissões de Service Role (Admin)."""
    global _supabase_admin
    if _supabase_admin is None:
        settings = get_settings()
        _supabase_admin = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    return _supabase_admin

def get_supabase_public() -> Client:
    """Retorna o cliente Supabase com a Anon Key pública."""
    global _supabase_public
    if _supabase_public is None:
        settings = get_settings()
        _supabase_public = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
    return _supabase_public

def get_user_profile(email: Optional[str] = None, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca o perfil de um usuário por e-mail ou user_id."""
    client = get_supabase_admin()
    try:
        query = client.from_('profiles').select('*')
        if user_id:
            query = query.eq('id', user_id)
        elif email:
            query = query.eq('email', email)
        else:
            return None

        res = query.maybe_single().execute()
        return res.data if res else None
    except Exception as e:
        logger.error(f"Erro ao buscar perfil (email={email}, user_id={user_id}): {e}")
        return None

def update_user_subscription(email: str, tier: str = "pro", status: str = "active") -> bool:
    """Atualiza o plano e status da assinatura de um usuário."""
    client = get_supabase_admin()
    try:
        profile = get_user_profile(email=email)
        if not profile:
            logger.warning(f"Usuário com e-mail {email} não possui perfil no Supabase ainda.")
            return False

        res = client.from_('profiles').update({
            'subscription_tier': tier,
            'subscription_status': status,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', profile['id']).execute()

        logger.info(f"Assinatura do usuário {email} atualizada para {tier} ({status})")
        return bool(res.data)
    except Exception as e:
        logger.error(f"Erro ao atualizar assinatura para {email}: {e}")
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
    """Registra uma transação de assinatura/pagamento vinda de webhook."""
    client = get_supabase_admin()
    try:
        profile = get_user_profile(email=email)
        user_id = profile['id'] if profile else None

        client.from_('subscriptions').insert({
            'user_id': user_id,
            'email': email,
            'plan': plan,
            'amount': amount,
            'gateway': gateway,
            'transaction_id': transaction_id,
            'status': status,
            'payload': payload or {},
            'created_at': datetime.utcnow().isoformat()
        }).execute()

        logger.info(f"Transação {transaction_id} gravada no Supabase para {email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao registrar transação no Supabase: {e}")
        return False

def record_heartbeat(component_name: str = "BackendEngine") -> None:
    """Registra batimento cardíaco da aplicação para monitoramento."""
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    logger.debug(f"[Heartbeat] {component_name} ativo em {now_str}")

def log_to_db(level: str, message: str, component: str = "System") -> None:
    """Registra evento nos logs estruturados."""
    logger.info(f"[{component}] [{level.upper()}] {message}")

def save_book(book_data: Dict[str, Any]) -> bool:
    """Salva ou atualiza um livro no Supabase."""
    client = get_supabase_admin()
    try:
        client.from_('books').upsert(book_data).execute()
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar livro no Supabase: {e}")
        return False

def get_user_books(user_id: str) -> List[Dict[str, Any]]:
    """Retorna os livros cadastrados de um usuário."""
    client = get_supabase_admin()
    try:
        res = client.from_('books').select('*').eq('user_id', user_id).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Erro ao buscar livros do usuário {user_id}: {e}")
        return []
