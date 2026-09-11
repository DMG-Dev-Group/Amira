// Teste do verificador de ID token. Rode com:  node api/_lib/id-token.teste.js
//
// Nao precisa de rede nem de Firebase: gera um par de chaves local e faz
// o papel do Google. O que importa aqui e a lista de RECUSAS — um
// verificador que so aceita token bom nao prova nada.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Par de chaves nosso, fazendo o papel do Google
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubPem = publicKey.export({ type: "spki", format: "pem" });
const KID = "chave-de-teste";
const PROJETO = "flora-5754a";

// Intercepta o fetch das chaves públicas
global.fetch = async () => ({
  ok: true,
  headers: { get: () => "max-age=3600" },
  json: async () => ({ [KID]: pubPem })
});

const { verificarIdToken } = require("./id-token.js");

const agora = Math.floor(Date.now() / 1000);
const base = {
  sub: "uid-da-pessoa", email: "cliente@exemplo.com",
  aud: PROJETO, iss: `https://securetoken.google.com/${PROJETO}`,
  iat: agora - 60, exp: agora + 3600, auth_time: agora - 60
};
const assinar = (p, opts = {}) => jwt.sign(p, privateKey, { algorithm: "RS256", keyid: KID, ...opts });

const casos = [
  ["token legitimo",            assinar(base),                                            true],
  ["expirado",                  assinar({ ...base, exp: agora - 10 }),                     false],
  ["aud de outro projeto",      assinar({ ...base, aud: "projeto-do-atacante" }),          false],
  ["iss forjado",               assinar({ ...base, iss: "https://evil.example/" }),        false],
  ["sem sub (uid)",             assinar({ ...base, sub: undefined }),                      false],
  ["auth_time no futuro",       assinar({ ...base, auth_time: agora + 9999 }),             false],
  ["assinado com OUTRA chave",  jwt.sign(base, crypto.generateKeyPairSync("rsa",{modulusLength:2048}).privateKey, {algorithm:"RS256", keyid:KID}), false],
  ["kid desconhecido",          assinar(base, { keyid: "kid-que-nao-existe" }),            false]
];

// alg none e HS256 assinado com a chave PUBLICA — os dois ataques classicos
const semAssinatura = Buffer.from(JSON.stringify({ alg: "none", kid: KID })).toString("base64url")
  + "." + Buffer.from(JSON.stringify(base)).toString("base64url") + ".";
casos.push(["alg: none", semAssinatura, false]);
casos.push(["HS256 com a chave publica", jwt.sign(base, pubPem, { algorithm: "HS256", keyid: KID }), false]);

(async () => {
  let falhas = 0;
  for (const [nome, token, deveriaPassar] of casos) {
    let passou = false, motivo = "";
    try { await verificarIdToken(token, PROJETO); passou = true; }
    catch (e) { motivo = e.message.slice(0, 42); }
    const ok = passou === deveriaPassar;
    if (!ok) falhas++;
    console.log(`${ok ? "OK  " : "FALHA"} ${nome.padEnd(28)} ${passou ? "aceitou" : "recusou: " + motivo}`);
  }
  console.log(falhas === 0 ? "\n>>> 10/10 como esperado" : `\n>>> ${falhas} FALHARAM`);
})();
