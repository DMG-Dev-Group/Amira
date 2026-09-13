// ── Avaliações da LOJA — Amira ──────────────────────────────────────────
// avaliacoesLoja/{id}:
// {
//   nome: string,        // até 120 caracteres — quem avalia não precisa
//                         // estar logado, então o nome vem do formulário
//   nota: 1..5,
//   texto: string,        // até 600 caracteres, opcional
//   aprovada: boolean,    // nasce false; só o admin publica
//   criadoEm: timestamp,
//   uidAutor: string      // OPCIONAL — só existe se a pessoa já estava
//                          // logada ao enviar (ver firestore.rules)
// }
//
// Pensada pro QR code no balcão da loja física (js/avaliar-loja.js):
// qualquer pessoa avalia, sem cadastro. Diferente de services/avaliacoes.js
// (avaliação de PRODUTO, que exige um pedido pago), aqui a MODERAÇÃO é a
// única trava — nasce pendente, só aparece na loja quando o admin publica
// (ver admin/js/admin-avaliacoes-loja.js).

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  limit as limitarQtd,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "avaliacoesLoja";
// configuracoes/avaliacoesLoja — já coberto pela regra genérica de
// configuracoes/{docId} (leitura pública, escrita só admin).
const CONFIG_DOC_ID = "avaliacoesLoja";
const QUANTIDADE_PADRAO = 6;

export const TAMANHO_MAXIMO_TEXTO = 600;
export const TAMANHO_MAXIMO_NOME = 120;

/** Envia uma avaliação da loja. Nasce pendente — só publica o admin. */
export async function enviarAvaliacao({ nome, nota, texto, uid }) {
  const corpo = {
    nome: String(nome || "").trim().slice(0, TAMANHO_MAXIMO_NOME),
    nota: Number(nota),
    texto: String(texto || "").trim().slice(0, TAMANHO_MAXIMO_TEXTO),
    aprovada: false,
    criadoEm: serverTimestamp()
  };
  // Ausente quando anônimo — nunca "" nem null (mesmo padrão de ref/refEm
  // e observacoes em services/pedidos.js).
  if (uid) corpo.uidAutor = uid;
  return addDoc(collection(db, COLECAO), corpo);
}

/** Avaliações PUBLICADAS, mais recentes primeiro. */
export async function listarAprovadas(max = 20) {
  const q = query(
    collection(db, COLECAO),
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

/** Quantas avaliações mostrar na home — controlado pelo admin. */
export async function buscarQuantidadeExibida() {
  try {
    const snap = await getDoc(doc(db, "configuracoes", CONFIG_DOC_ID));
    const valor = Number(snap.data()?.quantidadeExibida);
    return valor > 0 ? valor : QUANTIDADE_PADRAO;
  } catch {
    return QUANTIDADE_PADRAO;
  }
}

export async function definirQuantidadeExibida(quantidade) {
  return setDoc(
    doc(db, "configuracoes", CONFIG_DOC_ID),
    { quantidadeExibida: Math.max(1, Math.min(50, Math.trunc(Number(quantidade) || QUANTIDADE_PADRAO))) },
    { merge: true }
  );
}

// ── Painel admin ────────────────────────────────────────────────────────

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
