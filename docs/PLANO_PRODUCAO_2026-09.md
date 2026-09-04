# Plano de Produção e Segurança — Amira

**Data:** 03/09/2026 · **Atualizado:** 04/09/2026 (decisões) · **Solicitante:** Daniel
**Natureza:** documento de planejamento — descreve *o que fazer, em que ordem e por quê*.

Cobre as alterações pedidas + uma análise de segurança e de "criptografia de
dados" do sistema inteiro, que era o foco do pedido.

## Decisões tomadas (04/09/2026)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Host único | **Vercel.** |
| 2 | Projeto Firebase de produção | **Criar.** A loja tem que estar pronta para produção, então separa de `flora-5754a` (testes). |
| 3 | Estoque compartilhado | **Sim** — um número só; venda de atacado pode zerar o varejo na hora. |
| 4 | Cartão de crédito | **Não adiar.** PIX **funcional primeiro** (via Mercado Pago, não mais "combina no WhatsApp"), cartão logo em seguida. Tudo Mercado Pago. |
| 5 | Regra de parcelamento | **Só o valor do carrinho conta.** Carrinho **> R$ 1.000** → juros a partir de 2x (só 1x sem juros). Carrinho **≤ R$ 1.000** → juros a partir de 5x (até 4x sem juros). A distinção por categoria (perfume × celular) foi abandonada. |
| 6 | Cloudflare | Explicado abaixo (§2.4). Decisão pendente: depende de a Amira ter um **domínio próprio** (`amira.com.br`); com o domínio `.vercel.app` não dá para usar. |
| 7 | Tema | **Forçar o claro como padrão** (mudança de 1 linha). Não inverter a estrutura de tokens agora. |
| 8 | Menores de idade | **Suavizar o texto** da política ("não recomendada para menores"), **sem** trava de idade no cadastro. |

---

## Como ler

| Marca | Significado |
|---|---|
| 🔴 | Bloqueia a ida para produção. Fazer antes de divulgar a loja. |
| 🟠 | Alteração de produto pedida. Risco controlado. |
| 🟡 | Endurecimento / dívida. Importante, não bloqueia. |
| 🧩 | Projeto próprio, multi-semana (pagamento com cartão). |

As alterações estão agrupadas em **fases** no fim do documento. A regra é:
segurança de base (Fase 0) vem antes de qualquer mudança de produto.

---

# PARTE 1 — Estado do sistema hoje

## 1.1 Arquitetura real

- **Frontend:** HTML/CSS/JS puro, uma pasta por página em
  `frontend/src/pages/`. Sem build, sem framework.
- **Backend/dados:** Firebase — Firestore (banco) + Firebase Auth. **Sem
  Cloud Functions** (decisão de custo: plano Spark).
- **Hospedagem:** hoje em dois lugares — `flora-5754a.web.app` (Firebase
  Hosting) e `amira-phi.vercel.app` (Vercel, recém-configurado com
  `vercel.json`). **Precisa escolher um.**
- **Projeto Firebase:** `flora-5754a` — criado como **ambiente de testes**.
  Ainda não existe projeto de produção.

## 1.2 O que já sustenta a produção

- O modelo de segurança está **inteiramente nas `firestore.rules`** — não há
  servidor entre o cliente e o banco. As regras hoje já fazem:
  - `pedidos`: allowlist de chaves — o documento de pedido **não pode conter
    valor monetário**. Preço/total são derivados da coleção `produtos` (que só
    o admin escreve) na hora de exibir.
  - `metricas`: shape validado, escrita pública só do formato esperado.
  - `usuarios`: allowlist de chaves no create e no update do dono, limites de
    tamanho de string, `role` imutável, `aceiteTermos == true`.
  - `camadas`: shape validado + `ehAdmin()`.
- **Escape de HTML** aplicado: todo dado dinâmico passa por `escapeHtml()` /
  `urlImagemSegura()` antes de entrar em `innerHTML`. É a defesa real contra
  XSS armazenado.
- **LGPD (primeira rodada, feita):** cadastro coleta consentimento
  (termos + marketing separado), banner de cookies em toda a loja,
  `privacidade.html`, direitos do titular via WhatsApp no perfil.
- **HTTPS** obrigatório nos dois hosts (Firebase e Vercel forçam TLS).

## 1.3 O que NÃO está pronto para produção

