// ── Desconto de estoque na confirmação de pagamento ────────────────────
// Chamado só quando um pedido TRANSICIONA para "pago" pela primeira vez —
// quem chama garante isso (ver o guard em webhook-mp.js). Sem essa trava
// aqui, um retry do Mercado Pago descontaria a mesma venda duas vezes.
//
// Decrementa produtos/{id}.estoque pela quantidade de cada item — ou, em
// produto ainda não migrado para o campo único (ver o comentário de
// schema em services/produtos.js no frontend), o campo legado
// correspondente ao modo da compra (estoqueVarejo/estoqueAtacado),
// espelhando a mesma leitura que estoquePorModo() já faz no cliente.
//
// FieldValue.increment é atômico, mas só soma — decidir QUAL campo
// incrementar exige ler o produto primeiro. Por isso isto lê antes de
// escrever, em vez de ser um increment cego que criaria um campo
// "estoque" errado do zero num produto legado.

const { FieldValue } = require("firebase-admin/firestore");

/**
 * Adiciona ao `batch` os decrementos de estoque dos itens do pedido.
 * NÃO comita — quem chama decide quando (normalmente junto com a
 * atualização do próprio pedido, no mesmo commit atômico).
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {FirebaseFirestore.WriteBatch} batch
 * @param {Array<{produtoId:string, quantidade:number, modo:string}>} itens
 */
async function descontarEstoque(db, batch, itens) {
  for (const item of itens || []) {
    const produtoId = String(item?.produtoId || "");
    const quantidade = Math.max(0, Math.trunc(Number(item?.quantidade) || 0));
    if (!produtoId || quantidade === 0) continue;

    const ref = db.collection("produtos").doc(produtoId);
    const snap = await ref.get();
    if (!snap.exists) continue; // produto removido depois da compra — nada a descontar

    const dados = snap.data();
    if (typeof dados.estoque === "number") {
      batch.update(ref, { estoque: FieldValue.increment(-quantidade) });
    } else {
      const campo = item.modo === "atacado" ? "estoqueAtacado" : "estoqueVarejo";
      batch.update(ref, { [campo]: FieldValue.increment(-quantidade) });
    }
  }
}

module.exports = { descontarEstoque };
