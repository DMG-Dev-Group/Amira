# Estado Atual e Falhas Remanescentes — pós-rodada 2 (07/2026)

Registro honesto do que **ainda não está resolvido**. A rodada 2 re-arquitetou o sistema para o plano **Spark (custo zero, SEM Cloud Functions)** — isso muda o mapa de riscos: alguns foram fechados por regra de banco, outros passaram a depender de **conferência humana**, e está tudo explícito abaixo.

---

## 1. ⚠ RISCO RESIDUAL PRINCIPAL — integridade de preço sem servidor

**Contexto:** sem Cloud Functions (Blaze fora do orçamento), o pedido é criado pelo próprio cliente. As mitigações em camadas:

1. **O documento do pedido NÃO aceita nenhum campo monetário.** As `firestore.rules` usam allowlist de chaves — um pedido com `total`, `precoUnitario` ou qualquer campo de valor é **rejeitado pelo banco**. Não existe "gravar total de R$ 0,01": o total simplesmente não existe no documento.
2. **Todo valor exibido é DERIVADO da coleção `produtos`** (que só o admin escreve): confirmação de pedido, painel admin e dashboard recalculam preço/desconto/frete/total na hora, dos preços atuais.
3. **O que sobra nas mãos do cliente:** as **quantidades** e o **modo** de cada item (as rules não conseguem inspecionar elemento por elemento de uma lista — sem loops). Um cliente malicioso pode, via console, gravar quantidades absurdas ou marcar `modo: "atacado"` num item.
4. **Trava final — conferência humana do PIX:** o pagamento é manual. A loja compara o comprovante com o **total derivado exibido no painel** (que usa os preços dela, não os do cliente). O painel ainda marca com ⚠ pedidos com item de atacado marcado como varejo (adulteração detectável). **Um pedido forjado nunca vira prejuízo: vira um PIX que não bate e um pedido recusado.**

**Consequência prática do trade-off de derivação:** se o admin mudar um preço DEPOIS de um pedido criado e ANTES da conferência, o total exibido acompanha o preço novo (não há histórico de preço sem servidor). Para o fluxo manual da loja isso é aceitável — o valor certo é o do momento da conferência — mas está registrado como limitação.

## 2. Pendências que dependem de ação manual (bloqueiam a proteção nova)

| # | Pendência | Risco enquanto não for feita |
|---|-----------|------------------------------|
| P1 | **Deploy das `firestore.rules` + hosting juntos** | As regras antigas continuam valendo no servidor. O site novo já supõe as regras novas (pedido sem valores). |
| P2 | **App Check (chave reCAPTCHA + enforce)** — gratuito no Spark | Bots ainda conseguem chamar Auth/Firestore direto. |
| P3 | **Chave PIX em `configuracoes/pagamento`** | Sem ela, a confirmação de pedido só mostra o botão de WhatsApp. |
| P4 | **Estoque de atacado dos produtos antigos** | Produtos pré-rodada-1 aparecem "sem estoque de atacado" até preencher o campo no painel. |

## 3. Falhas conhecidas que PERMANECEM (por decisão de escopo/custo)

| # | Falha | Por que ficou | Mitigação atual |
|---|-------|---------------|-----------------|
| R1 | **Estoque não baixa automaticamente no pedido.** Client-side isso exigiria permitir escrita pública em `produtos` (griefing pior que o problema). | Sem backend no Spark. | Checkout avisa quando a quantidade passa do estoque; admin ajusta estoque ao confirmar o pagamento (rotina no MANUAL_CONFIGURACAO §4). Overselling é barrado na conferência humana. |
| R2 | **Quantidades/itens do pedido não são revalidados fora das rules** (tamanho da lista 1..30 é o máximo validável). | Rules não iteram listas. | Derivação clampa quantidades (1..500) na exibição + conferência humana (seção 1). |
| R3 | **Rate limiting fino inexistente.** | Sem backend; App Check é a barreira anti-bot disponível. | Alertas de uso no console; monitorar. |
| R4 | **E-mail "existente" não é verificável em tempo real.** | Trade-off padrão; verificação é o link. | Conta só ativa (e só entra no banco) após o clique no link. |
| R5 | **Admin é ponto único de falha.** | Escopo. | Escape (C4) impede XSS armazenado; MFA do admin no roadmap. |
| R6 | **Confirmação de pagamento manual** (sem webhook). | Custo zero — gateway automático exigiria backend. | Fluxo PIX+WhatsApp documentado; volume da loja comporta. |

## 4. Dívidas técnicas (não são falhas de segurança)

| # | Dívida | Impacto |
|---|--------|---------|
| D1 | `buscarMetricas` agrega no cliente (1 doc/visita, 30 dias). | Dashboard lento/caro com tráfego alto; pré-agregação exigiria backend. |
| D2 | Busca textual client-side (com filtro ativo baixa a categoria inteira). | OK para catálogo pequeno/médio. |
| D3 | Derivar totais no painel lê cada produto único dos pedidos (leituras Firestore). | Batched por produto único; ok no free tier (50k leituras/dia). |
| D4 | Frete duplicado? **Não mais** — na rodada 2 o cálculo voltou a existir SÓ em `services/frete.js` (client-side). | — |
| D5 | Testes automatizados não existem. | Testar as rules no emulador está no roadmap. |

## 5. Roteiro de teste manual (validar o estado atual)

1. **Preço não gravável:** via console do navegador, tentar `addDoc` em `pedidos` com campo `total` → deve falhar (`permission-denied`, allowlist).
2. **Pedido legítimo:** checkout normal → pedido criado; confirmação mostra total derivado; painel admin mostra o MESMO total.
3. **Adulteração detectável:** criar pedido com `modo: "atacado"` e `temItemAtacado: false` via console (conta cliente) → painel exibe ⚠ no pedido.
4. **Atacado sem aprovação:** pedido com `temItemAtacado: true` numa conta não aprovada → rejeitado pelas rules.
5. **Metricas:** `addDoc` com campo extra → rejeitado.
6. **Cadastro:** e-mail inventado → nunca ativa, `usuarios/{uid}` não existe.
7. **Frete por produto:** carrinho com item "só retirada" → opção Entrega desabilitada com aviso.
8. **XSS:** produto com nome `<img src=x onerror=alert(1)>` → aparece como texto literal em todas as telas.