| # | Item | Situação |
|---|---|---|
| 🔴 | Projeto Firebase de produção | Não existe. O site rodaria em cima do ambiente de testes. |
| 🔴 | App Check / reCAPTCHA | Chave é o placeholder `COLE_AQUI_...`. App Check **desligado**. Qualquer script fala com o Firestore direto, ignorando o site. |
| 🔴 | `apiKey` restrita no Google Cloud | A chave web está sem restrição de domínio/API. |
| 🔴 | `privacidade.html` com dados reais | Está cheio de `[placeholder]` (razão social, CNPJ, Encarregado). Não é conforme assim. |
| 🟡 | `carrinhos` sem allowlist | Único bloco de regra ainda sem `keys().hasOnly(...)` nem limite de tamanho. |
| 🟡 | Sem testes automatizados das rules | O emulador com `@firebase/rules-unit-testing` é o teste de maior retorno do projeto. |
| 🟡 | Selo "MEI" no painel admin | Exibe dado que o próprio candidato gravou como se fosse verificado. |
| 🟡 | Sem cabeçalhos de segurança / CSP | Nem no Firebase nem no Vercel. |
| 🟡 | MFA na conta admin | Não configurado. Conta admin é o alvo de maior valor. |

---

# PARTE 2 — Segurança e criptografia de dados (análise)

Esta é a parte que o pedido pediu para aprofundar. Vou por tema.

## 2.1 Criptografia de dados

### Em trânsito
Já resolvido. Firebase Hosting e Vercel servem só por HTTPS/TLS. As chamadas
do SDK do Firebase (Firestore, Auth) também são TLS. **Nada a fazer.**

### Em repouso
O **Firestore criptografa 100% dos dados em repouso por padrão** (AES-256,
chaves gerenciadas pelo Google), antes de gravar em disco. Isso não é
opcional e não custa nada. No plano Spark **não há** como usar chave própria
(CMEK) — e para este projeto não faz falta.

**Criptografia de campo** (cifrar um campo específico antes de gravar, ex.:
CPF): é possível, mas quebra busca/ordenação por aquele campo e adiciona
gestão de chave no cliente (onde não há lugar seguro para guardar chave). A
loja hoje guarda **nome, e-mail, telefone, data de nascimento** — são dados
pessoais, mas de sensibilidade baixa/média. A LGPD exige "medidas técnicas
adequadas", não necessariamente cifra de campo para este perfil de dado.

**Recomendação:** não implementar criptografia de campo agora. Se um dia for
coletar CPF, documento com foto ou dado de saúde, aí sim reavaliar (e
provavelmente já vai existir backend para isso).

### Conclusão
"Criptografia de dados" para o porte da Amira **já está coberta** pelo
Firebase. O trabalho real de segurança está nos itens abaixo.

## 2.2 Chaves de API e variáveis de ambiente

### O que existe hoje
`services/firebase-config.js` tem a config web do Firebase **hardcoded e
commitada no GitHub público**, incluindo `apiKey: "AIzaSy...LXYU"`.

**Isso não é um vazamento.** A config web do Firebase (apiKey inclusa) é
**pública por design** — ela *identifica* o projeto, não *autentica*. O
Google documenta que ela pode ir no cliente. O que impede abuso não é
esconder a chave (impossível num site estático), é:

1. **Restringir a chave no Google Cloud Console** 🔴
   APIs e Serviços → Credenciais → a "Browser key" do projeto:
   - **Restrição de aplicativo:** "Referenciadores HTTP" → só os domínios
     reais (`amira.com.br`, `*.amira.com.br`, `localhost` p/ dev).
   - **Restrição de API:** só as APIs que o site usa (Identity Toolkit,
     Firestore, Firebase Installations, Token Service).
   Assim, mesmo copiada, a chave só funciona a partir dos seus domínios.

2. **App Check com Enforce** 🔴 (ver 2.5) — a barreira que realmente vale.

### Variáveis de ambiente
Hoje **não há nenhuma** — o site é estático puro, não há mecanismo de env.
Isso muda quando entrar o **pagamento com cartão** (Parte 4): o token de
acesso do gateway (Mercado Pago etc.) é um **segredo de verdade** e **nunca**
pode ir no cliente. Ele vai como *Environment Variable* numa função
serverless da Vercel.

**Regra a partir daí — classificar cada chave:**

