# Alterações — Rodada 2 (07/2026)

O que mudou na segunda rodada, **por quê** e **onde**. A rodada 1 está em [ALTERACOES_2026-07.md](ALTERACOES_2026-07.md) — os pontos dela que esta rodada REVERTEU/refez estão marcados aqui.

---

## 1. RE-ARQUITETURA CUSTO ZERO — remoção das Cloud Functions ⚠ (muda a rodada 1)

**Por quê:** o plano Blaze (exigido por Cloud Functions) pede pré-pagamento de ~R$200 — fora do orçamento. Todo o sistema agora roda no plano **Spark (gratuito)**.

**O que saiu:**
- Pasta **`functions/` removida por completo** (a `criarPedido` server-side da rodada 1 e a cópia do frete).
- `firebase.json`: seção `functions` removida.
- `services/firebase-config.js`: import/export de `getFunctions` removidos. **App Check ficou** (é gratuito no Spark e não exige cartão).
- `services/pedidos.js`: `httpsCallable` substituído por `addDoc` direto.

**Como a integridade de preço ficou sem servidor (princípio: nenhum valor monetário vindo do cliente é gravado ou confiado):**
- **`firestore.rules` (pedidos):** create do cliente permitido, mas com **allowlist de chaves** — o documento só pode conter `uidComprador, itens, temItemAtacado, modoEntrega, endereco, status, pagamento, criadoEm`. Campos de preço/total **não são graváveis**. Também validados: e-mail verificado, dono, 1..30 itens, endereço com shape exato quando entrega, `status`/`pagamento` com valores fixos, `criadoEm == request.time`, e atacado só para revendedor aprovado.
- **Derivação na exibição:** `services/pedidos.js` ganhou `derivarTotaisDePedidos()` / `derivarTotaisDoPedido()` — preço (com desconto), frete e total são recalculados **da coleção `produtos`** (só admin escreve) em todo lugar que exibe pedido: `pedido-confirmado.js`, `admin-pedidos.js` (tabela + detalhe), `admin-dashboard.js` (faturamento). Produtos únicos são buscados uma vez só (economia de leituras no free tier).
- **Checkout (`js/carrinho-checkout.js`):** os preços exibidos vêm de uma **releitura fresca do catálogo** ao abrir a página (não do que está no carrinho); valida estoque/mínimo de atacado/entrega como UX antes do `addDoc`.
- **Nota sobre "validar preço via `get()` nas rules":** não foi necessário — como o pedido não CONTÉM preço, não há o que comparar; a allowlist é mais forte (o campo forjado nem entra). O que as rules não alcançam (conteúdo item a item da lista) está documentado como risco residual.
- **Mitigação final documentada:** pagamento é manual (PIX + WhatsApp) — a loja confere o total derivado no painel antes de enviar; pedidos adulterados geram aviso ⚠ no painel e morrem na conferência. Registro completo: [FALHAS_REMANESCENTES.md](FALHAS_REMANESCENTES.md) §1.
- **Estoque:** sem servidor, o pedido NÃO baixa estoque (permitir isso ao cliente seria pior). Rotina manual documentada no [MANUAL_CONFIGURACAO.md](MANUAL_CONFIGURACAO.md) §4.
- **Cadastro seguro** já era Spark-compatível desde a rodada 1 (email_verified nas rules + perfil no primeiro login verificado) — mantido, sem Function `onCreate`.
- **Frete:** cálculo 100% client-side em `services/frete.js` (a duplicata do servidor morreu junto com `functions/`).

## 2. Pagamento — totalmente gratuito

Mantido e refinado o modelo PIX manual + WhatsApp (`wa.me` click-to-chat, gratuito): pedido nasce com `pagamento: {metodo: "pix_whatsapp", status: "pendente"}` (valores fixados pelas rules); confirmação mostra chave PIX de `configuracoes/pagamento` + link de WhatsApp com pedido/valor. [MANUAL_PAGAMENTO.md](MANUAL_PAGAMENTO.md) reescrito com o passo a passo da chave PIX e opções futuras **sem mensalidade**.

## 3. Home — ordem e respiro

