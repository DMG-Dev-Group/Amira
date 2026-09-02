# Etapa 6 — Painel Administrativo

## O que foi feito

Criei o painel completo em `admin/`, protegido por `role: "admin"` (a
mesma proteção que já existia desde a Etapa 1). Tem 4 páginas:

### 1. Dashboard (`admin/index.html`)
- Cards com: visitas (30 dias), views de produto, produtos ativos,
  pedidos totais, faturamento (soma de pedidos com status diferente de
  "cancelado"/"aguardando_pagamento")
- Gráfico de barras simples: visitas por dispositivo (mobile/desktop/tablet)
- Gráfico de barras: origem do tráfego (direto, google, instagram,
  facebook, whatsapp, outros sites)
- Lista das páginas mais visitadas
- Tabela dos 8 pedidos mais recentes

### 2. Produtos (`admin/produtos.html`)
- Tabela com todos os produtos (inclusive inativos — diferente do
  catálogo público, que só mostra os ativos)
- Botão "+ Novo produto" abre um modal com todos os campos: nome, SKU,
  código de barras, categoria, peso, descrição, imagem, preço varejo,
  estoque, preço/quantidade mínima de atacado, status ativo/inativo,
  destaque na home
- Editar e excluir direto na tabela

### 3. Pedidos (`admin/pedidos.html`)
- Tabela com todos os pedidos, filtro por status
- Mudar o status (aguardando pagamento → pago → preparando → enviado →
  entregue, ou cancelado) direto num seletor na própria linha
- "Ver detalhes" abre os itens do pedido, endereço, frete e valores

### 4. Revendedores (`admin/revendedores.html`)
- Três blocos: pendentes, aprovados, rejeitados
- Botões de Aprovar/Rejeitar nas solicitações pendentes — substitui a
  necessidade de entrar no Firestore Console manualmente (como nas
  etapas anteriores)

## Métricas — o que é coletado e o que não é

Para o dashboard funcionar, toda página pública agora registra uma
"visita" anônima no Firestore (coleção `metricas`), com:
- Página visitada (ou produto, se for `produto.html`)
- Tipo de dispositivo (mobile/tablet/desktop) — detectado pelo navegador
- Origem do tráfego — pelo `referrer` do navegador (de onde a pessoa veio)
- Data/hora

**Não é coletado**: IP, localização exata, nome ou e-mail do visitante,
nem qualquer identificador pessoal. Isso é só pra te dar uma visão de
"quantas pessoas estão vindo, de onde, em que dispositivo" — sem entrar
em território de dado sensível (LGPD) que exigiria política de
privacidade e consentimento de cookies.

## Como acessar o painel

1. Sua conta precisa ter `role: "admin"` no Firestore (veja
   `INSTRUCOES_ETAPA1.md` para o passo a passo de promover a primeira
   conta manualmente)
2. Ao logar, você é redirecionado automaticamente para `admin/index.html`
3. O botão "Sair da conta" está no rodapé da barra lateral

## Pontos de atenção

- **Excluir produto é permanente** — não tem "lixeira" ou "desfazer".
  Se preferir manter o produto mas escondê-lo da loja, use "Inativo" em
  vez de excluir.
- O faturamento do dashboard soma pedidos com qualquer status diferente
  de cancelado/aguardando pagamento — ajuste essa regra em
  `admin-dashboard.js` se quiser contar só pedidos "entregue", por exemplo.
- As métricas começam a aparecer só depois que pessoas visitarem o site
  com este código já publicado — não há dados retroativos.

## Próxima etapa

Você mencionou no início do projeto que adicionaria features extras
conforme fôssemos avançando, sempre perguntando antes. Como já cobrimos
auth, perfil, catálogo, carrinho/checkout, frete, atacado e agora o
painel admin — todas as etapas originais estão completas. Mercado Pago
segue pendente por decisão sua (vai ser integrado pelo seu grupo).

Quer que eu sugira alguma melhoria adicional, ou já testar tudo
integrado primeiro?
