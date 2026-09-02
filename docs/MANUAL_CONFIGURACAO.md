# Manual de Configuração — Flora Beauty

**Para:** Miguel (DMG) · **Atualizado em:** rodada 2 (07/2026)
Passos manuais que **só podem ser feitos no console/CLI**. Sem eles, partes da revisão de segurança ficam desligadas.

> **Rodada 2 — custo zero:** o projeto roda 100% no plano **Spark (gratuito)**. As Cloud Functions da rodada 1 foram REMOVIDAS (exigiam Blaze). Nada aqui exige cartão de crédito.

---

## 1. Deploy das regras do Firestore (fazer AGORA)

As `firestore.rules` são a única barreira de servidor no Spark. A versão atual:
- fecha a coleção `metricas` (shape validado);
- exige e-mail verificado para criar perfil (`usuarios/{uid}`);
- permite criar `pedidos` **sem nenhum campo monetário** (allowlist de chaves — preço não é gravável) e só com atacado para revendedor aprovado.

```bash
firebase deploy --only firestore:rules
```

O site novo já supõe essas regras — **faça este deploy junto com o do hosting**:

```bash
firebase deploy --only hosting
```

## 2. App Check + reCAPTCHA v3 (anti-bot — GRATUITO no Spark)

Sem isso, um script chama o Firebase direto (a config do site é pública por design). O App Check **não exige cartão nem plano pago**.

1. Console Firebase → **App Check** → aba *Apps* → registre o app web com o provedor **reCAPTCHA v3** (o console gera a chave do site, ligada ao domínio).
2. Cole a chave em [firebase-config.js](../frontend/src/pages/services/firebase-config.js), na constante `RECAPTCHA_V3_SITE_KEY` (substituindo o placeholder `COLE_AQUI_...`), e faça `firebase deploy --only hosting`.
3. No console App Check → aba *APIs* → **Aplicar (Enforce)** para **Cloud Firestore** e **Authentication**.
   - Dica: deixe alguns dias em modo "monitorar" antes de aplicar, para confirmar que ~100% das requisições chegam verificadas.
4. Para testar em `localhost` depois do enforce: descomente `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;` no firebase-config.js, abra o site, copie o token do console do navegador e registre em App Check → Apps → ⋮ → *Gerenciar tokens de depuração*. **Não deixe essa linha descomentada em produção.**

## 3. Documentos de configuração no Firestore (opcionais, com padrão embutido)

Coleção `configuracoes` (leitura pública, escrita só admin):

| Documento       | Campos                                        | Para quê                                                    |
|-----------------|-----------------------------------------------|-------------------------------------------------------------|
| `atacado`       | `qtdMinimaCarrinho` (number)                  | Mínimo de unidades de atacado por carrinho (padrão: **6**)   |
| `pagamento`     | `pixChave`, `pixNome`, `instrucoes` (strings) | Chave PIX exibida na confirmação (ver MANUAL_PAGAMENTO.md)   |
| `homeCarrossel` | `imagens` (array de URLs https), `intervaloMs`| Fotos do carrossel de anúncio da home (padrão: fotos locais) |

## 4. Rotina operacional (sem backend, algumas coisas são manuais)

- **Estoque:** o site NÃO baixa estoque sozinho ao receber pedido (isso exigiria backend). Ao confirmar um pagamento, ajuste o estoque do produto no painel admin. O checkout avisa o cliente quando a quantidade pedida passa do estoque atual.
- **Conferência de valor:** o total do pedido é derivado dos preços atuais do catálogo — confira no painel admin antes de aceitar o PIX (ver MANUAL_PAGAMENTO.md, seção 3).
- **Produtos antigos / estoque de atacado:** produtos criados antes da rodada 1 precisam do campo "Estoque atacado" preenchido no painel para venderem no atacado.
- **Frete por produto:** o campo "Frete disponível" (painel → produto) controla se o item pode ser entregue; "Não" = só retirada na loja.

## 5. Ao migrar para o projeto de PRODUÇÃO (não migra sozinho)

1. `.firebaserc` → trocar `flora-5754a` pelo ID do projeto de produção.
2. `frontend/src/pages/services/firebase-config.js` → trocar o bloco `firebaseConfig` pelas credenciais do projeto novo.
3. **App Check**: registrar o app de novo (a chave reCAPTCHA é por domínio/projeto) e refazer a seção 2.
4. **Rules e indexes**: `firebase deploy --only firestore`.
5. Recriar os documentos da coleção `configuracoes` e a conta admin (`usuarios/{uid}` com `role: "admin"` — defina manualmente no console).
6. Hosting: `firebase deploy --only hosting` e apontar o domínio.

## 6. Comandos úteis

```bash
firebase deploy                      # hosting + rules (não há mais functions)
firebase deploy --only hosting       # só o site
firebase deploy --only firestore     # rules + indexes
firebase emulators:start             # testar local (Firestore + Auth)
```
