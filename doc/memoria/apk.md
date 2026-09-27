# App Android (APK)

Última atualização: 27/09/2026

## Como funciona

- O app usa o **Capacitor 8**: o mesmo site React (build do Vite) roda dentro de um WebView nativo. Não há código separado para o celular.
- O projeto Android fica em `frontend/android/` e a configuração em `frontend/capacitor.config.ts`.
- Identificador do app: `br.com.iagtp.ebook`. Nome: **Aedolia** (assinatura "por GTP Smart"; antes se chamava Ebook Readers GTP).
- **Logo:** livro aberto com ondas de som, redesenhada em vetor em `frontend/public/aedolia-mark.svg` (no app, componente `frontend/src/components/brand/AedoliaMark.tsx`). Ícone do app e da aba: logo branca sobre quadrado verde em degradê; tela de abertura: logo verde e o nome sobre fundo escuro. Ícone adaptável do Android: fundo em `res/drawable/ic_launcher_bg.xml`.
- Para refazer todos os ícones depois de mudar a logo: `cd frontend; npm install --no-save sharp; node ..\deploy\gerar-icones.cjs`, e depois gerar o APK.
- O identificador **não muda** com o nome: trocar faria o Android tratar como outro app (não atualiza o instalado) e exigiria refazer o login com Google. O domínio `ebook.iagtp.com.br` e o bucket `ebook-readers-gtp` também continuam.
- O build do APK usa o modo `android` do Vite (arquivo `frontend/.env.android`), que aponta para `https://backend-api.iagtp.com.br`. Sem isso o app tentaria `localhost:4000`, que não existe no celular.
- O backend já aceita o app: o CORS está liberado para qualquer origem em `/api/*`. No Android, a origem do app é `https://localhost`.

## Como gerar o APK

