# Extração de livros (importar no aparelho)

Última atualização: 02/11/2026. Desde essa data a importação roda **no próprio aparelho**, em TypeScript.
Antes era feita no servidor, em Python (`servidor-arquivado/backend/components/ProcessadorLivros`).

## Código (`frontend/src/services/bookImport/`)

| Arquivo | O que faz |
|---|---|
| `index.ts` | Ponto de entrada (`importBookFile`): detecta o formato, extrai, monta a estrutura, faz a capa. Aceita também o `.json` de livro já processado do servidor antigo |
| `textPipeline.ts` | Frases, fala/narração/colchetes/título, parágrafos e capítulos. **Tradução fiel** do `text_pipeline.py` |
| `epub.ts` | EPUB (spine + sumário nav/ncx) e HTML |
| `pdf.ts` | PDF pelo pdf.js: linhas com posição, cabeçalho/rodapé, recuo, marcadores |
| `text.ts` | TXT, Markdown e DOCX |

- **O pipeline tem que continuar idêntico ao Python:** o ponto de leitura guardado é o número da frase. Em 02/11/2026 os dois deram
  as mesmas frases, tipos e parágrafos nos dois livros ORV (141.512 e 125.887 frases). Ao mudar o `textPipeline.ts`, comparar de novo
  (o Python está em `servidor-arquivado/backend/components/ProcessadorLivros/python/text_pipeline.py`).
- Livro grande no celular: o pipeline dá uma folga à tela a cada 2.000 parágrafos. No PC, 1,2 milhão de palavras levou 1,7 s.
- PDF digitalizado (sem texto) é recusado com aviso: precisa de OCR antes. `.doc` antigo e MOBI/AZW também não são aceitos.
- O PDF usa a versão do pdf.js do `node_modules` (o worker vai junto no build). As linhas vêm dos itens de texto (`hasEOL` e mudança de altura).
  Esta parte não é tradução linha a linha do `pypdf`: PDFs podem sair um pouco diferentes do servidor.

## Como os capítulos saem de um EPUB

- Lê os arquivos na ordem do *spine* e usa o sumário (`nav.xhtml` ou `toc.ncx`) para dar nome aos capítulos. Cada entrada do sumário
  vira capítulo no primeiro parágrafo de texto do arquivo para onde ela aponta.
- Nomes com mais de 70 caracteres são cortados (terminam em "..."). Isso é só a exibição: o capítulo existe.

## Problemas já resolvidos (não repetir)

- **Capítulos sumindo (Omniscient Reader's Viewpoint: 487 de 551).** O Calibre separa a imagem de abertura do capítulo num arquivo só
  com a imagem (`ch_26_split_000.xhtml`) e o texto no seguinte. O título de um arquivo sem texto passa para o próximo com texto (`carriedTitle`).
- **Capítulos fora de ordem (ORV [Sequencia]: 1000…1057 e depois 553…999).** O EPUB foi montado em ordem alfabética dos números.
  `fixAlphabeticalChapterOrder` refaz a ordem numérica **só** quando todo capítulo do sumário tem número, sem repetição, e a ordem do
  arquivo é exatamente a alfabética.
- Em JavaScript, `\w` e `\b` não entendem acentos: o pipeline usa `[\p{L}\p{N}_]` com a flag `u` no lugar.
