// ── Configuração do atacado — Amira ─────────────────────────────────
// O mínimo para liberar a compra em atacado é contado POR CARRINHO (soma
// das unidades de todos os itens em modo atacado), não por produto (A3).
// O valor fica em configuracoes/atacado.qtdMinimaCarrinho — editável no
// Firestore sem mexer em código. Este serviço só serve para a INTERFACE
// avisar o cliente; a validação que vale é a da Cloud Function criarPedido.

import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export const MINIMO_ATACADO_CARRINHO_PADRAO = 6;

let cacheMinimo = null;

/**
 * Retorna o mínimo de unidades (modo atacado) por carrinho.
 * Cacheado por sessão de página — o valor muda raramente.
 */
export async function obterMinimoAtacadoCarrinho() {
  if (cacheMinimo !== null) return cacheMinimo;
  try {
    const snap = await getDoc(doc(db, "configuracoes", "atacado"));
    const valor = snap.exists() ? Number(snap.data().qtdMinimaCarrinho) : 0;
    cacheMinimo = valor > 0 ? valor : MINIMO_ATACADO_CARRINHO_PADRAO;
  } catch {
    cacheMinimo = MINIMO_ATACADO_CARRINHO_PADRAO;
  }
  return cacheMinimo;
}

/**
 * Soma as unidades em modo atacado de uma lista de itens de carrinho.
 */
export function contarUnidadesAtacado(itens) {
  return (itens || [])
    .filter((i) => i.modo === "atacado")
    .reduce((soma, i) => soma + (Number(i.quantidade) || 0), 0);
}
