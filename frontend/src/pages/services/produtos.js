// ── Serviço de Produtos Amira ─────────────────────────────────────
// Centraliza leitura/escrita da coleção "produtos" no Firestore.
//
// Estrutura de um documento em produtos/{id}:
// {
//   nome: string,
//   sku: string,                  // código interno do produto
//   codigoBarras: string,         // EAN/GTIN
//   peso: number,                 // em gramas (usado no frete)
//   volumeMl: number,             // volume do frasco; 0/ausente = nao se
//                                 //   aplica (acessorio, item nao liquido)
//   descricao: string,
//   filtros: { [camadaSlug]: string[] },  // opções marcadas por camada de
//                                 //   filtro (ver services/camadas.js) — a
//                                 //   fonte de verdade da filtragem
//   categoria: string,            // LEGADO: slug da opção principal. Mantido
//                                 //   como ponte p/ produtos e links antigos;
//                                 //   sempre gravado com a 1ª opção da camada
//                                 //   principal marcada em "filtros"
//   imagemURL: string,
//   imagensExtras: string[],
//   precoVarejo: number,
//   precoAtacado: number,         // preço por unidade no modo atacado (0/ausente = sem atacado)
//   estoque: number,              // estoque COMPARTILHADO (varejo e atacado
//                                 //   consomem o mesmo número)
//   estoqueVarejo / estoqueAtacado: LEGADO — produtos ainda não re-salvos;
//                                 //   estoquePorModo() usa o maior dos dois
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
// NÃO há Cloud Functions (plano Spark). O documento de pedido gravado
// pelo cliente não carrega nenhum valor monetário — a allowlist de
// chaves em firestore.rules rejeita campos de preço/total. Preço,
// desconto, frete e total são derivados desta coleção (que só o admin
// escreve) na hora de exibir checkout, confirmação e painel.

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
  writeBatch,
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
 * Estoque disponível. É COMPARTILHADO entre varejo e atacado — um número só
 * (`produto.estoque`). O parâmetro `modo` é aceito mas ignorado, só para
 * não quebrar as chamadas antigas.
 * Produtos ainda não re-salvos (com `estoqueVarejo`/`estoqueAtacado`
 * separados) usam o MAIOR dos dois, para nenhuma unidade "sumir".
 */
