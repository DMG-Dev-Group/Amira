// ── GET /api/status ───────────────────────────────────────────────────
// Diagnóstico: diz QUAIS Environment Variables o deploy enxerga (nunca os
// valores). Use para confirmar que as env vars da Vercel foram aplicadas
// ao ambiente certo (Production/Preview) e que o redeploy pegou.
//
// Remover, ou proteger, antes de abrir a loja ao público.

module.exports = async (req, res) => {
  let saOk = false;
  let saInfo = null;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw && raw.trim()) {
      const obj = JSON.parse(raw);
      saOk = Boolean(obj.project_id && obj.private_key && obj.client_email);
      saInfo = saOk ? { project_id: obj.project_id, client_email: obj.client_email } : "JSON incompleto";
    }
  } catch {
    saInfo = "JSON inválido";
  }

  res.status(200).json({
    ok: true,
    node: process.version,
    env: {
      MP_ACCESS_TOKEN: Boolean(process.env.MP_ACCESS_TOKEN),
      // MP mudou o prefixo: tokens de teste NOVOS também começam com
      // APP_USR-. O que separa teste de produção é a ABA de onde você
      // copiou (Credenciais de teste x de produção), não o prefixo.
      MP_ACCESS_TOKEN_prefixo: process.env.MP_ACCESS_TOKEN
        ? process.env.MP_ACCESS_TOKEN.split("-")[0]
        : null,
      MP_WEBHOOK_SECRET: Boolean(process.env.MP_WEBHOOK_SECRET),
      MP_TEST_PAYER_EMAIL: process.env.MP_TEST_PAYER_EMAIL || null,
      FIREBASE_SERVICE_ACCOUNT: saOk,
      FIREBASE_SERVICE_ACCOUNT_detalhe: saInfo,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null
    }
  });
};