| Chave | Tipo | Onde vive |
|---|---|---|
| Firebase web config (`apiKey`, `appId`…) | **pública** | pode ficar no cliente; ideal migrar para env da Vercel só por organização |
| reCAPTCHA v3 **site key** | **pública** (por domínio) | cliente |
| reCAPTCHA v3 **secret** | **segredo** | nunca no cliente — só se houver backend validando |
| `service-account.json` (seed/admin SDK) | **segredo forte** | só na máquina de quem roda o seed. Já está no `.gitignore`. |
| Token do gateway de pagamento | **segredo forte** | env var da Vercel Function, nunca no cliente |
| Chave de e-mail transacional (futuro) | **segredo** | env var da Vercel Function |

**Ação 🟡:** criar `docs/SEGREDOS.md` listando cada chave, tipo, onde vive e
como rotacionar. E confirmar que o histórico do Git não tem nenhum segredo
real (rodar `git log -p -- "*.json"` procurando `private_key`, tokens).

## 2.3 "Proteção contra SQL injection"

**O Firestore não usa SQL.** Não existe SQL injection aqui. O que existe de
análogo, e o estado de cada um:

- **Injeção de consulta NoSQL** — passar entrada do usuário direto como
  *nome de campo* ou *operador* numa query. O código **não faz isso**: os
  nomes de campo são fixos no código, e `where("campo", "==", valor)` recebe
  o valor como dado tipado, não como fragmento de query. **Risco baixo.**
- **As `firestore.rules` são o perímetro** — um cliente malicioso não usa o
  site: ele chama o Firestore direto com qualquer query que quiser. Então a
  regra tem que assumir entrada hostil. Hoje as coleções críticas
  (`pedidos`, `metricas`, `usuarios`, `camadas`) já têm allowlist de chaves e
  validação de shape. **Falta `carrinhos`** (🟡, ver Fase 2).
- **XSS** — *essa* é a "injeção" que importa nesta stack (injetar HTML/JS via
  dado que o admin vê no painel, ou que aparece em outra página). Está
  tratado com `escapeHtml()` / `urlImagemSegura()` em todo `innerHTML`. Uma
  violação que existia (o `<option>` do select de categoria) **deixou de
  existir** quando a Parte B removeu esse select.
- **Regra de ouro:** nenhuma coleção pode ficar aberta sem regra. Toda vez
  que criar coleção nova, criar a regra junto, com allowlist e limite de
  tamanho — não só `ehAdmin()`.

**Ação 🟡:** escrever a suíte de testes das rules no emulador
(`@firebase/rules-unit-testing`). O roteiro manual de `FALHAS_REMANESCENTES.md`
§5 vira teste quase 1:1. É isso que garante que uma regra não afrouxou sem
ninguém ver.

## 2.4 Rate limit

O plano Spark **não tem** limite de taxa para o Firestore. As alavancas:

1. **App Check com Enforce** 🔴 — de longe a mais eficaz. Corta requisição
   que não vem de um navegador real no domínio registrado. Resolve 90% do
   abuso automatizado (bots gravando `metricas`, tentativa de criar contas
   em massa, scraping agressivo).
2. **Firebase Auth já tem proteção nativa** — bloqueio por
   `too-many-requests`, proteção contra enumeração de e-mail. Já aparece
   traduzido em `traduzErroAuth`. Nada a fazer.
3. **Regras podem *dificultar* abuso** (exigir `criadoEm == request.time`,
   limitar tamanho de lista, allowlist) — mas **não** fazem rate limit real
   por IP/usuário. Já está aplicado onde dá.
4. **Cloudflare na frente do domínio (plano free)** 🟡 — é a resposta "de
   verdade" para rate limit num site estático de baixo orçamento:
   - Rate Limiting Rules (ex.: máx N requisições/min por IP em `/`).
   - WAF com regras gerenciadas (bloqueia payloads de ataque conhecidos).
   - Bot Fight Mode.
   - Bônus: cache de borda, esconde o IP de origem.
   Só precisa apontar o DNS do domínio para a Cloudflare. **Recomendo fazer**
   antes de divulgar a loja para volume.
5. **Se entrar backend na Vercel** (pagamento) — cada função pública precisa
   do seu próprio limite. Vercel tem rate limit de borda no plano pago; no
   free, dá para implementar um contador simples com Upstash Redis (free
   tier) ou Vercel KV.

