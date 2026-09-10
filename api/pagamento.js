// ── POST /api/pagamento ────────────────────────────────────────────────
// Corpo: { pedidoId }
//
// Pagamento com CARTÃO via Checkout Pro (redirect). Para PIX na própria
// página, ver /api/pix.
//
//  1. Lê pedidos/{pedidoId} e RECALCULA o total no servidor
//     (_lib/total-pedido) — nunca confia no cliente.
//  2. Calcula as parcelas sem juros (regra do carrinho).
//  3. Cria a preferência do Mercado Pago e devolve a URL do checkout.
//  4. O STATUS é atualizado pelo webhook (/api/webhook-mp).

const { getDb } = require("./_lib/firebase-admin");
const { criarPreferencia } = require("./_lib/mercadopago");
const { parcelasSemJuros } = require("./_lib/parcelamento");
const { calcularTotalPedido } = require("./_lib/total-pedido");
const { FieldValue } = require("firebase-admin/firestore");

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

    const { subtotal, frete, total, linhas } = await calcularTotalPedido(db, pedido);
    const maxSemJuros = parcelasSemJuros(total);
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

    const preferencia = {
      items: linhas,
      external_reference: String(pedidoId),
      notification_url: `${baseUrl}/api/webhook-mp`,
      back_urls: {
        success: `${baseUrl}/pedido-confirmado.html?id=${encodeURIComponent(pedidoId)}`,
        pending: `${baseUrl}/pedido-confirmado.html?id=${encodeURIComponent(pedidoId)}`,
        failure: `${baseUrl}/pedido-confirmado.html?id=${encodeURIComponent(pedidoId)}`
      },
      auto_return: "approved",
      payment_methods: {
        installments: 12,
        default_installments: 1
        // "Sem juros até maxSemJuros": no Checkout Pro isso é configurado no
        // painel do Mercado Pago (Suas integrações -> Checkout -> Parcelamento).
      },
      metadata: { pedidoId: String(pedidoId), maxSemJuros }
    };

    const pref = await criarPreferencia(preferencia);

    await pedidoRef.set(
      {
        pagamento: {
          metodo: "mercadopago",
          provedorId: pref.id,
          status: "pendente",
          subtotal,
          frete,
          total,
          maxSemJuros,
          atualizadoEm: FieldValue.serverTimestamp()
        }
      },
      { merge: true }
    );

    return res.status(200).json({
      preferenceId: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      total,
      maxSemJuros
    });
  } catch (erro) {
    const status = erro && erro.status ? erro.status : 500;
    console.error("[/api/pagamento]", erro && erro.message, JSON.stringify(erro && erro.detalhe));
    return res.status(status).json({
      erro: status === 500 ? "Não foi possível iniciar o pagamento agora." : erro.message,
      // Diagnóstico — remover/proteger antes de abrir a loja ao público.
      _diag: { message: erro && erro.message, mp: (erro && erro.detalhe) || null }
    });
  }
};
