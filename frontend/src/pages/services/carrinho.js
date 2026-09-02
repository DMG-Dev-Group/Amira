// ── Serviço de Carrinho Amira ─────────────────────────────────────
// O carrinho de cada usuário fica em carrinhos/{uid}, como um único
// documento contendo um array "itens". Simples de ler/escrever em uma
// operação só, e mais que suficiente para o tamanho de carrinho de uma loja.
//
// Formato de cada item:
// { produtoId, nome, imagemURL, precoUnitario, quantidade, modo }
// modo: "varejo" | "atacado"

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

function refCarrinho(uid) {
  return doc(db, "carrinhos", uid);
}

/**
 * Retorna os itens do carrinho do usuário (lista vazia se não existir).
 */
export async function obterCarrinho(uid) {
  const snap = await getDoc(refCarrinho(uid));
  return snap.exists() ? snap.data().itens || [] : [];
}

/**
 * Adiciona um item ao carrinho. Se o mesmo produto+modo já existir,
 * soma a quantidade em vez de duplicar a linha.
 */
export async function adicionarAoCarrinho(uid, item) {
  const itens = await obterCarrinho(uid);
  const indiceExistente = itens.findIndex(
    (i) => i.produtoId === item.produtoId && i.modo === item.modo
  );

  if (indiceExistente >= 0) {
    itens[indiceExistente].quantidade += item.quantidade;
  } else {
    itens.push(item);
  }

  await setDoc(refCarrinho(uid), { itens });
  return itens;
}

/**
 * Atualiza a quantidade de um item específico do carrinho.
 */
export async function atualizarQuantidade(uid, produtoId, modo, quantidade) {
  const itens = await obterCarrinho(uid);
  const novosItens = itens
    .map((i) => (i.produtoId === produtoId && i.modo === modo ? { ...i, quantidade } : i))
    .filter((i) => i.quantidade > 0);

  await setDoc(refCarrinho(uid), { itens: novosItens });
  return novosItens;
}

/**
 * Remove um item do carrinho.
 */
export async function removerDoCarrinho(uid, produtoId, modo) {
  const itens = await obterCarrinho(uid);
  const novosItens = itens.filter((i) => !(i.produtoId === produtoId && i.modo === modo));
  await setDoc(refCarrinho(uid), { itens: novosItens });
  return novosItens;
}

/**
 * Esvazia o carrinho (usado após finalizar a compra).
 */
export async function esvaziarCarrinho(uid) {
  await setDoc(refCarrinho(uid), { itens: [] });
}

/**
 * Calcula o total do carrinho.
 */
export function calcularTotal(itens) {
  return itens.reduce((soma, item) => soma + item.precoUnitario * item.quantidade, 0);
}
