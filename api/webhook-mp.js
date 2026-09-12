// ── POST /api/webhook-mp ───────────────────────────────────────────────
// Notificação do Mercado Pago sobre mudança de status de pagamento.
//
//  1. Descobre o id do pagamento (query ?data.id= ou corpo data.id).
//  2. Consulta o status REAL na API do MP com o nosso access token —
//     ESSA é a verificação de verdade: só marcamos "aprovado" se o
//     próprio MP disser "approved". Um webhook forjado não engana isso.
//  3. Confere a assinatura x-signature — e RECUSA quando não bate. O
//     passo 2 já garante que o status é verdadeiro, mas sem a assinatura
//     qualquer pessoa podia disparar esta função com data.id arbitrário e
//     usá-la como bomba de chamadas ao MP e de escritas no Firestore.
//  4. Atualiza pedidos/{id}.pagamento.status via Admin SDK e, na
//     PRIMEIRA vez que o pedido vira "pago", desconta o estoque dos
//     itens comprados (_lib/estoque.js) — os dois no mesmo batch.
//
// A reconciliação manual (GET ?pedidoId=) exige token de ADMIN: ela lê o
// pedido e devolve o status, então na mão de qualquer um era um oráculo
// de pedidos alheios.
//
// Responde 200 rápido — o MP re-tenta se não receber 2xx.

const crypto = require("crypto");
const { getDb, tokenDaRequisicao, exigirAdmin } = require("./_lib/firebase-admin");
const { buscarPagamento } = require("./_lib/mercadopago");
const { descontarEstoque } = require("./_lib/estoque");
const { FieldValue } = require("firebase-admin/firestore");

function traduzStatus(mp) {
  if (mp === "approved") return "aprovado";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(mp)) return "recusado";
  return "pendente"; // pending, in_process, authorized...
}

