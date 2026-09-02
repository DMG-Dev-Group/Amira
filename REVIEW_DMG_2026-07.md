# Code Review — Flora Beauty (DMG)

**Data:** 10/07/2026 · **Revisor:** Claude (skill `dmg-code-review`) · **Solicitante:** Miguel
**Contexto:** site alugado para o cliente; alterações solicitadas em andamento.

---

## Resumo executivo

A base está **mais organizada do que a média de um MVP**: separação clara entre `services/` (lógica de dados) e `js/` de página, `firestore.rules` bem escrito (default-deny, bloqueio de auto-promoção a admin, ownership por `uid`) e tratamento de erro consistente com feedback ao usuário.

O problema central não é estilo — é **arquitetural**: o `package.json` tem só `firebase` e `boxicons`, **não existe pasta `functions/` nem nenhuma Cloud Function**. Vários comentários no código dizem "o backend valida via Cloud Function" — **esse backend não existe**. Tudo que as `firestore.rules` não conseguem validar sozinhas (preço, total, estoque) fica **confiando no cliente**. É daí que sai o bloqueante principal.

---

## 🔴 Bloqueante — corrigir antes de subir as alterações

### B1 — Preço e total do pedido são confiáveis no cliente (fraude de preço)
O caminho inteiro do preço nasce e morre no navegador, sem revalidação no servidor:

- `produto-detalhe.js:270-278` grava `precoUnitario: produtoAtual.precoVarejo` no carrinho.
- `carrinho.js:82` `calcularTotal` soma `item.precoUnitario` — valor vindo do documento `carrinhos/{uid}`, **que o próprio usuário tem permissão de escrever** (`firestore.rules:83-85`).
- `carrinho-checkout.js:296-311` calcula `total` no front e passa pro `criarPedido`.
- `pedidos.js:50-61` grava `subtotal`/`total` exatamente como vieram.
- `firestore.rules:98-105` aceita o `create` do pedido validando só `uidComprador` e `temItemAtacado` — **nunca compara o preço com a coleção `produtos`**.

**Exploração:** um usuário logado edita `carrinhos/{seuProprioUid}` (ou chama `addDoc` em `pedidos` direto pelo console) com `total: 0.01` e o pedido é aceito.

**Correção recomendada:** como não há backend, criar a Cloud Function `criarPedido` que **lê os preços atuais da coleção `produtos` no servidor** e monta o pedido a partir dela, ignorando qualquer preço enviado pelo cliente. Alternativa (b): endurecer as rules para validar cada `item.preco` via `get(/produtos/{id})` — funciona, mas é frágil e caro em reads. **Preferir (a)** — é exatamente o backend que está faltando.

### B2 — Cadastro sem barreira anti-bot (criação de contas em massa)
> Nota: achado levantado pelo Miguel na revisão do review — eu havia subestimado a
> severidade na primeira passada. É bloqueante.

`cadastrarUsuario` (`auth.js:53-95`) cria a conta no Auth, grava `usuarios/{uid}` no
Firestore **antes de qualquer verificação** e dispara `sendEmailVerification` — tudo sem
nenhuma proteção contra automação. Como a config do Firebase é pública, um script em loop
pode: inflar a fatura (escritas no Firestore + envio de e-mails), criar milhares de contas
fantasma e **queimar a reputação do domínio** mandando e-mails de verificação a vítimas que
nunca se cadastraram. (E-mail *duplicado* já é barrado pelo próprio Firebase Auth —
`auth/email-already-in-use` — então esse ponto específico não é o problema.)

**Correção:** (a) **Firebase App Check + reCAPTCHA**, exigido no Auth e no Firestore — é o
mecanismo que recusa requisições que não vêm do app real; (b) **não gravar `usuarios/{uid}`
antes do e-mail verificado** (criar o perfil no primeiro login já verificado ou via Cloud
Function `onCreate`). Validação em JS no front **não resolve** — o bot ignora a interface.

### B3 — Coleção `metricas` com escrita pública irrestrita (custo/spam) · severidade média
- `firestore.rules:110-111` → `allow create: if true`
- `metricas.js:61-74` → `addDoc` livre, sem validação de shape.

