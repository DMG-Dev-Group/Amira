// ── Firebase Admin SDK para as funções serverless ──────────────────────
// A service account vai numa Environment Variable da Vercel
// (FIREBASE_SERVICE_ACCOUNT) — o JSON INTEIRO. NUNCA commitar o valor.
// Ver .env.example.
//
// Inicialização PREGUIÇOSA: se a env var faltar ou estiver malformada, o
// erro estoura DENTRO do handler (vira um 500 com JSON), não no load do
// módulo (que viraria FUNCTION_INVOCATION_FAILED, difícil de depurar).

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

let _db = null;

function credenciais() {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto || !bruto.trim()) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não configurada nas Environment Variables da Vercel.");
  }
  let obj;
  try {
    obj = JSON.parse(bruto);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido (cole o conteúdo inteiro do arquivo).");
  }
  if (!obj.project_id || !obj.private_key || !obj.client_email) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT incompleta (faltam project_id / private_key / client_email).");
  }
  return obj;
}

/** Retorna o Firestore (Admin). Inicializa na primeira chamada. */
function getDb() {
  if (_db) return _db;
  const app = getApps()[0] || initializeApp({ credential: cert(credenciais()) });
  _db = getFirestore(app);
  return _db;
}

module.exports = { getDb };
