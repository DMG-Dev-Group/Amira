# Flora Beauty — Prompt de implementação (FINAL)

> Este é o prompt único e definitivo. Ele consolida as funcionalidades/design/segurança pedidos pela DMG **e** as correções de segurança do code review. Substitui os arquivos `PROMPT_CLAUDE_CODE_FLORA_V2.md` e `BLOCO_PARA_PROMPT_CLAUDE_CODE.md` (mantidos apenas como histórico).

## 0. Contexto e regras gerais (ler antes de qualquer alteração)

**Skills a utilizar nesta tarefa:** `dmg-code-review`, `dmg-seguranca`, `flora-beauty-context`, `dmg-design-uiux`.

**Sobre o projeto (confirme com a skill `flora-beauty-context`):** Flora Beauty é um e-commerce cuja stack **real** é HTML/CSS/JavaScript vanilla, uma página por rota em `frontend/src/pages/`, com backend em **Firebase (Firestore como banco + Firebase Auth)**. Os serviços de dados ficam em `frontend/src/pages/services/` e o painel admin em `frontend/src/pages/admin/`. **Não existe backend próprio hoje** (o `package.json` só tem `firebase` e `boxicons`, e não há pasta `functions/`).

**Regras que valem para TODAS as tarefas abaixo:**

1. **Considere o sistema como um todo.** Cada mudança precisa ficar consistente entre páginas, serviços (`services/`), painel admin e regras do Firestore (`firestore.rules`).
2. **Mantenha o Firebase.** Não migre para Express/Postgres/Prisma. O `README.md` descreve uma stack que **nunca foi implementada** — ignore-o como fonte de arquitetura.
3. **Princípio de segurança inegociável:** **nenhum preço, total, estoque ou permissão pode ser decidido pelo cliente.** Se as `firestore.rules` não conseguem validar algo sozinhas, isso vira **Cloud Function**. Texto dinâmico em tela nunca é interpolado cru em `innerHTML`.
4. **Toda coleção nova precisa de regra correspondente em `firestore.rules`** (o padrão do banco é negar).
5. **Priorize escalabilidade, segurança, performance e manutenção** em toda decisão.
6. **Documente enquanto trabalha** — ver a seção **E. Documentação** (entregável obrigatório).
7. O projeto Firebase atual (`flora-5754a`) é **ambiente de testes**, não produção. Ao migrar para o projeto de produção depois, será preciso **refazer no projeto real**: chaves do App Check/reCAPTCHA (ligadas ao domínio), a configuração das Cloud Functions e o `.firebaserc` — nada disso migra sozinho.

**Ordem de execução recomendada:** implemente primeiro a seção **C (Fundações de segurança)**, porque várias features das seções A e B dependem dela (App Check, Cloud Function de pedido, cadastro seguro). Depois siga para A e B, e documente em D o tempo todo.

> As anotações "Provável ponto de alteração" são pistas para acelerar sua análise, não ordens rígidas — confirme no código antes de mexer.

---

## C. Fundações de segurança (EXECUTAR PRIMEIRO)

Aplique a skill `dmg-seguranca`. O objetivo global é um site **100% seguro e protegido contra invasões** — revise **possibilidade de invasões, injeção no banco (DB injection), interceptação (interception)** e demais vetores. Os itens abaixo são os pontos concretos já identificados (não se limite a eles se encontrar outros):

### C0 — Habilitar Firebase App Check (pré-requisito de tudo)
Inicializar o **App Check com reCAPTCHA (v3/Enterprise)** em `firebase-config.js` e **exigir** a atestação no console do Firebase para **Auth e Firestore**. Sem isso, um bot chama o SDK direto (a config do Firebase é pública) e ignora toda a interface. Este item é **pré-requisito de C2, C3 e C4**.
*No ambiente de testes `flora-5754a`, configure para desenvolver; as chaves serão refeitas no projeto de produção depois.*

