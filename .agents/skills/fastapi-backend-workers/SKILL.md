---
name: fastapi-backend-workers
description: Padrões de arquitetura de workers de automação, background jobs e rotinas de daemon no GTP CRM. Use ao criar novos workers de disparo, follow-up, gestão de estagnados ou integrar tarefas agendadas na VPS Docker Swarm.
---

# FastAPI & Background Workers (GTP CRM)

## 📌 Visão Geral dos Workers
O backend do GTP opera uma API central (`api_server.py`) combinada com scripts autônomos que rodam em loops contínuos no container Docker:
- `run_followup_worker.py`: Executa o ciclo de follow-up a cada X segundos.
- `message_dispatcher.py`: Disparador de campanhas e listas frias.
- `stalled_clients_manager.py`: Monitora clientes sem interação e aplica ações automáticas.

---

## 🔁 1. Estrutura Padrão de Worker
Todo worker em background deve implementar:
1. **Loop com Tratamento de Erro Global:** Nunca permitir que uma exceção não tratada mate o processo do worker.
2. **Checagem de Expediente:**
   ```python
   def _is_within_business_hours(agency_id: str) -> bool:
       # Verifica working_hours_start e working_hours_end em automation_settings
   ```
3. **Heartbeat / Atualização de Status:** Registrar última execução na tabela `automation_settings` (`last_run = NOW()`).
4. **Sleep Consciente:** `time.sleep(interval_seconds)` entre ciclos.

---

## 📜 2. Estratégia de Logs e Rotação
- Logs gravados em `/app/logs/` com rotação via `RotatingFileHandler` para evitar estouro de disco na VPS.
- Registros de erros críticos devem acionar `log_to_db("ERROR", msg, agency_id, category="...")` e o componente `AlertasErro`.

---

## 🐳 3. Ambiente de Produção (Docker Swarm)
- Contêiner de API: `crm_crm-api`
- Python path padrão: `PYTHONPATH=/app/backend`
- Nunca usar chamadas síncronas bloqueantes sem timeout explícito (ex: `requests.get(..., timeout=10)`).
