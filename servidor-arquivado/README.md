# Versão com servidor (arquivada)

De setembro a outubro de 2026 o Aedolia rodava com servidor: site + APK conversando com uma VPS
(API Flask, MariaDB, MinIO, login, plano PRO, vozes geradas no servidor). Em 02/11/2026 a VPS foi
resetada e o app passou a rodar **só no celular** (veja o [README da raiz](../README.md)).

Nada foi apagado: tudo o que só servia para a versão com servidor está aqui, guardado para quando o
app voltar para a VPS e for vendido.

## A versão completa e funcionando

A etiqueta do Git **`versao-servidor-vps`** marca o último commit da versão com servidor (a40619d,
13/10/2026). Para ver ou recuperar tudo exatamente como era:

```powershell
git switch -c voltar-para-vps versao-servidor-vps   # cria um ramo a partir dela
```

## O que tem nesta pasta

| Pasta / arquivo | O que é |
|---|---|
| `backend/` | API Flask (`api_server.py`), banco MariaDB (`schema_mariadb.sql`), MinIO, login e sessões, assinaturas, assistente de IA, extração de livros e as vozes do servidor (Piper, Pocket TTS, Google Cloud). Inclui o `.env` e os dados locais de teste (fora do Git). |
| `backend/uploads/extracted/` | Dois livros já processados (fora do Git): *Omniscient Reader's Viewpoint* e a *Sequência*. Dá para importar esses `.json` no app novo: o livro volta com o mesmo id e o ponto de leitura salvo no celular continua valendo. |
| `deploy/` | Publicação na VPS: `deploy.ps1`, `remote_deploy.sh`, `nginx-frontend.conf`. |
| `doc/` | Anotações que só valem com servidor: deploy, contas e segurança, sincronização entre aparelhos, downloads offline, próximos passos (pagamento, Google Cloud...). |
| `frontend/` | Telas e serviços do app que dependiam do servidor: login (`pages/Login`), assinatura PRO, pergunte ao livro (IA), administração, segurança da conta, downloads offline, duplicador de voz (`pages/Vozes` original), cliente da API (`services/api.ts`, `session.ts`), login Google (`googleAuth.ts`). Não fazem parte do build atual. |
| `iniciar_dev.ps1` | Subia backend + frontend juntos para desenvolver. |

## O que foi reaproveitado no app atual

- **Extração de livros** (`backend/components/ProcessadorLivros`): traduzida para TypeScript em
  `frontend/src/services/bookImport/`. O pipeline de texto gera **exatamente** as mesmas frases que o
  Python (conferido em 02/11/2026 com os dois livros acima: 141.512 e 125.887 frases idênticas).
- **Vozes Piper** (Faber, Cadu, Jeff): agora rodam no celular, pelo motor sherpa-onnx.
- **Estatísticas de leitura** (`shared/python/reading_stats.py`): o cálculo foi para `frontend/src/services/library.ts`.

## Para voltar para a VPS (quando for a hora)

1. Partir da etiqueta `versao-servidor-vps` e trazer as melhorias feitas depois (importação no aparelho,
   voz no celular) conforme fizer sentido.
2. **Licença das vozes:** Dii e Miro são CC BY-NC-ND 4.0 (uso não comercial). Para vender o app, tirar
   essas duas vozes ou licenciar com a TigreGotico. Faber, Cadu e Jeff são de dados CC0.
3. O APK continua com o mesmo identificador (`br.com.iagtp.ebook`) e a mesma chave de assinatura
   (cópia em `apk\chave-assinatura`), então a versão com servidor também instala por cima.
