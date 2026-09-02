# Atualizações — Categorias em carrossel, Banner por produto, Galeria de imagens

## 1. Categorias em carrossel

A seção "Nossas categorias" da home agora rola horizontalmente, igual à
seção "Os mais amados" — não importa quantas categorias você cadastrar,
elas vão sempre aparecer em uma linha só, com rolagem lateral, em vez de
"quebrar" em colunas estranhas.

## 2. Título do banner agora é por produto (não mais global)

Removi o bloco de "Configuração do banner Produto da Estação" do topo da
página de produtos. Agora, dentro do formulário de cada produto, quando
você marca "Aparece no banner Produto da Estação?" = Sim, o primeiro
campo que aparece é **"Nome da seção"** — onde você escreve livremente
algo como "Produto da estação", "Sexo" (como você testou), "Destaque do
mês", etc. Cada produto pode ter seu próprio texto ali.

> Como essa mudança altera onde o texto é guardado, produtos que você já
> tinha marcado para o banner **antes** desta atualização vão mostrar
> "Produto da estação" como valor padrão até você abrir e salvar
> novamente — é só reabrir o produto em Admin → Produtos → Editar e
> confirmar/ajustar esse campo.

## 3. Galeria de imagens do produto: carrossel automático + setas + arrastar

Na página pública de cada produto, quando ele tem mais de uma imagem
cadastrada, agora aparece um carrossel completo:

- **Troca automática**: passa para a próxima imagem sozinho, de tempos em
  tempos.
- **Setas**: uma de cada lado da imagem, para avançar/voltar manualmente.
- **Pontinhos indicadores**: embaixo da imagem, mostram quantas fotos
  existem e qual está sendo exibida; também são clicáveis.
- **Arrastar**: funciona tanto com o mouse no computador quanto com o
  dedo no celular/tablet — arrasta para o lado e a imagem troca.

### Onde alterar o tempo de troca automática

Como você pediu, isso está isolado em uma única linha, bem comentada, no
arquivo `frontend/src/pages/js/produto-detalhe.js`, logo no topo:

```javascript
// ⚠️ Miguel: para mudar o tempo de troca automática das imagens do
// produto, edite só o número abaixo (em milissegundos — 1000 = 1 segundo).
const INTERVALO_TROCA_AUTOMATICA_MS = 4000;
```

Está em **4000** agora, ou seja, 4 segundos entre cada troca. Para deixar
mais rápido, diminua o número (ex: `2000` = 2 segundos); para mais lento,
aumente (ex: `6000` = 6 segundos). Essa configuração não aparece em
nenhuma tela do admin, como você pediu — é só esse número no código.

## Arquivo removido

O `services/config-home.js` (criado na rodada anterior para guardar o
título global do banner) foi removido, já que essa configuração passou a
ser por produto. Se você publicou as regras do Firestore com a coleção
`configuracoes` na rodada passada, pode deixar como está — ela não
interfere em nada, só ficou sem uso por enquanto.

## Publicar regras

Nenhuma regra nova nesta rodada — não é necessário publicar nada.
