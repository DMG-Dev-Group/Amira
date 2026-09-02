# Alterações — Revisão de 07/2026

> ⚠️ **ATUALIZADO PELA RODADA 2** ([ALTERACOES_2026-07_R2.md](ALTERACOES_2026-07_R2.md)): as
> **Cloud Functions descritas no item C1 foram REMOVIDAS** — o plano Blaze ficou fora do
> orçamento e o sistema foi re-arquitetado para rodar 100% no plano gratuito (Spark), com o
> pedido criado no cliente sem nenhum campo monetário. Leia a R2 antes deste documento.

O que foi alterado, **por que**, **onde** (arquivos) e quais ajustes acompanham. Organizado pelos itens do plano (C = segurança, A = funcionalidades, B = visual, D = housekeeping).

> Pós-requisitos manuais estão em [MANUAL_CONFIGURACAO.md](MANUAL_CONFIGURACAO.md) (deploy de rules/functions, App Check) e [MANUAL_PAGAMENTO.md](MANUAL_PAGAMENTO.md).

---

## C — Fundações de segurança

### C0 · App Check (anti-bot)
- **Por quê:** a config do Firebase é pública; sem App Check, um script chama o SDK direto e ignora o site inteiro.
- **Onde:** `frontend/src/pages/services/firebase-config.js` — inicialização do App Check com reCAPTCHA v3, atrás da constante `RECAPTCHA_V3_SITE_KEY`. Enquanto a chave for placeholder, fica desligado com aviso no console (para não derrubar o site antes da configuração manual).
- **Ajustes:** passos de console + token de debug documentados no manual. As Cloud Functions têm `EXIGIR_APP_CHECK` para ligar depois.

### C1 · Integridade de preço e pedido (Cloud Function `criarPedido`)
- **Por quê:** o preço nascia e morria no cliente — qualquer usuário forjava um pedido de R$ 0,01.
- **Onde:**
  - **`functions/`** (NOVA pasta): `index.js` (função `criarPedido`), `frete.js` (cópia servidor do cálculo de frete), `package.json`.
  - `firebase.json`: seção `functions` adicionada.
  - `firestore.rules`: `pedidos` agora tem `allow create: if false` — só o Admin SDK (a função) cria pedidos.
  - `services/pedidos.js`: `criarPedido` virou chamada `httpsCallable`; envia **apenas** `{produtoId, quantidade, modo}` + entrega/endereço; nova `traduzErroPedido`.
  - `js/carrinho-checkout.js`: usa a função, mostra o total confirmado pelo servidor, avisa que os valores locais são estimativa.
- **O que a função valida no servidor:** produto existe/ativo, preço atual (com desconto A2), estoque por modalidade (A4), permissão de atacado (revendedor aprovado), mínimo de atacado por carrinho (A3), frete por bairro/peso; **baixa o estoque na mesma transação** (reserva) e esvazia o carrinho. Valores em centavos para evitar erro de ponto flutuante.
- **Nota:** o admin editar preço na coleção `produtos` continua sendo o fluxo autorizado (rules inalteradas nesse ponto).

### C2 · Cadastro seguro (e-mail válido + anti-abuso)
- **Por quê:** contas fantasma inflavam billing e queimavam a reputação do domínio; e-mails inexistentes criavam contas inúteis.
- **Onde:** `services/auth.js`, `js/cadastro.js`, `js/login.js`, `firestore.rules` (`usuarios`).
- **Como:**
  - O documento `usuarios/{uid}` **não é mais criado no cadastro** — as rules agora exigem `request.auth.token.email_verified == true` para o create. O perfil nasce no primeiro acesso verificado (`garantirPerfil`, chamado por `observarAuth`); contas Google já chegam verificadas.
  - Dados do cadastro (nome, CNPJ de revendedor) ficam pendentes em `localStorage` até a verificação; se a pessoa confirmar em outro dispositivo, o perfil nasce como cliente e ela solicita revenda pelo perfil (A5).
  - E-mail com formato inválido é barrado no front com aviso claro; a prova de que o e-mail **existe** é o próprio link de verificação (sem clicar, a conta nunca ativa nem entra no banco).

### C3 · Coleção `metricas` fechada
- **Onde:** `firestore.rules`.
- **Como:** `create` só com o shape exato — allowlist de campos (`tipo`, `pagina`, `dispositivo`, `origem`, `criadoEm`), valores controlados (`tipo`/`dispositivo` em enums), strings ≤200 caracteres e `criadoEm == request.time`. Campos extras são rejeitados.