**Recomendação:** App Check enforce (Fase 0) + Cloudflare free na frente
(Fase 2). Juntos, é proteção adequada para o porte da loja sem custo.

## 2.5 Captcha

O captcha desta stack **é o App Check com reCAPTCHA v3** — já está
esqueleto-pronto em `firebase-config.js`, faltando só a chave e o Enforce:

1. Console Firebase → App Check → registrar o app web com **reCAPTCHA v3**
   (o console gera a *site key*, ligada ao domínio).
2. Colar a chave em `RECAPTCHA_V3_SITE_KEY`.
3. No console, marcar **Aplicar (Enforce)** para **Firestore** e
   **Authentication**.
4. **Atenção:** a chave é por domínio. Ao migrar para o projeto de produção,
   refazer com os domínios reais (`amira.com.br` e o domínio da Vercel).

O reCAPTCHA v3 é invisível (pontua o comportamento, não pede "clique nos
semáforos"). Se quiser um desafio visível **só no cadastro/login** (onde o
abuso é mais caro), dá para adicionar um reCAPTCHA v2 checkbox nesses dois
formulários — mas com App Check enforce isso vira opcional.

**Custo:** App Check + reCAPTCHA v3 são **gratuitos no Spark, sem cartão.**

## 2.6 Resumo da Parte 2 — o que fazer

| Prioridade | Ação |
|---|---|
| 🔴 | Registrar reCAPTCHA v3, colar a chave, **Enforce** em Firestore + Auth |
| 🔴 | Restringir a `apiKey` no Google Cloud (referrer HTTP + APIs) |
| 🔴 | Projeto Firebase de produção separado do `flora-5754a` |
| 🟡 | Cloudflare free na frente do domínio (rate limit + WAF) |
| 🟡 | Allowlist + limite de tamanho em `carrinhos` |
| 🟡 | Suíte de testes das rules no emulador |
| 🟡 | `docs/SEGREDOS.md` + varredura do histórico do Git |
| 🟡 | Cabeçalhos de segurança + CSP (no `vercel.json`) |
| 🟡 | MFA na conta admin (Firebase Auth suporta TOTP sem custo) |

---

# PARTE 3 — Alterações de produto pedidas

## 3.1 🟠 Estoque compartilhado (varejo = atacado)

**Hoje:** `produtos` tem `estoqueVarejo` e `estoqueAtacado` independentes
(decisão A4 de uma rodada anterior). `estoquePorModo(produto, modo)` lê um ou
outro.

**Mudança:** um único campo `estoque`. Varejo e atacado consomem o mesmo
número.

**O que fazer:**
- `services/produtos.js`: `estoquePorModo()` passa a devolver
  `Number(produto.estoque) || 0` para os dois modos (mantém a leitura do
  campo legado `estoque` — que já era o fallback).
- `admin/produtos.html` + `admin/js/admin-produtos.js`: os dois campos de
  estoque viram **um só** ("Estoque (unidades)"). A validação "produto de
  atacado precisa de estoque de atacado" cai; passa a ser "produto precisa de
  estoque > 0 se tem preço".
- `disponivelNoModo()` **não muda** — ela olha preço, não estoque.
- A derivação de pedido (`services/pedidos.js`) e o aviso de estoque no
  carrinho já usam `estoquePorModo`, então pegam o campo compartilhado
  automaticamente.
- **Migração:** produtos existentes com `estoqueVarejo`/`estoqueAtacado` —
  um script pontual copia `estoqueVarejo` (ou o maior dos dois) para
  `estoque` e zera os antigos. Ou, mais simples: o admin re-salva cada
  produto uma vez.

**Risco:** baixo. É simplificação. O ponto de atenção é o pedido de atacado
— se o mesmo número serve os dois canais, uma venda de atacado grande zera o
estoque do varejo na hora. Confirmar que é isso mesmo que a loja quer.

## 3.2 🟠 Todos os inputs de foto por arquivo

**Já feito** para as fotos do produto (upload de arquivo → redimensiona no
canvas → data URI no documento, sem Firebase Storage).

**Falta converter os mesmos inputs de URL para upload de arquivo em:**
- `admin/produtos.html` — imagem do banner "Produto da Estação"
  (`p-banner-imagem`).
- `admin/js/admin-camadas.js` — imagem de capa das opções da camada
  principal (hoje é campo de URL no modal de opção).
