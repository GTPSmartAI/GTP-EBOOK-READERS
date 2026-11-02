# Pastas da estante

Criado em 27/09/2026. Desde 02/11/2026 ficam só no aparelho (antes ficavam no banco do servidor; a versão antiga
deste documento, com as rotas da API, está no Git na etiqueta `versao-servidor-vps`).

## O que é

- Pastas para organizar os livros no Painel (ex.: "Ficção", "Estudos"). Um livro fica em **uma** pasta ou em nenhuma ("Sem pasta").
- Apagar uma pasta **não apaga os livros**: eles voltam para "Sem pasta".
- Nome: até 60 caracteres, sem repetir (sem diferenciar maiúsculas).

## Onde fica

- Lista de pastas: localStorage `gtp_folders_<dono>`. A pasta de cada livro: campo `folderId` nos metadados da estante.
- Código: `src/services/library.ts` (validar nome, novo id, gravar), `src/pages/Painel/Folders.tsx` (barra e janela "Mover para pasta"),
  estado em `App.tsx` (`folders`, `activeFolderId`).
- Livro importado com uma pasta aberta entra nela.
