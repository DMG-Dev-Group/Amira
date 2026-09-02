// ── Serviço de Categorias — Amira ─────────────────────────────────
// As categorias deixaram de ser uma lista fixa no código e passaram a
// ser uma coleção no Firestore, gerenciável pelo admin. Isso permite
// criar, renomear ou remover categorias sem precisar editar código.
//
// Estrutura de categorias/{id}:
// { nome: string, slug: string, icone: string, imagemURL: string, criadoEm: timestamp }
//
// "slug" é o identificador usado na URL de filtro (produtos.html?categoria=slug)
// e como valor salvo no campo "categoria" de cada produto — nunca muda
// depois de criado, mesmo que o "nome" de exibição seja editado.
// "imagemURL" é opcional — usada como capa na seção "Nossas categorias" da home.

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

const COLECAO = "categorias";

function gerarSlug(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Lista todas as categorias cadastradas, ordenadas por nome.
 */
export async function listarCategorias() {
  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, orderBy("nome", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Cria uma categoria nova. O slug é gerado automaticamente a partir do
 * nome (ex: "Kits Especiais" -> "kits-especiais") e usado como
 * identificador estável para filtros e para o campo "categoria" do produto.
 * Lança um erro se já existir uma categoria com o mesmo slug, evitando
 * duas categorias diferentes colidirem no mesmo identificador de filtro.
 */
export async function criarCategoria({ nome, imagemURL = "" }) {
  const slug = gerarSlug(nome);

  const existentes = await listarCategorias();
  if (existentes.some((c) => c.slug === slug)) {
    throw new Error("Já existe uma categoria com esse nome (ou muito parecido).");
  }

  const colecaoRef = collection(db, COLECAO);
  return addDoc(colecaoRef, {
    nome,
    slug,
    imagemURL,
    criadoEm: serverTimestamp()
  });
}

export async function atualizarCategoria(id, { nome, icone, imagemURL }) {
  const ref = doc(db, COLECAO, id);
  const dados = {};
  if (nome !== undefined) dados.nome = nome;
  if (icone !== undefined) dados.icone = icone;
  if (imagemURL !== undefined) dados.imagemURL = imagemURL;
  return updateDoc(ref, dados);
}

export async function excluirCategoria(id) {
  const ref = doc(db, COLECAO, id);
  return deleteDoc(ref);
}
