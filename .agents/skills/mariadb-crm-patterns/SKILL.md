---
name: mariadb-crm-patterns
description: Padrões de banco de dados MariaDB/MySQL para o GTP CRM. Use ao criar ou otimizar consultas, tabelas, migrações, isolamento multitenant (agency_id), colunas JSON de metadados e conversão de fusos horários de Brasília.
---

# MariaDB & CRM Data Patterns (GTP CRM)

## 📌 Arquitetura do Banco
- **Driver:** `pymysql` com cursor DictCursor via wrapper `MariaDBClient` (`shared.python.mariadb_client`).
- **Padrão Multi-Tenant:** Toda tabela relacionada a leads, mensagens ou automações possui `agency_id`. Queries DEVEM sempre filtrar por `agency_id`.

---

## 🕒 1. Fuso Horário Obrigatório
- O sistema opera no horário de Brasília (`America/Sao_Paulo`).
- Sempre utilize o helper `get_now_br()` ou converta usando `pytz`:
  ```python
  import pytz
  from datetime import datetime
  
  tz = pytz.timezone('America/Sao_Paulo')
  now_br = datetime.now(tz)
  ```
- No MariaDB, utilize `NOW()` em conjunto com timezones configurados ou armazene timestamps ISO.

---

## 🗄️ 2. Manipulação de `automation_settings.metadata`
Configurações complexas (steps de follow-up, status_config, limites de corretor) ficam na coluna `metadata` (JSON ou texto):
- Ao ler `metadata`, trate sempre ambos os tipos (`dict` ou `str`):
  ```python
  meta = row.get("metadata") or {}
  if isinstance(meta, str):
      try:
          meta = json.loads(meta)
      except Exception:
          meta = {}
  ```
- Para atualizar campos específicos no `metadata`, faça leitura, merge e update atômico usando `json.dumps(meta)`.

---

## ⚡ 3. Regras de Queries Críticas
- **Soft Delete:** Verifique sempre `deleted_at IS NULL` em `users` e `clients`.
- **Prevenção de Duplicação:** Toda automação de envio deve consultar logs recentes antes de disparar:
  ```sql
  SELECT id FROM followup_dispatch_logs
  WHERE client_id = %s AND agency_id = %s AND step = %s
    AND dispatched_at >= NOW() - INTERVAL 5 MINUTE
  LIMIT 1;
  ```
- **Paginação e Batches:** Limitar sempre queries de busca de leads candidatos a `LIMIT 100` ou `LIMIT 300` para evitar lock de tabela e picos de memória.
