# Ponto de leitura entre aparelhos

Última atualização: 29/09/2026

## Regra

**Vale o ponto lido por último, em qualquer aparelho** (site, celular 1, celular 2). Antes valia o maior progresso, e isso quebrava a sincronização (veja abaixo).

## Como funciona

- Cada livro guarda, além do trecho e da porcentagem, **quando** a pessoa chegou naquele ponto: `progressReadAt` no app, coluna `reading_progress.read_at_ms` no banco (milissegundos desde 1970, horário do aparelho). A coluna é criada sozinha pelo `ensure_schema()` ao subir o backend.
- `POST /api/reading-progress` recebe `read_at_ms`. O banco **só troca o ponto salvo por um mais recente** (`IF(VALUES(read_at_ms) >= read_at_ms, ...)` em `save_reading_progress`). Um aparelho parado com um ponto velho não passa mais por cima do que foi lido em outro. Sem `read_at_ms` (APK antigo) ou com horário adiantado mais de 1 minuto, vale a hora do servidor.
- `GET /api/books` devolve `progress_read_at_ms` de cada livro.
- No app (`frontend/src/App.tsx`, `syncWithCloud`):
  - busca a estante e os pontos ao abrir, **ao voltar para o app** (`visibilitychange` e `resume` do Capacitor) e **a cada 30 s** com a tela aberta e a leitura parada;
  - se o ponto do servidor for mais novo e a leitura aqui estiver parada, o livro aberto vai para lá (`speechEngine.setPosition`, que muda o trecho sem tocar);
  - enquanto toca aqui, o ponto deste aparelho continua valendo;
  - se o ponto deste aparelho for mais novo que o do servidor (ex.: leu sem internet), ele é enviado.
- Envio durante a leitura: agrupado a cada 1,5 s, e **na hora** ao pausar ou sair do app.
- `newestProgress()` (App.tsx) decide entre duas cópias. Cópias sem horário (de antes desta mudança) ficam com o maior progresso.

## Problemas já resolvidos (não repetir)

- **Ponto velho apagando o novo.** Ao abrir, o app mandava para o servidor o progresso salvo no aparelho, sem saber se era velho. Quem abria o celular parado apagava o que foi lido no site. Esse envio foi removido; agora o servidor compara o horário.
- **"Maior progresso vence".** Quem voltava alguns capítulos nunca via isso nos outros aparelhos.
- **Livro aberto não mudava.** O app só buscava a estante uma vez, ao abrir. No Android o app fica aberto em segundo plano por dias, então nunca via o que foi lido em outro lugar.
- **Cópia completa do livro (IndexedDB) com ponto antigo.** Ao abrir o livro, o `loadFullBook` usava o ponto guardado junto com o texto. Agora usa o mais recente entre ele e o da estante.
