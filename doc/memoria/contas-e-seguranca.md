# Contas, login e segurança

Última atualização: 27/09/2026

## Como funciona o login

- Cada pessoa tem conta própria (e-mail, nome, **nome de usuário** e senha). A tela de login é obrigatória; o antigo "modo demonstração" e o usuário fixo no código foram removidos.
- **Senhas:** Argon2id (`argon2-cffi`). Hashes antigos (SHA-256 sem sal) ainda entram uma vez e são trocados por Argon2id no mesmo login. Regra: 8+ caracteres, maiúsculas, minúsculas e número.
- **Sessão:** no login o backend devolve um token aleatório de 256 bits. O app manda ele no cabeçalho `Authorization: Bearer ...`. No banco (tabela `user_sessions`) fica só o SHA-256 do token, com validade de 30 dias. Sair apaga a sessão; trocar a senha derruba todos os aparelhos.
- **Tentativas erradas:** 5 por e-mail ou 25 por IP em 15 minutos bloqueiam por 15 minutos (em memória: o gunicorn roda 1 processo).
- Código: `backend/shared/python/auth.py` (senha, sessão, bloqueio, `@require_auth`) e `frontend/src/services/session.ts` (token, `apiFetch`, login/cadastro/sair).
- O bloqueio é **por e-mail digitado**. Se a conta certa entra pelo celular e não pelo computador, quase sempre o navegador do computador está preenchendo outro e-mail (um antigo salvo, com erro de digitação).
- Configurações > **Senha e acesso**: trocar a senha, ou criar uma senha numa conta que só usa Google.

## Login com Google

- Rota `POST /api/auth/google` recebe o **ID token** do Google. O backend confere a assinatura com as chaves públicas do Google (`google-auth`), o emissor, o destinatário (nosso client ID) e se o e-mail foi verificado. Nunca confia em nome ou e-mail mandados pelo app.
- Conta: procura pelo `users.google_sub` (ID fixo da conta Google); se não achar, pelo e-mail (e liga o Google nela); se não existir, cria a conta sem senha (`password_hash` vazio, que nunca confere no login por senha).
- Configuração: `GOOGLE_CLIENT_IDS` no `backend/.env` (o client ID **Web** do Google Cloud; é público, não é segredo). Sem ela o botão some e a rota responde 503. O app busca o ID em `GET /api/auth/google/config`, então trocar não exige APK novo.
- Navegador: botão oficial do Google (`accounts.google.com/gsi/client`, liberado na CSP). A `Referrer-Policy` do site precisa ser `strict-origin-when-cross-origin`; com `no-referrer` o botão do Google falha.
- APK: o Google bloqueia o login dentro de WebView, então o app usa o login nativo do Android (plugin `@capgo/capacitor-social-login`, Credential Manager). Precisa de um client ID **Android** no mesmo projeto do Google Cloud, com o pacote `br.com.iagtp.ebook` e o SHA-1 da chave que assina o APK. A chave de debug deste computador tem SHA-1 `EB:18:D2:C3:F0:6B:EF:76:35:8F:6A:D9:77:AA:7E:1F:D8:45:59:F5`. Um APK assinado com outra chave (release, Play Store) precisa do SHA-1 dela cadastrado também.
- Código: `frontend/src/services/googleAuth.ts` e o componente `GoogleSignIn` em `frontend/src/pages/Login/index.tsx`.

## Regras de acesso (backend)

- O servidor **nunca** usa `user_id` mandado pelo app: o usuário vem do token (`g.user`).
- **Todo livro é privado** (decisão de 27/09/2026): só o dono vê, abre, ouve e apaga. A opção de publicar e a aba "Comunidade" foram removidas, junto com a rota `/api/books/<id>/toggle-visibility`. Motivo: livro público com direito autoral faria o app distribuir obra pirata.
- A coluna `books.is_public` continua no banco, mas sempre 0 (o `ensure_schema` zera qualquer valor antigo ao iniciar a API) e nunca vai para o app.
- Rotas abertas (sem login): `/api/health`, `/api/voices`, `/api/audio/<chave>.mp3` (o `<audio>` não manda cabeçalho; a chave é um hash imprevisível), `/api/auth/login|register|google`, `/api/auth/google/config`, webhook de pagamento.
- Removidas por serem inseguras: `/api/uploads/<arquivo>` (entregava todos os arquivos) e `/api/users/<email>/status` (criava contas com senha fixa).
- CORS só aceita o site, o app Android (`https://localhost`) e o `localhost:5173`. Variável `CORS_ORIGINS` para mudar.
- O Nginx do site manda CSP, HSTS e outros cabeçalhos de segurança (`deploy/nginx-frontend.conf`). Se aparecer um recurso bloqueado no console, a origem dele precisa entrar na CSP.

## MinIO: pastas por usuário

- Bucket `ebook-readers-gtp`, que deve ser **privado**. Cada livro fica em:
  `usuarios/<username>/<titulo-do-livro>_<book_id>/livro.<ext>`, `capa.<ext>` e `texto-extraido.json`.
- O banco guarda os caminhos (`books.storage_prefix`, `file_key`, `cover_key`). As capas chegam ao app por **link assinado** que vale 2 dias (a assinatura usa a meia-noite do dia, então o link não muda durante o dia e a imagem fica em cache).
- Credenciais do MinIO só no `.env` (antes estavam escritas em `minio_storage.py`; foram tiradas do código).

## Sistema zerado (27/09/2026)

- Depois do deploy com login, o sistema foi **zerado a pedido do dono**: todas as linhas de `users`, `books`, `reading_progress`, `reading_stats`, `subscriptions`, `user_sessions` e `cloned_voices` foram apagadas (as tabelas continuam), e todos os objetos do bucket também. O bucket estava com política pública de leitura e listagem; ela foi removida, então ele está **privado**.
- Todas as contas são criadas pela tela de cadastro, já com senha Argon2. Os scripts `definir_senha.py` (trocar a senha de uma conta sem entrar nela) e `migrar_minio.py` (livros no formato antigo `books/<id>/`) continuam no projeto, mas a migração não é mais necessária.
- Sobram na VPS arquivos antigos de cache em `/root/EBOOK-APP/uploads/extracted` e `uploads/books`. Ninguém consegue abrir esses arquivos pelo app, porque a API confere o livro no banco antes de ler o cache. Podem ser apagados quando for conveniente.

## Estatísticas de leitura

- Tabela `reading_stats` (usuário, dia, livro, palavras, segundos). O app soma só as palavras dos trechos que a voz **terminou de ler** e o tempo real em que ela estava tocando (`frontend/src/services/readingTracker.ts`); envia a cada 30 s e guarda no aparelho se estiver sem internet.
- `GET /api/stats/reading?period=day|week|month|year&offset=0` monta os números (`backend/shared/python/reading_stats.py`). Tela: Configurações > Estatísticas de leitura. O "palavras lidas" do Painel usa o total dessa tabela.
- Leituras anteriores a 27/09/2026 não entram: antes o app estimava pelo ponto do livro, e isso contava capítulos pulados.
