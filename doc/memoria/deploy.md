# Deploy (publicação na VPS)

Última atualização: 25/09/2026

## Endereços

| O quê | Endereço |
|---|---|
| Site (frontend) | https://ebook.iagtp.com.br |
| API (backend) | https://backend-api.iagtp.com.br |
| Saúde da API | https://backend-api.iagtp.com.br/api/health |

## Como publicar uma atualização

Na raiz do projeto, no PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
```

Para também enviar a pasta `backend\uploads` (livros e caches locais), use `-SyncUploads`. Só é necessário na primeira vez ou para levar livros enviados localmente:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -SyncUploads
```

O script faz tudo sozinho, em uns 2 minutos:

1. Gera o frontend (`npm run build`) já apontando para `https://backend-api.iagtp.com.br`, pela variável `VITE_API_URL`.
2. Empacota o backend, sem `.env`, `uploads`, `models` e `scratch`.
3. Gera o arquivo de ambiente de produção a partir do `backend\.env` local, trocando alguns valores (veja abaixo).
4. Envia tudo para a VPS por `scp` e roda `deploy/remote_deploy.sh` lá.
5. Na VPS: gera a imagem Docker `ebook-api:<data-hora>`, atualiza os serviços e apaga imagens antigas (mantém as 2 mais recentes).
6. **GitHub:** depois do deploy dar certo, faz `git add -A`, um commit (mensagem `deploy <data-hora>` ou a de `-Message "..."`) e `git push` para `origin` na branch atual (repositório `GTPSmartAI/GTP-EBOOK-READERS`). `-NoGit` pula esta parte.
   - Trava de segurança: se as mudanças tiverem arquivo `.env`, `.keystore`, `.jks`, `keystore.properties`, chave SSH, linha no formato `ALGO_PASSWORD=valor` ou senha entre aspas no código (com letras e números), o script **não envia** para o GitHub e lista o que achou. O deploy na VPS já terá sido feito.
   - Se só o GitHub falhar (sem internet, sem permissão), o script avisa em amarelo; o site já está atualizado.

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Message "login com Google e downloads offline"
```

**Requisito:** a chave SSH `~/.ssh/id_ed25519` deste computador precisa estar autorizada na VPS (já está), e o Git deste computador precisa ter permissão de push no GitHub.

## Arquitetura na VPS

- **VPS:** `root@2.25.124.5`, Ubuntu, 2 processadores, 7,7 GB de memória. É compartilhada com outros sistemas (app cell, n8n, MinIO, Portainer).
- **Docker Swarm + Traefik.** O Traefik recebe tudo nas portas 80/443 e gera o HTTPS sozinho (Let's Encrypt, resolvedor `letsencryptresolver`). Os serviços ficam na rede Docker `GTP`.
- **Serviço `ebook_api`:** imagem `ebook-api:<tag>`, criada a partir de `backend/Dockerfile`. Roda o Flask no **Gunicorn** (1 processo, 32 threads, porta 5000).
  - Precisa ser 1 processo só: o cache de áudio em RAM e o limite de tentativas de login ficam na memória do processo.
- **Serviço `ebook_frontend`:** `nginx:alpine` servindo os arquivos do build, com a configuração em `deploy/nginx-frontend.conf`.
- **MariaDB:** roda direto na VPS, fora do Docker. O container acessa por `172.17.0.1:3306`. Banco `ebook_readers_gtp`.
- **MinIO:** bucket `ebook-readers-gtp`, acessado por `cell-s3.iagtp.com.br`.

### Pastas na VPS

| Pasta | Conteúdo |
|---|---|
| `/root/EBOOK-APP/backend.env` | Variáveis de ambiente de produção (permissão 600, tem senhas) |
| `/root/EBOOK-APP/uploads` | Uploads persistentes, montados em `/app/uploads` no container |
| `/root/EBOOK-APP/frontend/dist` | Arquivos do site, montados no Nginx |
| `/root/EBOOK-APP/deploy/nginx-frontend.conf` | Configuração do Nginx do site |
| `/root/EBOOK-APP/backend-src` | Código do último build do backend |

### Variáveis de ambiente

O `deploy.ps1` copia o `backend\.env` local e troca estes valores para produção:

| Variável | Valor em produção | Por quê |
|---|---|---|
| `DB_HOST` | `172.17.0.1` | Endereço do MariaDB visto de dentro do container. No computador local é `127.0.0.1`, pelo túnel SSH |
| `PORT` | `5000` | Porta do Gunicorn, a mesma configurada no Traefik |
| `HOST` | `0.0.0.0` | Aceitar conexões vindas do Traefik |
| `DEBUG` | `false` | |
| `TZ` | `America/Sao_Paulo` | |

Para mudar uma variável: altere o `backend\.env` local e rode o deploy de novo.

## Depois de publicar mudanças de login ou MinIO

Veja [contas-e-seguranca.md](contas-e-seguranca.md): definir a senha do dono e rodar `scripts/migrar_minio.py` dentro do container.

## DNS (Cloudflare)

O DNS do `iagtp.com.br` é gerenciado na **Cloudflare**, não na Hostinger. Registros criados:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `ebook` | `2.25.124.5` | **DNS only** (nuvem cinza) |
| A | `backend-api` | `2.25.124.5` | **DNS only** (nuvem cinza) |

Os registros precisam ficar **cinza**. Com a nuvem laranja:
- o Traefik não consegue gerar o certificado HTTPS;
- a Cloudflare segura o áudio que chega frase por frase (NDJSON);
- a Cloudflare corta pedidos acima de 100 segundos.

Para um subdomínio novo: crie o registro A cinza apontando para `2.25.124.5` e coloque o label do Traefik com o `Host(...)` no serviço.

## Comandos úteis

Ver se os serviços estão de pé:

```powershell
ssh root@2.25.124.5 "docker service ls --filter name=ebook_"
```

Ver os logs do backend (últimas 100 linhas):

```powershell
ssh root@2.25.124.5 "docker service logs --tail 100 ebook_api"
```

Reiniciar o backend sem novo deploy:

```powershell
ssh root@2.25.124.5 "docker service update --force ebook_api"
```

**Voltar para a versão anterior do backend.** Primeiro liste as imagens (ficam as 2 mais recentes):

```powershell
ssh root@2.25.124.5 "docker images ebook-api"
```

Depois troque a tag:

```powershell
ssh root@2.25.124.5 "docker service update --image ebook-api:<tag-anterior> ebook_api"
```

## Problemas já resolvidos (não repetir)

- **Erro 413 "Request Entity Too Large" ao enviar livro.** O Flask 3.1 limita campos de texto do formulário a 500 KB, separado do limite de arquivo, e a capa vai em base64 num campo de texto. A correção é `app.config['MAX_FORM_MEMORY_SIZE']` em `backend/api_server.py`.
- **Mudança no backend "não funciona".** O Python não recarrega o código sozinho: é preciso reiniciar o processo. Localmente, reinicie o `python api_server.py`. Em produção, rode o deploy.
- **`main.py` não sobe.** Ele importa `record_heartbeat`, que não existe em `shared/python/database.py`. Por isso o container roda só a API, pelo Gunicorn no `entrypoint.sh`. As tarefas agendadas de heartbeat e alertas de erro **não estão rodando**.
- **`entrypoint.sh` com quebra de linha do Windows (CRLF).** A `Dockerfile` converte automaticamente com `sed`.

## Desenvolvimento local

- Backend: `cd backend; python api_server.py` (porta 4000). Acessa o MariaDB da VPS pelo túnel SSH do `iniciar_dev.ps1`.
- Frontend: `cd frontend; npm run dev` (porta 5173). Sem `VITE_API_URL`, usa `http://localhost:4000`.
