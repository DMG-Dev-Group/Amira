// ── Recalcular o total de um pedido no servidor ───────────────────────
// Fonte de verdade do valor cobrado. Nunca confia em nada que o cliente
// mande — lê os produtos do Firestore e aplica desconto + frete.
// Usado por /api/pagamento (cartão) e /api/pix.

const { precoFinal, calcularFrete } = require("./precos");

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} pedido  documento pedidos/{id}
 * @returns {Promise<{ subtotal:number, frete:number, total:number, linhas:Array }>}
 * @throws {Error} com .status (422/…) quando o pedido está inconsistente
 */
async function calcularTotalPedido(db, pedido) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  if (itens.length === 0) {
    const e = new Error("Pedido sem itens");
    e.status = 422;
    throw e;
  }

  const linhas = [];
  let subtotal = 0;
  let pesoGramas = 0;

  for (const item of itens) {
    const prodSnap = await db.collection("produtos").doc(String(item.produtoId)).get();
    if (!prodSnap.exists) {
      const e = new Error(`Produto ${item.produtoId} não existe mais`);
      e.status = 422;
      throw e;
    }
    const prod = prodSnap.data();
    const modo = item.modo === "atacado" ? "atacado" : "varejo";
    const qtd = Math.max(1, Number(item.quantidade) || 1);
    const precoUnit = precoFinal(prod, modo);

    subtotal += Math.round(precoUnit * qtd * 100) / 100;
    pesoGramas += (Number(prod.peso) || 0) * qtd;
    linhas.push({
      title: String(prod.nome || "Produto").slice(0, 250),
      quantity: qtd,
      unit_price: precoUnit,
      currency_id: "BRL"
    });
  }

  let frete = 0;
  if (pedido.modoEntrega === "entrega") {
    const f = calcularFrete(pedido.endereco && pedido.endereco.bairro, pesoGramas);
    frete = f.valor;
    if (frete > 0) {
      linhas.push({
        title: `Frete${f.zonaNome ? ` — ${f.zonaNome}` : ""}`,
        quantity: 1,
        unit_price: frete,
        currency_id: "BRL"
      });
    }
  }

  const total = Math.round((subtotal + frete) * 100) / 100;
  if (total <= 0) {
    const e = new Error("Total do pedido inválido");
    e.status = 422;
    throw e;
  }

  return { subtotal, frete, total, linhas };
}

module.exports = { calcularTotalPedido };
