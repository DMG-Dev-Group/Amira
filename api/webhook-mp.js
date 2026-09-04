// ── POST /api/webhook-mp ───────────────────────────────────────────────
// Notificação do Mercado Pago sobre mudança de status de pagamento.
//
//  1. Valida a assinatura (x-signature) com MP_WEBHOOK_SECRET.
//  2. Consulta o status REAL do pagamento na API do MP (nunca confia no
//     corpo da notificação).
//  3. Atualiza pedidos/{id}.pagamento.status via Admin SDK.
//
// Responde 200 rápido — o MP re-tenta se não receber 2xx.
//
// ESQUELETO: testar com o simulador de webhook do painel do Mercado Pago
// e com pagamentos de sandbox antes de ligar em produção.

const crypto = require("crypto");
const { db } = require("./_lib/firebase-admin");
const { buscarPagamento } = require("./_lib/mercadopago");
const { FieldValue } = require("firebase-admin/firestore");

// Status do Mercado Pago -> nosso status.
function traduzStatus(mp) {
  if (mp === "approved") return "aprovado";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(mp)) return "recusado";
  return "pendente"; // pending, in_process, authorized...
}

// Assinatura do webhook do Mercado Pago.
// manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// header x-signature = `ts=<ts>,v1=<hmac-sha256-hex>`
function assinaturaValida(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[/api/webhook-mp] MP_WEBHOOK_SECRET não configurada");
    return false;
  }

  const assinatura = req.headers["x-signature"] || "";
  const requestId = req.headers["x-request-id"] || "";

  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const dataId =
    (req.query && (req.query["data.id"] || req.query.id)) ||
    (req.body && req.body.data && req.body.data.id) ||
    "";

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(esperado, "hex"));
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  try {
    if (!assinaturaValida(req)) {
      console.warn("[/api/webhook-mp] assinatura inválida — ignorando");
      return res.status(401).end();
    }

    const tipo = (req.body && req.body.type) || (req.query && req.query.type);
    const pagamentoId =
      (req.body && req.body.data && req.body.data.id) ||
      (req.query && req.query["data.id"]);

    // Só nos interessa notificação de pagamento.
    if (tipo !== "payment" || !pagamentoId) return res.status(200).end();

    const pagamento = await buscarPagamento(pagamentoId);
    const pedidoId = pagamento.external_reference;
    if (!pedidoId) {
      console.warn("[/api/webhook-mp] pagamento sem external_reference", pagamentoId);
      return res.status(200).end();
    }

    await db.collection("pedidos").doc(String(pedidoId)).set(
      {
        pagamento: {
          provedorPagamentoId: String(pagamentoId),
          status: traduzStatus(pagamento.status),
          statusMP: pagamento.status,
          atualizadoEm: FieldValue.serverTimestamp()
        }
      },
      { merge: true }
    );

    return res.status(200).end();
  } catch (erro) {
    console.error("[/api/webhook-mp]", erro && erro.message, erro && erro.detalhe);
    // 200 mesmo em erro interno: evita o MP floodar de retry. O log
    // registra o problema para investigação.
    return res.status(200).end();
  }
};
