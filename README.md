# Aedolia 🎙️📚

Leitor de livros com voz, **que roda inteiro no celular**: importa PDF, EPUB, DOCX, TXT, Markdown e HTML, lê em voz alta com destaque da palavra, separa narração, falas e mensagens entre colchetes (cada uma com sua voz) e guarda o ponto de leitura. Não precisa de internet, servidor nem conta.

A voz é gerada no processador do próprio celular (vozes Piper pelo motor sherpa-onnx).

> A versão anterior, com servidor (VPS, MariaDB, MinIO, login, plano PRO), está guardada em
> [`servidor-arquivado/`](servidor-arquivado/README.md) e na etiqueta do Git `versao-servidor-vps`.

## Como usar

| Quero... | Como |
|---|---|
| **Gerar o APK** | `powershell -ExecutionPolicy Bypass -File deploy\build-apk.ps1` → sai em `apk\aedolia-debug-<data>.apk`. Instale **por cima** do app que já está no celular (não desinstale: isso apaga os livros). |
| **Testar no PC** | Atalho **Aedolia** na Área de Trabalho ou no Menu Iniciar (ou dois cliques no **`Aedolia-PC.bat`**). Compila o app se o código mudou e abre no navegador, com as mesmas vozes do celular. Atalhos: `deploy\criar-atalhos.ps1`. |
| **Só compilar** | `cd frontend` e `npm run build` (o `.bat` usa esse build). |
| **Desenvolver com recarga automática** | `cd frontend` e `npm run dev` (para ouvir as vozes, deixe o `Aedolia-PC.bat` aberto ao mesmo tempo). |

Na primeira vez, os scripts baixam sozinhos o que fica fora do Git (~330 MB): o motor de voz e as vozes (`deploy\baixar-motor-voz.ps1`).

## Vozes

| Voz | | Licença |
|---|---|---|
| **Faber** (padrão), Cadu, Jeff | masculinas | dados CC0 |
| **Dii** | feminina | CC BY-NC-ND 4.0, só uso não comercial |
| **Miro** | masculina grave | CC BY-NC-ND 4.0, só uso não comercial |

## Estrutura

```
.
├── Aedolia-PC.bat              # abre o app no navegador do PC, com voz (teste)
├── frontend/                   # o app (React + Vite + Capacitor)
│   ├── src/
│   │   ├── App.tsx             # estado do app: estante, leitor, player, pastas
│   │   ├── pages/              # Painel (estante), Leitor, Vozes, Configurações
│   │   ├── components/         # player, leitor, janelas
│   │   ├── services/
│   │   │   ├── bookImport/     # importação de livros no aparelho (PDF, EPUB, DOCX, TXT...)
│   │   │   ├── localTts.ts     # ponte com o motor de voz (celular ou ajudante do PC)
│   │   │   ├── speechEngine.ts # leitura: fila, pré-carregamento, destaque da palavra
│   │   │   ├── bookStorage.ts  # livros guardados no aparelho (IndexedDB)
│   │   │   └── library.ts      # pastas e estatísticas de leitura (no aparelho)
│   │   └── data/               # catálogo de vozes
│   └── android/                # projeto Android
│       ├── app/src/main/java/br/com/iagtp/ebook/
│       │   ├── LocalTtsEngine.java   # gera a voz no celular (fila com prioridade, cache)
│       │   ├── LocalTtsPlugin.java   # ponte com o app
│       │   └── PlaybackService.java  # leitura com a tela apagada, player da notificação
│       └── tts-assets/         # vozes e fonética (baixadas, fora do Git)
├── deploy/
│   ├── build-apk.ps1           # gera o APK
│   ├── baixar-motor-voz.ps1    # baixa o motor e as vozes
│   ├── rodar-no-pc.ps1         # usado pelo Aedolia-PC.bat
│   ├── voz_pc.py               # ajudante de voz do PC (só 127.0.0.1)
│   ├── criar-atalhos.ps1       # atalhos com ícone na Área de Trabalho e no Menu Iniciar
│   ├── aedolia.ico             # ícone dos atalhos
│   └── gerar-icones.cjs        # refaz os ícones do app
├── doc/memoria/                # como cada parte funciona e problemas já resolvidos
└── servidor-arquivado/         # versão com servidor, guardada para voltar à VPS
```

Detalhes em [`doc/memoria/`](doc/memoria/README.md).

Desenvolvido por GTP Smart AI. Todos os direitos reservados.
