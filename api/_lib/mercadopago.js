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
    // Sem isto, QUALQUER recusa do Mercado Pago (token de outra conta,
    // aplicação sem Checkout Pro habilitado, credencial revogada…) virava
    // 500 opaco em pagamento.js/pix.js — o "erro.status" não existia,
    // então status===500 e a mensagem real ficava só no console.error do
    // servidor. Mesma classe de bug já corrigida para erro de
    // configuração local em _lib/firebase-admin.js; faltava aqui.
    //
    // 502 (Bad Gateway) é a semântica certa: a falha é do NOSSO lado com
    // o Mercado Pago, não de quem chamou a nossa API. A mensagem do MP
    // (dados.message) não é segredo — descreve o que está errado com a
    // integração, é exatamente o que quem estiver trocando de credencial
    // precisa ler.
    const mensagemMp = String(dados.message || dados.error || `HTTP ${resposta.status}`);
    const erro = new Error(`Mercado Pago ${method} ${caminho} -> HTTP ${resposta.status}: ${mensagemMp}`);
    erro.detalhe = dados;
    erro.status = 502;
    erro.publico = `O Mercado Pago recusou a requisição: ${mensagemMp}`;
    throw erro;
  }
  return dados;
}

module.exports = {
  // Checkout Pro (redirect): cria a preferência e devolve
  // { id, init_point, sandbox_init_point }. Usado para CARTÃO.
  criarPreferencia: (preferencia) =>
    mpFetch("/checkout/preferences", { method: "POST", body: preferencia }),

  // Pagamentos API (transparente): cria um pagamento PIX e devolve o
  // QR Code + copia-e-cola em point_of_interaction.transaction_data.
  // O cliente paga sem sair do site.
  criarPagamentoPix: (body, idempotencyKey) =>
    mpFetch("/v1/payments", { method: "POST", body, idempotencyKey }),

  // Consulta o status real de um pagamento (usado pelo webhook)
  buscarPagamento: (pagamentoId) => mpFetch(`/v1/payments/${pagamentoId}`)
};
