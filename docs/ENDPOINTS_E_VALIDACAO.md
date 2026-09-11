# URL BASE
https>//amira-phi.vercel.app/
# Endpoints e validação — Amira

Este site não tem um backend tradicional: a maior parte das escritas vai
**direto do cliente para o Firestore**, e quem valida é o arquivo
`firestore.rules`. Só o que envolve dinheiro de verdade (cobrar cartão,
gerar PIX) ou uma ação que o SDK web não pode fazer sem deslogar o admin
(criar conta de outra pessoa) passa por uma função serverless em `api/`.

Por isso este documento tem duas partes:

1. **Funções serverless** (`api/*.js`) — endpoints HTTP de verdade, na Vercel.
2. **Coleções do Firestore** — o cliente escreve nelas diretamente; a
   validação mora em `firestore.rules`, não em código de servidor.

Em ambos os casos, **validação de formulário no navegador é só UX** — o
que realmente impede um dado ruim de entrar no banco é o que está listado
aqui. Qualquer um pode abrir o DevTools e chamar a API ou o SDK do
Firestore direto, pulando o HTML.

Gerado em 2026-09-11, a partir da leitura de `api/*.js`, `api/_lib/*.js` e
`firestore.rules` no commit atual do `main`. Se esses arquivos mudarem,
este documento fica desatualizado — não é gerado automaticamente.

---

## Parte 1 — Funções serverless (`api/*.js`)

### `POST /api/pagamento`

Cria a cobrança no cartão (Checkout Pro do Mercado Pago).

| Camada | Validação |
|---|---|
| Método | Só `POST` — outros métodos: `405` |
| Autenticação | **Obrigatória.** ID token do Firebase, no corpo (`idToken`) ou header `Authorization: Bearer`. Verificado por `_lib/id-token.js` (assinatura RS256 contra a chave pública do Google, `aud`/`iss`/`exp`/`sub`) — não usa `firebase-admin/auth` (ver nota técnica no fim). Sem token ou token inválido: `401` |
| Autorização | O pedido citado (`pedidoId`) precisa existir e pertencer a quem chama (`uidComprador == uid`). Se não for dono: `404` (não `403` — não revela que o pedido existe) |
| Rate limit | 10 chamadas / 5 min, por uid, contador no Firestore (`_lib/limite.js`). Estourou: `429`. Firestore fora do ar: **passa sem limitar** (falha aberta — não pode derrubar o checkout) |
| Entrada | `pedidoId` obrigatório no corpo. Sem ele: `400` |
| Regra de negócio | Pedido já pago: `409`. Pedido sem itens ou com produto que não existe mais: `422` (`_lib/total-pedido.js`) |
| Valor cobrado | **Nunca vem do cliente.** Recalculado no servidor a partir de `produtos/{id}` (preço, desconto) + frete por bairro/peso. O que o cliente mandou no carrinho é só exibição |

### `POST /api/pix`

Gera cobrança PIX (QR + copia-e-cola), mesma família de validação do `/api/pagamento`.

| Camada | Validação |
|---|---|
| Método, autenticação, autorização, rate limit, `pedidoId` | Idênticos ao `/api/pagamento` (mesmo código) |
| E-mail do pagador | Obrigatório na API do Mercado Pago — vem do **perfil no Firestore** (`usuarios/{uid}.email`), nunca do corpo da requisição |
| Valor cobrado | Mesmo recálculo server-side de `/api/pagamento` |
| Idempotência | Chave `pix-{pedidoId}` no Mercado Pago — clicar duas vezes devolve o mesmo pagamento, não cria dois |

### `POST /api/webhook-mp`

Recebe a notificação de pagamento do Mercado Pago. É a **única rota pública de escrita** deste site (precisa ser — o MP não tem como mandar um ID token seu).

| Camada | Validação |
|---|---|
| Método | `POST` ou `GET` (GET é só para a reconciliação manual abaixo) |
| Assinatura (`x-signature`) | HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparação em tempo constante (`crypto.timingSafeEqual`). Não bate: `401`. Segredo não configurado: **aceita e avisa no log** (para não perder pagamento por env var esquecida — mas fica exposta enquanto isso) |
| **A validação de verdade** | Independente da assinatura, a função consulta o **status real na API do Mercado Pago** com o `MP_ACCESS_TOKEN` antes de gravar qualquer coisa. Um webhook forjado com `data.id` falso não engana isso — a consulta ao MP é que decide |
| Reconciliação manual (`GET ?pedidoId=`) | **Só admin.** Verifica ID token + `role == admin`. Sem isso, qualquer um descobria o status de pagamento de qualquer pedido só chutando o ID |
| Erros internos | Sempre responde `200` (exceto 401/403 da reconciliação) — evita o MP entrar em loop de retry. O erro real vai só para o log da Vercel |

