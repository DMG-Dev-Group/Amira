// ── Firebase Admin SDK para as funções serverless ──────────────────────
// A service account vai numa Environment Variable da Vercel
// (FIREBASE_SERVICE_ACCOUNT) — o JSON INTEIRO. NUNCA commitar o valor.
// Ver .env.example.
//
// Inicialização PREGUIÇOSA: se a env var faltar ou estiver malformada, o
// erro estoura DENTRO do handler (vira um 500 com JSON), não no load do
// módulo (que viraria FUNCTION_INVOCATION_FAILED, difícil de depurar).
//
// ⚠️ "firebase-admin/auth" é carregado SÓ quando alguém pede o Auth, e não
// no topo do arquivo, pelo mesmo motivo. Ele arrasta jwks-rsa → jose, e
// jose 6 é ESM puro: em Node abaixo de 20.19/22.12 o require() dele
// derruba o PROCESSO (ERR_REQUIRE_ESM), antes de qualquer try/catch. O
// resultado era a função morrer sem resposta — 500 sem JSON nenhum.
//
// A correção de verdade é o engines.node do package.json (Node 22, que
// suporta require(ESM)). Este adiamento é a rede de proteção: se voltar a
// acontecer, quebra dentro do handler, vira JSON com mensagem, e o
// Firestore continua funcionando mesmo com o Auth quebrado.

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { verificarIdToken } = require("./id-token");

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

/**
 * Retorna o Auth (Admin). Usado SÓ para criar/apagar usuário
 * (/api/admin-usuario) — a conferência de ID token não passa mais por
 * aqui, justamente para o pagamento não depender disso.
 */
function getAuthAdmin() {
  if (_auth) return _auth;
  let getAuth;
  try {
    ({ getAuth } = require("firebase-admin/auth"));
  } catch (erro) {
    const texto =
      "O Firebase Auth não carregou nesta função. É a versão do Node na " +
      "Vercel: jose 6 é ESM e só carrega no Node 22. Ajuste em Vercel > " +
      "Settings > General > Node.js Version (o engines.node do package.json " +
      `não bastou). Detalhe: ${erro.code || erro.message}`;
    const e = new Error(texto);
    e.status = 500;
    e.code = erro.code;
    // "publico" é o que as funções mostram na tela. Sem ele, quem trata o
    // erro lá na frente só vê status 500 e cai na mensagem genérica — foi
    // o que escondeu esta causa no cadastro de revendedor.
    e.publico = texto;
    throw e;
  }
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
  // Conferido por _lib/id-token.js, NÃO pelo firebase-admin/auth: aquele
  // arrasta jose (ESM) e derrubava a função inteira em Node antigo.
  const projeto = credenciais().project_id;
  try {
    const { uid, email } = await verificarIdToken(String(idToken), projeto);
    return { uid, email };
  } catch (erro) {
    // Falha de REDE ao buscar as chaves do Google não é token inválido:
    // dizer "sessão expirada" mandaria a pessoa tentar de novo para
    // sempre, que foi o que atrasou o diagnóstico do 500 do revendedor.
    if (/chaves públicas/.test(erro.message)) {
      const e = new Error("Não foi possível validar sua sessão agora. Tente em instantes.");
      e.status = 503;
      throw e;
    }
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
  // Mesma separação de exigirUsuario: erro de infra não vira 401.
  let decodificado;
  try {
    decodificado = await verificarIdToken(String(idToken), credenciais().project_id);
  } catch (erro) {
    if (/chaves públicas/.test(erro.message)) {
      const e = new Error("Não foi possível validar a credencial agora. Tente em instantes.");
      e.status = 503;
      throw e;
    }
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
