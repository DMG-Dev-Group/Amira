// ── Serviço de Autenticação Amira ────────────────────────────────
// Centraliza cadastro, login, logout e leitura do perfil/role do usuário.
// Qualquer página que precise de auth importa só daqui.
//
// SEGURANÇA (C2): o documento usuarios/{uid} NUNCA é criado antes do
// e-mail estar verificado — as firestore.rules exigem
// request.auth.token.email_verified. O perfil nasce no primeiro acesso
// já verificado (garantirPerfil). Isso impede scripts em loop de encher
// o banco com contas fantasma: sem clicar no link do e-mail, nada é
// gravado no Firestore.

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Traduz os códigos de erro do Firebase Auth para mensagens em PT-BR
export function traduzErroAuth(codigo) {
  const mapa = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado. Tente fazer login.",
    "auth/invalid-email": "E-mail inválido. Verifique e tente novamente.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta. Tente novamente.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente de novo.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/requires-recent-login": "Por segurança, confirme sua senha atual para continuar.",
    "auth/popup-closed-by-user": "Login cancelado.",
    "auth/cancelled-popup-request": "Login cancelado.",
    "auth/account-exists-with-different-credential": "Esse e-mail já está cadastrado com senha. Faça login com e-mail e senha.",
    "auth/firebase-app-check-token-is-invalid.": "Não foi possível validar seu acesso. Recarregue a página e tente de novo."
  };
  return mapa[codigo] || "Ocorreu um erro inesperado. Tente novamente.";
}

// ── Cadastro pendente (aguardando verificação de e-mail) ──────────────────
// Guardamos localmente os dados informados no cadastro (nome, CNPJ...)
// para criar o perfil no primeiro login verificado. Se a pessoa confirmar
// o e-mail em OUTRO dispositivo, o perfil nasce como cliente comum e ela
// pode solicitar a conta de revendedor depois, pelo perfil (A5).
const CHAVE_CADASTRO_PENDENTE = "amiraCadastroPendente";
// Chave anterior ao rebrand: quem começou o cadastro antes da troca ainda
// tem os dados salvos nela, então continuamos lendo (nunca escrevendo).
const CHAVE_CADASTRO_PENDENTE_LEGADA = "floraCadastroPendente";

function salvarCadastroPendente(uid, dados) {
  try {
    localStorage.setItem(CHAVE_CADASTRO_PENDENTE, JSON.stringify({ uid, ...dados }));
  } catch {
    // localStorage indisponível (modo anônimo estrito) — segue sem ele.
  }
}

function lerCadastroPendente(uid) {
  try {
    const bruto =
      localStorage.getItem(CHAVE_CADASTRO_PENDENTE) ??
      localStorage.getItem(CHAVE_CADASTRO_PENDENTE_LEGADA);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return dados.uid === uid ? dados : null;
  } catch {
    return null;
  }
}

function limparCadastroPendente() {
  try {
    localStorage.removeItem(CHAVE_CADASTRO_PENDENTE);
    localStorage.removeItem(CHAVE_CADASTRO_PENDENTE_LEGADA);
  } catch {
    // sem localStorage, nada a limpar
  }
}

/**
 * Cria a conta no Firebase Auth e dispara o e-mail de verificação.
 * O documento de perfil NÃO é criado aqui — só depois do e-mail
 * verificado (ver garantirPerfil). Se a pessoa informar um e-mail
 * inexistente, ela nunca recebe o link e a conta nunca é ativada.
 *
 * @param {string} nome
 * @param {string} email
 * @param {string} senha
 * @param {{cnpj?: string, razaoSocial?: string, provavelMEI?: boolean|null, porteEmpresa?: string|null}} [dadosRevendedor]
 */