- Imagens da home configuradas em `configuracoes/homeCarrossel` e
  `configuracoes/homeIphones` — hoje editadas direto no Firestore como lista
  de URLs. Fazer uma tela no admin ("Home / Aparência") com upload de
  arquivo para essas listas.

**O que fazer:** extrair a lógica de compressão que já existe em
`admin-produtos.js` (`lerArquivoComoDataURL`, `redimensionar`,
`comprimirFoto`) para um módulo compartilhado
(`services/imagem-upload.js`) e reusar nos três lugares.

**Risco:** baixo. O `urlImagemSegura()` já aceita `data:image/...;base64`. O
único cuidado é o limite de 1 MB por documento — a home tem várias imagens
numa lista só; se ficar perto do limite, aí sim vale um plano B (Cloudinary
free, imgbb) — anotar como dívida.

## 3.3 ✅ Branco (tema claro) como padrão inicial — FEITO (branch `feat/producao-fase-1`)

`services/tema.js` → `temaInicial()` agora devolve `"light"` fixo em vez de
seguir o `prefers-color-scheme` do sistema. A escolha manual salva no
`localStorage` continua respeitada.

**Ficou de fora (opcional, mexida maior):** inverter a estrutura de tokens
(claro no `:root`, escuro no `[data-theme="dark"]`) — hoje ainda é o
contrário, então pode haver um flash escuro de ~1 frame no primeiro acesso
de quem nunca escolheu tema, em conexão lenta. Se incomodar, vira tarefa
própria.

## 3.4 ✅ Switch de tema do admin — FEITO (branch `feat/producao-fase-1`)

**Era:** `tema.js` (script clássico) rodava e fazia
`querySelectorAll(".theme-toggle")` **antes** de `admin-sidebar.js` (módulo,
deferido) criar o botão `#theme-toggle-admin` — o botão nascia sem listener.

**Correção:** `tema.js` passou a usar **delegação de evento** — um listener
de clique em `document` que pega qualquer `.theme-toggle`, inclusive os
injetados depois. `admin-sidebar.js` só sincroniza o estado visual (`.active`)
do botão recém-criado. Nenhum HTML precisou mudar (tema.js segue clássico).

**Testar o toggle em:** home, catálogo, produto, carrinho, perfil e todas as
páginas do admin.

## 3.5 🟠 Toggle para ligar/desligar o atacado

**O que é:** um interruptor no admin que **desliga o modo atacado da loja
inteira** — some o botão "Atacado" da navbar, a página `atacado.html` passa a
dizer "indisponível no momento", e o checkout não aceita item marcado como
atacado.

**O que fazer:**
- Novo campo em `configuracoes/atacado`: `ativo: boolean` (junto do
  `qtdMinimaCarrinho` que já existe).
- `services/atacado-config.js`: nova função `atacadoEstaAtivo()`.
- `services/nav-atacado-visibilidade.js` (já existe e controla a visão do
  botão) passa a esconder tudo quando `ativo === false`.
- `js/atacado.js`: se desligado, renderiza um aviso e não deixa adicionar ao
  carrinho.
- `admin/pedidos.html` ou uma nova aba "Configurações" no admin: o toggle.
  (Provavelmente vale criar a aba "Configurações" agora — ela vai receber
  também o toggle de tema padrão, dados de PIX, mínimo de atacado, imagens da
  home… hoje tudo isso é editado direto no Firestore.)
- **`firestore.rules`:** o `create` de `pedidos` já valida
  `temItemAtacado` + `ehRevendedorAprovado()`. Adicionar: se
  `configuracoes/atacado.ativo == false`, negar pedido com
  `temItemAtacado == true`. (`get()` numa regra custa 1 leitura — aceitável.)

**Risco:** médio-baixo. O cuidado é o carrinho de quem já tinha item de
atacado quando o admin desligou — tratar como "item indisponível, remova".

## 3.6 ✅ Gap das categorias no menu sanduíche — FEITO (branch `feat/producao-fase-1`)

Os itens da camada principal injetados por `navegacao-camadas.js` não têm
`<svg>`, então o texto começava ~26px à esquerda dos itens com ícone.
`.mobile-menu-sublink` ganhou `padding-left: calc(0.8rem + 18px + 0.8rem)` +
`font-size` menor para alinhar e parecer sub-item. CSS só.

---

# PARTE 4 — 🧩 Pagamento com cartão de crédito

