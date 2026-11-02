# Testar no PC (Aedolia-PC.bat)

Criado em 02/11/2026.

## Como usar

- Dois cliques no **`Aedolia-PC.bat`** (raiz do projeto). Ele abre o app no navegador em `http://127.0.0.1:5180`.
  Feche a janela preta para parar.
- `Aedolia-PC.bat -Build` força compilar de novo. Sem isso, ele compila só se algum arquivo do app mudou depois do último build.
- Os livros importados no PC ficam **no navegador do PC**, separados dos do celular.
- **Atalhos "Aedolia"** com o ícone do app na Área de Trabalho e no Menu Iniciar (abrem o `.bat`). Criados por
  `deploy\criar-atalhos.ps1`; rode de novo se a pasta do projeto mudar de lugar. O ícone `deploy\aedolia.ico` é gerado a partir de
  `frontend\public\icon-512.png` (tamanhos pequenos em bitmap e 256 em PNG; com tudo em PNG o ícone aparecia como ruído).

## O que ele faz (`deploy\rodar-no-pc.ps1`)

1. Baixa o motor e as vozes se faltarem (`baixar-motor-voz.ps1`).
2. Instala o sherpa-onnx 1.13.8 para Python em `.pc-voz\lib` (fora do Git).
3. `npm install` (se faltar) e `npm run build` (se preciso).
4. Roda `deploy\voz_pc.py`: serve o `frontend\dist` e gera a voz em `/local-tts`, só para este computador (127.0.0.1).
   Os áudios gerados ficam em `.pc-voz\cache`.

- `npm run dev` também ouve as vozes se o `Aedolia-PC.bat` estiver aberto: o Vite repassa `/local-tts` para a porta 5180 (`vite.config.ts`).
- Sem o ajudante, o app toca silêncio no lugar da voz (só para testar a tela).

## Problemas já resolvidos (não repetir)

- **Caminho com acento:** o espeak-ng não abre `...\Criação de pdf Readers\...` no Windows e cai em `/usr/share/espeak-ng-data`.
  O `voz_pc.py` copia a fonética para `%LOCALAPPDATA%\Aedolia\espeak-ng-data`. Os modelos `.onnx` abrem normalmente com acento.
- **`python -I` ignora `PYTHONUTF8`:** o script usa `-X utf8`.
- Medido no PC (4 núcleos, 2 threads): ~6 a 10x o tempo real por voz.

## Teste automático usado (02/11/2026)

Edge sem tela (playwright-core de `%APPDATA%\npm\node_modules\@playwright\cli`), janela de 390 px, com dados iguais aos do celular antigo
(usuário salvo, livro só com metadados no ponto 5000, pasta, voz "pocket-estela", estatística pendente). Passou: estante, sem login,
aviso de livro sem texto, reimportar o `.json` mantendo ponto/pasta, voz antiga virando Dii, play com voz gerada, importar EPUB com capítulos.