### `POST /api/admin-usuario`

Cria conta de cliente/revendedor pelo painel admin (o SDK web não serve aqui porque trocaria a sessão do admin pela da conta nova).

| Camada | Validação |
|---|---|
| Método | Só `POST` — `405` |
| Autenticação + autorização | **Só admin.** ID token verificado + `usuarios/{uid}.role == "admin"` no Firestore (mesma fonte que as rules usam). Sem isso: `401`/`403` |
| E-mail | Regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`. Inválido: `400` |
| Senha | Mínimo 6 caracteres (mesmo mínimo do Firebase Auth). Curta: `400` |
| Nome | Obrigatório, não vazio depois de `trim()`. Vazio: `400` |
| Revendedor | Se `comoRevendedor: true`, CNPJ e razão social passam a ser obrigatórios. Faltando: `400` |
| Tamanho dos campos | `email` até 200, `nome` até 120, `cnpj` até 20, `razaoSocial` até 160 — cortados com `.slice()`, não rejeitados |
| Criação da conta | Via API REST do Identity Toolkit (`_lib/identity-toolkit.js`), assinando com a service account — não usa `firebase-admin/auth` |
| Consistência | Se a conta é criada no Auth mas o perfil falha ao gravar no Firestore, a conta **é apagada automaticamente** (evita conta órfã sem perfil) |
| Diagnóstico (`_diag`) | Só aparece na resposta depois que o chamador **já provou ser admin** — um 500 na própria verificação de admin não vaza detalhe interno para quem não é |

### `GET /api/status`

Diagnóstico de quais env vars a função enxerga (nunca o valor inteiro).

| Camada | Validação |
|---|---|
| Autenticação + autorização | **Só admin** — mesma checagem do `/api/admin-usuario`. Antes era pública; foi fechada por vazar `project_id`, `client_email` da service account e o final do token do Mercado Pago |

---

## Parte 2 — Coleções do Firestore (escrita direta do cliente)

O cliente usa o SDK do Firestore para ler/escrever essas coleções sem
passar por nenhuma função — quem valida é `firestore.rules`. Toda coleção
**não listada** aqui cai no bloqueio padrão do fim do arquivo
(`allow read, write: if false`).

### `usuarios/{uid}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | O próprio dono, ou admin | — |
| Criar (cadastro público) | O próprio uid, com **e-mail verificado** | Allowlist fechada de campos (`hasOnly`); `role` tem que nascer `"cliente"`; `aceiteTermos == true`; `aceiteMarketing` precisa ser bool; `consentimentoEm == request.time` (não pode forjar data); strings com limite de tamanho; `statusRevendedor`, se vier, só pode ser `"pendente"` |
| Atualizar (o próprio) | O dono | Mesma allowlist; **não pode mudar `role`**; **não pode mudar `ativo` nem `comissao`** (campos do sistema interno — só carrega, nunca edita); `statusRevendedor` só muda para `"pendente"`, e só se não estiver `"aprovado"` (autoaprovação bloqueada) |
| Criar/editar/apagar (qualquer uid) | Só admin | — (é assim que o sistema interno cadastra vendedor: admin cria perfil em uid alheio) |

### `usuarios/{uid}/dados/{docId}` (endereço salvo)

| Ação | Quem pode | Validação |
|---|---|---|
| Ler/escrever | Dono ou admin | Allowlist fechada (`cep`, `endereco`, `bairro`, `cidadeUf`, `complemento`, `atualizadoEm`); cada string com limite (`cep` ≤ 12, `endereco` ≤ 300, `bairro`/`cidadeUf` ≤ 120, `complemento` ≤ 200) |

### `produtos/{produtoId}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | Qualquer um, logado ou não | — |
| Escrever | Só admin | Sem allowlist de campos (o admin é confiável e o shape é grande — preço, estoque, camadas, banner…) |

### `camadas/{camadaId}` (filtros de navegação)

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | Qualquer um | — |
| Criar/editar | Só admin | Allowlist fechada; `nome` e `slug` 1–60 chars; `ordem` inteiro 1–50; `opcoes` lista ≤ 30 itens. **Limitação conhecida:** o conteúdo de cada opção dentro da lista não é validado (rules não fazem laço) |
| Apagar | Só admin | — |

### `configuracoes/{docId}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | Qualquer um | — |
| Escrever | Só admin | Sem allowlist |

