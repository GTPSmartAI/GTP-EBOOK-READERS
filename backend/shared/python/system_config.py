# Configurações do Sistema e Regras de Negócio do ElevenReader

SYSTEM_NAME = "ElevenReader"
SYSTEM_VERSION = "2.0.0"

# Planos e Limites
PLAN_TIERS = {
    "free": {
        "name": "Gratuito",
        "max_books": 3,
        "daily_words_limit": 5000,
        "has_ai_chat": False,
        "audio_quality": "standard",
    },
    "pro": {
        "name": "ElevenReader PRO",
        "max_books": 999999,
        "daily_words_limit": 999999,
        "has_ai_chat": True,
        "audio_quality": "neural_high_definition",
    },
    "unlimited": {
        "name": "ElevenReader Vitalício / Empresarial",
        "max_books": 999999,
        "daily_words_limit": 999999,
        "has_ai_chat": True,
        "audio_quality": "master_studio",
    }
}

# Status de Assinatura
SUBSCRIPTION_STATUS_ACTIVE = "active"
SUBSCRIPTION_STATUS_TRIAL = "trialing"
SUBSCRIPTION_STATUS_CANCELED = "canceled"
SUBSCRIPTION_STATUS_PAST_DUE = "past_due"

# Intervalos de Jobs de Automação (em segundos)
INTERVAL_HEARTBEAT_SECONDS = 60
INTERVAL_SUBSCRIPTION_AUDIT_SECONDS = 3600 # a cada 1 hora
INTERVAL_MAINTENANCE_SECONDS = 86400        # diário
