# 🏛️ Arquitetura do Backend - Aedolia

O backend do Aedolia segue o mesmo padrão modular corporativo adotado no projeto `GTP-TESTE-SISTEMA`, com separação estrita de responsabilidades e integração com MariaDB e MinIO S3 na VPS.

---

## 📂 Estrutura de Diretórios

```
backend/
├── components/                      # Componentes modulares independentes
│   ├── ProcessadorLivros/python/    # Extração de texto de PDF, capítulos e frases
│   ├── GestaoAssinaturas/python/    # Processamento de webhooks e ativação de planos
│   ├── SinteseVoz/python/           # Catálogo de vozes, clonagem e neural_tts
│   ├── AssistenteIA/python/         # Respostas contextuais sobre os livros
│   └── AlertasErro/python/          # Monitoramento de integridade e logs
├── shared/                          # Módulos compartilhados entre componentes
│   └── python/
│       ├── config.py                # Gerenciamento de variáveis de ambiente
│       ├── database.py              # Camada de acesso ao MariaDB
│       ├── mariadb_client.py        # Driver DictCursor com reconexão resiliente
│       ├── minio_storage.py         # Cliente MinIO S3 (upload, download e streaming)
│       └── system_config.py         # Constantes, planos, limites e intervalos
├── scripts/                         # Utilitários operacionais
│   ├── init_database.py             # Validação de conexão MariaDB e MinIO
│   └── test_webhook.py              # Teste de disparo de webhooks
├── docs/                            # Documentação técnica do sistema
├── uploads/                         # Armazenamento temporário de arquivos
├── api_server.py                    # Servidor Flask com rotas HTTP e CORS
├── schema_mariadb.sql               # Schema do banco de dados MariaDB
├── README.md                        # Guia de instalação e execução
└── requirements.txt                 # Dependências Python
```

---

## 🔄 Fluxo de Dados e Integrações

1. **Frontend -> Backend/MariaDB/MinIO**:
   - Autenticação e sessão gerenciadas via MariaDB (`users` com hash SHA-256).
   - Leitura de PDFs salva no MinIO S3 (`ebook-readers-gtp`).
   - Sincronização de progresso de leitura entre dispositivos na tabela `reading_progress`.

2. **n8n / Gateways de Pagamento (Kiwify, Hotmart, Asaas, Stripe) -> Backend**:
   - Webhook recebido em `POST /api/webhooks/payment`.
   - O backend atualiza o perfil do usuário para `subscription_tier: 'pro'` e `subscription_status: 'active'`.
   - O histórico de pagamentos é registrado na tabela `subscriptions`.
