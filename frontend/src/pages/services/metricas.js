// ── Serviço de Métricas — Amira ───────────────────────────────────
// Registra eventos de acesso (visualização de página/produto) de forma
// agregável para o painel admin. NÃO coleta IP, localização exata ou
// qualquer identificador pessoal — só o necessário para entender de onde
// vêm os visitantes e em que dispositivo, por questão de privacidade
// (e simplicidade: tudo fica no Firestore, sem serviço externo pago).
//
// Estrutura de metricas/{id}:
// {
//   tipo: "pagina" | "produto",
//   pagina: string,          // ex: "index", "produtos", "produto:abc123"
//   dispositivo: "mobile" | "tablet" | "desktop",
//   origem: string,          // "direto" | "google" | "instagram" | "facebook" | "outro" | domínio do referrer
//   criadoEm: timestamp
// }

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLECAO = "metricas";

function detectarDispositivo() {
  const largura = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();
  const ehTablet = /ipad|tablet/.test(ua) || (largura >= 600 && largura < 1024 && /mobi/.test(ua));
  const ehMobile = /mobi|android|iphone/.test(ua) && !ehTablet;

  if (ehMobile) return "mobile";
  if (ehTablet) return "tablet";
  return "desktop";
}

function detectarOrigem() {
  const referrer = document.referrer;
  if (!referrer) return "direto";

  try {
    const host = new URL(referrer).hostname.replace("www.", "");
    if (host.includes("google")) return "google";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook") || host.includes("fb.com")) return "facebook";
    if (host.includes("whatsapp")) return "whatsapp";
    if (host.includes(window.location.hostname)) return "interno";
    return host;
  } catch {
    return "outro";
  }
}

/**
 * Registra uma visualização de página ou produto. Falha silenciosamente
 * (nunca interrompe a navegação do visitante por causa de métricas).
 */
export async function registrarVisita(pagina, tipo = "pagina") {
  try {
    const colecaoRef = collection(db, COLECAO);
    await addDoc(colecaoRef, {
      tipo,
      pagina,
      dispositivo: detectarDispositivo(),
      origem: detectarOrigem(),
      criadoEm: serverTimestamp()
    });
  } catch (erro) {
    console.error("Erro ao registrar métrica (não crítico):", erro);
  }
}

/**
 * Busca todas as métricas dos últimos N dias (uso exclusivo do painel admin).
 * Para o volume de uma loja pequena/média, buscar tudo e agregar no
 * cliente é simples e suficiente — evita complexidade de Cloud Functions
 * de agregação por agora.
 */
export async function buscarMetricas(diasAtras = 30) {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - diasAtras);

  const colecaoRef = collection(db, COLECAO);
  const q = query(colecaoRef, where("criadoEm", ">=", dataLimite));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