- **3.1** Seções trocadas em `index.html`: o **lançamento** ("Produto da estação", `#sobre`) subiu para logo após o carrossel; **"Os mais amados"** (`#destaques`) desceu para o lugar dele. Nova ordem: carrossel → lançamento → vitrine → categorias → destaques → galeria → newsletter.
- **3.2** Lançamento mais compacto (`style.css`): paddings, gaps, margens e círculo reduzidos (~30%).
- **3.3** Degradê no topo do carrossel (`.hero-slide-overlay`): escurecimento sutil no topo para a navbar ler sobre qualquer foto.
- **3.4** "Nossas categorias" com fundo próprio (`--bg-alt` + bordas) — não se confunde mais com a vitrine de produtos.

## 4. Cards e grids unificados

- **4.1/4.2** Destaques ("Os mais amados") agora usam **o mesmo card do catálogo** (`.catalogo-card`, imagem quadrada `object-fit: cover` centralizada) + botão "+" sobreposto (`.destaque-card`). O carrossel horizontal de cards 280px foi substituído pelo mesmo grid do catálogo (`services/home-dinamica.js`, `style.css`).
- **4.3** `produtos.html` em **2×n no mobile** (`catalogo.css`: `repeat(2, 1fr)` ≤900px — antes o auto-fill de 230px virava 1 coluna). Destaques idem, inclusive ≤480px.

## 5. Navbar e busca

- **5.1** A busca **saiu do menu lateral** (e do topo do catálogo) e agora vive **na própria navbar também no mobile**, entre o logo e o botão ATACADO. Removidos: `.mobile-menu-busca` (4 páginas), `.catalogo-busca-mobile` (produtos.html) e seus CSS; `nav-busca.js` simplificado.
- **5.2** Navbar mobile redistribuída (`style.css` ≤900px): logo compacto · busca esticando · ATACADO estático (saiu o posicionamento absoluto centralizado) · hambúrguer; input com 16px para não dar zoom no iOS.

## 6. Quantidade e estoque

- **6.1 Varejo opcional:** produto pode existir **só no atacado**. `produto-detalhe.js` esconde preço/estoque/quantidade de varejo quando não há `precoVarejo` (mostra "Produto exclusivo do atacado"); cards do catálogo/home mostram "Exclusivo atacado" no lugar do preço; admin não exige mais preço/estoque de varejo, mas valida que **pelo menos uma** modalidade esteja configurada; badge "SÓ ATACADO" na tabela do admin.
- **6.2 Spinners removidos** dos inputs de quantidade (`catalogo.css`: `appearance: textfield` + `::-webkit-*-spin-button` — vale para atacado e página de produto; os botões −/+ continuam).

## 7. Frete por produto (admin + checkout)

- Campo novo no produto: **`freteDisponivel`** (padrão `true`; produtos antigos continuam entregáveis). Admin: select "Frete disponível?" + badge "SÓ RETIRADA" na tabela; helper `podeSerEntregue()` em `services/produtos.js`.
- **Checkout:** se o carrinho tem item só-retirada, a opção "Entrega" fica **desabilitada** com aviso nomeando o item (e o item ganha etiqueta "SÓ RETIRADA" na lista); validação extra no finalizar. Página do produto avisa "não tem entrega — apenas retirada na loja".

## 8. Fora desta rodada (por instrução)

- **Switch de tema (dark/light): intocado** — será tratado depois.

## Arquivos desta rodada

**Removidos:** `functions/` (inteira).
**Alterados:** `firebase.json`, `firestore.rules`, `services/firebase-config.js`, `services/pedidos.js`, `services/produtos.js`, `services/nav-busca.js`, `services/home-dinamica.js`, `js/carrinho-checkout.js`, `js/pedido-confirmado.js`, `js/produtos-catalogo.js`, `js/produto-detalhe.js`, `admin/js/admin-pedidos.js`, `admin/js/admin-dashboard.js`, `admin/js/admin-produtos.js`, `admin/produtos.html`, `index.html`, `produtos.html`, `atacado.html`, `produto.html`, `carrinho.html`, `styles/style.css`, `styles/catalogo.css`, `seed-produtos.js`, docs.
