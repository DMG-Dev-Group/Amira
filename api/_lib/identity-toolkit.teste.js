// Teste do criador de conta pela API REST. Rode com:
//   node api/_lib/identity-toolkit.teste.js
//
// Nao fala com o Google: finge o fetch e confere o FORMATO das chamadas e
// o mapeamento de erro. O que nao da para testar aqui e se o Google
// aceita a credencial de verdade — isso so no deploy.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { criarUsuario, apagarUsuario } = require("./identity-toolkit.js");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const CRED = {
  project_id: "flora-5754a",
  client_email: "sa@flora-5754a.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" })
};

let chamadas = [];
function fingirGoogle({ erroItk = null, statusItk = 200 } = {}) {
  chamadas = [];
  global.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (url.includes("oauth2.googleapis.com")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "token-de-acesso", expires_in: 3600 }) };
    }
    if (erroItk) {
      return { ok: false, status: statusItk, json: async () => ({ error: { message: erroItk } }) };
    }
    return { ok: true, status: 200, json: async () => ({ localId: "uid-novo", email: "novo@exemplo.com" }) };
  };
}

function limparCache() { delete require.cache[require.resolve("./identity-toolkit.js")]; }

(async () => {
  let falhas = 0;
  const conferir = (nome, ok, extra = "") => {
    if (!ok) falhas++;
    console.log(`${ok ? "OK  " : "FALHA"} ${nome}${extra ? " — " + extra : ""}`);
  };

  // 1) caminho feliz + formato das duas chamadas
  limparCache(); fingirGoogle();
  const itk = require("./identity-toolkit.js");
  const r = await itk.criarUsuario(CRED, { email: "novo@exemplo.com", senha: "segredo123", nome: "Fulano" });
  conferir("cria a conta e devolve o uid", r.uid === "uid-novo");

  const [oauth, criar] = chamadas;
  const corpoOauth = Object.fromEntries(oauth.opcoes.body);
  conferir("troca JWT por access token no OAuth do Google",
    oauth.url === "https://oauth2.googleapis.com/token" &&
    corpoOauth.grant_type === "urn:ietf:params:oauth:grant-type:jwt-bearer");

  const asserido = jwt.verify(corpoOauth.assertion, publicKey.export({ type: "spki", format: "pem" }), { algorithms: ["RS256"] });
  conferir("assertion assinada com a chave da service account",
    asserido.iss === CRED.client_email && asserido.aud === "https://oauth2.googleapis.com/token");
  conferir("escopo pede identitytoolkit", asserido.scope.includes("identitytoolkit"));

  conferir("chama o projeto certo no Identity Toolkit",
    criar.url === "https://identitytoolkit.googleapis.com/v1/projects/flora-5754a/accounts");
  conferir("manda o access token no Authorization",
    criar.opcoes.headers.Authorization === "Bearer token-de-acesso");
  const corpoCriar = JSON.parse(criar.opcoes.body);
  conferir("corpo tem email, senha, nome e emailVerified",
    corpoCriar.email === "novo@exemplo.com" && corpoCriar.password === "segredo123" &&
    corpoCriar.displayName === "Fulano" && corpoCriar.emailVerified === true);

  // 2) o access token e reaproveitado (nao pede dois por cadastro)
  chamadas = [];
  await itk.criarUsuario(CRED, { email: "outro@exemplo.com", senha: "segredo123", nome: "Beltrano" });
  conferir("reaproveita o access token em cadastro seguinte",
    !chamadas.some((c) => c.url.includes("oauth2")));

  // 3) apagar
  chamadas = [];
  await itk.apagarUsuario(CRED, "uid-novo");
  const del = chamadas[0];
  conferir("apaga pelo accounts:delete com o localId",
    del.url.endsWith("/accounts:delete") && JSON.parse(del.opcoes.body).localId === "uid-novo");

  // 4) mapeamento de erro — cada um vira o codigo que o chamador ja trata
  const casos = [
    ["EMAIL_EXISTS", "auth/email-already-exists"],
    ["INVALID_EMAIL", "auth/invalid-email"],
    ["WEAK_PASSWORD : Password should be at least 6 characters", "auth/invalid-password"],
    ["PERMISSION_DENIED", "auth/insufficient-permission"],
    ["ALGO_QUE_NAO_CONHECO", "auth/internal-error"]
  ];
  for (const [daApi, esperado] of casos) {
    limparCache(); fingirGoogle({ erroItk: daApi });
    const i2 = require("./identity-toolkit.js");
    let codigo = "(nao lancou)";
    try { await i2.criarUsuario(CRED, { email: "a@b.c", senha: "x", nome: "n" }); }
    catch (e) { codigo = e.code; }
    conferir(`erro "${daApi.split(":")[0].trim()}" vira ${esperado}`, codigo === esperado, codigo);
  }

  console.log(falhas === 0 ? "\n>>> tudo como esperado" : `\n>>> ${falhas} FALHARAM`);
  process.exit(falhas ? 1 : 0);
})();
