# Roadmap Futuro — Flora Beauty

Possíveis modificações e funcionalidades para elevar o nível do sistema, em ordem sugerida de prioridade.

> **Atualizado na rodada 2 (custo zero):** o projeto roda 100% no plano Spark, sem backend. Vários itens abaixo dependem de voltar a ter um servidor — estão marcados com 💰.

---

## 0. 💰 Quando houver orçamento: voltar a ter backend (prioridade nº 1)

A rodada 2 removeu as Cloud Functions (Blaze exigia pré-pagamento fora do orçamento). O código da `criarPedido` server-side existe no histórico do git (branch `revisao-seguranca-2026-07`, antes da rodada 2) e pode ser restaurado quando der. Com backend de volta:

- **Validação de preço/quantidade/estoque no servidor** — elimina o risco residual da conferência manual (FALHAS_REMANESCENTES §1);
- **Baixa automática de estoque** em transação;
- **Webhook de pagamento** (Mercado Pago Checkout Pro, sem mensalidade — só % por venda) com confirmação automática;
- **Agregação de métricas** e e-mails transacionais.

Caminhos: (a) Firebase Blaze (~US$0 de fato no volume da loja, mas exige cartão); (b) **Nuvemshop** como backend (item 1 abaixo — resolve checkout+pagamento+estoque de uma vez); (c) um serviço gratuito tipo Cloudflare Workers como "mini-backend" com Admin SDK — avaliar na hora.

## 1. Integração com a Nuvemshop (A9)

### É possível?

**Sim.** A Nuvemshop tem uma [API REST pública](https://dev.nuvemshop.com.br/) (produtos, pedidos, clientes, estoque) com autenticação OAuth 2. Existem dois caminhos, e a escolha é uma decisão de negócio:

| Caminho | O que significa | Quando faz sentido |
|---------|-----------------|--------------------|
| **(a) Nuvemshop como loja** | A vitrine passa a ser a loja Nuvemshop; o site atual vira institucional/apoio. | Se a loja quiser terceirizar checkout, pagamento, frete e catálogo de vez. Menos código para manter, menos controle visual. |
| **(b) Nuvemshop como backend de catálogo/estoque** (recomendado se o site atual continuar) | O site continua sendo a vitrine, mas produtos/estoque/pedidos sincronizam com a Nuvemshop via API. | Mantém a identidade e o front atual, ganha ERP/emissão/integrações da Nuvemshop. |

### Como o projeto JÁ está preparado (baixo acoplamento)

- **Toda leitura/escrita de dados passa pela camada `services/`** (`produtos.js`, `pedidos.js`, `carrinho.js`, `auth.js`...). As páginas não conhecem o Firestore — conhecem funções como `listarProdutosPaginado()` e `criarPedido()`. Trocar a fonte de dados = reescrever serviços, **não páginas**.
- **O modelo de produto usa helpers, não campos crus** (`infoPreco()`, `estoquePorModo()`, `disponivelNoModo()`) — dá para mapear os campos da Nuvemshop (price, promotional_price, stock) dentro desses helpers sem tocar nos cards.
- **O pedido já é desacoplado de valores** (só ids/quantidades) — no caminho (b), um backend 💰 criaria o pedido na Nuvemshop via API (credenciais OAuth nunca no navegador). A Nuvemshop também pode assumir o checkout inteiro, dispensando backend próprio.

### Passos quando chegar a hora (caminho b)

1. Criar app na [Nuvemshop Partners](https://partners.nuvemshop.com.br/) e obter `client_id`/`client_secret` (guardar como secrets de functions).
2. Function `sincronizarProdutos` (agendada): API Nuvemshop → coleção `produtos` (a vitrine continua lendo do Firestore = rápido e barato; a Nuvemshop vira fonte de verdade).
3. `criarPedido` passa a criar o pedido também na Nuvemshop (ou passa a criar SÓ lá, guardando um espelho local para o painel).
4. Webhooks da Nuvemshop (produto/estoque atualizado) → function HTTP que atualiza o Firestore.

## 2. Segurança — próximos degraus

1. **Concluir os passos manuais** (rules, App Check) — ver MANUAL_CONFIGURACAO.md. Sem isso o resto é teoria.
2. **MFA na conta admin** (Firebase Auth suporta) — o admin é o alvo mais valioso do sistema.
3. 💰 **Rate limiting por usuário** (exige backend) e alerta de anomalia.
4. 💰 **Baixa/devolução automática de estoque** (exige backend).
5. **Trilha de auditoria** simples: coleção `auditoria` gravada pelas functions (quem mudou preço/status e quando).
6. **Testes das rules** com `@firebase/rules-unit-testing` no emulador (protege contra regressão de segurança em cada mudança).

## 3. Performance / escala

1. 💰 **Agregação diária de métricas** (exige backend) — dashboard passa a ler ~30 docs em vez de milhares.
2. **Busca full-text** (Algolia/Typesense/extensão oficial) quando o catálogo passar de algumas centenas de itens.
3. **Imagens**: migrar de URLs externas para o Firebase Storage com redimensionamento (extensão Resize Images) + `srcset`.
4. **Cache/ISR do catálogo**: headers de cache no Hosting para as páginas estáticas.

## 4. Produto / experiência

1. 💰 **Gateway de pagamento com webhook** (MANUAL_PAGAMENTO.md §4 — só opções sem mensalidade).
2. **Página "Meus pedidos"** no perfil (o serviço `listarPedidosDoUsuario` já existe, falta a tela).
3. **Avaliações de produto** (quando existir, lembrar: TODO texto de cliente passa por `escapeHtml` — o padrão C4 já protege).
4. 💰 **Cupons de desconto** (validação segura exige backend, nunca o front).
5. 💰 **E-mail transacional** (pedido criado/pago/enviado).
6. **Notificação de admin** (novo pedido/novo revendedor) via e-mail ou WhatsApp.

## 5. Migração para produção

Checklist completo na seção 5 do [MANUAL_CONFIGURACAO.md](MANUAL_CONFIGURACAO.md) — resumo: novo projeto Firebase (Spark serve), refazer App Check/reCAPTCHA (chave é por domínio), redeploy de rules+hosting, recriar `configuracoes` e conta admin, apontar domínio.
