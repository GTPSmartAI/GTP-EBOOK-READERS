---
name: react-crm-chat-ui
description: Padrões de desenvolvimento frontend para o GTP CRM em React, Vite, TypeScript e TailwindCSS. Use ao construir telas de chat WhatsApp em tempo real, Kanban de CRM, modais de equipe, painéis de automação e componentes com estado otimista.
---

# React & CRM Chat UI Patterns (GTP CRM)

## 📌 Stack Frontend
- **Framework:** React 18 + Vite + TypeScript
- **Estilização:** TailwindCSS + Radix UI / Shadcn / Lucide React
- **Roteamento:** React Router DOM

---

## 💬 1. Padrões de Chat WhatsApp (Inbox)
- **Renderização de Balões:** Distinção clara entre:
  - `bot_message` (mensagens enviadas pela IA)
  - `cliente_message` (mensagens recebidas do lead)
  - `corretor_message` (intervenção humana)
- **Rolagem Automática:** Manter scroll no final ao receber nova mensagem, mas respeitar se o usuário rolou para cima lendo o histórico.
- **Formatação WhatsApp:** Suportar quebra de linhas, links clicáveis e renderização de mídias (`media_url`, `media_type`).

---

## 📊 2. Padrões de Kanban e Pipelines
- Status padrão de leads:
  - `disparo`
  - `QUALIFICANDO`
  - `QUALIFICADO`
  - `AGENDANDO`
  - `AGENDADO`
  - `FOLLOWUP`
  - `DESCARTADO`
- **Mutação Otimista:** Atualizar a coluna visualmente no drag-and-drop antes de confirmar a resposta do backend, revertendo apenas em caso de erro HTTP.

---

## 🎨 3. Design e Acessibilidade
- Modo Escuro (Dark Mode) como padrão de primeira classe.
- Feedback visual imediato em cliques de botão (estados de loading e desabilitação durante requisições).
- Toasts de notificação claros para ações críticas (ex: reconexão de WhatsApp, exclusão de membros).
