# Funções serverless (`/api`) — pagamento Mercado Pago

**Estado: esqueleto.** A estrutura está pronta; falta plugar credenciais e
fechar os `TODO` marcados no código antes de ir para produção.

## Arquivos

| Arquivo | O quê |
|---|---|
| `pagamento.js` | `POST /api/pagamento` `{ pedidoId }` → recalcula o total no servidor, cria a preferência do Mercado Pago (Checkout Pro: PIX + cartão), grava `pedidos/{id}.pagamento` e devolve a URL do checkout. |
| `webhook-mp.js` | `POST /api/webhook-mp` → recebe a notificação do MP, valida a assinatura, consulta o status real e atualiza `pedidos/{id}.pagamento.status`. |
| `_lib/firebase-admin.js` | Inicializa o Admin SDK a partir de `FIREBASE_SERVICE_ACCOUNT`. |
| `_lib/mercadopago.js` | Cliente mínimo da API do MP (só `fetch`, sem SDK). |
| `_lib/parcelamento.js` | Regra de parcelas sem juros (espelho de `frontend/src/pages/services/parcelamento.js`). |

## Setup (quando for ativar)

1. **Conta Mercado Pago** → criar uma aplicação → pegar as credenciais de
   **teste** (prefixo `TEST-`). Configurar o webhook apontando para
   `https://<dominio>/api/webhook-mp` e copiar a "assinatura secreta".
2. **Vercel → Settings → Environment Variables**: preencher tudo que está
   em `.env.example` (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
   `FIREBASE_SERVICE_ACCOUNT`, `PUBLIC_BASE_URL`).
3. **`firestore.rules`**: já aceita `pagamento.metodo == 'mercadopago'` no
   `create` de `pedidos`. Fazer `firebase deploy --only firestore:rules`.
4. **Front (`carrinho-checkout.js`)** — ainda NÃO está ligado. Falta:
   - criar o pedido com `pagamento: { metodo: 'mercadopago', status: 'pendente' }`;
   - `fetch('/api/pagamento', { method:'POST', body: JSON.stringify({ pedidoId }) })`;
   - redirecionar para `init_point` (ou `sandbox_init_point` em teste).
5. **Fechar os `TODO`** em `pagamento.js`: cálculo de desconto/atacado/frete
   no total (hoje é placeholder de preço de varejo cheio) e a config de
   "sem juros até Nx" no painel do MP.

## Rodar local

`vercel dev` na raiz do projeto (usa o `.env` local, que você cria a partir
do `.env.example`). As funções ficam em `http://localhost:3000/api/*`.