### C1 — Integridade de preço e do pedido (impedir fraude de valor)
Hoje o preço nasce e morre no cliente: `precoUnitario` é gravado no carrinho (`services/carrinho.js`, `js/produto-detalhe.js`), o total é calculado no front (`js/carrinho-checkout.js`) e gravado sem revalidação (`services/pedidos.js`); as `firestore.rules` (coleção `pedidos`) **não comparam o preço com a coleção `produtos`**. Como o usuário tem permissão de escrever o próprio carrinho, ele pode forjar um pedido com `total` arbitrário (ex.: R$ 0,01) via console/API.

**Correção:** criar uma **Cloud Function `criarPedido`** que recebe apenas identificadores/quantidades (ex.: `{ produtoId, quantidade, modo }`), **lê os preços atuais da coleção `produtos` no servidor**, e **recalcula subtotal, frete e total** — ignorando qualquer valor enviado pelo cliente. Essa mesma função deve **revalidar estoque, preço e se o produto está ativo** no momento do checkout.
*Observação: o admin editar preço na coleção `produtos` é o fluxo **autorizado** e correto (`firestore.rules` já restringe escrita a admin) — não altere isso.*

### C2 — Cadastro seguro (e-mail válido + anti-abuso)
Dois requisitos combinados:

- **(a) E-mail existente/válido:** no cadastro, a pessoa deve informar um **e-mail que exista** — não pode cadastrar um e-mail inexistente. Caso informe um e-mail inválido/inexistente, o site deve **exibir um aviso pedindo um e-mail válido**.
- **(b) Anti-abuso / anti-bot:** hoje `cadastrarUsuario` (`services/auth.js`) cria a conta, grava `usuarios/{uid}` e dispara verificação **sem nenhuma barreira** — um script em loop infla billing, cria contas fantasma e queima a reputação do domínio. Correção: **App Check exigido no Auth** (C0) **e não gravar o documento `usuarios/{uid}` antes do e-mail ser verificado** (criar o perfil no primeiro login já verificado, ou via Cloud Function `onCreate`).

**Importante:** validação apenas em JS no front **não resolve** o abuso — o bot pula a interface inteira. A garantia real vem do App Check + verificação de e-mail no servidor.
*Provável ponto de alteração: `js/cadastro.js`, `services/auth.js`, `firestore.rules` (coleção `usuarios`).*

### C3 — Fechar a coleção `metricas`
`firestore.rules` permite hoje `create: if true` em `metricas`, ou seja, **escrita pública ilimitada** (risco de billing e lixo no dashboard). Validar o **shape** na própria regra (allowlist de campos: `tipo`, `pagina`, `dispositivo`, `origem`, `criadoEm`; barrar campos extras e strings acima de ~200 caracteres). O App Check (C0) cobre o resto.

### C4 — Escapar toda saída dinâmica em `innerHTML`
Há ~60 usos de `innerHTML` com dados interpolados crus (começar por `js/produto-detalhe.js` e `admin/js/admin-produtos.js`). Criar um helper `escapeHtml()` e aplicá-lo a todo **texto** de dado dinâmico, ou usar `textContent`/`createElement`. Validar que `imagemURL` é `https://` antes de usar em `src`. **Este é o padrão do projeto daqui pra frente.**

### C5 — `atualizarPerfil` com allowlist explícita
Em `services/auth.js`, `atualizarPerfil` grava qualquer chave via spread `...dados`. Trocar por **allowlist explícita** dos campos editáveis (`nome`, `telefone`, `fotoURL`). Relevante porque a troca de tipo de conta (A5) vai mexer no perfil.

---

## A. Funcionalidades

### A1 — Corrigir a busca no mobile
O sistema de busca **não está aparecendo em dispositivos mobile** — provavelmente deveria estar no início da seção de produtos. Faça a busca aparecer e funcionar no mobile.
*Provável ponto de alteração: `services/nav-busca.js`, HTML/CSS das páginas de produtos.*

