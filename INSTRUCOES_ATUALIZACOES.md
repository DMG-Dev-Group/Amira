# Atualizações — Auth, Categorias Dinâmicas, Home e Rodapé

## 1. Verificação de e-mail + Login com Google

**O que mudou:**
- Toda conta criada por e-mail/senha agora recebe um e-mail de confirmação automaticamente.
- Login só é permitido depois de confirmar o e-mail (com botão de reenviar, se precisar).
- Adicionei "Entrar com Google" / "Continuar com Google" em login e cadastro — contas via Google já chegam verificadas (o próprio Google garante isso).

**O que você precisa fazer no Firebase Console (uma vez só, no projeto `flora-5754a`):**

1. **Ativar o provedor Google:**
   - Authentication → Sign-in method → adicionar provedor **Google**
   - Selecione um e-mail de suporte do projeto (qualquer e-mail seu serve)
   - Salvar

2. **Autorizar o domínio onde o site vai rodar** (se ainda não tiver feito):
   - Authentication → Settings → Authorized domains
   - `localhost` já vem autorizado por padrão (para testes locais)
   - Quando o site for publicado de verdade, adicione o domínio final aqui

3. **(Opcional) Personalizar o e-mail de verificação:**
   - Authentication → Templates → Email address verification
   - Pode editar o texto/remetente — por padrão já funciona com o template do Firebase

> **Atenção sobre login com Google em ambiente local:** ele abre um popup. Alguns
> navegadores bloqueiam popups por padrão — se isso acontecer ao testar, basta
> permitir popups para o endereço do site.

## 2. Admin com acesso total ao atacado

Contas com `role: "admin"` agora veem e compram no catálogo de atacado normalmente,
da mesma forma que um revendedor aprovado — tanto na interface quanto nas regras
de segurança do banco.

## 3. Categorias dinâmicas (gerenciadas pelo admin)

**Isso é uma mudança estrutural importante.** As categorias deixaram de ser uma
lista fixa no código (perfumes/maquiagem/acessórios/kits) e passaram a ser uma
coleção própria no Firestore (`categorias`), editável por você em
**Admin → Categorias**.

### ⚠️ Passo obrigatório de migração

Como os produtos que você já cadastrou usam os slugs antigos (`perfumes`,
`maquiagem`, `acessorios`, `kits`), você precisa criar essas mesmas categorias
no novo sistema, com o **nome exatamente correspondente**, para que o slug
gerado bata com o que já está salvo nos produtos:

| Nome a digitar no admin | Slug gerado automaticamente | Ícone sugerido |
|---|---|---|
| Perfumes | `perfumes` | 🌸 |
| Maquiagem | `maquiagem` | 💄 |
| Acessórios | `acessorios` | 💍 |
| Kits Especiais | `kits-especiais` | 🎁 |

**Atenção ao "Kits Especiais":** o slug antigo no código era `kits`, mas o novo
gerador de slug vai produzir `kits-especiais` a partir desse nome. Se você tiver
produtos já cadastrados com `categoria: "kits"`, eles vão parar de aparecer no
filtro dessa categoria até você os editar e selecionar a categoria nova
corretamente no formulário de produto (Admin → Produtos → Editar).

Recomendo: depois de criar as categorias, abra cada produto existente em
**Admin → Produtos → Editar** e confirme/reselecione a categoria certa no
campo, mesmo que pareça já estar certa — isso garante que o produto está
"reconectado" à categoria nova.

### Filtros e ordenação na tabela de produtos do admin

Adicionei o seletor que você pediu, no topo da página **Admin → Produtos**:
Mais recentes, Categoria (A-Z), Preço (maior), Preço (menor), Estoque (maior),
Estoque (menor).

## 4. Produtos em destaque na home

A seção "Os mais amados" (antes com produtos fixos no código) agora busca
automaticamente os produtos marcados com **Destaque na home = Sim**, no
formulário de produto do admin. Sem produto marcado, a seção aparece vazia
com uma mensagem.

## 5. Botão "+" da home adiciona ao carrinho de verdade

O botão "+" dos cards de produto na home agora chama a mesma lógica de
carrinho do resto do site — clicar sem estar logado leva para a tela de login.

## 6. Banner "Produto da Estação" configurável, com carrossel

No formulário de produto do admin, agora existe a seção **"Aparece no banner
Produto da Estação?"**. Quando marcada como "Sim", aparecem campos extras:

- **Etiqueta** (ex: "Lançamento", "Edição Limitada")
- **Título do banner** (pode ser diferente do nome do produto)
- **Texto promocional**
- **Tags** (separadas por vírgula — ex: "Rosa, Jasmim, Baunilha, Âmbar")
- **Ordem de exibição** (produtos com número menor aparecem primeiro)

Na home, se houver mais de um produto marcado, aparecem setas (◀ ▶) abaixo do
banner para navegar entre eles, com um contador (ex: "1 / 3").

## 7. Rodapé funcional

- A lista de "Categorias" no rodapé agora é preenchida automaticamente a
  partir das categorias cadastradas (mesma fonte do menu de navegação).
- "Institucional" e "Atendimento" agora apontam para páginas reais do site
  (Sobre nós → âncora da seção da home, Atacado, Seja revendedora → cadastro,
  Minha Conta, Meu Carrinho). Removi links que ainda não existem (Blog, FAQ,
  Rastreio de Pedido, Trocas e Devoluções) — quando quiser que eu crie essas
  páginas, me avise.
- **Os ícones de Facebook e Instagram continuam apontando para `#`** — me
  envie os links reais das suas redes quando tiver, e eu conecto.

## 8. Produtos de exemplo removidos

Os 4 produtos fixos no HTML (que apareciam sempre, independente do banco de
dados: "La Vie est Belle", "Black Opium", "Kit Lábios Perfeitos", "Colar
Dourado Flora") foram removidos. Agora a seção de destaques só mostra
produtos reais cadastrados por você com "Destaque = Sim".

## Publicar as novas regras e índices

Nada novo de índice nesta rodada, mas as regras do Firestore mudaram
(categoria de produtos, atacado para admin). Publique:

```bash
firebase deploy --only firestore:rules
```

## Resumo do que falta decidir/fazer

1. Ativar o provedor Google no Firebase Console (passo manual, acima)
2. Criar as 4 categorias no painel admin, com os nomes exatos da tabela acima
3. Reabrir cada produto existente e confirmar a categoria
4. Marcar pelo menos 1 produto como destaque e pelo menos 1 como banner hero,
   para essas seções não aparecerem vazias
5. Me enviar os links reais do Instagram/Facebook quando quiser conectá-los
