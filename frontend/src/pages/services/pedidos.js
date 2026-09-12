// ── Serviço de Pedidos — Amira ────────────────────────────────────
// ARQUITETURA CUSTO ZERO (plano Spark, sem Cloud Functions):
// o pedido é criado direto pelo cliente (addDoc), mas o documento NÃO
// carrega nenhum valor monetário — as firestore.rules rejeitam qualquer
// campo fora da allowlist. Cada item guarda só {produtoId, quantidade,
// modo}; preço, desconto, frete e total são DERIVADOS da coleção
// "produtos" (que só o admin escreve) na hora de exibir — no checkout,
// na confirmação e no painel admin (ver derivarTotaisDePedidos).
//
// Risco residual (ver docs/PLANO_PRODUCAO_2026-09.md, Apêndice A): sem
// servidor, quantidades/itens não são revalidados fora das rules. A
// função /api/pagamento RECALCULA o total no servidor antes de cobrar
// (é ela a trava de integridade de preço); no PIX manual de fallback, a
// conferência humana do comprovante cumpre esse papel.
//
// Estrutura de pedidos/{id} (exatamente o que as rules permitem):
// {
//   uidComprador, itens: [{produtoId, quantidade, modo}],
//   temItemAtacado, modoEntrega: "entrega"|"retirada",
//   endereco: {cep, endereco, bairro} | null,
//   status, pagamento: {metodo, status}, criadoEm,
//   ref, refEm  — OPCIONAIS: código do indicador do link ?ref= do site
//                 (ver services/indicador.js) e o instante em que o
//                 pedido foi criado com ele. Sem link, os dois somem do
//                 documento — não viram "" nem null.
// }

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  increment,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { buscarProdutoPorId, infoPreco, disponivelNoModo } from "./produtos.js";
import { calcularFrete } from "./frete.js";
import { refSalvo } from "./indicador.js";

const COLECAO = "pedidos";

// A loja não acompanha etapas de fulfillment (preparando/enviado/entregue)
// — o pagamento é confirmado sozinho pelo Mercado Pago e a retirada é no
// balcão. Sobram três estados de verdade.
export const STATUS_PEDIDO = {
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PAGO: "pago",
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
  const corpo = {
    uidComprador,
    itens: itensLimpos,
    temItemAtacado: itensLimpos.some((i) => i.modo === "atacado"),
    modoEntrega,
    endereco: modoEntrega === "entrega" ? endereco : null,
    status: STATUS_PEDIDO.AGUARDANDO_PAGAMENTO,
    pagamento: { metodo: "pix_whatsapp", status: "pendente" },
    criadoEm: serverTimestamp()
  };

  // ref/refEm só entram no documento se existir um indicador salvo — as
  // rules exigem os dois juntos quando presentes (ver firestore.rules).
  const ref = refSalvo();
  if (ref) {
    corpo.ref = ref;
    corpo.refEm = serverTimestamp();
  }

  return addDoc(colecaoRef, corpo);
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

/**
 * Cancela um pedido que ainda não foi pago.
 *
 * As firestore.rules deixam o DONO mudar só a chave "status", só para
 * 'cancelado', só saindo de 'aguardando_pagamento' e só enquanto o
 * provedor não aprovou — depois de pago é caso de estorno, com o admin.
 * Por isso não validamos nada aqui além do óbvio: quem manda é a regra.
 *
 * @param {string} pedidoId
 */
export async function cancelarPedido(pedidoId) {
  const ref = doc(db, COLECAO, pedidoId);
  await updateDoc(ref, { status: STATUS_PEDIDO.CANCELADO });
}

/**
 * Admin confirma manualmente um pedido pago fora do site (PIX combinado
 * pelo WhatsApp — pagamento.metodo == "pix_whatsapp"). É a ÚNICA porta
 * de entrada para "pago" nesse método: o Mercado Pago só confirma pedido
 * próprio (pagamento.metodo == "mercadopago"), via webhook. Sem esta
 * função, um PIX manual conferido pelo admin nunca vira "pago" em lugar
 * nenhum do sistema — e o estoque, que só desconta na transição pra
 * "pago", nunca desconta.
 *
 * Estoque e status saem no MESMO batch: se o commit falhar, nenhum dos
 * dois muda. O admin já é quem confere o comprovante antes de clicar —
 * a função não questiona isso, só grava.
 *
 * @param {{id: string, itens: Array<{produtoId:string, quantidade:number, modo:string}>}} pedido
 */
export async function marcarPixManualComoPago(pedido) {
  const batch = writeBatch(db);

  batch.update(doc(db, COLECAO, pedido.id), {
    status: STATUS_PEDIDO.PAGO,
    pagoEm: serverTimestamp(),
    pagamento: { metodo: "pix_whatsapp", status: "aprovado" }
  });

  // Mesma decisão de campo que estoquePorModo() usa pra ler: campo único
  // quando existe; senão, o legado do MODO comprado. Precisa ler cada
  // produto primeiro — increment() só soma, não decide EM QUAL campo.
  for (const item of pedido.itens || []) {
    const quantidade = Math.max(0, Math.trunc(Number(item?.quantidade) || 0));
    if (!item?.produtoId || quantidade === 0) continue;

    const refProduto = doc(db, "produtos", item.produtoId);
    const snap = await getDoc(refProduto);
    if (!snap.exists()) continue; // produto removido depois da compra

    const dados = snap.data();
    if (typeof dados.estoque === "number") {
      batch.update(refProduto, { estoque: increment(-quantidade) });
    } else {
      const campo = item.modo === "atacado" ? "estoqueAtacado" : "estoqueVarejo";
      batch.update(refProduto, { [campo]: increment(-quantidade) });
    }
  }

  await batch.commit();
}

/**
 * O pedido ainda pode ser cancelado pelo cliente?
 */
export function podeCancelar(pedido) {
  return pedido?.status === STATUS_PEDIDO.AGUARDANDO_PAGAMENTO &&
    pedido?.pagamento?.status !== "aprovado";
}

// ── Código de retirada ───────────────────────────────────────────────────
// Derivado do próprio id do pedido: não precisa gravar nada a mais (nem
// mexer nas rules) e cliente e balcão sempre chegam ao MESMO código.
// O id do Firestore é alfanumérico e único, então os últimos 6 caracteres
// já bastam para o balcão localizar o pedido no painel.
const AMBIGUOS = { O: "0", I: "1", L: "1", U: "V" };

/**
 * Código curto que o cliente mostra no balcão. Ex.: "AMR-7K2QX9".
 * @param {string} pedidoId
 */
export function codigoRetirada(pedidoId) {
  const base = String(pedidoId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(-6)
    .padStart(6, "X");
  const limpo = [...base].map((c) => AMBIGUOS[c] || c).join("");
  return `AMR-${limpo}`;
}

export const ROTULO_STATUS = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  cancelado: "Cancelado"
};

/**
 * Rótulo legível do status do pedido.
 */
export function rotuloStatus(status) {
  return ROTULO_STATUS[status] || String(status || "—").replace(/_/g, " ");
}

/**
 * "pago" | "pendente" | "recusado" | "cancelado" — usado para colorir os
 * selos de status na loja e no painel.
 */
export function tomDoStatus(pedido) {
  if (pedido?.status === "cancelado") return "cancelado";
  if (pedido?.pagamento?.status === "recusado") return "recusado";
  if (pedido?.pagamento?.status === "aprovado" || pedido?.status !== "aguardando_pagamento") return "pago";
  return "pendente";
}