### A2 — Desconto visível no card do produto
Quando o vendedor abaixar o preço, o card deve mostrar o desconto no estilo **`R$ 180 (̶2̶0̶0̶)`** (preço novo em destaque, preço antigo riscado). Deve ser uma opção **opcional/adicional configurável no painel admin, na aba de produtos** — exatamente como o "banner" funciona hoje (opcional, só aparece para preencher se você marcar). O admin define, por produto: se está em desconto (liga/desliga), o **tipo** de desconto e a **porcentagem (%)** — tudo opcional.
**Segurança:** o preço final/desconto exibido e cobrado deve derivar do servidor (coleção `produtos` + Cloud Function do C1) — o cliente nunca define o valor pago.
*Provável ponto de alteração: `admin/js/admin-produtos.js`, `services/produtos.js`, `js/produtos-catalogo.js`, `js/produto-detalhe.js`.*

### A3 — Mínimo de atacado por carrinho, não por produto
O mínimo para liberar o **atacado** passa a ser contado **por carrinho**, não por produto. Exemplo: **6 produtos no carrinho** já liberam o atacado (para quem tem CNPJ aprovado), em vez de exigir o mínimo por item.
*Provável ponto de alteração: `services/carrinho.js`, `js/atacado.js`, `js/carrinho-checkout.js`.*

### A4 — Estoque de varejo e atacado independentes
Estoque de **varejo** e **atacado** passam a ser **independentes**: um produto pode existir nas duas modalidades ou em apenas uma, com **quantidade unitária individualizada por modo**. Isso **altera o cadastro/edição de produtos no painel admin** (estoque separado por modalidade).
**Segurança:** a validação de estoque/modo no checkout deve acontecer no servidor (Cloud Function do C1), não só no front.
*Provável ponto de alteração: `admin/js/admin-produtos.js`, `services/produtos.js`, `js/produto-detalhe.js`, carrinho, atacado.*

### A5 — Botão de atacado visível a todos + comportamento por tipo de usuário
O **botão de atacado deve aparecer para todos os clientes**, inclusive quem não tem conta (hoje só aparece para quem se cadastrou com CNPJ).

Comportamento da **página de atacado**:

- **CNPJ já aprovado pela loja:** permanece como hoje — navega, adiciona ao carrinho e compra normalmente.
- **CNPJ ainda não aprovado:** exibir no topo um aviso de **"Aguardando aprovação de conta pela loja"** (ou algo mais profissional). A pessoa **visualiza** os produtos, mas ao tentar **adicionar ao carrinho ou comprar**, aparece um aviso explicando por que a função ainda não está liberada.
- **Cadastro normal (sem CNPJ) ou visitante sem cadastro:** comportamento parecido, apenas **ajustando a mensagem** para indicar que a pessoa precisa fazer o **cadastro de CNPJ**.
- **Quem já tem conta:** deve poder **trocar o tipo de conta sem criar uma nova**. Ajuste o que for necessário nas **`firestore.rules`** e no modelo de usuário para suportar a troca com segurança (usar a allowlist do C5 ao mexer no perfil).
- **Quem ainda não tem conta:** ao seguir para virar revendedor, é apenas levado para a **página de cadastro normal**.
*Provável ponto de alteração: `services/nav-atacado-visibilidade.js`, `js/atacado.js`, `services/auth.js`, `perfil.js`, `firestore.rules` (`usuarios`, `statusRevendedor`/`tipoConta`).*

### A6 — Corrigir o switch dark/light no admin e no atacado
O switch de **dark/light mode não funciona** na página de **admin** nem na seção de **atacado** — provavelmente porque o JS responsável **não está sendo referenciado** nessas páginas. Corrija a inclusão para o switch funcionar nelas. (Ver B5 — o switch permanece, agora na nova paleta.)
*Provável ponto de alteração: `services/script.js` (ou o JS do tema) e as tags `<script>` de `admin/*.html` e `atacado.html`.*

### A7 — Sistema de pagamento provisório + manual em .md
Adicione um **sistema de pagamento momentâneo/provisório** para **validar o funcionamento do site** (checkout ponta a ponta). Como o Miguel **não enviará dados bancários por segurança**, produza **um único arquivo `.md`** que sirva de **manual de instruções** para ele mesmo configurar o pagamento na conta dele depois.

### A8 — Escalabilidade
O site deve ter **boa escalabilidade**. Estruture as mudanças pensando em crescimento (dados, tráfego, catálogo).

