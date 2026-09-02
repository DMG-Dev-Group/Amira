# Flora Beauty — Prompt de ajustes (Rodada 2)

## 0. Contexto

Esta é a **segunda rodada** de ajustes, depois da primeira implementação já feita. Use as skills `dmg-code-review`, `dmg-seguranca`, `flora-beauty-context`, `dmg-design-uiux`. Mantenha a stack real (HTML/CSS/JS vanilla + Firebase; uma página por rota em `frontend/src/pages/`). Trate o sistema como um todo e **documente todas as mudanças** (seção 9).

> Anotações "Provável ponto de alteração" são pistas, não ordens rígidas — confirme no código.

---

## 1. RESTRIÇÃO CRÍTICA — custo zero (remover Cloud Functions)

O plano **Blaze não é viável** (exige pré-pagamento de R$200, fora do orçamento). **Todo o sistema precisa rodar 100% no plano gratuito do Firebase (Spark).** A leva anterior criou uma **Cloud Function `criarPedido`** — isso não roda no Spark e precisa ser **removido e refeito**:

1. **Remover** a pasta `functions/` e toda dependência de Cloud Functions no cliente: `getFunctions`/`httpsCallable` (`services/firebase-config.js`, `services/pedidos.js`).
2. **Recriar a criação de pedido no cliente** (`addDoc` em `pedidos`), **protegida por regras endurecidas** no `firestore.rules`.
3. **Integridade de preço sem servidor** — princípio: **nenhum valor monetário vindo do cliente pode ser gravado ou confiado.** Implemente da forma mais segura possível dentro do Spark:
   - Gravar no pedido **apenas** `{ produtoId, quantidade, modo }` por item (+ modo de entrega/endereço). **Derivar** preço, desconto, frete e total da coleção `produtos` (que só o admin escreve) **na hora de exibir** (checkout, `pedido-confirmado`, painel admin).
   - Onde as `firestore.rules` conseguirem, validar `precoUnitario`/`total` contra `get(/produtos/{id})`.
4. **Mitigação documentada:** o pagamento é **manual (PIX + WhatsApp)** — a loja confere o valor real antes de enviar, então um pedido forjado com total baixo é barrado na conferência humana. **Registre esse risco residual** no doc de falhas (seção 9).
5. **App Check permanece** — ele é **gratuito no Spark e não exige cartão**. Mantenha o `initializeAppCheck`/reCAPTCHA no `firebase-config.js`.
6. **Cadastro seguro sem Function `onCreate`:** exigir `request.auth.token.email_verified == true` nas `firestore.rules` para criar `usuarios/{uid}`, e criar o perfil **no primeiro login já verificado**. Mantenha o App Check no Auth.
7. **Frete:** garantir que o cálculo esteja num **módulo client-side** (`services/frete.js`), sem depender de Function.

*Provável ponto de alteração: `functions/` (remover), `services/firebase-config.js`, `services/pedidos.js`, `js/carrinho-checkout.js`, `firestore.rules`, `services/auth.js`, `js/cadastro.js`, `services/frete.js`.*

---

## 2. Pagamento — solução totalmente gratuita

O método de pagamento deve ser **totalmente gratuito**, sem plano pago nem gateway com mensalidade. Mantenha e refine o modelo atual:

- **PIX manual** (chave copia-e-cola, idealmente com QR estático) + **confirmação via WhatsApp**. A chave PIX continua vindo de `configuracoes/pagamento` (editável pelo admin, sem mexer em código).
- **WhatsApp está funcional e é gratuito** — é link `wa.me` (click-to-chat), não a API paga. Mantenha.
- Atualizar o **`docs/MANUAL_PAGAMENTO.md`** com o passo a passo para o Miguel cadastrar a própria chave PIX. Se um dia quiser um gateway, sugerir apenas opções **sem mensalidade** (ex.: Mercado Pago Checkout Pro, que cobra só % por venda) — mas **não** exigir isso agora.

---

## 3. Layout da home — ordem e espaçamento