Qualquer pessoa **sem login** pode gravar documentos ilimitados, com qualquer formato, na coleção `metricas`. Num site alugado isso é passivo: inflar a fatura do Firebase (billing por escrita) e poluir o dashboard admin com lixo.

**Correção:** validar o shape na própria rule (allowlist de campos: `tipo`, `pagina`, `dispositivo`, `origem`, `criadoEm`; barrar campos extras e strings gigantes) e habilitar **Firebase App Check**. Idealmente, registrar métrica via Cloud Function.

---

## 🟡 Sugestão — melhora o código, não impede o merge

### S1 — XSS latente via `innerHTML` com dados não escapados (60 ocorrências)
`produto-detalhe.js:76-142` e `admin-produtos.js:119-135` injetam `p.nome`, `p.descricao`, `p.sku` e URLs direto em `innerHTML` sem escapar. Hoje o vetor é estreito (só admin escreve produtos), mas vira **XSS armazenado** se a conta admin for comprometida ou se algum campo passar a aceitar input de cliente (avaliações, etc.). `imagemURL` entra em `src=""` sem validação → um `onerror` injetável no dia que a fonte deixar de ser confiável.

**Correção:** helper `escapeHtml()` nos textos, ou migrar campos de texto para `textContent`/`createElement`. Vale virar padrão do projeto.

### S2 — Sem revalidação de estoque/preço no checkout
O item entra no carrinho com o preço/estoque do momento da adição e nunca é reconferido. Entre adicionar e finalizar, o produto pode ter mudado de preço, zerado estoque ou sido desativado. Mesma raiz do B1 — a Cloud Function de pedido resolve os dois de uma vez.

### S3 — `atualizarPerfil` faz `updateDoc` com spread `...dados` (auth.js:149-153)
Grava qualquer chave que chegar em `dados`. As rules hoje bloqueiam `role`/`statusRevendedor`, então não é exploração direta — mas é porta aberta: qualquer campo novo passado sem querer vai parar no documento. **Usar allowlist explícita** dos campos editáveis (`nome`, `telefone`, `fotoURL`).

### S4 — `buscarMetricas` lê todos os docs de 30 dias no cliente (metricas.js:82-90)
Agrega no front. Cada visita = 1 documento; a query cresce linearmente com o tráfego. Pra loja pequena, ok — mas anotar como **dívida técnica**: pré-agregar por dia quando o volume subir, senão o dashboard fica lento e caro.

---

## ⚪ Nitpick — opcional

- **N1** — `cadastro.js:191` tem `console.log("Toggle senha clicado")` esquecido. Remover.
- **N2** — Confirmado com o Miguel: `flora-5754a` é o **ambiente de testes** e o projeto será mantido nele por enquanto. Ao migrar para o banco de produção, refazer no projeto real: chaves do App Check/reCAPTCHA (ligadas ao domínio), config da Cloud Function e o `.firebaserc` — nada disso migra sozinho.
- **N3** — `README.md` descreve stack que não existe (Postgres/Express/Prisma/JWT/Zod). Atualizar para refletir a realidade (HTML vanilla + Firebase), senão confunde qualquer dev novo — e o próprio Claude Code.
- **N4** — *Não é vazamento:* a `apiKey` no `firebase-config.js:20` é identificador público de projeto Firebase, comportamento esperado no client. Registrado aqui só para não virar falso-positivo. A proteção real é App Check + rules.
- **N5** — Indentação inconsistente no `cadastro.js` (bloco do toggle de senha usa 4 espaços, o resto usa 2). Padronizar em 2.

---

## O que já está bom (manter)
- `firestore.rules` com default-deny final e prevenção de escalonamento de privilégio (cliente não muda o próprio `role`/`statusRevendedor`).
- Camada `services/` desacoplada das páginas — fácil de portar se um dia virar framework.
- Tratamento de erro com feedback ao usuário e falha silenciosa onde faz sentido (métricas, CNPJ).
- Validação de CNPJ (dígito verificador) e fluxo de verificação de e-mail no cadastro.
