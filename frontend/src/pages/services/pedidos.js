// ── Serviço de Pedidos — Amira ────────────────────────────────────
// ARQUITETURA CUSTO ZERO (plano Spark, sem Cloud Functions):
// o pedido é criado direto pelo cliente (addDoc), mas o documento NÃO
// carrega nenhum valor monetário — as firestore.rules rejeitam qualquer
// campo fora da allowlist. Cada item guarda só {produtoId, quantidade,
// modo}; preço, desconto, frete e total são DERIVADOS da coleção
// "produtos" (que só o admin escreve) na hora de exibir — no checkout,
// na confirmação e no painel admin (ver derivarTotaisDePedidos).
//
// Risco residual (documentado em docs/FALHAS_REMANESCENTES.md): sem
// servidor, quantidades/itens não são revalidados fora das rules. O
// pagamento é manual (PIX + WhatsApp) e a loja confere o valor derivado
// antes de enviar — um pedido adulterado é barrado na conferência humana.
//
// Estrutura de pedidos/{id} (exatamente o que as rules permitem):
// {
//   uidComprador, itens: [{produtoId, quantidade, modo}],
//   temItemAtacado, modoEntrega: "entrega"|"retirada",
//   endereco: {cep, endereco, bairro} | null,
//   status, pagamento: {metodo, status}, criadoEm
// }

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { buscarProdutoPorId, infoPreco, disponivelNoModo } from "./produtos.js";
import { calcularFrete } from "./frete.js";

const COLECAO = "pedidos";

export const STATUS_PEDIDO = {
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PAGO: "pago",
  PREPARANDO: "preparando",
  ENVIADO: "enviado",
  ENTREGUE: "entregue",
  CANCELADO: "cancelado"
};

const MAX_ITENS = 30;
const MAX_QTD_POR_ITEM = 500;

/**
 * Cria um pedido no Firestore com APENAS identificadores e quantidades —
 * nunca valores monetários (as rules rejeitam qualquer campo extra).
 * @param {{ uidComprador: string,
 *           itens: Array<{produtoId: string, quantidade: number, modo: string}>,
 *           modoEntrega: "entrega"|"retirada",
 *           endereco: {cep, endereco, bairro}|null }} dados
 * @returns {Promise<{id: string}>}
 */
export async function criarPedido({ uidComprador, itens, modoEntrega, endereco }) {
  const itensLimpos = (itens || [])
    .slice(0, MAX_ITENS)
    .map((i) => ({
      produtoId: String(i.produtoId || ""),
      quantidade: Math.min(Math.max(Math.trunc(Number(i.quantidade) || 1), 1), MAX_QTD_POR_ITEM),
      modo: i.modo === "atacado" ? "atacado" : "varejo"
    }))
    .filter((i) => i.produtoId);

  if (itensLimpos.length === 0) {
    throw new Error("O carrinho está vazio.");
  }

  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    uidComprador,
    itens: itensLimpos,
    temItemAtacado: itensLimpos.some((i) => i.modo === "atacado"),
    modoEntrega,
    endereco: modoEntrega === "entrega" ? endereco : null,
    status: STATUS_PEDIDO.AGUARDANDO_PAGAMENTO,
    pagamento: { metodo: "pix_whatsapp", status: "pendente" },
    criadoEm: serverTimestamp()
  });
}

// ── Derivação de totais (fonte de verdade: coleção "produtos") ───────────
// Como o pedido não guarda preço, todo lugar que EXIBE um pedido deriva
// os valores dos preços ATUAIS do catálogo. Trade-off documentado: se o
// admin mudar um preço depois, pedidos antigos passam a exibir o valor
// novo — a loja confere o total no momento do PIX, que é o que vale.

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