// Assinatura do MP. manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// mas cada segmento SÓ entra se o valor existir (spec do MP). Retorna
// "ok" | "sem-assinatura" | "sem-segredo" | "nao-confere".
function checarAssinatura(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return "sem-segredo";

  const assinatura = req.headers["x-signature"] || "";
  const requestId = req.headers["x-request-id"] || "";
  if (!assinatura) return "sem-assinatura";

  const partes = {};
  for (const p of assinatura.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return "sem-assinatura";

  // data.id alfanumérico deve ir em minúsculas (spec do MP).
  const id = /[a-zA-Z]/.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);

  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(esperado, "hex"));
    return ok ? "ok" : "nao-confere";
  } catch {
    return "nao-confere";
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  try {
    const tipo = (req.body && (req.body.type || req.body.topic)) ||
      (req.query && (req.query.type || req.query.topic));
    let pagamentoId =
      (req.query && (req.query["data.id"] || req.query.id)) ||
      (req.body && req.body.data && req.body.data.id) ||
      null;

    // Reconciliação manual: GET /api/webhook-mp?pedidoId=XYZ — resolve o
    // id do pagamento a partir do pedido e sincroniza o status. Útil para
    // um pedido que ficou "pendente" porque a notificação se perdeu.
    // Só admin: esta rota LÊ o pedido e devolve o status dele.
    let reconciliacaoAdmin = false;
    if (!pagamentoId && req.query && req.query.pedidoId) {
      await exigirAdmin(tokenDaRequisicao(req));
      reconciliacaoAdmin = true;
      const snap = await getDb().collection("pedidos").doc(String(req.query.pedidoId)).get();
      pagamentoId = snap.exists ? (snap.data().pagamento || {}).provedorId : null;
      if (!pagamentoId) return res.status(404).json({ erro: "Pedido sem pagamento associado" });
    }

    // Assinatura do Mercado Pago. Com o segredo configurado, ela MANDA:
    // sem isso a rota é pública e escreve no Firestore. Sem o segredo
    // (deploy ainda não configurado) só avisa, para não perder pagamento
    // por causa de uma env var esquecida.
    if (!reconciliacaoAdmin) {
      const assinatura = checarAssinatura(req, pagamentoId || "");
      if (assinatura === "sem-segredo") {
        console.warn("[/api/webhook-mp] MP_WEBHOOK_SECRET não configurada — notificação aceita SEM validar assinatura. Configure na Vercel.");
      } else if (assinatura !== "ok") {
        console.warn(`[/api/webhook-mp] assinatura recusada: ${assinatura}`);
        return res.status(401).json({ erro: "Assinatura inválida" });
      }
    }

    // Só notificação de pagamento nos interessa.
    if ((tipo && tipo !== "payment" && tipo !== "payment.updated" && tipo !== "payment.created") || !pagamentoId) {
      return res.status(200).end();
    }

    const pagamento = await buscarPagamento(pagamentoId);
    const pedidoId = pagamento.external_reference;
    if (!pedidoId) {
      console.warn("[/api/webhook-mp] pagamento sem external_reference", pagamentoId);
      return res.status(200).end();
    }

    const novoStatus = traduzStatus(pagamento.status);
    const db = getDb();
    const ref = db.collection("pedidos").doc(String(pedidoId));

    const atualizacao = {
      pagamento: {
        provedorPagamentoId: String(pagamentoId),
        status: novoStatus,
        statusMP: pagamento.status,
        atualizadoEm: FieldValue.serverTimestamp()
      }
    };

    // Confirmação AUTOMÁTICA do pedido: antes o admin precisava conferir o
    // comprovante e mudar o status na mão. Com o Mercado Pago confirmando,
    // o pedido já entra como "pago" no painel. Só promovemos a partir de
    // "aguardando_pagamento" — se o admin já avançou (preparando, enviado…),
    // o status dele é preservado.
    //
    // O desconto de estoque mora NESTE MESMO guard, de propósito: é o que
    // já garante "só a primeira vez que vira pago" (o MP reenvia a mesma
    // notificação em retry — sem essa trava, cada reenvio descontaria a
    // venda de novo). Pedido e estoque saem no MESMO batch: se o commit
    // falhar, nenhum dos dois muda — não existe estado "pago mas sem
    // descontar" nem o contrário.
    const batch = db.batch();
    if (novoStatus === "aprovado") {
      const snap = await ref.get();
      const dadosPedido = snap.exists ? snap.data() : null;
      if (!dadosPedido || dadosPedido.status === "aguardando_pagamento") {
        atualizacao.status = "pago";
        atualizacao.pagoEm = FieldValue.serverTimestamp();
        if (dadosPedido) await descontarEstoque(db, batch, dadosPedido.itens);
      }
    }

    batch.set(ref, atualizacao, { merge: true });
    await batch.commit();

    console.log(
      `[/api/webhook-mp] pedido ${pedidoId} -> pagamento ${novoStatus}` +
      `${atualizacao.status ? ` + status ${atualizacao.status}` : ""} (MP: ${pagamento.status})`
    );
    return res.status(200).json({
      pedidoId,
      status: novoStatus,
      statusPedido: atualizacao.status || null,
      statusMP: pagamento.status
    });
  } catch (erro) {
    // 401/403/500 da reconciliação são resposta de verdade, não erro do
    // MP — o 500 só pode vir daqui (exigirAdmin), nunca do fluxo público
    // de notificação, que não chama exigirAdmin. Sem isso, um erro de
    // configuração (FIREBASE_SERVICE_ACCOUNT quebrada) virava um 200
    // vazio e o admin não fazia ideia do que aconteceu.
    if (erro && (erro.status === 401 || erro.status === 403 || erro.status === 500)) {
      return res.status(erro.status).json({ erro: erro.publico || erro.message });
    }
    console.error("[/api/webhook-mp]", erro && erro.message, JSON.stringify(erro && erro.detalhe));
    // 200 mesmo em erro interno: evita o MP floodar de retry. O log
    // registra o problema; a página de confirmação faz polling e o MP
    // re-tenta a notificação.
    return res.status(200).end();
  }
};
