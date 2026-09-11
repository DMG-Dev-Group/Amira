// ── Criar e apagar conta pela API REST do Identity Toolkit ─────────────
// POR QUE NÃO O firebase-admin/auth: ele arrasta jwks-rsa → jose, e o
// jose 6 é ESM puro. Em Node abaixo de 20.19/22.12 o require() disso
// derruba o processo (ERR_REQUIRE_ESM). A correção pelo painel da Vercel
// (Node 22) não pegou neste projeto, e um cadastro da loja não pode
// depender de um dropdown que não obedece.
//
// Com isto, NENHUM arquivo em api/ importa firebase-admin/auth — a
// verificação de token já saiu em _lib/id-token.js, e aqui sai a última
// coisa que faltava.
//
// O caminho é o mesmo que o SDK percorre por baixo:
//   1. assina um JWT com a chave privada da service account
//   2. troca esse JWT por um access token no OAuth do Google
//   3. chama identitytoolkit.googleapis.com com esse token
//
// Os erros saem com os MESMOS códigos do SDK (auth/email-already-exists
// etc.) para quem consome não precisar saber quem está por baixo.

const jwt = require("jsonwebtoken");

const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_ITK = "https://identitytoolkit.googleapis.com/v1";
const ESCOPOS = [
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/cloud-platform"
].join(" ");

// Um access token vale 1h. Guardar evita duas idas ao OAuth por cadastro.
let cacheToken = null;
let cacheExpiraEm = 0;

async function tokenDeAcesso(credencial) {
  if (cacheToken && Date.now() < cacheExpiraEm) return cacheToken;

  const agora = Math.floor(Date.now() / 1000);
  const assercao = jwt.sign(
    {
      iss: credencial.client_email,
      scope: ESCOPOS,
      aud: URL_TOKEN,
      iat: agora,
      exp: agora + 3600
    },
    credencial.private_key,
    { algorithm: "RS256" }
  );

  const resposta = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assercao
    })
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.access_token) {
    const e = new Error(
      `O Google recusou a credencial da service account (${dados.error || resposta.status}). ` +
      "Confira a FIREBASE_SERVICE_ACCOUNT na Vercel."
    );
    e.code = "auth/insufficient-permission";
    throw e;
  }

  cacheToken = dados.access_token;
  // 60s de folga para não usar um token que expira no meio da chamada.
  cacheExpiraEm = Date.now() + (Number(dados.expires_in || 3600) - 60) * 1000;
  return cacheToken;
}

// A API responde erro como { error: { message: "EMAIL_EXISTS" } }. Os
// nomes viram os códigos do SDK para o chamador não mudar de vocabulário.
const CODIGOS = {
  EMAIL_EXISTS: "auth/email-already-exists",
  INVALID_EMAIL: "auth/invalid-email",
  WEAK_PASSWORD: "auth/invalid-password",
  PERMISSION_DENIED: "auth/insufficient-permission",
  TOO_MANY_ATTEMPTS_TRY_LATER: "auth/too-many-requests"
};

function erroDaApi(resposta, corpo) {
  const bruto = String((corpo && corpo.error && corpo.error.message) || `HTTP ${resposta.status}`);
  // Vem como "WEAK_PASSWORD : Password should be at least 6 characters"
  const nome = bruto.split(":")[0].trim();
  const e = new Error(bruto);
  e.code = CODIGOS[nome] || (resposta.status === 403 ? "auth/insufficient-permission" : "auth/internal-error");
  return e;
}

async function chamar(credencial, caminho, corpo) {
  const token = await tokenDeAcesso(credencial);
  const resposta = await fetch(`${URL_ITK}/projects/${credencial.project_id}/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(corpo)
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw erroDaApi(resposta, dados);
  return dados;
}

/**
 * Cria a conta e devolve o uid.
 * @returns {Promise<{uid: string, email: string}>}
 */
async function criarUsuario(credencial, { email, senha, nome, emailVerificado = true }) {
  const dados = await chamar(credencial, "accounts", {
    email,
    password: senha,
    displayName: nome,
    emailVerified: emailVerificado
  });
  if (!dados.localId) {
    const e = new Error("O Identity Toolkit não devolveu o uid da conta criada.");
    e.code = "auth/internal-error";
    throw e;
  }
  return { uid: dados.localId, email: dados.email || email };
}

/** Apaga a conta. Usado para desfazer quando o perfil não grava. */
async function apagarUsuario(credencial, uid) {
  await chamar(credencial, "accounts:delete", { localId: uid });
}

/** Chamada barata só para saber se a credencial fala com o Auth. */
async function testarAcesso(credencial) {
  await tokenDeAcesso(credencial);
}

module.exports = { criarUsuario, apagarUsuario, testarAcesso };
