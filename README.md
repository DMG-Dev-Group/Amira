# Flora Beauty — E-commerce (Flora Boutique)

Loja virtual de perfumes, maquiagem e acessórios (varejo + atacado para revendedores com CNPJ), operando em São Luís–MA. Projeto da DMG.

> **Nota histórica:** versões antigas deste README descreviam um plano com React/Express/PostgreSQL/Prisma que **nunca foi implementado**. Este documento reflete a stack REAL do projeto. Não proponha mudanças baseadas na stack antiga.

---

## Stack real

| Camada | Tecnologia |
|--------|------------|
| Frontend | **HTML/CSS/JavaScript vanilla** (módulos ES via CDN) — uma página por rota em `frontend/src/pages/` |
| Banco de dados | **Cloud Firestore** (regras em `firestore.rules` — padrão: negar) |
| Autenticação | **Firebase Auth** (e-mail/senha com verificação obrigatória + Google) |
| Backend | **NENHUM — plano Spark (custo zero)**. Pedidos são criados pelo cliente **sem nenhum campo monetário** (allowlist nas rules); preço/frete/total são derivados da coleção `produtos` na exibição, e o valor é conferido manualmente no PIX (`docs/FALHAS_REMANESCENTES.md` §1) |
| Anti-bot | **Firebase App Check** (reCAPTCHA v3, gratuito no Spark) — exige configuração no console, ver `docs/MANUAL_CONFIGURACAO.md` |
| Pagamento | **PIX manual + WhatsApp** (`wa.me`, gratuito) — ver `docs/MANUAL_PAGAMENTO.md` |
| Hospedagem | **Firebase Hosting** (serve `frontend/src/pages/`) |
| Dependências npm | apenas `firebase` e `boxicons` (o site usa SDK via CDN; o pacote npm existe por compatibilidade) |

**Projeto Firebase atual:** `flora-5754a` — **ambiente de testes**, plano **Spark**. A migração para produção está documentada em `docs/MANUAL_CONFIGURACAO.md` (seção 5).

> ⚠️ **Não reintroduza Cloud Functions sem alinhar orçamento**: elas exigem o plano Blaze (cartão + pré-pagamento), descartado na rodada 2. O plano de retorno está em `docs/ROADMAP_FUTURO.md` (item 0).

## Estrutura de pastas

```
├── frontend/src/pages/        # o site (cada .html é uma rota)
│   ├── js/                    # scripts específicos de página
│   ├── services/              # ÚNICA camada de acesso a dados (Firestore/Auth)
│   ├── styles/                # CSS (paleta em style.css :root)
│   ├── images/
│   └── admin/                 # painel administrativo (produtos, pedidos, revendedores, categorias)
├── docs/                      # documentação da revisão 2026-07 (manuais, alterações, roadmap)
├── firestore.rules            # regras de segurança do banco (default-deny)
├── firestore.indexes.json
├── firebase.json              # hosting + firestore
└── seed-produtos.js           # popular produtos de exemplo no ambiente de testes
```

## Regras do projeto (leia antes de mexer)

1. **Toda leitura/escrita de dados passa por `services/`** — páginas nunca falam com o Firestore direto. Isso mantém a troca futura de backend (ex.: integração Nuvemshop) barata.
2. **Nenhum valor monetário do cliente é gravado ou confiado.** Pedidos não carregam preço (allowlist nas rules); totais são derivados de `produtos` na exibição; a conferência humana do PIX é a trava final.
3. **Texto dinâmico nunca entra cru em `innerHTML`** — use `escapeHtml()` e `urlImagemSegura()` de `services/seguranca.js`.
4. **Toda coleção nova precisa de regra correspondente** em `firestore.rules` (o padrão do banco é negar).
5. Frete é calculado 100% no cliente, em `services/frete.js` — único lugar para editar zonas/valores.

## Rodando localmente

```bash
# site estático (qualquer servidor serve):
python -m http.server 5500 --directory frontend/src/pages

# emuladores do Firebase (Firestore + Auth):
firebase emulators:start
# (descomente as linhas connect*Emulator em services/firebase-config.js)
```

## Deploy

```bash
firebase deploy --only hosting            # site
firebase deploy --only firestore:rules    # regras
```

⚠️ As regras novas e o site **precisam ir ao ar juntos** — o front novo grava pedidos no formato que as rules novas exigem (sem campos de valor). Passo a passo: `docs/MANUAL_CONFIGURACAO.md`.

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/ALTERACOES_2026-07_R2.md](docs/ALTERACOES_2026-07_R2.md) | **Rodada 2:** re-arquitetura custo zero (sem Cloud Functions) e ajustes de UX |
| [docs/ALTERACOES_2026-07.md](docs/ALTERACOES_2026-07.md) | Rodada 1: o que mudou, por que e onde |
| [docs/ESTADO_ANTERIOR.md](docs/ESTADO_ANTERIOR.md) | Diagnóstico do site antes da revisão (falhas e bugs) |
| [docs/FALHAS_REMANESCENTES.md](docs/FALHAS_REMANESCENTES.md) | O que ainda falta / riscos conhecidos após a revisão |
| [docs/MANUAL_CONFIGURACAO.md](docs/MANUAL_CONFIGURACAO.md) | Passos manuais: rules, App Check, rotina operacional, migração p/ produção |
| [docs/MANUAL_PAGAMENTO.md](docs/MANUAL_PAGAMENTO.md) | PIX manual + WhatsApp (gratuito) e como cadastrar a chave PIX |
| [docs/ROADMAP_FUTURO.md](docs/ROADMAP_FUTURO.md) | Integração Nuvemshop e próximas evoluções |
| `INSTRUCOES_*.md` | Anotações históricas de etapas anteriores do projeto |

## Modelo de dados (coleções)

| Coleção | Leitura | Escrita | Observações |
|---------|---------|---------|-------------|
| `produtos` | pública | admin | preços, estoques por modalidade (`estoqueVarejo`/`estoqueAtacado`), desconto opcional |
| `categorias` | pública | admin | slug estável usado nos filtros |
| `configuracoes` | pública | admin | `atacado` (mínimo por carrinho), `pagamento` (PIX), `homeCarrossel` |
| `usuarios/{uid}` | dono/admin | dono (restrito) | perfil só nasce com e-mail verificado; `role`/aprovação de revenda só via admin |
| `carrinhos/{uid}` | dono | dono | valores de exibição; nada aqui é fonte de verdade de preço |
| `pedidos` | dono/admin | dono (create restrito) | **sem campos monetários** (allowlist nas rules); totais derivados de `produtos` na exibição |
| `metricas` | admin | create público com shape validado | telemetria anônima de visitas |
