// ── POST /api/imagekit-auth ────────────────────────────────────────────
// Assina um upload de imagem para o ImageKit.
//
// O painel envia a foto DIRETO do navegador para o ImageKit (a foto não
// passa pela Vercel), mas o ImageKit só aceita o envio com uma assinatura
// feita com a CHAVE PRIVADA — que nunca pode ir para o navegador. Esta
// função faz só isso: confere que quem pede é admin e devolve uma
// assinatura de uso único, válida por poucos minutos.
//
// Assinatura (documentação do ImageKit, "client-side file upload"):
//   signature = HMAC-SHA1(chavePrivada, token + expire)   — em hexadecimal
//   token  = valor único por envio (o ImageKit recusa token repetido)
//   expire = timestamp em SEGUNDOS, no máximo 1 hora à frente
//
// Sem as variáveis de ambiente configuradas, responde 503 com
// naoConfigurado: true — o painel então cai no modo antigo (foto em
// base64 dentro do documento) em vez de travar o cadastro.
//
// SEGURANÇA: o endpoint é público (qualquer um alcança a URL). Sem o
// exigirAdmin(), qualquer pessoa conseguiria assinaturas e usar a conta do
// ImageKit da loja como hospedagem grátis de arquivos.

const crypto = require("crypto");
const { tokenDaRequisicao, exigirAdmin } = require("./_lib/firebase-admin");

const VALIDADE_SEGUNDOS = 10 * 60;

function configuracao() {
  const publicKey = (process.env.IMAGEKIT_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || "").trim();
  const urlEndpoint = (process.env.IMAGEKIT_URL_ENDPOINT || "").trim().replace(/\/+$/, "");
  if (!publicKey || !privateKey || !urlEndpoint) return null;
  return { publicKey, privateKey, urlEndpoint };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });
  res.setHeader("Cache-Control", "no-store");

  try {
    await exigirAdmin(tokenDaRequisicao(req));
  } catch (erro) {
    return res.status(erro.status || 500).json({ erro: erro.publico || erro.message });
  }

  const config = configuracao();
  if (!config) {
    return res.status(503).json({
      erro: "ImageKit não configurado (IMAGEKIT_PUBLIC_KEY / IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT).",
      naoConfigurado: true
    });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + VALIDADE_SEGUNDOS;
  const signature = crypto
    .createHmac("sha1", config.privateKey)
    .update(token + expire)
    .digest("hex");

  return res.status(200).json({
    token,
    expire,
    signature,
    publicKey: config.publicKey,
    urlEndpoint: config.urlEndpoint
  });
};
