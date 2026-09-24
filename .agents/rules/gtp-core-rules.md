# Diretrizes Fundamentais — GTP CRM

## 1. Isolamento Multi-Tenant
- Toda e qualquer consulta, inserção ou atualização de dados de clientes, mensagens ou automações **DEVE** incluir a cláusula de isolamento `agency_id = %s`.
- Nunca exponha dados de uma imobiliária a outra.

## 2. Padrão de Fuso Horário
- O horário oficial de operação de todos os robôs e logs é o **Fuso Horário de Brasília** (`America/Sao_Paulo`).
- Sempre utilize `get_now_br()` ou converta objetos datetime adequadamente.

## 3. Integridade do WhatsApp e Corretores
- Instâncias de WhatsApp conectadas operam com anti-ban: respeite o cooldown de 5 a 12 minutos entre disparos.
- Lembre-se que proprietários (`role = 'empresa'`) podem operar sem equipe. Sempre use `(status = 'disparar' OR id = %s)` para garantir que donos não fiquem bloqueados em filas de disparo.

## 4. Contrato de Inteligência Artificial
- Prompts imobiliários devem responder **exclusivamente em JSON** estruturado.
- Renda e modelo de trabalho são inseparáveis: nunca pergunte idade antes de concluir o bloco de renda e tipo de serviço.