Na raiz do projeto, no PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\build-apk.ps1
```

O APK sai em `apk\aedolia-debug-<data>.apk` (a pasta `apk\` não vai para o Git). Leva uns 30 segundos depois do primeiro build.

O script faz:
1. `npm run build:android` no frontend (build no modo android + `cap sync android`).
2. Mapeia o `frontend` numa unidade virtual `E:` e roda o Gradle de lá (veja o problema dos acentos abaixo).
3. Copia o APK para `apk\` com data e hora no nome.

**Toda mudança no frontend precisa de um APK novo.** O app não baixa o site da internet; os arquivos vão dentro do APK.

## Leitura com a tela apagada

- O Android congela o app quando a tela apaga. Para a voz continuar, o app liga um **serviço em primeiro plano** (`frontend/android/app/src/main/java/br/com/iagtp/ebook/PlaybackService.java`) enquanto a leitura está tocando ou pausada.
- O serviço mostra o **player de mídia** do Android (notificação e tela de bloqueio), feito com MediaSession (`androidx.media`):
  - título "Livro – Capítulo" e a capa do livro (baixada da URL do MinIO);
  - barra de progresso **do capítulo atual**. Dá para arrastar, e isso leva ao trecho correspondente;
  - botões −15s / play-pausa / +15s. No Android 13 ou mais novo, o −15/+15 são "ações personalizadas" da MediaSession, porque o sistema monta o player sozinho;
  - os fones Bluetooth controlam o play/pausa, e anterior/próxima dos fones voltam/avançam 15s. Essas teclas são tratadas em `onMediaButtonEvent` do `PlaybackService`: o player não anuncia "pular faixa" (`ACTION_SKIP_TO_NEXT`), porque aí o Android 13+ troca os botões −15/+15 da notificação por "anterior/próxima", e sem isso o sistema não chamava `onSkipToNext`.
- O tempo do capítulo é **estimado** por palavras (145 palavras por minuto × velocidade), igual ao player da tela (`frontend/src/utils/readingTime.ts`). O Android anda a barra sozinho; o app só reenvia a posição quando ela se afasta mais de 4 s da mostrada.
- Enquanto toca, o serviço segura o processador (wake lock) e o Wi-Fi para baixar os próximos áudios.
- O site liga e desliga o serviço por `frontend/src/services/nativePlayback.ts` (plugin `BackgroundPlayback`, registrado no `MainActivity.java`). Os botões do player chegam como evento `command` e são tratados no `App.tsx`. No navegador essas chamadas não fazem nada.
- No Android 13 ou mais novo, o app pede a permissão de notificação no primeiro play.
- Alguns celulares (Xiaomi, Samsung, Motorola) ainda matam apps em segundo plano pela "otimização de bateria". Se a voz parar com a tela apagada, coloque o app como **"Sem restrições"** na bateria.

## Layout no celular

- Abaixo de 760 px de largura, o hook `frontend/src/hooks/useIsMobile.ts` troca para o layout compacto: barra do leitor com ícones e o player em três linhas com botões grandes.
- Navegação no celular: **menu embaixo, só com ícones** (`frontend/src/components/layout/MobileBottomNav.tsx`): Início, Leitor, **+ redondo verde (subir livro)**, Vozes, Configurações. O cabeçalho de cima mostra só o logo e o nome. No computador a navegação continua no cabeçalho.
- Regra (celular e computador): **dentro do livro** aparece só o player, e o menu de baixo some; **fora do livro** aparece o menu, e o player some. A leitura continua tocando fora do livro, e o controle fica no player de notificação do Android.
- Botão "voltar" do Android (`@capacitor/app`, no `App.tsx`), igual a um navegador: primeiro fecha a janela aberta por cima (subir livro, PRO, capítulos, vozes, etc., na ordem inversa em que abriram); sem janela, volta para a **tela anterior** (histórico `pageHistoryRef`, até 50 telas); sem histórico e no Início, minimiza o app em vez de fechar, para não parar a leitura. Todo `setActivePage` do App grava no histórico. Em `npm run dev`, `window.__aedoliaBack()` faz o mesmo "voltar" para testes.
- Para conferir o layout de celular com o Edge sem tela (headless), coloque o app num `<iframe>` de 390 px: a janela do navegador tem largura mínima de ~500 px e corta a foto.
- O player de computador tinha três blocos de largura fixa na mesma linha. No celular isso empurrava o botão de play para fora da tela.

## Ferramentas instaladas neste computador (sem administrador)

| O quê | Onde |
|---|---|
| JDK 21 (Eclipse Temurin, portátil) | `%LOCALAPPDATA%\AndroidBuild\jdk21` |
| Android SDK (platform 36, build-tools 35 e 36, platform-tools) | `%LOCALAPPDATA%\Android\Sdk` |

Não foram colocadas no PATH do sistema; o `build-apk.ps1` define `JAVA_HOME` e `ANDROID_HOME` sozinho. O Android Studio **não** é necessário.

## Instalar no celular

- **APK de teste (debug):** copie o arquivo para o celular (WhatsApp, Drive, cabo) e abra. O Android pede para permitir "instalar apps de fontes desconhecidas".
- Para a **Play Store** é preciso um build assinado (release, formato `.aab`) com uma chave própria. **Ainda não foi feito.** A chave nunca pode ir para o Git (`*.keystore`, `*.jks` e `keystore.properties` já estão no `.gitignore`) e, se for perdida, não dá mais para atualizar o app na loja.

## Problemas já resolvidos (não repetir)

- **Caminho com acentos.** A pasta do projeto se chama "Criação de pdf Readers". O plugin Android recusa o caminho e o `cmd` não acha o `gradlew.bat`. Solução: `subst E: <pasta frontend>` e rodar `E:\android\gradlew.bat` pelo caminho completo. Também foi colocado `android.overridePathCheck=true` em `frontend/android/gradle.properties`.
- **Livro grande "carregando" para sempre no celular.** O `/api/books/<id>/content` mandava o texto duas vezes (`content` inteiro e `sentences`) e sem compressão: 52 MB num livro de 3,7 milhões de palavras. Agora vai sem o `content`, com gzip (~8,6 MB), e a versão compactada fica salva em disco (`uploads/extracted/<id>.content.json.gz`). O leitor mostra o progresso do download e, se falhar, o botão "Tentar de novo".
- **`sdkmanager --licenses` pelo PowerShell não aceita as respostas "y" do pipe.** Use `cmd /c "sdkmanager.bat --licenses < arquivo_com_ys.txt"`.
