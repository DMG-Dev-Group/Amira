// ── Cliente mínimo da API do Mercado Pago ──────────────────────────────
// Sem o SDK oficial — só `fetch` (nativo no Node 18+). O access token vai
// numa Environment Variable da Vercel (MP_ACCESS_TOKEN). Ver .env.example.
//
// Docs: https://www.mercadopago.com.br/developers/pt/reference

const MP_BASE = "https://api.mercadopago.com";

function token() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurada nas Environment Variables.");
  return t;
}

async function mpFetch(caminho, { method = "GET", body, idempotencyKey } = {}) {
  const resposta = await fetch(`${MP_BASE}${caminho}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": String(idempotencyKey) } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(`Mercado Pago ${method} ${caminho} -> HTTP ${resposta.status}`);
    erro.detalhe = dados;
    throw erro;
  }
  return dados;
}

module.exports = {
  // Checkout Pro: cria a preferência e devolve { id, init_point, sandbox_init_point }
  criarPreferencia: (preferencia) =>
    mpFetch("/checkout/preferences", { method: "POST", body: preferencia }),

  // Consulta o status real de um pagamento (usado pelo webhook)
  buscarPagamento: (pagamentoId) => mpFetch(`/v1/payments/${pagamentoId}`)
};
