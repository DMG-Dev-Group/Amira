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
const { getAuth } = require("firebase-admin/auth");

let _db = null;
let _auth = null;

function credenciais() {
  let bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto || !bruto.trim()) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não configurada nas Environment Variables da Vercel.");
  }
  bruto = bruto.trim();

  // Aceita o JSON cru OU o JSON em base64. O base64 evita o problema mais
  // comum: as quebras de linha da private_key vêm como \n literais no
  // arquivo, mas campos de texto às vezes as convertem em quebras reais,
  // o que torna o JSON inválido.
  if (!bruto.startsWith("{")) {
    try {
      const decodificado = Buffer.from(bruto, "base64").toString("utf8").trim();
      if (decodificado.startsWith("{")) bruto = decodificado;
    } catch {
      /* segue com o valor original */
    }
  }

  let obj;
  try {
    obj = JSON.parse(bruto);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT não é um JSON válido. Cole o conteúdo inteiro do " +
      "arquivo (a partir de um editor de texto puro) OU o arquivo em base64."
    );
  }

  // Normaliza a private_key caso venha com \n duplo-escapado.
  if (typeof obj.private_key === "string") {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
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

/** Retorna o Auth (Admin). Usado para criar usuário e validar ID token. */
function getAuthAdmin() {
  if (_auth) return _auth;
  const app = getApps()[0] || initializeApp({ credential: cert(credenciais()) });
  _auth = getAuth(app);
  return _auth;
}

/** Lê o ID token do corpo (campo idToken) ou do header Authorization. */
function tokenDaRequisicao(req) {
  const doCorpo = req && req.body && req.body.idToken;
  const doHeader = ((req && req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "");
  return String(doCorpo || doHeader || "").trim();
}

/**
 * Verifica o ID token e devolve QUEM está chamando. É o portão mínimo de
 * qualquer função que leia ou escreva dado de cliente: sem ele, saber um
 * pedidoId bastaria para mexer no pedido dos outros — as firestore.rules
 * não valem aqui dentro, o Admin SDK passa por cima delas.
 * @returns {Promise<{uid: string, email: string}>}
 */
async function exigirUsuario(idToken) {
  if (!idToken) {
    const e = new Error("Entre na sua conta para continuar.");
    e.status = 401;
    throw e;
  }
  try {
    const d = await getAuthAdmin().verifyIdToken(String(idToken));
    return { uid: d.uid, email: d.email || "" };
  } catch {
    const e = new Error("Sessão expirada. Entre de novo para continuar.");
    e.status = 401;
    throw e;
  }
}

/**
 * Verifica o ID token de quem chamou e exige que seja ADMIN.
 * O papel não vem do token: é lido de usuarios/{uid}.role, a mesma fonte
 * que as firestore.rules usam. Lança em qualquer falha.
 * @returns {Promise<{uid: string, email: string}>}
 */
async function exigirAdmin(idToken) {
  if (!idToken) {
    const e = new Error("Sem credencial de administrador.");
    e.status = 401;
    throw e;
  }
  let decodificado;
  try {
    decodificado = await getAuthAdmin().verifyIdToken(String(idToken));
  } catch {
    const e = new Error("Credencial inválida ou expirada. Entre de novo no painel.");
    e.status = 401;
    throw e;
  }
  const snap = await getDb().collection("usuarios").doc(decodificado.uid).get();
  if (!snap.exists || snap.data().role !== "admin") {
    const e = new Error("Só administradores podem fazer isso.");
    e.status = 403;
    throw e;
  }
  return { uid: decodificado.uid, email: decodificado.email || "" };
}

/** Diagnóstico sem lançar — usado por /api/status. Mesma lógica de credenciais(). */
function diagnosticoServiceAccount() {
  try {
    const obj = credenciais();
    return { ok: true, project_id: obj.project_id, client_email: obj.client_email };
  } catch (erro) {
    return { ok: false, detalhe: erro.message };
  }
}

module.exports = { getDb, getAuthAdmin, tokenDaRequisicao, exigirUsuario, exigirAdmin, diagnosticoServiceAccount };
