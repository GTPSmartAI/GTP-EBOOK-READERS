# Ouvir sem internet (capítulos baixados)

Última atualização: 27/09/2026

## Como a pessoa usa

- No leitor, abra **Capítulos**. Em "Ouvir sem internet", escolha quantos capítulos baixar a partir do atual (1, 3, 5 ou 10) ou toque no ícone de download de um capítulo.
- Capítulo baixado mostra o ✓ verde e "offline · Nd" (dias que faltam). Tocar no ✓ apaga o download.
- Os downloads **vencem em 7 dias** e são apagados sozinhos (ao abrir o app e a cada hora).
- Configurações > **Downloads offline** mostra o que está guardado, quanto ocupa e quando vence, com "Apagar tudo".
- Só aparece no **APK** (e no `npm run dev`, para testar). No navegador o espaço pode ser apagado sem aviso.
- O app precisa ficar aberto enquanto baixa (com a tela apagada o Android pausa o app).

## Como funciona

- Código: `frontend/src/services/offlineAudio.ts` (guardar, baixar, apagar, vencer), `frontend/src/components/ChapterDrawer.tsx` (botões), `frontend/src/components/OfflineDownloadsCard.tsx` (Configurações).
- O download usa a mesma rota da leitura normal (`POST /api/tts/prefetch-batch`, lotes de 20, 2 lotes ao mesmo tempo) e baixa cada MP3 logo em seguida. O cache de áudio do servidor fica em RAM e guarda só 600 trechos, então o MP3 precisa ser baixado na hora.
- Os MP3 ficam no **IndexedDB** do app (`GTP_OFFLINE_AUDIO`): store `clips` (um por trecho) e store `chapters` (um por capítulo, com validade). O texto do livro já fica no aparelho (`bookStorage.ts`, `GTP_EBOOK_READER_DB`).
- Chave do trecho: livro + hash (cyrb53) do texto, da voz, da cadência, do tom e do ritmo. O player (`speechEngine.ts`) procura primeiro o áudio baixado. Se a pessoa trocou de voz, com internet ele gera na voz nova; **sem internet** ele usa o baixado mesmo sendo de outra voz.
- Sem internet e sem o trecho baixado, o player **pausa e mostra um aviso**, em vez de pular trecho por trecho até o fim do livro.
- Tamanho medido: cerca de 18 KB por frase curta (MP3 do Edge TTS, 48 kbps, ~6 KB por segundo de fala). Um capítulo de 20 minutos fica perto de 7 MB.
- A velocidade não entra na chave: o áudio é sempre 1x e a velocidade é aplicada na reprodução.

## Testado

- Teste de ponta a ponta com o Edge sem tela (playwright-core, 390 px): baixar um capítulo, cortar a internet, tocar sem nenhum pedido ao servidor, aviso no capítulo não baixado, apagar e vencimento de 7 dias.
- Atenção ao testar no `npm run dev`: cortar a rede também corta o servidor do Vite, então módulos importados depois disso falham. No APK o código vem dentro do app.