### C4 · Escape de toda saída dinâmica (padrão do projeto)
- **Por quê:** ~60 usos de `innerHTML` com dado cru = XSS armazenado à espera de um admin comprometido.
- **Onde:** **`services/seguranca.js`** (NOVO): `escapeHtml()` e `urlImagemSegura()` (só aceita `https://` ou caminho relativo; `javascript:`/`data:`/`http:` caem no fallback). Aplicado em: `home-dinamica.js`, `nav-categorias-home.js`, `produtos-catalogo.js`, `produto-detalhe.js`, `atacado.js`, `carrinho-checkout.js`, `pedido-confirmado.js`, `perfil.js`, `admin-produtos.js`, `admin-pedidos.js`, `admin-revendedores.js`, `admin-categorias.js`, `admin-dashboard.js`.
- **Padrão daqui pra frente:** todo texto dinâmico em template `innerHTML` passa por `escapeHtml()`; toda URL de imagem por `urlImagemSegura()`.

### C5 · `atualizarPerfil` com allowlist
- **Onde:** `services/auth.js` — spread `...dados` substituído pela allowlist `["nome", "telefone", "fotoURL"]`. Mudanças de tipo de conta têm funções dedicadas (`solicitarContaRevendedor`, `voltarParaContaCliente`).

---

## A — Funcionalidades

### A1 · Busca no mobile
- **Causa raiz:** `.nav-busca-form` recebia `display:none !important` ≤900px sem alternativa.
- **Onde:** `produtos.html` ganhou uma busca própria no topo do catálogo (visível só no mobile — `.catalogo-busca-mobile` em `catalogo.css`); o menu mobile de `index/produto/atacado/carrinho` ganhou um campo de busca (`.mobile-menu-busca`); `services/nav-busca.js` liga os dois formulários (navbar + mobile) e `produtos-catalogo.js` liga a busca do catálogo à filtragem em página.

### A2 · Desconto no card do produto
- **Onde:** `admin/produtos.html` + `admin-produtos.js` (campos opcionais estilo "banner": liga/desliga, tipo, %), `services/produtos.js` (`infoPreco()` — fonte única do preço de exibição), cards em `produtos-catalogo.js`, `home-dinamica.js`, `produto-detalhe.js`; CSS `.preco-antigo`, `.desconto-badge`, `.desconto-selo`.
- **Modelo:** `descontoAtivo: boolean`, `descontoTipo: "percentual"`, `descontoPercentual: 1..90` — aplicado sobre o **preço de varejo**; o de atacado é o valor exato do painel.
- **Segurança:** o card mostra `R$ 180 ~~R$ 200~~ (-10%)`, mas o valor **cobrado** é recalculado pela Cloud Function com os mesmos campos — o cliente nunca define o preço.

### A3 · Mínimo de atacado por carrinho
- **Onde:** **`services/atacado-config.js`** (NOVO — lê `configuracoes/atacado.qtdMinimaCarrinho`, padrão 6), `js/atacado.js` (aviso na página, inputs a partir de 1), `js/carrinho-checkout.js` (aviso dinâmico + bloqueio de UX), `functions/index.js` (validação que vale), `admin/produtos.html` (campo por produto removido), `seed-produtos.js` atualizado.
- **Regra:** soma das unidades de TODOS os itens em modo atacado ≥ mínimo. O campo antigo `qtdMinimaAtacado` foi aposentado (ignorado se existir em docs antigos).

### A4 · Estoques independentes (varejo × atacado)
- **Onde:** `services/produtos.js` (`estoquePorModo()`, `disponivelNoModo()`), `admin` (dois campos de estoque + validação), `produto-detalhe.js` (usa estoque de varejo), `atacado.js` (usa estoque de atacado), `functions/index.js` (valida e baixa o estoque do modo certo).
- **Compatibilidade:** produtos antigos (só `estoque`) seguem vendendo no varejo; para o atacado é preciso preencher o estoque de atacado no painel (ver manual, seção 5). Ao salvar no painel, o produto migra para o modelo novo.

### A5 · Atacado visível a todos + troca de tipo de conta
- **Onde:** `services/nav-atacado-visibilidade.js` (botão sempre visível), `js/atacado.js` (reescrito: catálogo visível para todos; banner e bloqueio de compra conforme status — aprovado / pendente "Cadastro em análise" / rejeitado / sem CNPJ / visitante), `perfil.html` + `js/perfil.js` (nova aba "Atacado / Revenda": solicitar revenda com CNPJ validado+consultado, voltar a cliente, reativar aprovação guardada), `services/auth.js` (funções dedicadas), `firestore.rules` (usuário pode definir `statusRevendedor: "pendente"` desde que o status atual não seja "aprovado"; `role` continua intocável).