export async function cadastrarUsuario(nome, email, senha, dadosRevendedor = null) {
  const credencial = await createUserWithEmailAndPassword(auth, email, senha);
  const usuario = credencial.user;

  await updateProfile(usuario, { displayName: nome });

  salvarCadastroPendente(usuario.uid, {
    nome,
    dadosRevendedor: dadosRevendedor || null
  });

  // O e-mail de verificação é o que "ativa" a conta. Se falhar aqui
  // (rede instável), a pessoa pode pedir reenvio pela tela de login.
  try {
    await sendEmailVerification(usuario);
  } catch (erro) {
    console.error("Não foi possível enviar o e-mail de verificação agora:", erro);
  }

  return usuario;
}

/**
 * Garante que usuarios/{uid} existe para um usuário com e-mail já
 * verificado. Chamado automaticamente por observarAuth no primeiro
 * acesso verificado. Retorna o perfil (existente ou recém-criado).
 */
export async function garantirPerfil(usuario) {
  const ref = doc(db, "usuarios", usuario.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  if (usuario.emailVerified !== true) return null;

  const pendente = lerCadastroPendente(usuario.uid);
  const dadosRevendedor = pendente?.dadosRevendedor || null;

  // TODA conta nova nasce com role "cliente" (as rules rejeitam qualquer
  // outra coisa). Promover a "admin" só manualmente no Firebase Console.
  const dadosPerfil = {
    nome: pendente?.nome || usuario.displayName || "Cliente",
    email: usuario.email,
    role: "cliente",
    tipoConta: dadosRevendedor ? "revendedor" : "cliente",
    criadoEm: serverTimestamp()
  };

  if (dadosRevendedor) {
    dadosPerfil.cnpj = dadosRevendedor.cnpj;
    dadosPerfil.razaoSocial = dadosRevendedor.razaoSocial;
    // Resultado (informativo) da consulta pública à BrasilAPI feita no
    // cadastro — ajuda o admin a decidir a aprovação, nunca é trava.
    dadosPerfil.provavelMEI = dadosRevendedor.provavelMEI ?? null;
    dadosPerfil.porteEmpresa = dadosRevendedor.porteEmpresa ?? null;
    // Conta de revendedor nasce pendente — só o admin aprova.
    dadosPerfil.statusRevendedor = "pendente";
  }

  await setDoc(ref, dadosPerfil);
  limparCadastroPendente();
  return dadosPerfil;
}

/**
 * Reenvia o e-mail de verificação para o usuário logado atualmente.
 */
export async function reenviarVerificacaoEmail(usuario) {
  await sendEmailVerification(usuario);
}

/**
 * Faz login (ou cadastro automático, se for a primeira vez) usando a
 * conta Google da pessoa. Contas criadas assim já chegam com o e-mail
 * verificado — o perfil é criado na hora por garantirPerfil.
 */
export async function loginComGoogle() {
  const provedor = new GoogleAuthProvider();
  const credencial = await signInWithPopup(auth, provedor);
  const usuario = credencial.user;
  await garantirPerfil(usuario);
  return usuario;
}

// Campos do perfil que o próprio usuário pode editar (C5). Qualquer outra
// chave passada para atualizarPerfil é IGNORADA — nunca use spread de um
// objeto vindo de formulário direto no updateDoc.
const CAMPOS_PERFIL_EDITAVEIS = ["nome", "telefone", "fotoURL"];

/**
 * Atualiza dados do perfil no Firestore e, quando aplicável, também no
 * próprio Firebase Auth (nome/foto). Só os campos da allowlist passam.
 * @param {import("https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js").User} usuario
 * @param {{nome?: string, telefone?: string, fotoURL?: string}} dados
 */
export async function atualizarPerfil(usuario, dados) {
  const atualizacoesAuth = {};
  if (dados.nome !== undefined) atualizacoesAuth.displayName = dados.nome;
  if (dados.fotoURL !== undefined) atualizacoesAuth.photoURL = dados.fotoURL || null;

  if (Object.keys(atualizacoesAuth).length > 0) {
    await updateProfile(usuario, atualizacoesAuth);
  }

  const atualizacoes = { atualizadoEm: serverTimestamp() };
  for (const campo of CAMPOS_PERFIL_EDITAVEIS) {
    if (dados[campo] !== undefined) atualizacoes[campo] = dados[campo];
  }

  const ref = doc(db, "usuarios", usuario.uid);
  await updateDoc(ref, atualizacoes);
}

/**
 * Troca de tipo de conta SEM criar conta nova (A5): o usuário informa o
 * CNPJ e vira revendedor com status "pendente" — o acesso ao atacado só
 * abre depois da aprovação do admin (as rules impedem o próprio usuário
 * de se marcar "aprovado").
 */
export async function solicitarContaRevendedor(usuario, { cnpj, razaoSocial, provavelMEI = null, porteEmpresa = null }) {
  const ref = doc(db, "usuarios", usuario.uid);
  await updateDoc(ref, {
    tipoConta: "revendedor",
    cnpj,
    razaoSocial,
    provavelMEI,
    porteEmpresa,
    statusRevendedor: "pendente",
    atualizadoEm: serverTimestamp()
  });
}

/**
 * Volta a conta para o modo cliente (A5). O histórico de aprovação
 * (statusRevendedor) é preservado — se a pessoa já era aprovada e quiser
 * voltar ao atacado depois, não precisa de nova análise.
 */
export async function voltarParaContaCliente(usuario) {
  const ref = doc(db, "usuarios", usuario.uid);
  await updateDoc(ref, {
    tipoConta: "cliente",
    atualizadoEm: serverTimestamp()
  });
}

/**
 * Troca a senha do usuário logado. Por exigência do Firebase, é preciso
 * reautenticar com a senha atual antes de definir a nova.
 */
export async function alterarSenha(usuario, senhaAtual, novaSenha) {
  const credencial = EmailAuthProvider.credential(usuario.email, senhaAtual);
  await reauthenticateWithCredential(usuario, credencial);
  await updatePassword(usuario, novaSenha);
}

/**
 * Faz login com e-mail e senha.
 */
export async function loginUsuario(email, senha) {
  const credencial = await signInWithEmailAndPassword(auth, email, senha);
  return credencial.user;
}

/**
 * Indica se a conta logada (criada por e-mail/senha) já confirmou o
 * e-mail. Contas criadas via Google sempre retornam true.
 */
export function emailEstaVerificado(usuario) {
  return usuario.emailVerified === true;
}

/**
 * Faz logout do usuário atual.
 */
export async function logoutUsuario() {
  await signOut(auth);
}

/**
 * Busca o perfil completo (incluindo role) do Firestore para um uid.
 */
export async function buscarPerfil(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Observa o estado de autenticação. Chama o callback com
 * { usuario, perfil } sempre que o login mudar (inclusive null/null).
 * No primeiro acesso com e-mail já verificado, cria o perfil que ficou
 * pendente desde o cadastro (ver garantirPerfil).
 */
export function observarAuth(callback) {
  return onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      callback({ usuario: null, perfil: null });
      return;
    }
    let perfil = null;
    try {
      perfil = await buscarPerfil(usuario.uid);
      if (!perfil && usuario.emailVerified === true) {
        perfil = await garantirPerfil(usuario);
      }
    } catch (erro) {
      console.error("Erro ao carregar o perfil:", erro);
    }
    callback({ usuario, perfil });
  });
}

/**
 * Protege uma página: redireciona para login.html se não estiver autenticado.
 * Retorna { usuario, perfil } quando autenticado.
 */
export function exigirLogin(aoAutenticar, caminhoLogin = "./login.html") {
  return observarAuth(({ usuario, perfil }) => {
    if (!usuario) {
      window.location.href = caminhoLogin;
      return;
    }
    aoAutenticar({ usuario, perfil });
  });
}

/**
 * Protege uma página de admin: redireciona se não for admin.
 */
export function exigirAdmin(aoAutenticar, caminhoSemPermissao = "./index.html") {
  return observarAuth(({ usuario, perfil }) => {
    if (!usuario || !perfil || perfil.role !== "admin") {
      window.location.href = caminhoSemPermissao;
      return;
    }
    aoAutenticar({ usuario, perfil });
  });
}
