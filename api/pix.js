// ── POST /api/pix ─────────────────────────────────────────────────────
// Corpo: { pedidoId }
//
// Gera um pagamento PIX (Pagamentos API do Mercado Pago) e devolve o
// QR Code + o copia-e-cola — o cliente paga SEM sair do site.
//
//  1. Lê pedidos/{pedidoId}, RECALCULA o total no servidor.
//  2. POST /v1/payments { payment_method_id: "pix", ... }.
//  3. Grava pedidos/{id}.pagamento = { metodo:"pix", provedorId, status, total }.
//  4. Devolve { qrCodeBase64, copiaECola, ticketUrl, expiraEm, total }.
//  5. O STATUS vira "aprovado" pelo webhook (/api/webhook-mp) quando o
//     cliente paga; a página de confirmação faz polling e atualiza sozinha.

const { getDb } = require("./_lib/firebase-admin");
const { criarPagamentoPix } = require("./_lib/mercadopago");
const { calcularTotalPedido } = require("./_lib/total-pedido");
const { FieldValue } = require("firebase-admin/firestore");

const EXPIRA_MIN = 30;

// Data ISO 8601 no fuso -03:00 (São Luís/MA, sem horário de verão) —
// o Mercado Pago exige offset explícito em date_of_expiration.
function isoMenos3h(date) {
  const d = new Date(date.getTime() - 3 * 3600 * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}-03:00`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { pedidoId } = req.body || {};
    if (!pedidoId) return res.status(400).json({ erro: "pedidoId é obrigatório" });

    const db = getDb();
    const pedidoRef = db.collection("pedidos").doc(String(pedidoId));
    const pedidoSnap = await pedidoRef.get();
    if (!pedidoSnap.exists) return res.status(404).json({ erro: "Pedido não encontrado" });

    const pedido = pedidoSnap.data();
    if (pedido.pagamento && pedido.pagamento.status === "aprovado") {
      return res.status(409).json({ erro: "Este pedido já foi pago" });
    }

    // E-mail do comprador — obrigatório na Pagamentos API. Vem do perfil,
    // não do cliente (garantirPerfil sempre grava usuarios/{uid}.email).
    let email = null;
    if (pedido.uidComprador) {
      const userSnap = await db.collection("usuarios").doc(String(pedido.uidComprador)).get();
      email = userSnap.exists ? userSnap.data().email : null;
    }
    if (!email) {
      return res.status(422).json({ erro: "Não foi possível identificar seu e-mail. Use o pagamento com cartão." });
    }

    const { subtotal, frete, total } = await calcularTotalPedido(db, pedido);
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

    const pagamento = await criarPagamentoPix(
      {
        transaction_amount: total,
        payment_method_id: "pix",
        description: `Pedido ${pedidoId} — Amira`,
        external_reference: String(pedidoId),
        notification_url: `${baseUrl}/api/webhook-mp`,
        date_of_expiration: isoMenos3h(new Date(Date.now() + EXPIRA_MIN * 60000)),
        payer: { email }
      },
      `pix-${pedidoId}` // idempotência: clicar 2x devolve o mesmo pagamento
    );

    const td = (pagamento.point_of_interaction &&
      pagamento.point_of_interaction.transaction_data) || {};

    if (!td.qr_code) {
      console.error("[/api/pix] resposta sem QR", JSON.stringify(pagamento).slice(0, 500));
      return res.status(502).json({ erro: "O Mercado Pago não devolveu o QR Code do PIX." });
    }

    await pedidoRef.set(
      {
        pagamento: {
          metodo: "pix",
          provedorId: String(pagamento.id),
          status: "pendente",
          subtotal,
          frete,
          total,
          atualizadoEm: FieldValue.serverTimestamp()
        }
      },
      { merge: true }
    );

    return res.status(200).json({
      pagamentoId: pagamento.id,
      copiaECola: td.qr_code,
      qrCodeBase64: td.qr_code_base64 || null, // PNG em base64 (sem o prefixo data:)
      ticketUrl: td.ticket_url || null,
      expiraEm: pagamento.date_of_expiration || null,
      total
    });
  } catch (erro) {
    const status = erro && erro.status ? erro.status : 500;
    console.error("[/api/pix]", erro && erro.message, erro && erro.detalhe);
    return res.status(status).json({
      erro: status === 500 ? "Não foi possível gerar o PIX agora." : erro.message
    });
  }
};
