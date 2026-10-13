# Voz e desempenho da leitura

Última atualização: 13/10/2026 (seção "Motores de voz desde 13/10/2026" vale sobre o que estiver diferente abaixo)

## Como o áudio é gerado

- Cada frase (trecho) vira um MP3 separado, gerado no backend e guardado na memória RAM do servidor. São até 600 áudios; os mais antigos saem primeiro.
- **Dois motores, por plano (decisão de 27/09/2026, provisória):**
  - **Plano grátis: Piper**, modelos abertos rodando no nosso servidor (`backend/components/SinteseVoz/python/piper_engine.py`). Vozes **Faber** (padrão), **Cadu** e **Jeff**, todas masculinas (o Piper não tem voz feminina pt-BR). Dados de treino CC0; os modelos foram ajustados a partir da voz inglesa "lessac", cuja licença comercial não é totalmente clara. Rever antes de escalar.
  - **PRO: Edge TTS** (Francisca, Francisca Jovem, Thalita, Thalita Madura), `tier: "premium"` no catálogo. O Edge é um uso não oficial do serviço da Microsoft; o plano é migrar o PRO para a Azure oficial.
- **Quem controla o plano é o backend:** `voice_for_plan()` (neural_tts.py) troca qualquer voz premium ou personalizada pela voz grátis padrão quando o usuário não é `pro`/`unlimited`. Exceção: a frase de amostra da própria voz (para ouvir antes de assinar). O app também mostra cadeado "🔒 PRO" e abre a assinatura ao escolher uma voz PRO (`isFreeVoice` em `frontend/src/data/voices.ts`).
- **Piper, detalhes:** a fonética (espeak-ng) roda sob uma trava (não é segura em paralelo); a geração do som roda em paralelo. Saída MP3 48 kbps (lameenc). Mediu ~0,13 do tempo real no computador de desenvolvimento (1 frase de 5 s em ~0,6 s). Os modelos (~60 MB cada) ficam em `backend/models/piper` (fora do Git) e são baixados do Hugging Face no build da imagem (Dockerfile, `PIPER_MODELS_DIR=/app/models/piper`). A API carrega os modelos ao iniciar (`warm_up`).
- Os sons nasais (ã, õ) saem certos no piper-tts 1.8: nenhum fonema fica sem som no modelo (antes havia o aviso "Missing phoneme").
- Amostras geradas para o usuário ouvir: `apk\amostras-voz\` (fora do Git).
- **A velocidade (1x, 2x, 3x) é aplicada só no navegador** (`playbackRate`). O áudio é sempre gerado em 1x, então trocar a velocidade não gera nada de novo.

## Vozes disponíveis de graça (testado em 27/09/2026)

- O Edge TTS grátis só tem **3 vozes nativas do Brasil**: `pt-BR-AntonioNeural`, `pt-BR-FranciscaNeural` e Thalita. O Donato e as outras vozes brasileiras antigas **foram retiradas** (o Donato saiu do catálogo e aponta para o Antonio em `legacy_ids`).
- As vozes "Multilingual" (Andrew, Ava, Brian…) leem português com sotaque. **Não dá para forçar o português**: o serviço grátis recusa a tag SSML `<lang xml:lang='pt-BR'>` ("No audio was received").
- O usuário acha que só Francisca, Antonio e Thalita soam naturais.
- **Piper** (motor aberto, CPU) tem vozes pt-BR (faber, cadu, jeff, edresson). Numa primeira avaliação o usuário recusou as vozes dele; depois (27/09/2026) aceitou usá-las **provisoriamente no plano grátis**, para não depender de serviço externo, enquanto uma voz própria não é criada.
- Vozes novas do plano grátis, escolhidas pelo usuário ouvindo amostras: variações de tom e ritmo das vozes Edge. São elas `antonio-calmo` (−5 Hz, −12%), `antonio-jovem` (+10 Hz, +4%), `francisca-jovem` (+12 Hz, +4%) e `thalita-madura` (−10 Hz, −5%). Ele recusou Antonio Grave, Francisca Suave, Thalita Viva e as vozes Piper.
- Depois disso ele mandou tirar Antonio e as variações dele também: ficaram só as vozes da Francisca e da Thalita.
- **Voz nova no catálogo exige deploy do backend.** Se o servidor não conhece o id, `get_voice_metadata` cai na voz padrão (hoje o Faber) e o app toca a voz errada.

## Destaque da palavra lida

- O backend não informa o tempo de cada palavra. O `speechEngine.getSpokenWord()` estima a palavra pela posição no áudio (tempo atual ÷ duração), dando a cada palavra um tempo proporcional ao número de letras.
- Cada áudio sabe quais palavras do trecho cobre (`WordSegment`): a frase inteira, o início ou o resto de uma frase dividida, ou a partir da palavra clicada.
- O `ReaderView` troca a classe `spoken` direto no DOM a cada quadro, sem re-renderizar o React.
- **Rolagem que acompanha a voz (29/09/2026):** quando a palavra lida passa para outra linha, o texto sobe na hora para essa linha ficar a 35% da altura da tela (`FOLLOW_LINE_AT`). Antes o texto só subia quando a frase chegava perto do fim da tela, e o usuário achava que demorava. Rolar com o dedo solta o acompanhamento por 12 s.

## Pré-carregamento (`frontend/src/services/speechEngine.ts`)

- Mantém pelo menos **30 frases pedidas adiante**. Acima de 2,5x a quantidade cresce junto: 36 em 3x, 48 em 4x.
- Os pedidos saem em **lotes de 12**, com até **2 lotes ao mesmo tempo**.
- O backend responde cada lote em **streaming NDJSON** (`/api/tts/prefetch-batch` com `stream: true`): cada frase chega assim que fica pronta. O frontend também aceita o formato antigo, um JSON único com o lote inteiro.
- A próxima frase fica **pré-carregada num elemento de áudio** para a troca ser imediata.
- **Frase sem áudio pronto** (play, salto, clique em palavra): se tiver 12 palavras ou mais, é dividida em início curto + resto. O início sai mais rápido e toca enquanto o resto é gerado.
- **Pausar, pular ou dar play de novo cancela os pedidos antigos**, para eles não ocuparem as conexões do navegador.
- **Lote que volta vazio:** o app espera 3 segundos antes de pedir de novo, para não sobrecarregar o servidor.

## Vozes geradas no próprio servidor (abandonadas em 27/09/2026)

Um motor de voz rodando no processador da VPS aguentou só ~1,1x com uma pessoa ouvindo (medido), e o português tinha sotaque. O usuário mandou abandonar e ele foi removido do código, das dependências e do deploy. Na VPS sobrou uma pasta de modelos em `/opt`, que pode ser apagada. Para voltar a gerar voz no servidor, precisa de GPU (30 a 100 vezes o tempo real) ou de um serviço pago.

## Medição de engasgos (`frontend/src/services/audioDiagnostics.ts`)

- Fica ligada **só com `npm run dev`**. No build de produção ela é desligada.
- Abra o console (F12) e deixe ler. Para cada frase aparecem:
  - a origem do áudio (pré-carregado, baixado na hora ou gerado na hora);
  - o tempo parado esperando;
  - o silêncio embutido no MP3;
  - quantas frases estão prontas adiante.
- A cada 20 frases sai um resumo em tabela. `__audioDiag()` no console mostra o resumo na hora.
- **Como ler o resultado:**
  - "prontos adiante: 0" e "gerado na hora": a geração não acompanha a leitura. Buffer não resolve.
  - "parado esperando" baixo e silêncio embutido alto: o problema é o intervalo entre MP3s.
- O silêncio embutido medido nos MP3 é pequeno (~100–160 ms por troca em 2x) e não é a causa dos engasgos.

## Motores de voz desde 13/10/2026

| Motor | Plano | Vozes | Arquivo |
|---|---|---|---|
| **Piper** | grátis | Faber (padrão), Cadu, Jeff | `piper_engine.py` |
| **Pocket TTS** (Kyutai, aberto) | grátis | Rafael, Rafael Expressivo, Davi, Bruno, Marcos; Estela, Alice, Luna, Vera, Helena | `pocket_engine.py` |
| **Google Cloud TTS** (API oficial) | PRO | Kore, Aoede, Leda, Charon, Orus, Puck (Chirp 3 HD) | `google_tts.py` |

- O selo POCKET / PIPER / GOOGLE aparece em cada voz na lista (`ENGINE_BADGE` em `frontend/src/data/voices.ts`), e o campo `accent` do catálogo começa com o motor.
- **Edge removido.** Desde ~13/10/2026 a Microsoft responde **403** a todo pedido do Edge TTS (edge-tts 7.2.8). Trocar a versão informada não resolve; não tentar driblar. Os IDs antigos (Francisca, Thalita) apontam para vozes Google em `legacy_ids` (o código segue a corrente de IDs antigos).
- **Sintoma de motor fora do ar:** a leitura não toca ou pula trechos, porque o `speechEngine` tenta de novo e depois avança (`handlePlaybackFailure`).
- **Plano B (api_server.py, `synthesize_to_cache`):** se a voz pedida falha, o trecho sai no Faber. Falha do Google deixa o Google sem ser tentado por 120 s (`PREMIUM_RETRY_S`). O áudio do plano B fica no cache com a chave do Faber.

### Pocket TTS

- Um modelo só, em português (`language="portuguese"`, versão sem clonagem, pública). Cada voz escolhe um timbre pronto (`pocket_voice`) e a temperatura (`pocket_temp`, padrão 0.3; 0.6 = entonação mais variada, medida +30% de variação de tom).
- O modelo em português aceita 27 timbres (os de outros idiomas falam português com o modelo pt). Os escolhidos foram medidos pelo tom médio (F0): Estela 245 Hz, Alice 218, Luna 183 (mais expressiva), Vera 169, Helena 147 (feminina grave); Rafael 143, Davi 141, Bruno 118, Marcos 87 (o mais grave). Charles, Daan e Javert deram medida instável e ficaram de fora.
- Velocidade: ~2x o tempo real num i3 de 2 núcleos (~3 s por trecho). A versão `portuguese_24l` soa melhor, mas é 0,6x: lenta demais para ler ao vivo.
- Não é seguro para várias threads: a geração roda sob uma trava (um trecho por vez).
- No container: PyTorch só de CPU e modelo + timbres baixados no build (`HF_HOME=/app/models/hf`, Dockerfile).
- **No Windows:** precisa de `PYTHONUTF8=1` (a biblioteca abre um YAML sem informar UTF-8; já está no `iniciar_dev.ps1`). O Controle de Aplicativo do Windows bloqueia DLLs novas que ainda não têm reputação: instalar com `torch==2.14.1`, `pydantic==2.13.5` e `pydantic-core==2.46.5`, que já carregam.
- Amostras para ouvir: `apk\amostras-voz\pocket-vozes\` (fora do Git), uma por timbre, e `rafael-temp*.mp3` com as temperaturas.
- Qwen3-TTS foi testado e descartado: nenhuma voz pronta brasileira e lento demais sem placa de vídeo.

### Google Cloud (PRO)

- API REST `texttospeech.googleapis.com/v1/text:synthesize` com **chave de API**. Sem biblioteca do Google: usa `requests`.
- A chave fica no banco (`app_settings.google_tts_api_key`) e é cadastrada em **Configurações > Administração** (só e-mails em `ADMIN_EMAILS` no `.env`; para os outros as rotas `/api/admin/*` respondem 404). Antes de salvar, o backend confere a chave listando as vozes pt-BR. Sem chave no banco, vale `GOOGLE_TTS_API_KEY` do `.env`.
- "Testar vozes" gera uma frase em cada voz Google do catálogo e mostra quais a conta aceita. Se o Google não tiver alguma voz Chirp 3 HD em pt-BR, trocar o `google_voice` dela no catálogo (ex.: `pt-BR-Neural2-A`).
- Trocar de conta Google: colar a chave nova no mesmo campo.

### Como voltar atrás

- Tirar as vozes Pocket: apagar as entradas `"engine": "pocket"` do `voice_catalog.json` (e, se quiser, a linha `pocket-tts` do requirements e o bloco Pocket do Dockerfile). Quem tiver uma voz Pocket salva volta para o Faber.
- Teste rápido das vozes, sem subir o servidor: chamar `neural_tts.generate_speech_bytes(texto, voice_id)` para cada id de `VOICE_MAPPING` (com `PYTHONUTF8=1`).

## Problemas já resolvidos (não repetir)

- **Tela travando durante a leitura.** A animação de ondas atualizava o app inteiro 10 vezes por segundo. Agora é só CSS.
- **Tempo decorrido pesado.** O cálculo recontava as palavras do livro inteiro a cada frase. Agora conta uma vez ao abrir o livro.
- **Play que "não iniciava".** Durante o carregamento, o botão mostrava ▶ mas clicar pausava. Agora mostra um ícone de carregamento.
- **Troca de frase com buraco.** Ao avançar, o elemento de áudio pré-carregado era descartado. Agora é aproveitado.
- **Tela preta ao abrir o livro.** O `AudioPlayer` tinha hooks do React depois de um `return null`. Todos os hooks ficam antes de qualquer retorno.
