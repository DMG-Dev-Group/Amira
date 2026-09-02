// ── Serviço de Produtos Amira ─────────────────────────────────────
// Centraliza leitura/escrita da coleção "produtos" no Firestore.
//
// Estrutura de um documento em produtos/{id}:
// {
//   nome: string,
//   sku: string,                  // código interno do produto
//   codigoBarras: string,         // EAN/GTIN
//   peso: number,                 // em gramas
//   descricao: string,
//   categoria: string,            // slug de uma categoria (ver services/categorias.js)
//   imagemURL: string,
//   imagensExtras: string[],
//   precoVarejo: number,
//   precoAtacado: number,         // preço por unidade no modo atacado (0/ausente = sem atacado)
//   estoqueVarejo: number,        // estoque da modalidade varejo (A4)
//   estoqueAtacado: number,       // estoque da modalidade atacado (A4)
//   estoque: number,              // LEGADO: produtos antigos; vale como estoqueVarejo
//   descontoAtivo: boolean,       // desconto opcional configurado pelo admin (A2)
//   descontoTipo: "percentual",   // por ora só percentual (campo previsto p/ futuros tipos)
//   descontoPercentual: number,   // 1..90 — aplicado sobre precoVarejo
//   freteDisponivel: boolean,     // false = só retirada na loja (sem entrega) — R2.7
//   ativo: boolean,               // false = produto oculto do catálogo
//   destaque: boolean,            // aparece na seção "Os mais amados" da home
//   bannerHero: boolean,          // aparece no carrossel "Produto da Estação"
//   bannerEtiqueta: string,       // ex: "Lançamento", "Edição Limitada"
//   bannerTitulo: string,         // título de exibição no banner
//   bannerTexto: string,          // texto promocional do banner
//   bannerTags: string[],         // ex: ["Rosa", "Jasmim", "Baunilha"]
//   bannerOrdem: number,          // ordem de exibição no carrossel
//   criadoEm: timestamp,
//   atualizadoEm: timestamp
// }
//
// ⚠️ SEGURANÇA: os preços/descontos daqui são usados só para EXIBIÇÃO.
// O valor cobrado num pedido é sempre recalculado pela Cloud Function
// criarPedido, que lê esta mesma coleção no servidor.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitarQtd,
  startAfter,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "produtos";

// ── Preço e desconto (A2) ─────────────────────────────────────────────────

/**
 * Resolve o preço de exibição de um produto, aplicando o desconto
 * configurado pelo admin (só sobre o varejo — o preço de atacado é o
 * valor exato definido no painel).
 * @returns {{ precoFinal: number, precoOriginal: number, temDesconto: boolean, percentual: number }}
 */
export function infoPreco(produto, modo = "varejo") {
  if (modo === "atacado") {
    const preco = Number(produto.precoAtacado) || 0;
    return { precoFinal: preco, precoOriginal: preco, temDesconto: false, percentual: 0 };
  }

  const base = Number(produto.precoVarejo) || 0;
  const pct = Number(produto.descontoPercentual) || 0;

  if (produto.descontoAtivo === true && pct >= 1 && pct <= 90) {
    const precoFinal = Math.round(base * (1 - pct / 100) * 100) / 100;
    return { precoFinal, precoOriginal: base, temDesconto: true, percentual: pct };
  }
  return { precoFinal: base, precoOriginal: base, temDesconto: false, percentual: 0 };
}

// ── Estoque por modalidade (A4) ───────────────────────────────────────────

/**
 * Estoque disponível na modalidade. Produtos antigos (só com "estoque")
 * continuam funcionando: o campo legado vale como estoque de varejo.
 */
export function estoquePorModo(produto, modo = "varejo") {
  if (modo === "atacado") {
    return Number(produto.estoqueAtacado) || 0;
  }
  if (typeof produto.estoqueVarejo === "number") {
    return produto.estoqueVarejo;
  }
  return Number(produto.estoque) || 0;
}

/**
 * O produto existe na modalidade? (cada modo exige o próprio preço
 * configurado — um produto pode existir SÓ no atacado, R2 item 6.1)
 */
export function disponivelNoModo(produto, modo = "varejo") {
  if (modo === "atacado") {
    return (Number(produto.precoAtacado) || 0) > 0;
  }
  return (Number(produto.precoVarejo) || 0) > 0;
}

/**
 * O produto pode ser pedido para ENTREGA? (R2 item 7 — produtos com
 * freteDisponivel === false só podem ser retirados na loja).
 * Produtos antigos, sem o campo, continuam entregáveis.
 */
export function podeSerEntregue(produto) {
  return produto.freteDisponivel !== false;
}

// ── Listagens ─────────────────────────────────────────────────────────────

/**
 * Lista produtos ativos, opcionalmente filtrando por categoria.
 * A busca textual é feita no cliente (Firestore não tem full-text search
 * nativo); para um catálogo de porte pequeno/médio isso é suficiente.
 */