### `carrinhos/{uid}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler/escrever/apagar | Só o dono | Allowlist: só a chave `itens`; `itens` tem que ser lista, ≤ 50 itens. **Não é fonte de preço** — o checkout recalcula tudo a partir de `produtos` |

### `pedidos/{pedidoId}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | Dono do pedido, ou admin | — |
| Criar | Quem está logado, com **e-mail verificado** | Allowlist fechada e completa (`hasOnly` + `hasAll`); `uidComprador` tem que ser quem está criando; `itens` lista de 1 a 30; **nenhum campo monetário é aceito** (preço/total são derivados depois, na hora de exibir); `temItemAtacado: true` só passa se a pessoa for revendedor aprovado **e** o modo atacado estiver ligado; `modoEntrega` só `entrega`/`retirada`; se `entrega`, endereço com CEP (8–12), rua (1–300) e bairro (1–120) obrigatórios e nada mais; `status` tem que nascer `aguardando_pagamento`; `pagamento.metodo` só `pix_whatsapp`/`mercadopago`; `pagamento.status` tem que nascer `pendente`; `criadoEm == request.time` |
| Atualizar | Admin (livre), ou o dono só para **cancelar** | O dono só pode mudar a chave `status`, só para `"cancelado"`, só saindo de `"aguardando_pagamento"`, e só se o pagamento ainda não estiver aprovado |
| Apagar | Só admin | — |
| **Risco residual documentado** | — | O conteúdo de cada item dentro de `itens` (produtoId, quantidade, modo) não é validado por rules — quem fecha isso é o recálculo server-side em `/api/pagamento` e `/api/pix` |

### `metricas/{docId}` (analytics próprio)

| Ação | Quem pode | Validação |
|---|---|---|
| Criar | Qualquer um, mesmo deslogado | Allowlist fechada; `tipo` só `pagina`/`produto`; `pagina` e `origem` strings 1–200 chars; `dispositivo` só `mobile`/`tablet`/`desktop`; `criadoEm == request.time` |
| Ler/editar/apagar | Só admin | — |

### `avaliacoes/{docId}`

| Ação | Quem pode | Validação |
|---|---|---|
| Ler | Todo mundo vê as **aprovadas**; o autor vê a própria mesmo pendente; admin vê tudo | — |
| Criar | Quem está logado, com e-mail verificado | Allowlist fechada; `uidAutor` tem que ser quem escreve; **nasce sempre `aprovada: false`** (publicar é só admin); `nota` inteiro 1–5; `texto` ≤ 600 chars; `nomeAutor` ≤ 120; `criadoEm == request.time`; **o pedido citado (`pedidoId`) precisa existir, ser do autor e estar com `status == "pago"`** |
| Editar/apagar | Só admin | O autor não pode editar depois de enviar |
| **Limitação documentada** | — | As rules confirmam que o autor tem *um* pedido pago, mas não confirmam que *aquele pedido contém o produto avaliado* (sem laço sobre `itens`). Quem fecha essa brecha é a moderação do admin, não a regra |

### `caixa/{docId}` e `vendas/{docId}` (sistema interno — não é usado pela loja)

| Ação | Quem pode | Validação |
|---|---|---|
| Ler/escrever | Quem for `admin` ou `vendedor` (e não estiver com `ativo: false`) | Sem allowlist de campos — o shape é definido pelo outro sistema (`flora-5754a-interno.web.app`), que compartilha este banco |

### `limites/{chave}` (contador de rate limit das funções serverless)

| Ação | Quem pode | Validação |
|---|---|---|
| Qualquer coisa, do cliente | **Ninguém** | Cai no bloqueio padrão de propósito — só o Admin SDK (que ignora rules) mexe aqui. Se o cliente pudesse escrever, dava para zerar o próprio contador |

### Qualquer outra coleção

`allow read, write: if false` — negado por padrão.

---

## Nota técnica: por que a validação de token não usa `firebase-admin/auth`

Todo endpoint acima que "verifica ID token" faz isso via `api/_lib/id-token.js`
(assinatura RS256 + chaves públicas do Google via `jsonwebtoken`), não via
`firebase-admin/auth`. Motivo: aquele módulo arrasta `jose` (ESM puro), que
derruba a função inteira em versões de Node anteriores à 20.19/22.12 — foi
o que já tirou o pagamento do ar em produção. O mesmo vale para criar/apagar
conta (`_lib/identity-toolkit.js`, API REST do Identity Toolkit) — nenhum
arquivo em `api/` importa `firebase-admin/auth`.
