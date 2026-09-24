---
name: whatsapp-uazapi-engine
description: Regras, arquitetura e padrões de integração com WhatsApp via UAZAPI no CRM GTP. Use ao lidar com conexões de instâncias, envio de mensagens, webhook handling, cooldown anti-ban, gestão de corretores e tratamento de desconexões.
---

# WhatsApp & UAZAPI Integration Engine (GTP CRM)

## 📌 Visão Geral
O GTP CRM conecta corretores e imobiliárias ao WhatsApp primariamente através da **UAZAPI** (e Evolution API em instâncias legadas). Cada corretor/empresa possui suas credenciais armazenadas na tabela `users` (coluna `dados_uazapi`, criptografada via AES/Fernet em `encryption_service`).

---

## 🔒 1. Credenciais e Descriptografia
- As credenciais de cada usuário estão criptografadas na tabela `users`:
  ```python
  from shared.python.encryption_service import decrypt, encrypt
  
  dados_str = decrypt(user['dados_uazapi'])
  dados = json.loads(dados_str)
  url_api = dados.get('server_url')
  instance_token = dados.get('instance_token')
  ```
- **Nunca logar tokens** ou credenciais em texto puro.

---

## 🛡️ 2. Regras Anti-Ban e Cadência de Disparo
Disparos automatizados (Disparador e Follow-up) **devem obrigatoriamente** respeitar a cadência anti-bloqueio:
- **Delay entre envios do mesmo corretor:** 5 a 12 minutos (aleatorizado).
- **Limite diário por corretor:** configurável em `automation_settings.metadata.daily_limit_per_broker` (0 = ilimitado).
- **1 disparo por ciclo por corretor:** Em cada ciclo do worker, no máximo 1 mensagem é despachada por `owner_id`.
- **Prevenção de Inanição (Starvation):** Antes de buscar clientes, verificar se a instância do corretor está conectada via `_is_instance_connected()`. Se desconectada, pular seus leads e notificar sem travar a fila da agência.

---

## 📡 3. Checagem de Conexão (UAZAPI)
```python
def _is_instance_connected(url: str, token: str) -> bool:
    try:
        resp = requests.get(
            f"{url}/instance/status",
            headers={"Token": token, "Content-Type": "application/json"},
            timeout=10
        )
        if resp.status_code != 200:
            return False
        data = resp.json()
        status = data.get('status', {}) or {}
        instance = data.get('instance', {}) or {}
        return bool(
            str(instance.get('status', '')).lower() == 'connected' or
            status.get('connected') or status.get('loggedIn') or status.get('jid') or
            instance.get('connected') or instance.get('loggedIn')
        )
    except Exception:
        return False
```

---

## ⚠️ 4. Regra de Negócio: Dono de Imobiliária sem Time
- Usuários com `role = 'empresa'` são donos e frequentemente operam sozinhos.
- Ao consultar corretores aptos para disparar (`status = 'disparar'`), SEMPRE incluir fallback para o dono:
  ```sql
  WHERE agency_id = %s 
    AND (status = 'disparar' OR id = %s)
    AND deleted_at IS NULL
  ```
- Omitir `OR id = %s` trava disparos de empresas individuais porque o dono não edita a si mesmo no painel de equipe.