- **3.1** Inverter duas seções: a seção **"Produto da estação"/lançamento** (o highlight com setas, `id="sobre"`) deve subir para **logo após o carrossel inicial**; a seção **"Os mais amados"** (`id="destaques"`) assume a posição que o lançamento ocupava. (Trocar as posições.)
- **3.2** A seção **lançamento** está **muito espaçada** — reduzir um pouco o espaçamento entre os elementos dela.
- **3.3** O **carrossel inicial** está dificultando ver a **navbar** — adicionar um **leve degradê no topo** (escurecimento sutil) para melhorar a leitura da navbar sobre o carrossel.
- **3.4** Mudar a **cor da seção "Nossas categorias"** — hoje ela se confunde com a seção de produtos, parecendo a mesma coisa. Dar a ela uma cor de fundo que a separe visualmente (dentro da nova paleta).

*Provável ponto de alteração: `index.html` (ordem das `<section>`), CSS de `.highlight`, `.carousel`/hero, `.categories`.*

---

## 4. Cards e grids

- **4.1** Na seção **"Os mais amados"**, os cards estão em **tamanho desproporcional** (PC e mobile). Reduzir para o **mesmo tamanho dos cards da aba de produtos** (`produtos.html`).
- **4.2** **Centralizar a imagem** desses cards, do **mesmo jeito** que o card da página de produtos.
- **4.3** O **grid da seção de produtos em `produtos.html` não está em 2×n** — corrigir para **2×n** (2 colunas), **igual à home**. Aplicar o mesmo padrão de grid nos dois lugares.

*Provável ponto de alteração: `services/home-dinamica.js` (render dos destaques), CSS de `.featured .products-grid` vs. o card do catálogo, CSS de grid em `produtos.html`.*

---

## 5. Navbar e busca

- **5.1** **Remover a barra de pesquisa da sidebar** e colocá-la **na navbar, para mobile, ao lado de "Atacado"**.
- **5.2** Deixar a **disposição dos elementos da navbar bem dividida** (espaçamento/alinhamento equilibrados).

*Provável ponto de alteração: `services/nav-busca.js`, HTML/CSS da navbar (presente nas páginas), CSS da sidebar de `produtos.html`.*

---

## 6. Atacado, quantidade e estoque

- **6.1** A opção de **quantidade no varejo** também deve ser **opcional**, porque um produto pode existir **apenas no atacado** (estoque independente por modo — já definido na rodada anterior). Se o produto não tem varejo, não exibir/nem exigir o seletor de quantidade de varejo; idem no admin (estoque de varejo opcional).
- **6.2** **Remover a seta branca padrão do HTML** (spinners do `input[type="number"]`) que aparece ao lado da quantidade do produto **no atacado**.

*Provável ponto de alteração: `js/produto-detalhe.js`, `js/atacado.js`, `admin/js/admin-produtos.js`, CSS (`input[type=number]::-webkit-inner-spin-button` / `-moz-appearance`).*

---

## 7. Admin — frete por produto

- **7.1** Adicionar no **painel admin** (aba de produtos) a opção **"Frete disponível: sim/não"** por produto. Isso define **se o cliente pode pedir aquele produto para entrega**. Se estiver como "não", aquele produto só pode ser **retirado na loja** (não aparece/não permite a opção de entrega no checkout). Refletir essa regra no checkout (`carrinho-checkout.js`): se o carrinho tiver um produto sem frete disponível e o cliente escolher entrega, avisar/bloquear conforme a regra.

*Provável ponto de alteração: `admin/produtos.html` (form), `admin/js/admin-produtos.js`, `services/produtos.js` (modelo do produto), `js/carrinho-checkout.js`.*

---

## 8. NÃO fazer agora

- **8.1** **Switch de tema (dark/light): não mexer nesta rodada.** Deixar como está — será tratado depois.

---

## 9. Documentação (obrigatório)

Atualizar a documentação existente em `docs/` refletindo **todas** as mudanças desta rodada e, principalmente, a **re-arquitetura para o plano gratuito**:

- **`ALTERACOES_*.md`** — o que mudou, por quê e onde (incluindo a remoção das Cloud Functions e a nova forma de criar pedido).
- **Estado atual / `ESTADO_*.md`** — refletir o novo estado (sem Cloud Functions, no Spark).
- **`FALHAS_REMANESCENTES.md`** — deixar **explícito** o risco residual de integridade de preço agora que não há Cloud Function (mitigado pela confirmação manual do PIX), e qualquer outra falha remanescente.
- **`MANUAL_PAGAMENTO.md`** e demais manuais — atualizar conforme seções 1 e 2.
- **`ROADMAP_FUTURO.md`** — registrar como evolução futura: migrar para um backend/plano pago (ou Nuvemshop) quando houver orçamento, o que permitiria voltar à validação de preço no servidor.