export function estoquePorModo(produto, _modo) {
  if (typeof produto.estoque === "number") return produto.estoque;
  return Math.max(
    Number(produto.estoqueVarejo) || 0,
    Number(produto.estoqueAtacado) || 0
  );
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
 * Lista TODOS os produtos ativos (mais recentes primeiro).
 * A filtragem por camadas e a busca textual são feitas no cliente
 * (Firestore aceita só um array-contains por consulta — cruzar várias
 * camadas no servidor custaria mais leituras e latência que filtrar em
 * memória no porte deste catálogo. Reavaliar (busca facetada dedicada)
 * a partir de ~1.000 produtos ativos.
 */
export async function listarProdutos() {
  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, where("ativo", "==", true), orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lista paginada por cursor (B3/A8): carrega o catálogo em blocos em vez
 * de baixar a coleção inteira — escala com o crescimento do catálogo.
 * Usada só na navegação SEM filtro; quando há qualquer filtro de camada,
 * busca ou preço, o catálogo carrega a lista completa uma vez e cruza em
 * memória (js/produtos-catalogo.js).
 * @param {{tamanhoPagina?: number, aposDoc?: object|null}} opcoes
 * @returns {{ produtos: Array, ultimoDoc: object|null, temMais: boolean }}
 */
export async function listarProdutosPaginado({ tamanhoPagina = 24, aposDoc = null } = {}) {
  const colecaoRef = collection(db, COLECAO);

  const partes = [where("ativo", "==", true), orderBy("criadoEm", "desc")];
  if (aposDoc) partes.push(startAfter(aposDoc));
  partes.push(limitarQtd(tamanhoPagina));

  const snap = await getDocs(query(colecaoRef, ...partes));
  return {
    produtos: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ultimoDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    temMais: snap.docs.length === tamanhoPagina
  };
}

// ⚠️ PESO: enquanto as fotos morarem dentro do documento (data URI), cada
// produto lido custa ~90 KB. Toda listagem aqui busca SÓ o que a tela vai
// mostrar — listarProdutos() (o catálogo inteiro) fica para quando não há
// outro jeito (busca textual, painel admin).

// Teto da lista de destaques (curada pelo admin — sobra folga).
const POOL_VITRINE = 60;

// Bloco lido por vez quando a vitrine precisa completar `max` produtos
// depois de tirar inativos e a linha de iPhones.
const BLOCO_VITRINE = 12;

/**
 * Lê blocos de uma consulta (por cursor) até juntar `max` produtos que
 * passam em `aceitar`, ou a consulta acabar.
 */
async function coletarAte(max, partesBase, aceitar) {
  const colecaoRef = collection(db, COLECAO);
  const aceitos = [];
  let cursor = null;
  for (;;) {
    const partes = [...partesBase];
    if (cursor) partes.push(startAfter(cursor));
    partes.push(limitarQtd(BLOCO_VITRINE));
    const snap = await getDocs(query(colecaoRef, ...partes));
    for (const d of snap.docs) {
      const produto = { id: d.id, ...d.data() };
      if (aceitar(produto)) aceitos.push(produto);
      if (aceitos.length >= max) return aceitos;
    }
    if (snap.docs.length < BLOCO_VITRINE) return aceitos;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Lista os produtos da vitrine da home (B2).
 *
 * A ordem é a definida no painel (campo "ordem", arrastando as linhas em
 * Admin > Produtos). Quem ainda não tem "ordem" vai para o fim, mantendo
 * o critério antigo — mais recentes primeiro.
 *
 * Lê em blocos pequenos, primeiro pela "ordem" e, se faltar produto, pelos
 * mais recentes sem "ordem" — só o necessário para encher a vitrine (antes
 * eram 60 documentos para mostrar 8). Os dois orderBy usam o índice
 * automático de campo único; "ativo" é conferido em memória para não
 * exigir índice composto.
 *
 * @param {number} max
 * @param {{excluir?: (produto: object) => boolean}} opcoes
 *   `excluir` tira produtos ANTES do corte em `max` — é assim que a linha
 *   de iPhones fica fora da vitrine sem deixar buracos (filtrar depois do
 *   slice devolveria menos produtos do que o pedido). Quem passa o
 *   predicado é services/home-dinamica.js.
 */
export async function listarProdutosRecentes(max = 8, { excluir = null } = {}) {
  const serve = (p) => p.ativo === true && !(excluir && excluir(p));
  // orderBy("ordem") só devolve quem TEM o campo
  const comOrdem = await coletarAte(max, [orderBy("ordem", "asc")], serve);
  if (comOrdem.length >= max) return comOrdem;

  // mesmo critério do orderBy: quem tem o campo já entrou na 1ª consulta
  const temOrdem = (p) => Object.prototype.hasOwnProperty.call(p, "ordem");
  const semOrdem = await coletarAte(
    max - comOrdem.length,
    [where("ativo", "==", true), orderBy("criadoEm", "desc")],
    (p) => serve(p) && !temOrdem(p)
  );
  return comOrdem.concat(semOrdem);
}

/**
 * Grava a ordem manual dos produtos (drag and drop do painel).
 * Recebe os ids na ordem desejada e escreve ordem = posição.
 * @param {string[]} idsNaOrdem
 */
export async function reordenarProdutos(idsNaOrdem) {
  const lote = writeBatch(db);
  idsNaOrdem.forEach((id, indice) => {
    lote.update(doc(db, COLECAO, id), { ordem: indice });
  });
  return lote.commit();
}

/**
 * Lista produtos marcados como destaque (para a home).
 *
 * O `limit` da consulta é o POOL, não o `max`: como `excluir` pode tirar
 * produtos depois (a linha de iPhones tem o próprio destaque, na seção
 * dela), cortar já no Firestore devolveria menos destaques do que o
 * pedido. A lista de destaques é curada pelo admin — o pool sobra.
 */
export async function listarDestaques(max = 8, { excluir = null } = {}) {
  const colecaoRef = collection(db, COLECAO);
  const q = query(
    colecaoRef,
    where("ativo", "==", true),
    where("destaque", "==", true),
    limitarQtd(POOL_VITRINE)
  );
  const snap = await getDocs(q);
  const produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return (excluir ? produtos.filter((p) => !excluir(p)) : produtos).slice(0, max);
}

/**
 * Lista produtos marcados para aparecer no banner "Produto da Estação",
 * já ordenados pela ordem de exibição definida pelo admin.
 */
export async function listarBannerHero() {
  // só os marcados (antes lia o catálogo inteiro para usar ~10 produtos)
  const q = query(collection(db, COLECAO), where("bannerHero", "==", true));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.ativo === true)
    // empate na ordem do banner: mais recente primeiro (como antes)
    .sort((a, b) => ((a.bannerOrdem || 0) - (b.bannerOrdem || 0)) || (milis(b.criadoEm) - milis(a.criadoEm)));
}

/**
 * Lista produtos disponíveis no modo atacado (têm precoAtacado > 0),
 * mais recentes primeiro. O filtro de preço vai ao servidor (índice de
 * campo único); "ativo" e a ordem ficam em memória para não exigir um
 * índice composto.
 */
export async function listarProdutosAtacado() {
  const q = query(collection(db, COLECAO), where("precoAtacado", ">", 0));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.ativo === true && disponivelNoModo(p, "atacado"))
    .sort((a, b) => milis(b.criadoEm) - milis(a.criadoEm));
}

function milis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

// ── Consultas por opção de camada ────────────────────────────────────────
// Os filtros moram em produtos.filtros.<camadaSlug> (lista de slugs), que
// o Firestore indexa sozinho — dá para pedir ao servidor só os produtos de
// uma categoria em vez de baixar tudo e filtrar aqui. array-contains-any
// aceita até 30 valores por consulta.
const MAX_VALORES_ANY = 30;

function filtroDeOpcoes(camadaSlug, opcoes) {
  const valores = [...new Set((opcoes || []).map(String))].slice(0, MAX_VALORES_ANY);
  return where(`filtros.${camadaSlug}`, "array-contains-any", valores);
}

/**
 * Produtos ativos marcados com QUALQUER uma das `opcoes` da camada.
 * Sem orderBy (dispensa índice composto) — volta mais recentes primeiro,
 * ordenado em memória.
 * @param {string} camadaSlug
 * @param {string[]} opcoes
 * @param {{limite?: number}} [extra]
 */
export async function listarProdutosPorOpcoes(camadaSlug, opcoes, { limite = null } = {}) {
  if (!camadaSlug || !opcoes || opcoes.length === 0) return [];
  const partes = [filtroDeOpcoes(camadaSlug, opcoes)];
  if (limite) partes.push(limitarQtd(limite));
  const snap = await getDocs(query(collection(db, COLECAO), ...partes));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.ativo === true)
    .sort((a, b) => milis(b.criadoEm) - milis(a.criadoEm));
}

/**
 * Versão paginada (por cursor) de listarProdutosPorOpcoes, mais recentes
 * primeiro. Precisa do índice composto filtros.<camada> + criadoEm
 * (firestore.indexes.json); sem ele o Firestore responde
 * "failed-precondition" e quem chama deve cair na versão sem paginação.
 * Inativos saem em memória, então um bloco pode vir menor que o pedido —
 * `temMais` olha o tamanho do bloco CRU.
 */
export async function listarProdutosPorOpcoesPaginado(camadaSlug, opcoes, { tamanhoPagina = 24, aposDoc = null } = {}) {
  const partes = [filtroDeOpcoes(camadaSlug, opcoes), orderBy("criadoEm", "desc")];
  if (aposDoc) partes.push(startAfter(aposDoc));
  partes.push(limitarQtd(tamanhoPagina));

  const snap = await getDocs(query(collection(db, COLECAO), ...partes));
  return {
    produtos: snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo === true),
    ultimoDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    temMais: snap.docs.length === tamanhoPagina
  };
}

/**
 * Busca um produto específico por ID.
 */
export async function buscarProdutoPorId(id) {
  const ref = doc(db, COLECAO, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Filtro por camadas (B) ───────────────────────────────────────────────

/**
 * As opções que um produto tem em cada camada, já normalizadas.
 * PONTE: se o produto não tiver nada gravado em "filtros" para a camada
 * principal, usa o campo legado "categoria" — produtos e links antigos
 * continuam funcionando sem migração.
 * @returns {{ [camadaSlug: string]: string[] }}
 */
export function filtrosDoProduto(produto, camadaPrincipalSlug = null) {
  const cru = (produto && produto.filtros && typeof produto.filtros === "object") ? produto.filtros : {};
  const norm = {};
  for (const [camada, opcoes] of Object.entries(cru)) {
    norm[camada] = Array.isArray(opcoes) ? opcoes.map(String) : [];
  }
  if (
    camadaPrincipalSlug &&
    (!norm[camadaPrincipalSlug] || norm[camadaPrincipalSlug].length === 0) &&
    produto && produto.categoria
  ) {
    norm[camadaPrincipalSlug] = [String(produto.categoria)];
  }
  return norm;
}

/**
 * O produto atende a uma seleção de filtros?
 * - Dentro de uma camada, as opções SOMAM (OU).
 * - Entre camadas, as escolhas se CRUZAM (E).
 * @param {object} produto
 * @param {{ [camadaSlug: string]: string[] }} selecao  só as camadas com opção marcada
 * @param {string|null} camadaPrincipalSlug  para a ponte do campo legado
 */
export function produtoAtendeCamadas(produto, selecao = {}, camadaPrincipalSlug = null) {
  const doProduto = filtrosDoProduto(produto, camadaPrincipalSlug);
  return Object.entries(selecao).every(([camada, marcadas]) => {
    if (!marcadas || marcadas.length === 0) return true;
    const tem = doProduto[camada] || [];
    return marcadas.some((op) => tem.includes(op));
  });
}

/**
 * Filtra uma lista de produtos já carregada por termo de busca
 * (nome, SKU ou descrição), faixa de preço e seleção de camadas. Tudo no
 * cliente.
 * @param {object} opcoes
 * @param {string} [opcoes.termo]
 * @param {number|null} [opcoes.precoMin]
 * @param {number|null} [opcoes.precoMax]
 * @param {{ [camadaSlug: string]: string[] }} [opcoes.selecaoCamadas]
 * @param {string|null} [opcoes.camadaPrincipalSlug]
 */
export function filtrarProdutos(produtos, {
  termo = "",
  precoMin = null,
  precoMax = null,
  selecaoCamadas = {},
  camadaPrincipalSlug = null
} = {}) {
  const termoNormalizado = termo.trim().toLowerCase();

  return produtos.filter((p) => {
    if (termoNormalizado) {
      const alvo = `${p.nome} ${p.sku} ${p.descricao}`.toLowerCase();
      if (!alvo.includes(termoNormalizado)) return false;
    }
    if (!produtoAtendeCamadas(p, selecaoCamadas, camadaPrincipalSlug)) return false;

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
