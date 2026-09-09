# Amira — E-commerce

Loja virtual de **perfumes, decantes, miniaturas e periféricos de celular**
(varejo + atacado para revendedores com CNPJ), São Luís–MA. Projeto da DMG.

> Versões antigas do repositório se chamavam "Flora Beauty" e descreviam
> uma stack React/Express/PostgreSQL que **nunca foi implementada**. Este
> README reflete o estado real.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | **HTML/CSS/JS vanilla** (módulos ES via CDN), uma página por rota em `frontend/src/pages/`. Sem build. |
| Banco | **Cloud Firestore** (regras em `firestore.rules` — padrão: negar) |
| Auth | **Firebase Auth** (e-mail/senha com verificação obrigatória + Google) |
| Funções serverless | **Vercel Functions** em `api/` (só pagamento — Mercado Pago) |
| Anti-bot | **Firebase App Check** (reCAPTCHA v3) |
| Pagamento | **Mercado Pago** (Checkout Pro: PIX + cartão) — em integração; fallback PIX manual + WhatsApp |
| Hospedagem | **Vercel** (`vercel.json` aponta o output para `frontend/src/pages/`) |
| npm | `firebase` (via CDN no site), `firebase-admin` (seed + funções) |

**Projeto Firebase atual:** `flora-5754a` — **ambiente de testes**. A
migração para um projeto de produção está no Apêndice B do plano.

## Estrutura

```
├── frontend/src/pages/     # o site (cada .html é uma rota)
│   ├── js/                 # scripts de página
│   ├── services/           # ÚNICA camada de acesso a dados (Firestore/Auth)
│   ├── styles/             # CSS (tokens de cor em style.css :root)
│   ├── images/
│   └── admin/              # painel (produtos, camadas, pedidos, revendedores, configurações)
├── api/                    # Vercel Functions — pagamento Mercado Pago (ver api/README.md)
├── docs/PLANO_PRODUCAO_2026-09.md   # plano vigente + análise de segurança + apêndices
├── firestore.rules         # regras do banco (default-deny)
├── firestore.indexes.json
├── firebase.json           # config Firestore (o hosting é a Vercel)
├── vercel.json
├── .env.example            # env vars das funções (Mercado Pago, service account)
└── seed-produtos.js        # popular camadas + produtos de exemplo (precisa de service-account.json)
```

## Regras do projeto (ler antes de mexer)

1. **Toda leitura/escrita de dados passa por `services/`** — páginas nunca
   falam com o Firestore direto.
2. **Nenhum valor monetário do cliente é gravado ou confiado.** O pedido
   não carrega preço (allowlist nas rules); o total é recalculado **no
   servidor** por `api/pagamento.js` antes de cobrar (no PIX manual de
   fallback, a conferência humana do comprovante).
3. **Texto dinâmico nunca entra cru em `innerHTML`** — `escapeHtml()` e
   `urlImagemSegura()` de `services/seguranca.js`.
4. **Toda coleção nova precisa de regra** em `firestore.rules`, com
   allowlist de chaves e limite de tamanho — não só `ehAdmin()`.
5. **Segredos** (token do Mercado Pago, service account) só em Environment
   Variables da Vercel — nunca no cliente. A `apiKey` do Firebase no
   `firebase-config.js` é **pública por design**, não é segredo.
6. Frete é calculado em `services/frete.js` (cliente) e replicado em
   `api/_lib/precos.js` (servidor) — manter os dois em sincronia.
7. Imagens: upload de arquivo → data URI no próprio documento
   (`services/imagem-upload.js`), sem Firebase Storage.

## Rodar localmente

```bash
# site estático:
python -m http.server 5500 --directory frontend/src/pages

# funções de pagamento (precisa de .env a partir do .env.example):
vercel dev

# emuladores do Firebase (Firestore + Auth):
firebase emulators:start
```

> Com o App Check enforçado no `flora-5754a`, o `localhost` precisa de um
> debug token, ou o Firestore recusa tudo. Ver Apêndice B do plano.

## Deploy

- **Site:** `git push` na branch que a Vercel publica.
- **Regras:** `firebase deploy --only firestore:rules`
- **Índices:** `firebase deploy --only firestore:indexes`

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/PLANO_PRODUCAO_2026-09.md](docs/PLANO_PRODUCAO_2026-09.md) | Plano vigente: fases para produção, análise de segurança/criptografia, decisões, e **Apêndice A** (roteiro de teste de segurança) + **Apêndice B** (passos de console Firebase/Google Cloud) |
| [api/README.md](api/README.md) | Integração de pagamento Mercado Pago — arquitetura e passo a passo de setup |

## Modelo de dados (coleções)

| Coleção | Leitura | Escrita | Observações |
|---------|---------|---------|-------------|
| `produtos` | pública | admin | preços, `estoque` (compartilhado varejo/atacado), desconto opcional, `filtros` por camada, imagens como data URI |
| `camadas` | pública | admin (shape validado) | eixos de filtro do catálogo (Tipo, Origem, Gênero…); a de menor `ordem` é a principal |
| `configuracoes` | pública | admin | `atacado` (`ativo`, `qtdMinimaCarrinho`), `pagamento` (PIX), `homeCarrossel`, `homeIphones` |
| `usuarios/{uid}` | dono/admin | dono (allowlist) | perfil só nasce com e-mail verificado; `role` e aprovação de revenda só via admin; telefone, nascimento, consentimento LGPD |
| `carrinhos/{uid}` | dono | dono | valores de exibição; nada aqui é fonte de verdade de preço |
| `pedidos` | dono/admin | dono (create com allowlist) | **sem campos monetários no create**; total gravado pela função de pagamento (Admin SDK); `pagamento.status` atualizado pelo webhook |
| `metricas` | admin | create público (shape validado) | telemetria anônima de visitas; só roda com consentimento de cookies |
