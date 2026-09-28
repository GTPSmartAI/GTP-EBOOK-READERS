# Extração de livros (capítulos) e reprocessamento

Última atualização: 28/09/2026

## Como os capítulos saem de um EPUB

- `backend/components/ProcessadorLivros/python/epub_extractor.py` lê os arquivos na ordem do *spine* e usa o sumário (`nav.xhtml` ou `toc.ncx`) para dar nome aos capítulos. Cada entrada do sumário vira capítulo no primeiro parágrafo de texto do arquivo para onde ela aponta.
- `text_pipeline.build_book_structure` corta nomes com mais de 70 caracteres (termina em "..."). Isso é só a exibição: o capítulo existe.

## Problemas já resolvidos (não repetir)

- **Capítulos sumindo (Omniscient Reader's Viewpoint: 487 de 551).** O Calibre separa a imagem de abertura do capítulo num arquivo só com a imagem (`ch_26_split_000.xhtml`) e o texto no seguinte (`ch_26_split_001.xhtml`). O sumário aponta para o arquivo da imagem, que não tem texto, e o título se perdia. Agora o título de um arquivo sem texto passa para o próximo arquivo com texto (`carried_title`).
- **Capítulos fora de ordem (ORV [Sequencia]: 1000…1057 e depois 553…999).** O próprio EPUB foi montado em ordem alfabética dos números. `_fix_alphabetical_chapter_order` refaz a ordem numérica, **só** quando todo capítulo do sumário tem número, sem repetição, e a ordem do arquivo é exatamente a alfabética. Em qualquer outro caso vale a ordem do arquivo.
- Conferido nos 11 EPUBs da estante em 28/09/2026: só os dois ORV mudaram; os outros ficaram com os mesmos capítulos e palavras.

## Reprocessar livros já enviados

Quando o extrator melhora, os livros antigos continuam com a extração velha até serem reprocessados:

```powershell
cd backend
python scripts\reprocess_books.py --dry-run --book-id <id>   # só mostra (capítulos antes -> depois)
python scripts\reprocess_books.py --book-id <id> [--book-id <id2>]
python scripts\reprocess_books.py --type epub                # todos os EPUBs
```

- Baixa o original da pasta do livro no MinIO, extrai de novo e atualiza o banco, o `texto-extraido.json` no MinIO e o cache local.
- Sobe `books.content_rev`. O app compara esse número com o da cópia guardada no aparelho e baixa o livro de novo quando é diferente (`sameContentRev` no `App.tsx`).
- Se a ordem das frases mudar, ajusta o ponto de leitura salvo (mesmo capítulo e mesma distância do início dele).
- **Rodando no computador, o cache da VPS continua velho.** Depois, apague na VPS `uploads/extracted/<id>.json`, `<id>.content.json.gz` e `<id>.content.json.gz.size` (a API passa a ler do banco). Exemplo:
  `ssh root@2.25.124.5 "cd /root/EBOOK-APP/uploads/extracted && rm -f <id>.json <id>.content.json.gz <id>.content.json.gz.size"`
- A troca automática da cópia no aparelho só funciona com o frontend que tem o `content_rev` (deploy e APK a partir de 28/09/2026).
