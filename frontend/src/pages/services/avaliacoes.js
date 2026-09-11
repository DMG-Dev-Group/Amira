// ── Avaliações de produto — Amira ──────────────────────────────────────
// avaliacoes/{id}:
// {
//   produtoId: string,
//   pedidoId: string,     // o pedido pago que dá direito de avaliar
//   uidAutor: string,
//   nomeAutor: string,    // copiado no envio: o nome no perfil pode mudar
//   nota: 1..5,
//   texto: string,        // até 600 caracteres
//   aprovada: boolean,    // nasce false; só o admin publica
//   criadoEm: timestamp
// }
//
// ⚠️ MODERAÇÃO NÃO É FRESCURA AQUI, É O CONTROLE DE SEGURANÇA. As
// firestore.rules conseguem exigir um pedido PAGO do próprio autor, mas
// NÃO conseguem verificar que aquele pedido contém este produto — rules
// não fazem laço sobre "itens". Quem fecha a brecha é o admin aprovando.
// Ver o bloco de avaliacoes em firestore.rules.
//
// A conferência "comprou ESTE produto" existe em podeAvaliar(), mas é de
// INTERFACE: serve para não oferecer o formulário a quem não pode usar.

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitarQtd,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "avaliacoes";
export const TAMANHO_MAXIMO_TEXTO = 600;

/**
 * Avaliações PUBLICADAS de um produto, mais recentes primeiro.
 * A ordenação é feita em memória: um índice composto
 * (produtoId + aprovada + criadoEm) só para isto não se paga.
 */
export async function listarAprovadas(produtoId, max = 20) {
  const q = query(
    collection(db, COLECAO),
    where("produtoId", "==", String(produtoId)),
    where("aprovada", "==", true),
    limitarQtd(max)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
}

/** Média e contagem, para o resumo no topo do bloco. */
export function resumo(avaliacoes) {
  if (avaliacoes.length === 0) return { media: 0, total: 0 };
  const soma = avaliacoes.reduce((t, a) => t + (Number(a.nota) || 0), 0);
  return {
    media: Math.round((soma / avaliacoes.length) * 10) / 10,
    total: avaliacoes.length
  };
}

/**
 * A pessoa pode avaliar este produto? Devolve o pedido que dá o direito,
 * ou null. É checagem de INTERFACE — a regra de verdade está no Firestore.
 *
 * @param {Array} pedidosDoUsuario  saída de listarPedidosDoUsuario()
 * @param {string} produtoId
 */
export function pedidoQueLiberaAvaliacao(pedidosDoUsuario, produtoId) {
  return (pedidosDoUsuario || []).find(
    (p) =>
      p.status === "pago" &&
      (p.itens || []).some((i) => i.produtoId === produtoId)
  ) || null;
}

/** Já avaliou este produto? (uma por pessoa por produto) */
export function jaAvaliou(avaliacoesDoProduto, uid) {
  return (avaliacoesDoProduto || []).some((a) => a.uidAutor === uid);
}

/**
 * Envia uma avaliação. Nasce pendente — só aparece na loja depois que o
 * admin publica.
 */
export async function enviarAvaliacao({ produtoId, pedidoId, uid, nome, nota, texto }) {
  return addDoc(collection(db, COLECAO), {
    produtoId: String(produtoId),
    pedidoId: String(pedidoId),
    uidAutor: uid,
    nomeAutor: String(nome || "Cliente").slice(0, 120),
    nota: Number(nota),
    texto: String(texto || "").trim().slice(0, TAMANHO_MAXIMO_TEXTO),
    aprovada: false,
    criadoEm: serverTimestamp()
  });
}

// ── Painel admin ───────────────────────────────────────────────────────

/** Todas as avaliações (o painel separa pendentes e publicadas). */
export async function listarTodas(max = 200) {
  const snap = await getDocs(query(collection(db, COLECAO), limitarQtd(max)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
}

export async function definirAprovacao(id, aprovada) {
  return updateDoc(doc(db, COLECAO, id), { aprovada: Boolean(aprovada) });
}

export async function excluirAvaliacao(id) {
  return deleteDoc(doc(db, COLECAO, id));
}
