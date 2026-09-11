// ── POST /api/admin-usuario ────────────────────────────────────────────
// Cria uma conta pelo painel admin (e-mail + senha definidos pela loja).
//
// POR QUE UMA FUNÇÃO E NÃO O CLIENTE: createUserWithEmailAndPassword do
// SDK web TROCA a sessão atual pela do usuário recém-criado — o admin
// seria deslogado a cada cadastro. O Admin SDK cria sem mexer em sessão.
//
// SEGURANÇA: o endpoint é público (qualquer um alcança a URL), então quem
// chama precisa provar que é admin. O cliente manda o próprio ID token do
// Firebase e exigirAdmin() o verifica e confere usuarios/{uid}.role —
// mesma fonte de verdade das firestore.rules. Sem isso, este endpoint
// seria uma porta para criar contas arbitrárias.
//
// A conta nasce com emailVerificado = true: quem cadastrou foi a própria
// loja, presencialmente ou por combinação direta, então não faz sentido
// exigir o link de confirmação que o fluxo público exige.

const { getDb, getAuthAdmin, exigirAdmin } = require("./_lib/firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const VERSAO_POLITICA_PRIVACIDADE = "2026-09-03";

function limpar(valor, max) {
  return String(valor == null ? "" : valor).trim().slice(0, max);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  try {
    const corpo = req.body || {};
    try {
      await exigirAdmin(corpo.idToken || (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    } catch (erro) {
      if (!erro.status) erro._etapa = "verificarAdmin";
      throw erro;
    }

    const email = limpar(corpo.email, 200).toLowerCase();
    const senha = String(corpo.senha || "");
    const nome = limpar(corpo.nome, 120);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ erro: "Informe um e-mail válido." });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
    }
    if (!nome) {
      return res.status(400).json({ erro: "Informe o nome." });
    }

    const comoRevendedor = corpo.comoRevendedor === true;
    const cnpj = limpar(corpo.cnpj, 20);
    const razaoSocial = limpar(corpo.razaoSocial, 160);
    if (comoRevendedor && (!cnpj || !razaoSocial)) {
      return res.status(400).json({ erro: "Para revendedor, informe CNPJ e razão social." });
    }

    // 1) conta no Firebase Auth
    let usuario;
    try {
      usuario = await getAuthAdmin().createUser({
        email,
        password: senha,
        displayName: nome,
        emailVerified: true
      });
    } catch (erro) {
      const codigo = erro && erro.code;
      const conhecidos = {
        "auth/email-already-exists": [409, "Já existe uma conta com esse e-mail."],
        "auth/invalid-password": [400, "Senha recusada pelo Firebase (mínimo 6 caracteres)."],
        "auth/invalid-email": [400, "E-mail recusado pelo Firebase."],
        // Este é o mais provável quando tudo mais está certo: a service
        // account tem acesso ao Firestore mas não ao Firebase Auth. Ver
        // api/README.md — precisa do papel "Firebase Authentication Admin"
        // em IAM no Google Cloud.
        "auth/insufficient-permission": [
          500,
          "A service account não tem permissão para criar usuários. " +
          "No Google Cloud > IAM, dê o papel 'Firebase Authentication Admin' a ela."
        ]
      };
      if (conhecidos[codigo]) {
        const [status, mensagem] = conhecidos[codigo];
        return res.status(status).json({ erro: mensagem, _diag: { etapa: "createUser", codigo } });
      }
      erro._etapa = "createUser";
      throw erro;
    }

    // 2) perfil no Firestore — mesmo shape do cadastro público
    const perfil = {
      nome,
      email,
      role: "cliente",
      tipoConta: comoRevendedor ? "revendedor" : "cliente",
      telefone: limpar(corpo.telefone, 20).replace(/\D/g, ""),
      dataNascimento: limpar(corpo.dataNascimento, 10),
      aceiteTermos: true,
      aceiteMarketing: corpo.aceiteMarketing === true,
      consentimentoEm: FieldValue.serverTimestamp(),
      consentimentoVersao: VERSAO_POLITICA_PRIVACIDADE,
      criadoEm: FieldValue.serverTimestamp(),
      // Marca que a conta nasceu pelo painel — útil na auditoria de LGPD,
      // já que o consentimento aqui não veio de um formulário do titular.
      criadoPeloAdmin: true
    };

    if (comoRevendedor) {
      perfil.cnpj = cnpj;
      perfil.razaoSocial = razaoSocial;
      // Cadastrado pela loja já entra aprovado — não faz sentido a própria
      // loja abrir uma solicitação para depois se aprovar.
      perfil.statusRevendedor = "aprovado";
    }

    try {
      await getDb().collection("usuarios").doc(usuario.uid).set(perfil);
    } catch (erro) {
      // A conta no Auth já existe neste ponto; sem o doc do Firestore ela
      // ficaria órfã (login funciona, perfil não). Desfaz para o admin
      // poder tentar de novo com o mesmo e-mail.
      try { await getAuthAdmin().deleteUser(usuario.uid); } catch { /* nada a fazer */ }
      erro._etapa = "gravarPerfil";
      throw erro;
    }

    return res.status(201).json({
      uid: usuario.uid,
      email,
      nome,
      tipoConta: perfil.tipoConta
    });
  } catch (erro) {
    const status = erro && erro.status ? erro.status : 500;
    if (status === 500) {
      console.error("[/api/admin-usuario]", erro && erro.code, erro && erro.message);
    }
    return res.status(status).json({
      erro: status === 500 ? "Não foi possível criar a conta agora." : erro.message,
      // Diagnóstico junto da resposta: sem isto a causa só aparece no log
      // da Vercel, e um 500 opaco vira adivinhação. Sai na limpeza
      // pré-lançamento, junto com /api/status.
      _diag: status === 500
        ? { etapa: erro._etapa || "desconhecida", codigo: erro && erro.code, mensagem: erro && erro.message }
        : undefined
    });
  }
};
