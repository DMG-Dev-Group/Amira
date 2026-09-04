// ── Firebase Admin SDK para as funções serverless ──────────────────────
// A service account vai numa Environment Variable da Vercel
// (FIREBASE_SERVICE_ACCOUNT) — o JSON INTEIRO numa linha só. NUNCA
// commitar o valor. Ver .env.example.
//
// Usado pelas funções para LER pedidos/produtos e ESCREVER o status do
// pagamento. O Admin SDK ignora as firestore.rules (é servidor confiável).

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function credenciais() {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não configurada nas Environment Variables.");
  }
  try {
    return JSON.parse(bruto);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido.");
  }
}

// Reaproveita a app entre invocações "quentes" da mesma função.
const app = getApps()[0] || initializeApp({ credential: cert(credenciais()) });

const db = getFirestore(app);

module.exports = { db };
