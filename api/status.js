// ── GET /api/status ───────────────────────────────────────────────────
// Diagnóstico: diz QUAIS Environment Variables o deploy enxerga (nunca os
// valores completos). Use para confirmar que as env vars da Vercel foram
// aplicadas ao ambiente certo (Production/Preview) e que o redeploy pegou.
//
// Remover, ou proteger, antes de abrir a loja ao público.

const { diagnosticoServiceAccount } = require("./_lib/firebase-admin");

// Últimos N caracteres de um segredo, para conferir "é o token certo?"
// sem expor o valor inteiro.
function final(str, n = 6) {
  if (!str) return null;
  return "…" + String(str).slice(-n);
}

module.exports = async (req, res) => {
  const sa = diagnosticoServiceAccount();

  res.status(200).json({
    ok: true,
    node: process.version,
    env: {
      MP_ACCESS_TOKEN: Boolean(process.env.MP_ACCESS_TOKEN),
      // O prefixo TEST- foi descontinuado — token de teste NOVO também é
      // APP_USR-. O que separa é a ABA de onde você copiou. Compare os
      // últimos caracteres com o token da aba "Credenciais de teste".
      MP_ACCESS_TOKEN_prefixo: process.env.MP_ACCESS_TOKEN
        ? process.env.MP_ACCESS_TOKEN.split("-")[0]
        : null,
      MP_ACCESS_TOKEN_final: final(process.env.MP_ACCESS_TOKEN),
      MP_WEBHOOK_SECRET: Boolean(process.env.MP_WEBHOOK_SECRET),
      MP_TEST_PAYER_EMAIL: process.env.MP_TEST_PAYER_EMAIL || null,
      FIREBASE_SERVICE_ACCOUNT: sa.ok,
      FIREBASE_SERVICE_ACCOUNT_detalhe: sa.ok
        ? { project_id: sa.project_id, client_email: sa.client_email }
        : sa.detalhe,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null
    }
  });
};
