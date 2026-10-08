# Decisões

## 2026-10-08 — Redesign editorial da vitrine

- **Status:** autorizado pelo pedido do usuário.
- **Fonte:** solicitação de refatoração total do front-end com referência em mdebeauty.com.
- **Decisão:** usar tríptico fotográfico no hero, categorias logo após a abertura, vitrine de destaque, campanha, mais produtos e uma pausa curta com o frasco 3D.
- **Razão:** dar protagonismo aos produtos e facilitar a passagem da inspiração para a compra.
- **Impacto:** home, estilos e movimentos da vitrine; identidade e fluxos comerciais existentes permanecem.
- **Aprovação adicional:** nenhuma para a implementação local; publicação é decisão separada.

## 2026-10-08 — Refinamento da campanha e movimento

- **Status:** autorizado pelo pedido do usuário para aproximar a home da referência.
- **Fonte:** pedido de mais semelhança visual, animações no scroll e fotografias dirigidas para o site.
- **Decisão:** abrir a home com três fotografias originais dos frascos existentes, deslocar a modelo para a vitrine e criar uma pausa visual com o símbolo solar da Amira. Usar GSAP para revelações, recorte da foto e parallax suave.
- **Razão:** dar prioridade visual ao produto, aumentar o respiro entre capítulos e criar progressão editorial no scroll.
- **Impacto:** home, assets de campanha e `services/movimento.js`; sem mudanças em preços, dados ou fluxos comerciais.
- **Aprovação adicional:** nenhuma para a implementação na branch; publicação em produção permanece separada.

## 2026-10-08 — Tema público e paleta Amira

- **Status:** autorizado pelo pedido de corrigir o seletor de cores e retornar à paleta original.
- **Decisão:** as superfícies editoriais voltam a herdar os tokens do tema. O claro usa creme, nude e mocha da Amira; o escuro usa espresso e texto claro. As áreas com fotografia preservam o contraste necessário. O rodapé mantém texto e ícones creme nos dois temas.
- **Razão:** as cores fixas da campanha anulavam a troca de tema, e os ícones sociais herdavam tinta escura sobre fundo escuro.
- **Impacto:** CSS público e referências versionadas às folhas de estilo; sem alterações no fluxo de compra ou no tema do painel admin.
