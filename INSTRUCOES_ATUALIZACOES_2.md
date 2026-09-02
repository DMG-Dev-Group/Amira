# Atualizações — Banner editável, Busca, Múltiplas Imagens, Categorias na Home

## 1. Título do banner agora é editável + cor dourada

O texto "Produto da estação" deixou de ser fixo. Em **Admin → Produtos**, no
topo da página, tem um bloco **"Configuração do banner Produto da Estação"**
onde você define esse título livremente. A cor também mudou de cinza para o
mesmo dourado da etiqueta (ex: "Lançamento").

## 2. Barra de pesquisa em Admin → Produtos

Adicionei um campo de busca por nome ou SKU, ao lado do seletor de
ordenação. Funciona em conjunto com a ordenação e mostra "X de Y produtos"
para você saber quantos resultados a busca encontrou.

## 3. Imagem exclusiva para o banner + múltiplas imagens por produto

**No formulário de produto (Admin → Produtos → Novo/Editar):**

- O campo único "URL da imagem" virou uma **lista de imagens**. A primeira
  é a principal (aparece no catálogo e como capa na página do produto); as
  demais aparecem como miniaturas clicáveis na página do produto. Use
  "+ Adicionar outra imagem" para incluir mais.
- Quando "Aparece no banner Produto da Estação?" = Sim, surge um campo
  **"Imagem do banner (opcional)"** — se deixado vazio, o banner usa a
  imagem principal do produto; se preenchido, usa essa imagem específica
  em vez da do catálogo.

**Na página pública do produto:** agora mostra a galeria com miniaturas
embaixo da imagem principal, quando há mais de uma imagem cadastrada.

## 4. Categorias com link real na home + imagem de capa

A seção "Nossas categorias" da home (com os 3 cards: Perfumes, Maquiagem,
Acessórios) era fixa no HTML e **não tinha link nenhum** — agora é gerada
automaticamente a partir das categorias que você cadastrar em
**Admin → Categorias**, e cada card leva para o catálogo já filtrado
naquela categoria.

Também adicionei um campo opcional **"Imagem de capa"** no formulário de
categoria — se você não preencher, usa o logo da loja como placeholder.

**⚠️ Ação recomendada:** entre em Admin → Categorias e adicione uma imagem
de capa para cada categoria que você já tiver criado, para a seção da home
ficar visualmente completa (sem isso, vai aparecer o logo no lugar da foto).

## Publicar as regras atualizadas

Há uma coleção nova (`configuracoes`, usada para o título do banner).
Publique:

```bash
firebase deploy --only firestore:rules
```

## Resumo do que verificar depois de testar

1. Definir o título do banner em Admin → Produtos (ou deixar o padrão
   "Produto da estação")
2. Adicionar imagens de capa nas categorias já cadastradas
3. Testar a busca de produtos no admin com nomes/SKUs parciais
4. Se algum produto já tinha imagem cadastrada antes desta atualização,
   ela continua funcionando normalmente como imagem principal — só não
   terá imagens extras até você editar e adicionar mais