### A6 · Switch dark/light no admin e atacado
- **Causa raiz:** `script.js` tinha `export` mas era carregado como script clássico → SyntaxError silencioso; admin nem incluía JS de tema e o `admin.css` usava variáveis nunca definidas.
- **Onde:** **`services/tema.js`** (NOVO — único dono do tema, funciona em qualquer página com `.theme-toggle`), `script.js` limpo (agora sempre `type="module"`; `handleNewsletter` exposto em `window`), todas as páginas da loja atualizadas, `admin-sidebar.js` ganhou o botão de tema, `admin.css` ganhou as variáveis da paleta + estilos do switch, todos os `admin/*.html` incluem `tema.js`.

### A7 · Pagamento provisório + manual
- **Onde:** `functions/index.js` (pedido nasce com `pagamento: {metodo: "provisorio", status: "pendente"}`), `js/pedido-confirmado.js` (instruções de PIX de `configuracoes/pagamento` + botão de WhatsApp com pedido/valor prontos + copiar chave), `admin` já permitia mudar status para `pago`.
- **Manual independente:** [MANUAL_PAGAMENTO.md](MANUAL_PAGAMENTO.md).

### A8 · Escalabilidade
- Catálogo paginado por cursor (`listarProdutosPaginado`, 24 por bloco) — o site não baixa mais a coleção inteira ao navegar.
- Pedido/estoque em transação no servidor; valores em centavos.
- Configurações operacionais (mínimo de atacado, PIX, carrossel) viraram documentos em `configuracoes` — mudam sem deploy.
- Dívidas registradas no roadmap (agregação de métricas, busca full-text).

### A9 · Preparação para Nuvemshop
- A camada `services/` continua sendo a única porta de dados das páginas — trocar Firestore por API da Nuvemshop = reescrever serviços, não páginas. Análise completa e plano de integração em [ROADMAP_FUTURO.md](ROADMAP_FUTURO.md).

---

## B — Design / Visual

### B1 · Carrossel de anúncio + destaques no topo
- **Onde:** `index.html` (hero antigo removido; nova seção `.hero-carrossel`; destaques sobem para logo após o carrossel), `home-dinamica.js` (`iniciarCarrosselAnuncio` — fotos passam sozinhas com crossfade, sem navegação manual; imagens/intervalo configuráveis em `configuracoes/homeCarrossel` com fallback para as fotos locais), `style.css`.

### B2 · Vitrine de produtos na home
- **Onde:** `index.html` (seção `.vitrine-produtos` após os destaques), `home-dinamica.js` (`carregarProdutosHome` — 8 mais recentes), `style.css` (grid 4 colunas no desktop, **2×n no mobile**, botão "Ver mais produtos" → `produtos.html`).

### B3 · Catálogo com sensação de infinito
- **Onde:** `js/produtos-catalogo.js` (reescrito) + `produtos.html` (sentinela) — scroll infinito com `IntersectionObserver` + paginação por cursor; grid já era responsivo (2 colunas no mobile). **Híbrido documentado:** com busca/faixa de preço ativa, a categoria é carregada por completo e filtrada no cliente (Firestore não tem full-text search).

### B4/B5 · Nova paleta + switch na paleta
- **Paleta:** `--color-1: #9C6644 · --color-2: #7E553A · --color-3: #B08A69 · --color-4: #DFB793 · --color-5: #EEE0D5`.
- **Onde:** `style.css` (`:root` escuro + `body[data-theme="light"]` claro — as variáveis antigas `--gold` etc. foram mantidas apontando para a paleta nova, evitando mexer em milhares de linhas), `admin.css` (variáveis próprias + temas), `catalogo.css`/`login.css`/`produtos.html admin` (valores hardcoded do dourado antigo substituídos), marquee e botões pretos migrados para a paleta. O switch (B5) continua em todas as páginas via `tema.js`, agora alternando entre os dois temas da paleta.

---

## D — Housekeeping

- `console.log("Toggle senha clicado")` removido de `js/cadastro.js` **e** `js/login.js` (mesmo log esquecido nos dois); indentação do bloco corrigida.
- Bug do `icone` indefinido corrigido em `services/categorias.js` (criar categoria quebrava com ReferenceError).
- URL da newsletter corrigida (`?text=` malformado) em `script.js`.
- `README.md` reescrito para refletir a stack real (ver raiz).
- `seed-produtos.js` atualizado para o modelo novo (estoques separados, sem mínimo por produto, exemplo de desconto).

## Arquivos novos

| Arquivo | Papel |
|---------|-------|
| `functions/index.js`, `functions/frete.js`, `functions/package.json` | Backend de confiança (Cloud Function `criarPedido`) |
| `frontend/src/pages/services/seguranca.js` | `escapeHtml` / `urlImagemSegura` (padrão C4) |
| `frontend/src/pages/services/tema.js` | Switch de tema unificado (A6/B5) |
| `frontend/src/pages/services/atacado-config.js` | Mínimo de atacado por carrinho (A3) |
| `docs/*.md` | Esta documentação |
