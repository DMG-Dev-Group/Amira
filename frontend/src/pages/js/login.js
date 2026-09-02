import {
  loginUsuario,
  traduzErroAuth,
  observarAuth,
  loginComGoogle,
  emailEstaVerificado,
  reenviarVerificacaoEmail,
  logoutUsuario
} from "../services/auth.js";
import {
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { auth } from "../services/firebase-config.js";
const form = document.getElementById("form-login");
const inputEmail = document.getElementById("login-email");
const inputSenha = document.getElementById("login-senha");
const checkboxLembrar = document.getElementById("login-lembrar");
const btnLogin = document.getElementById("btn-login");
const btnGoogle = document.getElementById("btn-login-google");
const msg = document.getElementById("login-msg");
const linkEsqueci = document.getElementById("link-esqueci");

let redirecionarAposLogin = true;

function mostrarMensagem(texto, tipo = "erro") {
  msg.innerHTML = texto;
  msg.classList.toggle("sucesso", tipo === "sucesso");
}

function redirecionarConformePerfil(perfil) {
  if (perfil && perfil.role === "admin") {
    window.location.href = "./admin/index.html";
  } else if (perfil && perfil.tipoConta === "revendedor" && perfil.statusRevendedor === "aprovado") {
    window.location.href = "./atacado.html";
  } else {
    window.location.href = "./index.html";
  }
}

// Pré-preenche o e-mail se o usuário marcou "lembrar" anteriormente
const emailSalvo =
  localStorage.getItem("amiraEmailLembrado") ??
  localStorage.getItem("floraEmailLembrado"); // chave anterior ao rebrand
if (emailSalvo) {
  inputEmail.value = emailSalvo;
  checkboxLembrar.checked = true;
}

// Se já estiver logado, não faz sentido ficar na tela de login —
// a menos que a gente tenha decidido manter a pessoa aqui por causa
// de e-mail não verificado (ver mais abaixo).
observarAuth(({ usuario, perfil }) => {
  if (usuario && redirecionarAposLogin) {
    redirecionarConformePerfil(perfil);
  }
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensagem("");

  const email = inputEmail.value.trim();
  const senha = inputSenha.value;

  if (!email || !senha) {
    mostrarMensagem("Preencha e-mail e senha.");
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "Entrando...";

  try {
    const usuario = await loginUsuario(email, senha);

    if (checkboxLembrar.checked) {
      localStorage.setItem("amiraEmailLembrado", email);
    } else {
      localStorage.removeItem("amiraEmailLembrado");
    }

    // Contas de e-mail/senha precisam ter confirmado o e-mail. Contas via
    // Google nunca passam por aqui (emailVerified já vem true do Google).
    if (!emailEstaVerificado(usuario)) {
      redirecionarAposLogin = false;
      mostrarMensagem(
        `Confirme seu e-mail antes de continuar. Verifique sua caixa de entrada (e o spam).<br>
         <button type="button" id="btn-reenviar-verificacao">Reenviar e-mail de confirmação</button>`
      );
      msg.classList.add("verificacao-alerta");

      document.getElementById("btn-reenviar-verificacao").addEventListener("click", async () => {
        try {
          await reenviarVerificacaoEmail(usuario);
          mostrarMensagem("E-mail reenviado! Confira sua caixa de entrada.", "sucesso");
        } catch {
          mostrarMensagem("Não foi possível reenviar agora. Tente de novo em alguns minutos.");
        }
      });

      await logoutUsuario();
      btnLogin.disabled = false;
      btnLogin.textContent = "Login";
      return;
    }

    mostrarMensagem("Login realizado! Redirecionando...", "sucesso");
    // O redirecionamento real acontece no observarAuth acima.
  } catch (erro) {
    mostrarMensagem(traduzErroAuth(erro.code));
    btnLogin.disabled = false;
    btnLogin.textContent = "Login";
  }
});

btnGoogle.addEventListener("click", async () => {
  mostrarMensagem("");
  btnGoogle.disabled = true;
  btnGoogle.textContent = "Conectando...";

  try {
    await loginComGoogle();
    mostrarMensagem("Login realizado! Redirecionando...", "sucesso");
    // O redirecionamento acontece no observarAuth.
  } catch (erro) {
    mostrarMensagem(traduzErroAuth(erro.code));
    btnGoogle.disabled = false;
    btnGoogle.textContent = "Entrar com Google";
  }
});

linkEsqueci.addEventListener("click", async (evento) => {
  evento.preventDefault();
  const email = inputEmail.value.trim();

  if (!email) {
    mostrarMensagem("Digite seu e-mail no campo acima para recuperar a senha.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    mostrarMensagem("Enviamos um e-mail com instruções para redefinir sua senha.", "sucesso");
  } catch (erro) {
    mostrarMensagem(traduzErroAuth(erro.code));
  }
});

// Funcionalidade de Mostrar / Ocultar Senha
const toggleSenha = document.getElementById("toggle-senha");

toggleSenha.addEventListener("click", () => {
  if (inputSenha.type === "password") {
    inputSenha.type = "text";
    toggleSenha.classList.remove("bx-lock");
    toggleSenha.classList.add("bxs-lock-open-alt");
  } else {
    inputSenha.type = "password";
    toggleSenha.classList.remove("bxs-lock-open-alt");
    toggleSenha.classList.add("bx-lock");
  }
});