Este é o item grande. Ele **quebra a premissa "sem backend"** do projeto e é
um projeto próprio, de algumas semanas. Merece decisão explícita.

## 4.1 Por que precisa de backend

Processar cartão exige um **gateway com certificação PCI** — você nunca toca
no número do cartão. Todos os gateways (Mercado Pago, Stripe, PagSeguro,
Cielo…) precisam que **o seu servidor** faça a chamada autenticada que cria a
cobrança, usando um **token de acesso secreto**. Esse token **não pode** ir
num site estático.

Como a loja **acabou de ir para a Vercel**, a saída natural é
**Vercel Serverless Functions** (`/api/*`): pequenas funções Node, o token
vira *Environment Variable* da Vercel, e o front continua estático. Não
precisa de Cloud Functions nem sair do Spark do Firebase.

## 4.2 Gateway — recomendação

**Mercado Pago** para o Brasil:
- Cobre PIX **e** cartão num fluxo só (unifica com o que já existe).
- **Checkout Pro** (redirect/popup): backend mínimo — uma função que cria a
  "preferência" e devolve a URL. O Mercado Pago hospeda a tela de pagamento
  (PCI é problema deles).
- Parcelamento configurável na preferência.
- Webhook para confirmar pagamento.
- Taxas: PIX ~0,99%, cartão ~4,98% + parcelamento. Confirmar no painel MP.

Alternativas: Stripe (excelente DX, aceitação de cartão nacional às vezes
pior), PagSeguro/PagBank (mais burocrático).

## 4.3 Arquitetura proposta

```
1. Cliente monta o carrinho e "finaliza" → cria pedidos/{id} SEM valor
   (exatamente como hoje: itens = {produtoId, qtd, modo}).
2. Front chama  POST /api/pagamento  { pedidoId }
   → a função lê pedidos/{id} + produtos, RECALCULA o total no servidor,
     cria a preferência no Mercado Pago, grava
     pedidos/{id}.pagamento = { metodo, provedorId, status: "pendente" }
     e devolve a init_point (URL do checkout).
3. Cliente paga no ambiente do Mercado Pago.
4. Mercado Pago chama  POST /api/webhook-mp  → a função valida a
   assinatura, consulta o status real na API do MP e atualiza
   pedidos/{id}.pagamento.status = "aprovado" | "recusado".
5. pedido-confirmado.html reflete o status.
```

Ponto-chave de segurança: **o total é calculado no servidor** (na função),
nunca recebido do cliente — mantém a mesma garantia que as rules dão hoje
para o PIX.

## 4.4 Regras de parcelamento e juros (decisão 04/09)

**A regra passou a ser só sobre o valor total do carrinho** — sem distinção
por categoria:

| Total do carrinho | Parcelas SEM juros | Juros começa em |
|---|---|---|
| ≤ R$ 1.000 | até **4x** | 5x |
| > R$ 1.000 | só **1x** (à vista) | 2x |

Implementação:

- Função `parcelasSemJuros(totalCarrinho)` no front → devolve `4` ou `1`.
- Exibida no checkout ("em até 4x sem juros" / "à vista sem juros").
- Passada para a preferência do Mercado Pago
  (`payment_methods.installments` + configuração de quem absorve o juro).
- Acima do limite sem juros, o acréscimo é o da tabela do adquirente — o
  próprio Mercado Pago calcula e mostra na tela dele.

Nada custom no gateway além de limitar o nº de parcelas sem juros.

## 4.5 Impacto no resto do sistema

- **`firestore.rules`:** `pagamento.metodo` passa a aceitar
  `['pix_whatsapp', 'mercadopago']`; novo campo `pagamento.provedorId`
  (string). O `status` deixa de ser sempre `'pendente'` no create — a
  função é que muda depois (via Admin SDK, que ignora rules), então o
  cliente continua só podendo criar como `'pendente'`.
- **LGPD:** o Mercado Pago vira um **operador** — tem que entrar na seção 5
  ("Com quem compartilhamos") da `privacidade.html`, com link para a
  política de privacidade deles.
