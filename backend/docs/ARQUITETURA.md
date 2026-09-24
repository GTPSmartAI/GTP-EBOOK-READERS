# 🏛️ Arquitetura do Backend - ElevenReader

O backend do ElevenReader segue o mesmo padrão modular corporativo adotado no projeto `GTP-TESTE-SISTEMA`, com separação estrita de responsabilidades e integração com o Supabase.

---

## 📂 Estrutura de Diretórios

```
backend/
├── components/                      # Componentes modulares independentes
│   ├── ProcessadorLivros/python/    # Extração de texto de PDF, capítulos e frases
│   ├── GestaoAssinaturas/python/    # Processamento de webhooks e ativação de planos
│   ├── SinteseVoz/python/           # Catálogo de vozes e integração ElevenLabs
│   ├── AssistenteIA/python/         # Respostas contextuais sobre os livros
│   └── AlertasErro/python/          # Monitoramento de integridade e logs
├── shared/                          # Módulos compartilhados entre componentes
│   └── python/
│       ├── config.py                # Gerenciamento de variáveis de ambiente
│       ├── database.py              # Camada de acesso ao Supabase (PostgreSQL & Storage)
│       └── system_config.py         # Constantes, planos, limites e intervalos
├── scripts/                         # Utilitários operacionais
│   ├── init_supabase.py             # Validação de conexão e storage
│   └── test_webhook.py              # Teste de disparo de webhooks
├── docs/                            # Documentação técnica do sistema
├── uploads/                         # Armazenamento temporário de arquivos
├── api_server.py                    # Servidor Flask com rotas HTTP e CORS
├── main.py                          # Motor de automações com APScheduler e logging
├── schema.sql                       # Schema do banco de dados (tabelas, triggers, RLS)
├── Dockerfile                       # Container Docker para deploy
├── entrypoint.sh                    # Script de inicialização do container
├── pyrightconfig.json               # Configuração do analisador de tipos
├── README.md                        # Guia de instalação e execução
└── requirements.txt                 # Dependências Python
```

---

## 🔄 Fluxo de Dados e Integrações

1. **Frontend -> Backend/Supabase**:
   - Autenticação e sessão gerenciadas via Supabase Auth (`@supabase/supabase-js`).
   - Leitura de PDFs salva no Supabase Storage (`pdf-uploads`).
   - Sincronização de progresso de leitura entre dispositivos.

2. **n8n / Gateways de Pagamento (Kiwify, Hotmart, Asaas, Stripe) -> Backend**:
   - Webhook recebido em `POST /api/webhooks/payment`.
   - O backend atualiza o perfil do usuário para `subscription_tier: 'pro'` e `subscription_status: 'active'`.
   - O histórico de pagamentos é registrado na tabela `subscriptions`.
