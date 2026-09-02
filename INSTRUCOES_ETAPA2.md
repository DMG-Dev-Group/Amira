# Etapa 2 — Catálogo de Produtos, Busca e Filtros

## O que foi feito

1. **Estrutura de produtos no Firestore** (`services/produtos.js`):
   coleção `produtos` com `nome`, `sku`, `peso` (em gramas), `descricao`,
   `codigoBarras`, mais categoria, preços de varejo/atacado e estoque —
   já deixando pronto o terreno pro modo atacado da próxima etapa.

2. **Página de catálogo** (`produtos.html`): grid de produtos com:
   - Filtro por categoria (lateral, estilo Mercado Livre)
   - Filtro por faixa de preço
   - Ordenação (mais recentes, menor/maior preço, nome A-Z)
   - Busca por nome, SKU ou descrição

3. **Barra de busca na navbar**: tanto na Home quanto no catálogo. Buscar
   leva para `produtos.html?busca=...`.

4. **Página de detalhe do produto** (`produto.html`): preço, descrição,
   estoque, peso, código de barras, seletor de quantidade e botão de
   adicionar ao carrinho (carrinho salvo no Firestore, por usuário).

5. **Botão "📦 Atacado"** na navbar, levando a uma página `atacado.html`
   (por ora um placeholder — o modo atacado completo é a Etapa 5).

6. **Serviço de carrinho** (`services/carrinho.js`): já funcional para
   adicionar produtos. A página de carrinho/checkout completa vem na
   próxima etapa.

7. **Dois bugs antigos corrigidos**, encontrados durante o trabalho:
   - Todas as imagens da Home usavam `../images/...`, um nível acima do
     correto — provavelmente nunca apareciam depois do deploy.
   - O `nav-conta.js` importava de si mesmo por engano (`../services/auth.js`
     dentro de um arquivo que já está em `services/`).

## Índices novos no Firestore

Os filtros de categoria exigem índices compostos. Já estão declarados em
`firestore.indexes.json`. Publique junto com as regras:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> Se você esquecer disso, o catálogo vai funcionar para "Todos os produtos"
> mas dar erro ao filtrar por categoria — o próprio console do navegador
> mostra um link direto para criar o índice manualmente, caso prefira.

## Como popular produtos de teste rapidamente

Vem incluso um script `seed-produtos.js` com 7 produtos de exemplo
(perfumes, maquiagem, acessórios e kits, com imagens de banco de imagens
gratuito). Para rodar:

1. No Firebase Console do projeto `flora-5754a`: Configurações do projeto
   → Contas de serviço → **Gerar nova chave privada** → salva o arquivo
   como `service-account.json` na raiz do projeto (mesma pasta do
   `seed-produtos.js`)
2. **Nunca envie esse arquivo pra ninguém ou suba pro GitHub** — ele dá
   acesso total ao seu banco de dados.
3. No terminal:
   ```bash
   npm install firebase-admin
   node seed-produtos.js
   ```
4. Recarregue `produtos.html` no navegador.

## Próxima etapa

Carrinho completo + checkout com endereço e cálculo de frete por CEP.