- **`.env` da Vercel:** `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
  `FIREBASE_ADMIN_SA` (a service account, como env var, para a função
  escrever no Firestore).
- **Testes:** o sandbox do Mercado Pago tem cartões de teste. Todo o fluxo
  se testa sem mover dinheiro.

## 4.6 Ordem dentro da Fase 4 (decisão 04/09: não adiar o cartão)

Um método **funcional** primeiro, cartão logo em seguida — tudo Mercado Pago:

1. **PIX via Mercado Pago** (não mais "combina no WhatsApp"): a função
   `/api/pagamento` cria a cobrança PIX, o cliente vê o QR Code / copia-e-cola
   na hora, e o webhook confirma sozinho. Já entrega a infra (Vercel
   Functions + env vars + webhook + Admin SDK escrevendo no Firestore).
2. **Cartão de crédito** reusa a mesma infra — muda só o tipo de pagamento na
   preferência e entra o `parcelasSemJuros()` (§4.4).

O PIX-por-WhatsApp atual (`configuracoes/pagamento` + `pedido-confirmado.js`)
vira fallback, ou é removido quando o PIX-MP estiver no ar.

---

# PARTE 5 — LGPD e privacidade (segunda revisão)

A primeira rodada entregou a base (consentimento, banner, política, direitos
via WhatsApp). O que falta para ficar **de fato** conforme:

| # | Item | Ação |
|---|---|---|
| 🔴 | `privacidade.html` com `[placeholder]` | Preencher razão social, CNPJ, endereço, e-mail do Encarregado. **Revisão de um advogado.** Sem isso, publicar a política é pior que não ter. |
| 🟠 | Direito de exclusão é só "manda WhatsApp" | Adicionar **botão "Excluir usuário"** no painel admin (a regra já permite só admin deletar `usuarios/{uid}`). E documentar o processo: prazo de resposta, o que é apagado, o que a lei obriga a reter. |
| 🟠 | Sem registro de atendimento a titulares | Uma planilha/coleção simples: quem pediu o quê, quando, o que foi feto. É prova de conformidade. |
| 🟡 | Retenção sem automação | Hoje "guardamos até X dias" é só texto. Um script mensal (ou rotina) que anonimiza conta inativa há N meses. Pode ficar para depois, mas tem que existir. |
| 🟡 | `carrinhos` sem limite | (mesmo item da Parte 2) — dado pessoal (o que a pessoa pretende comprar) sem allowlist nem TTL. |
| 🟡 | Analytics futuro | Se entrar Google Analytics / Meta Pixel, **tem que** ficar atrás do consentimento do banner (o gancho `consentiuAnalytics()` já existe). |
| 🟠 | Menores de idade (decisão 04/09: **suavizar o texto**) | Trocar "A loja é destinada a maiores de 18 anos" por "não recomendada para menores de 18", sem trava de idade no cadastro. Ajuste na seção 10 da `privacidade.html`. |
| 🟡 | Selo "MEI" (A1) | Continua exibindo dado auto-declarado como verificado. Trocar rótulo para "informado no cadastro" e, no médio prazo, refazer a consulta à BrasilAPI na hora da aprovação. |

---

# PARTE 6 — Ordem de execução (revisada com as decisões de 04/09)

## Fase 0 — Pré-produção (🔴 bloqueia tudo)

Nenhum destes é código no repositório — são passos de console/DNS. Eu
preparo os arquivos; a execução final é sua (precisa de acesso ao console).

1. **Projeto Firebase de produção** separado do `flora-5754a`. Console
   Firebase → criar projeto → registrar app web → copiar a nova config para
   `services/firebase-config.js` e o id para `.firebaserc`. Checklist em
   `docs/MANUAL_CONFIGURACAO.md` §5. Publicar as rules e os índices no
   projeto novo (`firebase use <novo>` + `firebase deploy --only firestore`).
2. **App Check + reCAPTCHA v3** com **Enforce** em Firestore e Auth (no
   projeto de produção). Colar a *site key* em `RECAPTCHA_V3_SITE_KEY`.
3. **Restringir a `apiKey`** no Google Cloud → Credenciais (referrer HTTP +
   APIs). Fazer no projeto de produção.
4. **Domínio real na Vercel** + adicionar o domínio (e o `*.vercel.app`) em
   Firebase Auth → Domínios autorizados. Definir se vai haver
   `amira.com.br` — isso destrava a Fase 2 (Cloudflare).
5. **Preencher `privacidade.html`** (razão social, CNPJ, endereço,
   Encarregado) + revisão jurídica.
6. Roteiro de teste de `FALHAS_REMANESCENTES.md` §5 **contra o servidor
   real**, logado como cliente comum.

## Fase 1 — Alterações de produto (🟠)

| # | Item | Situação |
|---|---|---|
| 7 | Tema claro como padrão (3.3) | ✅ feito — `feat/producao-fase-1` |
| 8 | Switch de tema do admin (3.4) | ✅ feito — `feat/producao-fase-1` |
| 9 | Gap do menu sanduíche (3.6) | ✅ feito — `feat/producao-fase-1` |
| 10 | Estoque compartilhado (3.1) | ✅ feito — `estoquePorModo()` devolve `produto.estoque` (fallback: maior dos legados); form do admin com 1 campo; tabela/ordenação. Falta só o **script de migração** dos produtos antigos (Fase 5, item 29). |
| 11 | Toggle liga/desliga atacado (3.5) | ✅ feito — `configuracoes/atacado.ativo`; nova página **Configurações** no admin (atacado + PIX); navbar esconde "Atacado" e a página avisa "indisponível" quando desligado; `firestore.rules` nega pedido de atacado com o modo desligado (`atacadoLigado()`). **Requer re-deploy das rules.** |
| 12 | Inputs de foto restantes por arquivo (3.2) | ✅ feito — `services/imagem-upload.js` (novo, compartilhado); banner "Produto da Estação" e capa de opção de camada agora são upload de arquivo. Home (`configuracoes/homeCarrossel`/`homeIphones`) segue sem UI no admin — vira tarefa própria (não é "input existente"). |

## Fase 2 — Endurecimento de segurança (🟡)

13. Allowlist + limite de tamanho em `carrinhos`.
14. **Cloudflare free na frente do domínio** — *só possível se a Amira tiver
    domínio próprio* (não funciona com `*.vercel.app`). Aponta o DNS do
    domínio para a Cloudflare, liga Rate Limiting + WAF + Bot Fight Mode.
15. Cabeçalhos de segurança + CSP (bloco `headers` no `vercel.json`, testar
    em preview antes).
16. Suíte de testes das rules no emulador (`@firebase/rules-unit-testing`).
17. `docs/SEGREDOS.md` + varredura do histórico do Git por segredo real.
18. MFA (TOTP) na conta admin.

## Fase 3 — LGPD operacional (🟠)

19. Botão "Excluir usuário" no painel admin + processo documentado.
20. Registro de atendimento a titulares (coleção simples).
21. Suavizar o texto de "menores de idade" na `privacidade.html`.
22. Corrigir o rótulo do selo "MEI" (A1) para "informado no cadastro".

## Fase 4 — Pagamento (não adiado — decisão 04/09)

23. **PIX via Mercado Pago primeiro** (§4.6): Vercel Functions `/api/pagamento`
    + `/api/webhook-mp`, segredos em Environment Variables, Admin SDK
    escrevendo `pedidos/{id}.pagamento.status`.
24. **Cartão** logo em seguida, reusando a infra: tipo de pagamento na
    preferência + `parcelasSemJuros(totalCarrinho)` (§4.4).
25. Ajuste nas `firestore.rules` (`pagamento.metodo in [...]`, `provedorId`).
26. Mercado Pago entra na `privacidade.html` como operador.
27. Testes ponta a ponta no sandbox do Mercado Pago.

## Fase 5 — dívida técnica

28. Retenção automatizada de dados (script/rotina mensal de anonimização).
29. Migração dos campos `estoqueVarejo`/`estoqueAtacado` legados (script).
30. Rebrand incompleto na documentação (`README`, `ROADMAP_FUTURO`,
    `REVIEW_DMG_2026-07` ainda dizem "Flora Beauty").

---

# PARTE 7 — Próximo passo

As 8 decisões estão registradas no topo. O que falta de **você** para a
Fase 0 andar:

- Dizer se a Amira vai ter **domínio próprio** (`amira.com.br` ou similar).
  Sem ele: sem Cloudflare, e o Firebase Auth fica preso ao `*.vercel.app`.
- Criar o **projeto Firebase de produção** e me passar a config nova (ou me
  dar acesso para eu preparar tudo e você só publicar).
- Conta no **Mercado Pago** (com as credenciais de sandbox para começar).

Enquanto isso, eu sigo pela Fase 1 (itens 10–12) e preparo os arquivos da
Fase 4 (as Vercel Functions e o `vercel.json` de rotas) para você só plugar
as credenciais.