### A9 — Preparar para integração futura com a Nuvemshop
Futuramente haverá integração com a **Nuvemshop**. Construa de forma que essa mudança **não seja muito trabalhosa no futuro** (baixo acoplamento, camada de dados isolável). **Explique se essa conexão com a Nuvemshop é possível** e, se for, como deixá-la preparada.

---

## B. Design / Visual

> Estilo de referência (usar como exemplo para **disposição de seções, tamanho de ícones, funcionalidades, UI/UX** etc.):
> **https://dalcotone.com.br/?srsltid=AfmBOopIXCblqH0Vx2JM75XrQ8eEkHKo6HCbJueqlxnnu1aveUveO-0q**

### B1 — Nova primeira seção (carrossel de anúncio) + reordenar destaques
A **primeira seção** da home muda **totalmente**: sai o fundo monótono com a mensagem centralizada ocupando a tela inteira, e entra um **carrossel de "anúncio"** com **fotos da marca divulgando produtos**. As imagens passam automaticamente, com **um leve intervalo entre elas** para o usuário ver cada uma. Como é **divulgação da loja** (não de um produto específico), **não é necessário poder voltar a foto** — basta mantê-las passando no mesmo padrão.
A **seção de produtos em destaque** sobe para o **topo, logo após essa primeira seção**.
*Provável ponto de alteração: `index.html`, `services/home-dinamica.js`, `services/nav-categorias-home.js`, CSS da home.*

### B2 — Seção de produtos na home (após os destaques)
Depois dos destaques, vem **uma seção de produtos**, **atrativa para o cliente**. No **mobile**, um **grid 2×n** (2 colunas, lista em coluna — rola para baixo). A seção **não deve ocupar muito espaço**, mas deve ser **grande o suficiente para mostrar variedade**. No final, um botão **"Ver mais"** que leva à **página principal de produtos**.

### B3 — Página principal de produtos (sensação de infinito)
Deve ter a **sensação de infinito**, com **todos os produtos** aparecendo, em **grid 2×n**, com **busca** e **filtragem** de produtos.
*Provável ponto de alteração: `js/produtos-catalogo.js`, `produtos.html`, CSS de catálogo.*

### B4 — Nova paleta de cores (abandonar preto e dourado)
Abandonar o **preto e dourado**. Usar exatamente esta paleta:

```
--color-1: #9C6644;
--color-2: #7E553A;
--color-3: #B08A69;
--color-4: #DFB793;
--color-5: #EEE0D5;
```

*Provável ponto de alteração: variáveis CSS em todos os `styles/`.*

### B5 — Manter o switch light/dark, agora na nova paleta
O switch de **light/dark mode permanece**, mas agora **baseado na nova paleta** acima (somado ao A6, que conserta o switch no admin e no atacado).

---

## D. Ajustes menores (housekeeping)

- Remover o `console.log("Toggle senha clicado")` esquecido em `js/cadastro.js` (~linha 191).
- Atualizar o `README.md` para refletir a stack real (Firebase), já que ele descreve uma arquitetura inexistente.

---

## E. Documentação (entregável obrigatório)

Documente **todas as modificações** feitas. A documentação deve conter:

1. **O que foi alterado, por que, onde** (arquivos/trechos) e **quais ajustes** foram feitos.
2. Um **manual de instruções** para os casos que exigirem ajuste manual (incluir o manual do sistema de pagamento do A7 como `.md` único e independente).
3. Um **registro do estado atual do site**: quais **erros** ele tem hoje e quais **falhas de segurança** existem atualmente (as fundações da seção C partem justamente desse diagnóstico — descreva o "antes").
4. Um **registro da nova versão** produzida — incluindo, **de forma explícita e bem informada, quaisquer falhas remanescentes** (inclusive de segurança) que ainda existirem depois das mudanças.
5. **Possíveis modificações e funcionalidades futuras** para elevar o nível do sistema (ex.: integração Nuvemshop do A9, migração do projeto de teste para produção com App Check/Functions refeitos).

Se necessário, **separe em documentos diferentes** (ex.: Manual de Instruções, Alterações, Estado Atual, Sistema de Pagamento, Revisão de Segurança etc.).