function derivarTotaisComMapa(pedido, mapaProdutos) {
  const itensDetalhados = [];
  const avisos = [];
  let subtotalCentavos = 0;
  let pesoTotal = 0;

  for (const item of (pedido.itens || []).slice(0, MAX_ITENS)) {
    const quantidade = Math.min(Math.max(Math.trunc(Number(item.quantidade) || 0), 0), MAX_QTD_POR_ITEM);
    const produto = mapaProdutos.get(item.produtoId) || null;
    const modo = item.modo === "atacado" ? "atacado" : "varejo";

    if (!produto) {
      avisos.push(`Produto ${item.produtoId} não existe mais no catálogo.`);
      itensDetalhados.push({
        produtoId: item.produtoId,
        nome: "(produto removido)",
        imagemURL: "",
        modo,
        quantidade,
        precoUnitario: 0,
        subtotal: 0,
        produtoEncontrado: false
      });
      continue;
    }

    if (modo === "atacado" && !disponivelNoModo(produto, "atacado")) {
      avisos.push(`"${produto.nome}" não está mais disponível no atacado.`);
    }

    // As rules validam o campo temItemAtacado (só revendedor aprovado pode
    // marcá-lo), mas não conseguem inspecionar cada item da lista. Se um
    // item "atacado" aparecer num pedido marcado como varejo, é adulteração
    // — sinalizamos para a conferência humana.
    if (modo === "atacado" && pedido.temItemAtacado !== true) {
      avisos.push(`⚠ Item em modo ATACADO num pedido marcado como varejo — possível adulteração, confira antes de aceitar o pagamento.`);
    }

    const precoUnitario = infoPreco(produto, modo).precoFinal;
    const itemCentavos = centavos(precoUnitario) * quantidade;
    subtotalCentavos += itemCentavos;
    pesoTotal += (Number(produto.peso) || 0) * quantidade;

    itensDetalhados.push({
      produtoId: item.produtoId,
      nome: produto.nome || "",
      imagemURL: produto.imagemURL || "",
      modo,
      quantidade,
      precoUnitario,
      subtotal: itemCentavos / 100,
      produtoEncontrado: true
    });
  }

  let frete = null;
  if (pedido.modoEntrega === "entrega") {
    frete = calcularFrete(pedido.endereco?.bairro || "", pesoTotal);
  }

  const subtotal = subtotalCentavos / 100;
  const total = (subtotalCentavos + (frete ? centavos(frete.valor) : 0)) / 100;

  return { itensDetalhados, subtotal, frete, total, avisos };
}

/**
 * Deriva subtotal/frete/total de VÁRIOS pedidos de uma vez, buscando cada
 * produto único uma única vez (economiza leituras — importante no Spark).
 * @param {Array} pedidos - documentos de pedido ({id, itens, modoEntrega, endereco, ...})
 * @returns {Promise<Map<string, {itensDetalhados, subtotal, frete, total, avisos}>>} por pedido.id
 */
export async function derivarTotaisDePedidos(pedidos) {
  const idsUnicos = [...new Set(
    pedidos.flatMap((p) => (p.itens || []).map((i) => i.produtoId)).filter(Boolean)
  )];

  const snaps = await Promise.all(idsUnicos.map((id) => buscarProdutoPorId(id)));
  const mapaProdutos = new Map();
  snaps.forEach((produto, i) => {
    if (produto) mapaProdutos.set(idsUnicos[i], produto);
  });

  const resultado = new Map();
  for (const pedido of pedidos) {
    resultado.set(pedido.id, derivarTotaisComMapa(pedido, mapaProdutos));
  }
  return resultado;
}

/**
 * Deriva os totais de UM pedido (atalho para a confirmação de pedido).
 */
export async function derivarTotaisDoPedido(pedido) {
  const mapa = await derivarTotaisDePedidos([pedido]);
  return mapa.get(pedido.id);
}

/**
 * Lista os pedidos de um usuário, mais recentes primeiro.
 */
export async function listarPedidosDoUsuario(uid) {
  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, where("uidComprador", "==", uid), orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Busca um pedido específico por ID.
 */
export async function buscarPedidoPorId(id) {
  const ref = doc(db, COLECAO, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
