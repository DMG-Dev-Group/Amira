// ── POST /api/pagamento ────────────────────────────────────────────────
// Corpo: { pedidoId }
//
// Fluxo:
//  1. Lê pedidos/{pedidoId} e a coleção produtos.
//  2. RECALCULA o total no servidor (nunca confia no cliente) — mesma
//     garantia que as firestore.rules davam para o PIX-por-WhatsApp.
//  3. Calcula as parcelas sem juros (regra do carrinho, ver _lib/parcelamento).
//  4. Cria a preferência do Mercado Pago (Checkout Pro — PIX + cartão).
//  5. Grava pedidos/{id}.pagamento = { metodo, provedorId, status, total }.
//  6. Devolve a URL do checkout. O STATUS é atualizado depois pelo
//     webhook (/api/webhook-mp).
//
// ESQUELETO: os pontos marcados com TODO precisam ser fechados antes de ir
// para produção (cálculo de desconto/atacado/frete e a config de juros).

const { getDb } = require("./_lib/firebase-admin");
const { criarPreferencia } = require("./_lib/mercadopago");
const { parcelasSemJuros } = require("./_lib/parcelamento");
const { precoFinal, calcularFrete } = require("./_lib/precos");
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

    // ── Total RECALCULADO no servidor ──────────────────────────────────
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    if (itens.length === 0) return res.status(422).json({ erro: "Pedido sem itens" });

    const linhas = [];
    let subtotal = 0;
    let pesoGramas = 0;

    for (const item of itens) {
      const prodSnap = await db.collection("produtos").doc(String(item.produtoId)).get();
      if (!prodSnap.exists) {
        return res.status(422).json({ erro: `Produto ${item.produtoId} não existe mais` });
      }
      const prod = prodSnap.data();
      const modo = item.modo === "atacado" ? "atacado" : "varejo";
      const qtd = Math.max(1, Number(item.quantidade) || 1);
      const precoUnit = precoFinal(prod, modo); // desconto do admin + varejo/atacado

      subtotal += Math.round(precoUnit * qtd * 100) / 100;
      pesoGramas += (Number(prod.peso) || 0) * qtd;
      linhas.push({
        title: String(prod.nome || "Produto").slice(0, 250),
        quantity: qtd,
        unit_price: precoUnit,
        currency_id: "BRL"
      });
    }

    // Frete — só quando a entrega for em casa (retirada = grátis).
    let frete = null;
    if (pedido.modoEntrega === "entrega") {
      frete = calcularFrete(pedido.endereco && pedido.endereco.bairro, pesoGramas);
      if (frete.valor > 0) {
        linhas.push({
          title: `Frete${frete.zonaNome ? ` — ${frete.zonaNome}` : ""}`,
          quantity: 1,
          unit_price: frete.valor,
          currency_id: "BRL"
        });
      }
    }

    const total = Math.round((subtotal + (frete ? frete.valor : 0)) * 100) / 100;
    if (total <= 0) return res.status(422).json({ erro: "Total do pedido inválido" });

    const maxSemJuros = parcelasSemJuros(total);
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

    const preferencia = {
      items: linhas,
      external_reference: String(pedidoId),
      notification_url: `${baseUrl}/api/webhook-mp`,
      back_urls: {
        success: `${baseUrl}/pedido-confirmado.html?id=${encodeURIComponent(pedidoId)}`,
        pending: `${baseUrl}/pedido-confirmado.html?id=${encodeURIComponent(pedidoId)}`,
        failure: `${baseUrl}/carrinho.html`
      },
      auto_return: "approved",
      payment_methods: {
        installments: 12,
        default_installments: 1
        // TODO: "sem juros até maxSemJuros" — no Checkout Pro isso é
        // configurado no painel do Mercado Pago (Suas integrações ->
        // Checkout -> Parcelamento sem juros). Se precisar controlar por
        // pedido, migrar para Checkout Transparente.
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
          frete: frete ? frete.valor : 0,
          total,
          maxSemJuros,
          atualizadoEm: FieldValue.serverTimestamp()
        }
      },
      { merge: true }
    );

    return res.status(200).json({
      preferenceId: pref.id,
      init_point: pref.init_point,               // produção
      sandbox_init_point: pref.sandbox_init_point, // sandbox
      total,
      maxSemJuros
    });
  } catch (erro) {
    console.error("[/api/pagamento]", erro && erro.message, erro && erro.detalhe);
    return res.status(500).json({ erro: "Não foi possível iniciar o pagamento agora." });
  }
};
