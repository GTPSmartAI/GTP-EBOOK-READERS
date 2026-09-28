# Próximos passos (pendências)

Última atualização: 27/09/2026

Coisas que faltam antes de o app cobrar e crescer. Quase todas dependem de **criar contas em serviços externos** primeiro; por isso ficaram paradas. Ordem sugerida: 1 → 2 → 3 → 4 → 5 → 6.

## 1. Proteger o webhook de pagamento (urgente antes de cobrar)

- Hoje `POST /api/webhooks/payment` (`backend/api_server.py`) aceita **qualquer** JSON com um e-mail e ativa o plano PRO. Não confere assinatura nem segredo: qualquer pessoa vira PRO com um `curl`.
- Correção: exigir a assinatura do gateway escolhido (cada um tem a sua: Asaas manda um token no cabeçalho, Stripe assina com `Stripe-Signature` etc.) ou um segredo compartilhado com o n8n, guardado no `.env`.
- **Depende de:** escolher o gateway (item 2).

## 2. Gateway de pagamento

- O código (`GestaoAssinaturas/subscription_service.py`) já entende Kiwify, Hotmart, Asaas, Stripe e n8n, mas nenhum está ligado de ponta a ponta.
- **Precisa:** criar a conta no gateway, cadastrar o produto/plano PRO e apontar o webhook para `https://backend-api.iagtp.com.br/api/webhooks/payment`.

## 3. Política de privacidade e termos de uso

- O app não tem nenhum dos dois. São exigidos pela LGPD, pela Play Store, pelo Google (login em produção) e pelo AdMob (anúncios).
- Precisa de uma página pública (ex.: `https://ebook.iagtp.com.br/privacidade`) e um link na tela de login e em Configurações.

## 4. "Esqueci minha senha"

- Não existe. Quem esquecer a senha fica sem acesso (hoje só o script `definir_senha.py` resolve).
- **Precisa:** um serviço de envio de e-mail (SMTP próprio, Resend, Brevo...). Fluxo: link com token de uso único e validade curta, guardado como hash, igual às sessões.

## 5. Conta Google Cloud (login com Google)

- Publicar a tela de consentimento OAuth em **produção**. Em modo teste só os e-mails cadastrados como testadores conseguem entrar. A publicação pede o link da política de privacidade (item 3).
- Quando houver APK assinado com a chave de release ou da Play Store, cadastrar o SHA-1 dessa chave num client ID Android (veja [contas-e-seguranca.md](contas-e-seguranca.md)).

## 6. Conta Azure (vozes PRO)

- As vozes PRO usam o Edge TTS, que é um uso **não oficial** do serviço da Microsoft: pode parar a qualquer hora, e cobrar por ele é arriscado.
- Migrar para o **Azure Speech** oficial (mesmas vozes neurais pt-BR). Tem cota grátis mensal de caracteres neurais; depois cobra por caractere, o que permite calcular o custo por assinante.
- **Precisa:** conta Azure, recurso "Speech" criado, chave e região no `.env`.

## 7. Anúncios (ideia avaliada em 27/09/2026)

- **Sim, mas no formato certo.** Banner na tela de leitura atrapalha e rende quase nada (a pessoa ouve com a tela apagada).
- **Melhor formato: anúncio recompensado (AdMob, no APK).** A pessoa assiste 30 s e ganha, por exemplo, 1 hora de voz PRO ou um capítulo com voz premium. Empurra para o PRO em vez de competir com ele.
- Também possível: intersticial entre capítulos, só no plano grátis e com limite de frequência.
- Receita no Brasil é baixa por mil exibições; só fica relevante com milhares de usuários ativos. Serve para pagar o servidor do Piper (voz grátis) e converter para o PRO.
- **Depende de:** conta AdMob, política de privacidade (item 3) e tela de consentimento de anúncios (LGPD). Começar pelo APK; o AdSense no site é mais difícil de aprovar.

## Outras pendências técnicas (não dependem de conta)

- As tarefas agendadas de heartbeat e alerta de erro **não rodam** (o `main.py` quebra ao iniciar; veja [deploy.md](deploy.md)). Se a API cair, ninguém é avisado.
- Não há backup automático do MariaDB.
- Rever a licença do modelo Piper (voz base "lessac") antes de escalar (veja [voz-e-desempenho.md](voz-e-desempenho.md)).
