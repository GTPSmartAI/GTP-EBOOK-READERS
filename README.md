# Ebook Readers GTP 🎙️📚

Plataforma moderna e imersiva para leitura de PDFs e e-books com síntese de voz neural sincronizada (Karaoke Highlighting), entonação cinematográfica com suspense, pré-carregamento contínuo em buffer (3 a 4 páginas) e **Duplicador de Voz com IA (Instant Voice Cloning)**.

---

## 🚀 Principais Funcionalidades

1. **Leitura & Sincronia de Voz (Karaoke Sync):**
   - Destaque em tempo real frase por frase enquanto o áudio é reproduzido.
   - Alternância entre leitura fluida formatada e visualização do documento original.
   - Velocidade ajustável (0.75x a 2.0x), salto de sentenças e navegação por capítulos.

2. **Vozes Neurais de Alta Definição (Drama & Suspense):**
   - Motor neural integrado via **Microsoft Azure Neural / Edge-TTS** (gratuito e sem limites).
   - Vozes brasileiras de estúdio:
     - **Francisca (Cinematográfica & Drama)**
     - **Antônio (Suspense & Narração Profunda)**
     - **Thalita (Storyteller & Expressiva)**
     - **Manuela (Audiolivro Clássico)**
   - Conector pronto para **ElevenLabs Multilingual v2**.

3. **Buffer Contínuo de Páginas (3 a 4 páginas):**
   - O sistema realiza pré-carregamento em lote das próximas frases em segundo plano.
   - Reprodução ininterrupta sem silêncios nem pausas entre sentenças.

4. **Duplicador de Voz com IA (Voice Cloning para Assinantes):**
   - Gravação de amostra ao vivo com microfone diretamente no navegador (com texto guia de 30s).
   - Upload de áudios em `.mp3`, `.wav` ou `.m4a`.
   - Armazenamento no Supabase Storage e ativação imediata como narrador pessoal no Leitor.

5. **Armazenamento e Banco de Dados Supabase:**
   - Upload de arquivos PDF físicos diretamente para o bucket `pdf-uploads`.
   - Persistência de progresso de leitura, perfis e assinaturas PRO.

---

## 📂 Estrutura do Projeto

```
.
├── backend/
│   ├── components/
│   │   ├── ProcessadorLivros/     # Extração de texto e sentenças de PDF/TXT
│   │   ├── SinteseVoz/            # neural_tts.py e voice_cloner.py
│   │   ├── GestaoAssinaturas/     # Webhooks de pagamento (Kiwify, Stripe, Asaas, n8n)
│   │   ├── AssistenteIA/          # "Pergunte ao Livro" contextual
│   │   └── AlertasErro/           # Tratamento de exceções e monitoramento
│   ├── shared/python/             # Configurações de banco, Supabase e logger
│   ├── uploads/                   # Diretório de trabalho e cache de áudio
│   ├── api_server.py              # API Flask (Porta 4000)
│   ├── main.py                    # Motor de tarefas em segundo plano (APScheduler)
│   ├── requirements.txt           # Dependências Python
│   └── schema.sql                 # Esquema do banco de dados Supabase
├── frontend/
│   ├── src/
│   │   ├── components/            # AudioPlayer, UploadModal, VoicePicker, Drawers
│   │   ├── pages/
│   │   │   ├── Login/             # Tela de login e landing page Cyber-Dark
│   │   │   ├── Painel/            # Biblioteca com % lida e vozes favoritas
│   │   │   ├── Leitor/            # Leitor com karaoke sync e drawer de IA
│   │   │   ├── Vozes/             # Catálogo de vozes neurais & Duplicador IA
│   │   │   └── Configuracoes/     # Tipografia, temas e assinatura PRO
│   │   ├── services/              # speechEngine.ts, pdfParser.ts, supabase.ts
│   │   ├── types/                 # Tipos TypeScript
│   │   └── index.css              # Design System Soft & Bold Cyber-Dark Esmeralda
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## 🛠️ Como Executar Localmente

### 1. Backend (Python 3.10+)
```bash
cd backend
pip install -r requirements.txt
python main.py
```
*O servidor iniciará em `http://localhost:4000`.*

### 2. Frontend (Node.js 18+)
```bash
cd frontend
npm install
npm run dev
```
*Acesse o frontend em `http://localhost:5173`.*

---

## 📜 Licença
Desenvolvido por GTP Smart AI. Todos os direitos reservados.
