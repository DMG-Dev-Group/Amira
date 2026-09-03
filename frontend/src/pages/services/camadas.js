// ── Serviço de Camadas de filtro — Amira ─────────────────────────────
// "Camadas" substituíram a antiga coleção "categorias". Cada camada é um
// eixo de filtragem do catálogo (ex: Tipo, Origem, Gênero) com um punhado
// de opções. A camada de MENOR "ordem" é a PRINCIPAL: é ela que aparece
// na navbar, no menu sanduíche, no rodapé e na seção "Nossas categorias"
// da home. As demais só existem no painel de filtros do catálogo.
//
// camadas/{id}:
// {
//   nome: string,        // rótulo exibido — pode ser renomeado à vontade
//   slug: string,        // identificador ESTÁVEL — nunca muda; é a chave
//                        //   na URL (?tipo=perfumes) e em produtos.filtros
//   ordem: number,       // 1 = camada principal
//   opcoes: [ { nome, slug, imagemURL } ],
//   criadoEm: timestamp
// }
//
// "imagemURL" nas opções só é usada na camada principal (as capas da
// seção "Nossas categorias" da home). O slug de cada opção é gerado uma
// única vez a partir do nome e nunca muda — ele fica salvo em
// produtos.filtros e nos links que os clientes salvam.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "camadas";

export function gerarSlug(nome) {
  return String(nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normaliza um documento cru do Firestore num objeto de camada previsível. */
function normalizarCamada(id, dados) {
  const opcoes = Array.isArray(dados.opcoes) ? dados.opcoes : [];
  return {
    id,
    nome: dados.nome || "",
    slug: dados.slug || "",
    ordem: Number(dados.ordem) || 1,
    opcoes: opcoes.map((o) => ({
      nome: o?.nome || "",
      slug: o?.slug || "",
      imagemURL: o?.imagemURL || ""
    }))
  };
}

/** Limpa uma lista de opções para gravação (sem campos extras, sem lixo). */
export function sanitizarOpcoes(opcoes) {
  return (Array.isArray(opcoes) ? opcoes : [])
    .map((o) => ({
      nome: String(o?.nome ?? "").trim(),
      slug: o?.slug ? String(o.slug).trim() : gerarSlug(o?.nome),
      imagemURL: String(o?.imagemURL ?? "").trim()
    }))
    .filter((o) => o.nome && o.slug);
}

/**
 * Lista todas as camadas, já ordenadas (menor "ordem" primeiro). A
 * primeira do array é sempre a camada principal.
 */
export async function listarCamadas() {
  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, orderBy("ordem", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizarCamada(d.id, d.data()));
}

/** A camada principal de uma lista já carregada (ou null se não houver). */
export function camadaPrincipal(camadas) {
  return (camadas && camadas.length > 0) ? camadas[0] : null;
}

/**
 * Cria uma camada nova. O slug sai do nome e é o identificador estável.
 * A "ordem" é a próxima disponível — camada nova entra por último e NÃO
 * vira principal sozinha (a reordenação no painel é que promove).
 */
export async function criarCamada({ nome }) {
  const slug = gerarSlug(nome);
  if (!slug) throw new Error("Informe um nome válido para a camada.");

  const existentes = await listarCamadas();
  if (existentes.some((c) => c.slug === slug)) {
    throw new Error("Já existe uma camada com esse nome (ou muito parecido).");
  }

  const proximaOrdem = existentes.reduce((max, c) => Math.max(max, c.ordem), 0) + 1;

  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    nome: String(nome).trim(),
    slug,
    ordem: proximaOrdem,
    opcoes: [],
    criadoEm: serverTimestamp()
  });
}

/**
 * Renomeia a camada. O slug NUNCA muda — ele já está gravado nos
 * produtos e nos links salvos pelos clientes.
 */
export async function renomearCamada(id, nome) {
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Error("Informe um nome válido para a camada.");
  return updateDoc(doc(db, COLECAO, id), { nome: limpo });
}

/** Substitui a lista de opções de uma camada (add/editar/remover em bloco). */
export async function salvarOpcoes(id, opcoes) {
  return updateDoc(doc(db, COLECAO, id), { opcoes: sanitizarOpcoes(opcoes) });
}

export async function excluirCamada(id) {
  return deleteDoc(doc(db, COLECAO, id));
}

/**
 * Reordena as camadas: recebe os ids na ordem desejada e grava
 * ordem = posição + 1 em cada uma. A que ficar na posição 0 passa a ser
 * a camada principal automaticamente.
 */
export async function reordenarCamadas(idsNaOrdem) {
  await Promise.all(
    idsNaOrdem.map((id, indice) =>
      updateDoc(doc(db, COLECAO, id), { ordem: indice + 1 })
    )
  );
}
