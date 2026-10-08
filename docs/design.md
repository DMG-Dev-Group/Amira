# Design: Amira — "Maison"

> Fonte de verdade das decisões visuais da loja. Atualize quando a direção
> mudar ou quando o build confirmar tokens provisórios. Adições locais (uma
> seção, um componente) não reescrevem este arquivo.

## Contexto

- **Modo principal**: Persuadir (home, iPhones, atacado), Experiência
  (catálogo e produto: o produto lidera, a interface recua) e Operar
  (carrinho, checkout, conta, pedidos: terminar a tarefa sem atrito).
- **Cena de uso**: cliente em São Luís, no celular, à noite ou no intervalo
  do trabalho, quase sempre vindo do Instagram ou do WhatsApp da loja. Quer
  ver o perfume, o preço e comprar ou chamar no WhatsApp em poucos toques. A
  loja física fica no Monumental Shopping: o site é a vitrine dela fora do
  horário.
- **Identidade**: cliente (marca própria). Logo Amira (sol nascente dourado sobre a
  linha do horizonte + "AMIRA" em sans geométrica fina), mocha `#9B6B5E`,
  creme `#FEF5EF`, nude `#ECC1A0`; o dourado do logo vira o acento de detalhe. A paleta original permanece; a forma muda.

## Direção

- **Tese**: o site é o **balcão de uma maison de perfumaria**, não um
  e-commerce de template. Cada produto em cima de um pedestal claro, com luz
  macia e muito ar em volta; a tipografia é a do rótulo do frasco. Recusa o
  arranjo da categoria: carrossel de banner + faixa de marquee + grade de
  cards com sombra + newsletter, tudo com o mesmo peso.
- **Mundo**: rótulo de perfume de nicho (didone + filete), cartonagem de
  caixa de perfume com hot stamping champanhe, vitrine iluminada de boutique
  de shopping, página de produto da Apple (o objeto no centro, a história
  contada pelo scroll), editorial de moda impresso (Harper's Bazaar), cartão
  de visita com relevo seco.
- **Primeira tela (home)**: as fotos cadastradas no painel formam um
  tríptico editorial em desktop; no celular, a imagem central ocupa toda a
  tela. O título e uma ação principal ficam sobre a fotografia, com
  contraste suficiente para a navegação.
- **Momento memorável**: a abertura. Na primeira visita da sessão, o **sol
  da Amira nasce**: a linha do horizonte se desenha, o semicírculo sobe, os
  raios se abrem um a um em dourado e o nome aparece fechando o espaçamento;
  a cortina sobe revelando a home. Mais adiante, o frasco de vidro em 3D
  acompanha o scroll em uma pausa breve sobre a marca.
- **Detalhe persistente**: a **linha do horizonte** do logo — um filete
  dourado de 1px. Ela se desenha sob os títulos de seção ao entrarem na
  tela, sublinha links no hover, separa o preço no card, marca o item ativo
  da navegação e o progresso dos toasts. Os **raios** do sol reaparecem só
  em momentos de marca: abertura, estado vazio, confirmação de pedido.

## Fundação

| Camada | Decisão | Onde vive no código |
|---|---|---|
| Cor | Estratégia **contida**: porcelana + tinta espresso, mocha como acento de marca (botões, preço promocional), dourado do logo só em filetes e no sol. Tema claro é o padrão (as fotos dos produtos têm fundo branco e somem num fundo escuro); tema escuro "espresso" preservado no seletor. | `styles/base.css` (`:root` e `body[data-theme="dark"]`) |
| Tipografia | **Bodoni Moda** (display; eixo óptico, itálico para a palavra de ênfase) — é a letra do rótulo de perfume e da revista de moda, o mundo do produto. **Jost** (UI e texto; linhagem Futura, a sans clássica das casas de perfume, já era a fonte do site). Escala fluida com `clamp()`. | `styles/base.css` (`--f-*`, `--t-*`) |
| Espaçamento | Escala 4px (`--s-1`…`--s-10`); seções com respiro grande (`--secao`). | `styles/base.css` |
| Raio e elevação | Imagens e cards sem raio, sem borda e sem sombra (o pedestal é a cor). Botões e campos 2px; pílula só em chip, contador e quantidade. Sombra só em sobreposição (toast, menu, diálogo). | `styles/base.css` |
| Movimento | Ease-out exponencial `cubic-bezier(.16,1,.3,1)`. UI 180–240ms; entradas de seção 0.9–1.1s com escalonamento curto. GSAP + ScrollTrigger para hero, filetes, parallax e o frasco 3D. Tudo respeita `prefers-reduced-motion`; conteúdo nunca depende da animação para aparecer. | `services/movimento.js`, `styles/base.css` |
| Ícones | Traço 1.5px, cantos arredondados, 20–22px — uma família só (SVG inline, estilo Lucide). | inline no HTML/JS |

## Recursos adotados

| Recurso | Para quê | Adaptação feita |
|---|---|---|
| GSAP 3 + ScrollTrigger (self-host em `vendor/`) | Entradas, parallax, frasco 3D guiado pelo scroll, abertura | Carregado sob demanda pelo `movimento.js`; sem GSAP o CSS mostra tudo |
| three.js (só o necessário, empacotado em `vendor/frasco-3d.js`) | Frasco de vidro 3D da home | Só em desktop/aparelho capaz, sem economia de dados e sem movimento reduzido; senão, fallback estático |
| Google Fonts: Bodoni Moda + Jost | Tipografia | `display=swap`, só os pesos usados |

## Regras do projeto

- Nenhum ID ou classe usada pelo JavaScript some: o JS monta cards, carrinho,
  checkout e avaliações com classes próprias (`catalogo-card`, `pc-*`,
  `cp-*`, `mp-*`, `carrinho-*`…). O redesign reestiliza por baixo.
- Nenhum valor de cor, raio, sombra ou duração fora dos tokens de
  `base.css`.
- Animação nunca bloqueia: a abertura dura no máximo ~2s, aparece só na
  primeira página da sessão e some ao primeiro clique/tecla.
- 3D é enfeite com motivo: nunca carrega no celular nem atrasa o conteúdo.
- A home segue uma ordem de compra: hero, coleções, destaques, campanha,
  novidades, marca, linha de iPhones, avaliações e lista de novidades.
- A página de avaliação e a página 404 usam a mesma fundação visual em
  `styles/extra-pages.css` e mantêm um caminho simples de volta à loja.
- O painel admin (`admin/`) é Operar e tem folha própria; fica fora desta
  direção.

## Em aberto

- Fotografia: as fotos da home vêm do admin; vale um ensaio com fundo neutro
  e luz lateral para casar com o pedestal.
- Redes sociais do rodapé: Facebook e Instagram ainda apontam para `#`.
