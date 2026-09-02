# Estado Anterior do Site — Diagnóstico (antes da revisão de 07/2026)

Registro do "antes": erros e falhas de segurança que existiam no site na data desta revisão. As fundações da seção C do plano partiram deste diagnóstico (baseado no code review `REVIEW_DMG_2026-07.md` + análise complementar durante a implementação).

---

## 1. Falhas de segurança (por severidade)

### 🔴 Críticas

| # | Falha | Onde estava | Impacto real |
|---|-------|-------------|--------------|
| S1 | **Preço e total do pedido confiados no cliente.** O preço nascia no navegador (`precoUnitario` gravado no carrinho), o total era somado no front e gravado sem revalidação; as rules de `pedidos` não comparavam nada com a coleção `produtos`. | `services/carrinho.js`, `js/carrinho-checkout.js`, `services/pedidos.js`, `firestore.rules` | Qualquer usuário logado podia forjar um pedido com `total: 0,01` pelo console do navegador — fraude de valor direta. |
| S2 | **Cadastro sem barreira anti-bot.** `cadastrarUsuario` criava a conta, gravava `usuarios/{uid}` e disparava e-mail de verificação sem nenhuma proteção. Sem App Check, a config pública do Firebase permite chamar o SDK direto. | `services/auth.js`, ausência de App Check | Script em loop inflando billing, criando contas fantasma e queimando a reputação do domínio com e-mails a vítimas. |
| S3 | **Coleção `metricas` com escrita pública ilimitada** (`allow create: if true`, sem validação de shape). | `firestore.rules` | Qualquer pessoa sem login podia gravar documentos ilimitados de qualquer formato: custo de billing + lixo no dashboard admin. |

### 🟡 Médias

| # | Falha | Onde estava | Impacto real |
|---|-------|-------------|--------------|
| S4 | **XSS latente:** ~60 usos de `innerHTML` com dados interpolados crus (`p.nome`, `p.descricao`, URLs de imagem sem validação de esquema). | `js/produto-detalhe.js`, `admin/js/admin-produtos.js`, home, catálogo, carrinho, admin inteiro | Vetor estreito hoje (só admin escreve produtos), mas vira **XSS armazenado na loja inteira** se a conta admin for comprometida ou se algum campo passar a aceitar input de cliente. |
| S5 | **Sem revalidação de estoque/preço no checkout** — item entrava no carrinho com preço/estoque do momento da adição e nunca era reconferido. | fluxo carrinho→pedido | Compra de produto desativado, sem estoque ou com preço desatualizado. |
| S6 | **`atualizarPerfil` com spread `...dados`** gravava qualquer chave recebida. | `services/auth.js` | Porta aberta para campos indesejados no perfil (rules seguravam `role`/`statusRevendedor`, o resto passava). |
| S7 | **Backend documentado que não existia:** comentários no código diziam "o backend valida via Cloud Function" — não havia pasta `functions/` nem nenhuma function. | comentários em `services/`, `firestore.rules` | Falsa sensação de segurança; toda validação que as rules não faziam simplesmente não existia. |

## 2. Bugs funcionais

| # | Bug | Causa raiz |
|---|-----|-----------|
| B1 | **Busca não aparecia no mobile.** | `style.css` (~linha 1835): `.nav-busca-form { display:none !important }` em telas ≤900px, sem nenhuma alternativa de busca no mobile. |
| B2 | **Switch dark/light morto fora da home** (admin, atacado, produtos, carrinho, perfil...). | `services/script.js` continha `export` mas era incluído como script clássico (`<script src>` sem `type="module"`) → `SyntaxError: Unexpected token 'export'` derrubava o arquivo inteiro. A home só funcionava porque `home-dinamica.js` importava o script.js como módulo. No admin era pior: nenhum JS de tema era incluído e o `admin.css` usava variáveis CSS que nunca eram definidas. |
| B3 | **Criar categoria quebrava** com `ReferenceError`. | `services/categorias.js`: `criarCategoria` gravava a variável `icone`, que não existia no escopo da função. |
| B4 | **`console.log("Toggle senha clicado")` esquecido** em produção. | `js/cadastro.js` **e** `js/login.js` (o review apontou só o cadastro; o login tinha o mesmo log). |
| B5 | **Newsletter enviava URL malformada** para o WhatsApp (`?text=Boa%20noite=<msg>`). | `services/script.js`, concatenação errada do parâmetro `text`. |

## 3. Dívidas de arquitetura/documentação

- **README.md descrevia uma stack inexistente** (React/Vite + Express + PostgreSQL + Prisma + JWT + Zod) — a stack real sempre foi HTML/CSS/JS vanilla + Firebase.
- `buscarMetricas` lia todos os documentos de 30 dias e agregava no cliente — cresce linearmente com o tráfego (anotado como dívida; ainda não resolvido nesta revisão, ver FALHAS_REMANESCENTES.md).
- Catálogo baixava a coleção `produtos` inteira em toda visita (sem paginação).
- Mínimo de atacado por produto (`qtdMinimaAtacado`) e estoque único para varejo+atacado — modelo de dados que a loja já tinha decidido mudar.

## 4. O que já estava bom (e foi mantido)

- `firestore.rules` com default-deny final e bloqueio de auto-promoção a admin/revendedor.
- Camada `services/` separada das páginas (facilitou muito esta revisão — e facilita a futura integração Nuvemshop).
- Tratamento de erro com feedback ao usuário; validação de CNPJ com dígito verificador; fluxo de verificação de e-mail no login.