export async function listarProdutos({ categoria = null } = {}) {
  const colecaoRef = collection(db, COLECAO);
  const condicoes = [where("ativo", "==", true)];

  if (categoria) {
    condicoes.push(where("categoria", "==", categoria));
  }

  const q = query(colecaoRef, ...condicoes, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lista paginada por cursor (B3/A8): carrega o catálogo em blocos em vez
 * de baixar a coleção inteira — escala com o crescimento do catálogo.
 * @param {{categoria?: string|null, tamanhoPagina?: number, aposDoc?: object|null}} opcoes
 * @returns {{ produtos: Array, ultimoDoc: object|null, temMais: boolean }}
 */
export async function listarProdutosPaginado({ categoria = null, tamanhoPagina = 24, aposDoc = null } = {}) {
  const colecaoRef = collection(db, COLECAO);
  const condicoes = [where("ativo", "==", true)];

  if (categoria) {
    condicoes.push(where("categoria", "==", categoria));
  }

  const partes = [...condicoes, orderBy("criadoEm", "desc")];
  if (aposDoc) partes.push(startAfter(aposDoc));
  partes.push(limitarQtd(tamanhoPagina));

  const snap = await getDocs(query(colecaoRef, ...partes));
  return {
    produtos: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ultimoDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    temMais: snap.docs.length === tamanhoPagina
  };
}

/**
 * Lista os produtos mais recentes (seção de produtos da home — B2).
 */
export async function listarProdutosRecentes(max = 8) {
  const { produtos } = await listarProdutosPaginado({ tamanhoPagina: max });
  return produtos;
}

/**
 * Lista produtos marcados como destaque (para a home).
 */
export async function listarDestaques(max = 8) {
  const colecaoRef = collection(db, COLECAO);
  const q = query(
    colecaoRef,
    where("ativo", "==", true),
    where("destaque", "==", true),
    limitarQtd(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lista produtos marcados para aparecer no banner "Produto da Estação",
 * já ordenados pela ordem de exibição definida pelo admin.
 */
export async function listarBannerHero() {
  const todos = await listarProdutos();
  return todos
    .filter((p) => p.bannerHero === true)
    .sort((a, b) => (a.bannerOrdem || 0) - (b.bannerOrdem || 0));
}

/**
 * Lista produtos disponíveis no modo atacado (têm precoAtacado > 0).
 * O filtro é feito no cliente — para o tamanho de catálogo de uma loja,
 * é mais simples que manter um índice composto dedicado.
 */
export async function listarProdutosAtacado({ categoria = null } = {}) {
  const todos = await listarProdutos({ categoria });
  return todos.filter((p) => disponivelNoModo(p, "atacado"));
}

/**
 * Busca um produto específico por ID.
 */
export async function buscarProdutoPorId(id) {
  const ref = doc(db, COLECAO, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Filtra uma lista de produtos já carregada por termo de busca
 * (nome, SKU ou descrição) e faixa de preço. Tudo no cliente.
 */
export function filtrarProdutos(produtos, { termo = "", precoMin = null, precoMax = null } = {}) {
  const termoNormalizado = termo.trim().toLowerCase();

  return produtos.filter((p) => {
    if (termoNormalizado) {
      const alvo = `${p.nome} ${p.sku} ${p.descricao}`.toLowerCase();
      if (!alvo.includes(termoNormalizado)) return false;
    }
    const { precoFinal } = infoPreco(p);
    if (precoMin !== null && precoFinal < precoMin) return false;
    if (precoMax !== null && precoFinal > precoMax) return false;
    return true;
  });
}

/**
 * Ordena uma lista de produtos.
 * criterios: "relevancia" | "menor-preco" | "maior-preco" | "nome"
 */
export function ordenarProdutos(produtos, criterio) {
  const lista = [...produtos];
  switch (criterio) {
    case "menor-preco":
      return lista.sort((a, b) => infoPreco(a).precoFinal - infoPreco(b).precoFinal);
    case "maior-preco":
      return lista.sort((a, b) => infoPreco(b).precoFinal - infoPreco(a).precoFinal);
    case "nome":
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    default:
      return lista; // "relevancia" = ordem original (mais recentes primeiro)
  }
}

// ── Funções de escrita (uso exclusivo do painel admin) ──────────────────
// As regras do Firestore já bloqueiam quem não é admin de chamar estas
// funções com sucesso — a segurança real está nas regras do banco.

export async function criarProduto(dados) {
  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    ...dados,
    ativo: dados.ativo ?? true,
    destaque: dados.destaque ?? false,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  });
}

export async function atualizarProduto(id, dados) {
  const ref = doc(db, COLECAO, id);
  return updateDoc(ref, {
    ...dados,
    atualizadoEm: serverTimestamp()
  });
}

export async function excluirProduto(id) {
  const ref = doc(db, COLECAO, id);
  return deleteDoc(ref);
}
