# Dados no aparelho (livros, progresso, pastas, estatísticas)

Criado em 02/11/2026, quando o app deixou de usar servidor.

## Onde fica cada coisa

Tudo fica no armazenamento do app (WebView do Android, endereço `https://localhost`; no PC, o navegador):

| O quê | Onde | Chave |
|---|---|---|
| Livro completo (texto, frases, capítulos, capa) | IndexedDB `GTP_EBOOK_READER_DB` | store `books_full_data` |
| Estante leve + ponto de leitura + pasta | localStorage | `gtp_reader_books_meta_<dono>` |
| Pastas | localStorage | `gtp_folders_<dono>` |
| Estatísticas por dia e livro | localStorage | `gtp_reading_stats_<dono>` |
| Vozes de cada livro (modo teatro) | localStorage | `gtp_book_cast_<livro>` |
| Configurações e voz escolhida | localStorage | `gtp_reader_settings`, `gtp_favorite_voices` |
| Áudio já gerado | cache do app | `cache/tts-audio/*.wav` |

- **Dono (`<dono>`):** é o id do usuário que estava logado na versão com servidor (`gtp_session_user` no localStorage), para achar os
  dados antigos. Aparelho novo usa `local`. Código: `getLocalOwner()` em `src/services/library.ts`.
- A capa em imagem fica só no IndexedDB (o localStorage tem pouco espaço). Capas que apontavam para o servidor antigo (MinIO) são descartadas.

## Atualizar o app sem perder nada

- O APK novo instala **por cima** e mantém tudo, desde que tenha o **mesmo identificador** (`br.com.iagtp.ebook`) e a **mesma chave de assinatura**.
  A chave é a debug deste PC: `%USERPROFILE%\.android\debug.keystore` (SHA-256 `7751…ea30`). Cópia em `apk\chave-assinatura\`.
  **Guarde uma cópia fora do PC:** sem ela, o próximo APK não instala por cima e seria preciso desinstalar (apaga os livros).
- `versionCode` em `frontend/android/app/build.gradle`: sobe a cada versão (2 = versão sem servidor).
- **Desinstalar o app apaga tudo.** Não há mais cópia na nuvem.

## Livros que vieram da versão com servidor

- Na versão com servidor, o texto completo só ficava no celular para os livros **abertos nele**. Os outros têm só título e progresso.
- Ao abrir um desses, o leitor avisa e oferece **"Importar o arquivo"**: o arquivo escolhido entra no mesmo livro, mantendo ponto de leitura,
  pasta e vozes. A importação também casa sozinha pelo id (`.json` do servidor antigo) ou pelo título igual.
- Como o pipeline de texto é o mesmo do servidor (frases idênticas, conferido), o ponto de leitura cai no mesmo lugar.
- Estatísticas: as somas que estavam no servidor se perderam com a VPS. As leituras que o celular ainda não tinha enviado
  (`gtp_stats_pending_<dono>`) entram nas estatísticas de hoje na primeira abertura.
