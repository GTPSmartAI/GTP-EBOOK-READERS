# Pastas da estante

Criado em 27/09/2026.

## O que é

- Cada usuário pode criar pastas para organizar os livros no Painel (ex.: "Ficção", "Estudos"). Um livro fica em **uma** pasta ou em nenhuma ("Sem pasta").
- As pastas são **só organização**: não mudam onde o livro está guardado no MinIO (`usuarios/<username>/<titulo>_<book_id>/` continua igual).
- Apagar uma pasta **não apaga os livros**: eles voltam para "Sem pasta".
- Nome: até 60 caracteres, sem repetir entre as pastas da mesma pessoa (sem diferenciar maiúsculas). Limite de 100 pastas por conta.

## Banco

- Tabela `book_folders` (`id`, `user_id`, `name`, `created_at`) e coluna `books.folder_id` (NULL = sem pasta). As duas são criadas sozinhas pelo `ensure_schema()` quando a API inicia.

## API (todas exigem login e só mexem nas pastas e livros do próprio usuário)

| Rota | O que faz |
|---|---|
| `GET /api/folders` | Lista as pastas |
| `POST /api/folders` `{name}` | Cria (409 se o nome já existe) |
| `PATCH /api/folders/<id>` `{name}` | Renomeia |
| `DELETE /api/folders/<id>` | Apaga; os livros ficam sem pasta |
| `PUT /api/books/<id>/folder` `{folder_id}` | Move o livro (`null` tira da pasta) |
| `POST /api/books/upload` com `folder_id` | O livro já entra na pasta |

- `GET /api/books` devolve `folder_id` em cada livro.

## App

- Painel: barra de pastas acima dos livros ("Todos", cada pasta com a contagem, "Sem pasta", "Nova pasta"). Com uma pasta aberta aparecem "Renomear pasta" e "Apagar pasta", e **livro enviado com a pasta aberta entra nela**.
- Cada livro tem o botão de pasta (ao lado da lixeira), que abre a janela "Mover para pasta", onde também dá para criar uma pasta nova e já mover o livro.
- Código: `frontend/src/pages/Painel/Folders.tsx` (barra e janela), estado em `App.tsx` (`folders`, `activeFolderId`). A lista de pastas fica guardada no aparelho (`gtp_folders_<user_id>` no localStorage) para aparecer sem internet.
