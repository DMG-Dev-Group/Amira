// ── Configuração do atacado — Amira ─────────────────────────────────
// configuracoes/atacado:
//   { ativo: boolean, qtdMinimaCarrinho: number }
//
// - "ativo": liga/desliga o modo atacado da loja inteira (editável na aba
//   Configurações do admin). Sem o campo, o atacado é considerado LIGADO.
// - "qtdMinimaCarrinho": mínimo de unidades (somando todos os itens em modo
//   atacado) para o pedido ser aceito (A3).
//
// Este serviço serve à INTERFACE. A validação que vale é a das
// firestore.rules (o create de "pedidos" exige revendedor aprovado + o
// atacado ligado quando há item de atacado).

import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export const MINIMO_ATACADO_CARRINHO_PADRAO = 6;

let cacheMinimo = null;
let cacheAtivo = null;

/**
 * O modo atacado está ligado? Sem o campo `ativo` (ou sem o documento), o
 * padrão é LIGADO — não quebra nada antes de o admin configurar.
 * Cacheado por carregamento de página.
 */
export async function atacadoEstaAtivo() {
  if (cacheAtivo !== null) return cacheAtivo;
  try {
    const snap = await getDoc(doc(db, "configuracoes", "atacado"));
    cacheAtivo = snap.exists() ? snap.data().ativo !== false : true;
  } catch {
    cacheAtivo = true;
  }
  return cacheAtivo;
}

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
