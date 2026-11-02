# Voz gerada no aparelho

Última atualização: 02/11/2026. **Testado no celular do usuário em 02/11/2026 (APK 2.0, instalado por cima do antigo): funcionou.**
A voz da época do servidor (Piper/Pocket/Google na VPS) está em
`servidor-arquivado/doc/voz-e-desempenho.md`.

## Como funciona

- **Motor:** sherpa-onnx **1.13.8** (onnxruntime + espeak-ng), rodando no processador do celular.
  Vem como `.aar` em `frontend/android/app/libs/` (fora do Git, baixado por `deploy\baixar-motor-voz.ps1`).
- **Não usar a 2.x:** a partir da 2.0 o espeak-ng saiu do pacote, e as vozes Piper não leem texto
  ("phoneme_codepoints is empty, no lexicon, and no frontend available").
- **Vozes:** modelos Piper completos (fp32), ~60 MB cada, dentro do APK em `assets/tts/<modelo>/model.onnx`,
  lidos direto do APK (gravados sem compressão, `noCompress 'onnx'`). Catálogo: `frontend/src/data/voice_catalog.json`.
  - Medido no PC (2 núcleos): fp32 ~11x o tempo real; **int8 saiu 4x mais lento** (3x) e o **fp16 não roda** no processador.
    Por isso as vozes são fp32, mesmo pesando mais.
  - Faber, Cadu e Jeff: dados CC0. **Dii (feminina) e Miro: CC BY-NC-ND 4.0, só uso não comercial.** Para vender o app, tirá-las ou licenciar.
  - Os modelos pt_BR "edresson" (baixa qualidade) não entraram.
- **Fonética (espeak-ng-data):** copiada uma vez do APK para a memória do app (`files/espeak-ng-data`),
  porque o espeak lê de arquivos de verdade. A versão da cópia é `ESPEAK_VERSION` no `LocalTtsEngine.java`.
  - **Precisa de todos os dicionários.** O português troca sozinho para o inglês em palavras inglesas
    ("Omniscient Reader's Viewpoint"). Sem o `en_dict` o espeak **encerra o processo** (fecharia o app). Achado em 02/11/2026.

## Código

| Arquivo | O que faz |
|---|---|
| `android/.../LocalTtsEngine.java` | Fila com prioridade (o trecho que vai tocar passa na frente), até 3 vozes carregadas (modo teatro), volume igualado (pico 0,89, ganho máx. 6x), WAV no cache |
| `android/.../LocalTtsPlugin.java` | Ponte com o app: `synthesize`, `promote`, `cancel`, `cancelAll`, `info`, `clearCache` |
| `src/services/localTts.ts` | Lado do app: junta pedidos iguais, cancela, e no PC usa o ajudante `deploy/voz_pc.py` |
| `src/services/speechEngine.ts` | Leitura: pré-carrega 30 trechos adiante, divide frase longa sem áudio pronto em início curto + resto, destaque da palavra |
| `src/components/VoiceEngineCard.tsx` | Configurações > Voz neste aparelho: vozes, velocidade do motor, áudio guardado |

- **Cache:** cada trecho vira um WAV em `cache/tts-audio/` (chave: modelo + ritmo + texto). Ouvir de novo não gera de novo,
  nem depois de fechar o app. Passou de 400 MB, apaga os mais antigos até 300 MB. O Android também pode limpar o cache se faltar espaço.
- **Threads:** 4 em celulares com 8 núcleos, 2 nos outros (no PC, 4 threads deram só +6% sobre 2).
- **GPU:** não é usada. O VITS no onnxruntime roda no processador; NNAPI é instável e foi descontinuado no Android 15.
- **Tela apagada:** o `PlaybackService` segura o processador (wake lock) enquanto toca, e a geração continua.
- A velocidade (1x, 2x...) é aplicada só na reprodução: o áudio é sempre gerado em 1x e serve em qualquer velocidade.

## Como trocar ou adicionar vozes

1. Escolher o modelo em <https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models> (`vits-piper-pt_BR-...`, sem `-int8`/`-fp16`).
2. Pôr o nome em `$Models` no `deploy\baixar-motor-voz.ps1` e rodar o script.
3. Adicionar a voz no `voice_catalog.json` (`model` = nome da pasta). Voz removida: mapear o id antigo em `legacy_ids`.
4. Gerar o APK.
