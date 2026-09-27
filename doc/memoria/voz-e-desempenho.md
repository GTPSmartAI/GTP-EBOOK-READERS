# Voz e desempenho da leitura

Última atualização: 27/09/2026

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

## Problemas já resolvidos (não repetir)

- **Tela travando durante a leitura.** A animação de ondas atualizava o app inteiro 10 vezes por segundo. Agora é só CSS.
- **Tempo decorrido pesado.** O cálculo recontava as palavras do livro inteiro a cada frase. Agora conta uma vez ao abrir o livro.
- **Play que "não iniciava".** Durante o carregamento, o botão mostrava ▶ mas clicar pausava. Agora mostra um ícone de carregamento.
- **Troca de frase com buraco.** Ao avançar, o elemento de áudio pré-carregado era descartado. Agora é aproveitado.
- **Tela preta ao abrir o livro.** O `AudioPlayer` tinha hooks do React depois de um `return null`. Todos os hooks ficam antes de qualquer retorno.
