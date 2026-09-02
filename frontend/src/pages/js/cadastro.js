import { cadastrarUsuario, traduzErroAuth, loginComGoogle, logoutUsuario } from "../services/auth.js";
import { formatarCNPJ, validarCNPJ, consultarCNPJ } from "../services/cnpj.js";

const form = document.getElementById("form-cadastro");
const inputNome = document.getElementById("cad-nome");
const inputEmail = document.getElementById("cad-email");
const inputSenha = document.getElementById("cad-senha");
const inputConfirma = document.getElementById("cad-confirma");
const btnCadastro = document.getElementById("btn-cadastro");
const msg = document.getElementById("cadastro-msg");

const camposRevendedor = document.getElementById("campos-revendedor");
const inputCnpj = document.getElementById("cad-cnpj");
const inputRazaoSocial = document.getElementById("cad-razao-social");
const tipoContaInfo = document.getElementById("tipo-conta-info");
const cnpjStatus = document.getElementById("cnpj-status");
const botoesTipoConta = document.querySelectorAll(".tipo-conta-btn");

let tipoConta = "cliente";
let infoEmpresaConsultada = null; // resultado da última consulta bem-sucedida

function mostrarMensagem(texto, tipo = "erro") {
  msg.textContent = texto;
  msg.classList.toggle("sucesso", tipo === "sucesso");
}

// Formato básico de e-mail. A prova real de que o e-mail EXISTE é o link
// de verificação: a conta só é ativada depois que a pessoa clica nele —
// um e-mail inventado nunca recebe o link e a conta nunca entra no banco.
function emailTemFormatoValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ── Toggle cliente / revendedor ──────────────────────────────────────────
botoesTipoConta.forEach((btn) => {
  btn.addEventListener("click", () => {
    tipoConta = btn.dataset.tipo;
    botoesTipoConta.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const ehRevendedor = tipoConta === "revendedor";
    camposRevendedor.style.display = ehRevendedor ? "block" : "none";
    inputCnpj.required = ehRevendedor;
    inputRazaoSocial.required = ehRevendedor;

    tipoContaInfo.textContent = ehRevendedor
      ? "Sua conta passará por uma análise antes de liberar o acesso aos preços de atacado."
      : "";
  });
});

// ── Máscara de CNPJ ───────────────────────────────────────────────────────
inputCnpj.addEventListener("input", () => {
  inputCnpj.value = formatarCNPJ(inputCnpj.value);
  cnpjStatus.textContent = "";
  cnpjStatus.className = "cnpj-status";
  infoEmpresaConsultada = null;
});

// ── Consulta automática (informativa, nunca bloqueia o cadastro) ─────────
inputCnpj.addEventListener("blur", async () => {
  const cnpj = inputCnpj.value.trim();
  if (!cnpj) return;

  if (!validarCNPJ(cnpj)) {
    cnpjStatus.textContent = "Verifique os números do CNPJ digitado.";
    cnpjStatus.className = "cnpj-status indisponivel";
    return;
  }

  cnpjStatus.textContent = "Consultando dados públicos do CNPJ...";
  cnpjStatus.className = "cnpj-status verificando";

  const resultado = await consultarCNPJ(cnpj);

  if (!resultado) {
    // Falha na consulta (API fora do ar, sem internet, etc.) — não
    // bloqueia nada, só avisa que não foi possível confirmar agora.
    cnpjStatus.textContent = "Não foi possível verificar automaticamente — você pode continuar o cadastro normalmente.";
    cnpjStatus.className = "cnpj-status indisponivel";
    return;
  }

  infoEmpresaConsultada = resultado;

  // Preenche a razão social automaticamente, se o campo ainda estiver vazio.
  if (resultado.razaoSocial && !inputRazaoSocial.value.trim()) {
    inputRazaoSocial.value = resultado.razaoSocial;
  }

  if (resultado.provavelMEI) {
    cnpjStatus.textContent = "✓ Identificado como MEI (Microempreendedor Individual).";
    cnpjStatus.className = "cnpj-status mei";
  } else {
    cnpjStatus.textContent = `✓ CNPJ encontrado${resultado.porte ? ` — porte: ${resultado.porte}` : ""}.`;
    cnpjStatus.className = "cnpj-status empresa";
  }
});

// ── Envio do formulário ───────────────────────────────────────────────────
form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensagem("");

  const nome = inputNome.value.trim();
  const email = inputEmail.value.trim();
  const senha = inputSenha.value;
  const confirma = inputConfirma.value;

  if (!nome || !email || !senha || !confirma) {
    mostrarMensagem("Preencha todos os campos.");
    return;
  }

  if (!emailTemFormatoValido(email)) {
    mostrarMensagem("Informe um e-mail válido e existente — enviaremos um link de confirmação para ele.");
    return;
  }

  if (senha.length < 6) {
    mostrarMensagem("A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  if (senha !== confirma) {
    mostrarMensagem("As senhas não coincidem.");
    return;
  }

  let dadosRevendedor = null;

  if (tipoConta === "revendedor") {
    const cnpj = inputCnpj.value.trim();
    const razaoSocial = inputRazaoSocial.value.trim();

    if (!cnpj || !razaoSocial) {
      mostrarMensagem("Informe o CNPJ e a razão social da sua loja.");
      return;
    }

    if (!validarCNPJ(cnpj)) {
      mostrarMensagem("CNPJ inválido. Verifique os números digitados.");
      return;
    }

    dadosRevendedor = {
      cnpj,
      razaoSocial,
      provavelMEI: infoEmpresaConsultada?.provavelMEI ?? null,
      porteEmpresa: infoEmpresaConsultada?.porte ?? null
    };
  }

  btnCadastro.disabled = true;
  btnCadastro.textContent = "Criando conta...";

  try {
    await cadastrarUsuario(nome, email, senha, dadosRevendedor);

    // Por exigir e-mail confirmado, não deixamos a pessoa entrar direto.
    // Ela é deslogada e enviada para o login, com a tela de verificação.
    await logoutUsuario();

    mostrarMensagem(
      "Conta criada! Enviamos um link de confirmação para o seu e-mail — confirme antes de fazer login. " +
      "Se o link não chegar (confira o spam), o e-mail informado pode não existir: nesse caso, refaça o cadastro com um e-mail válido.",
      "sucesso"
    );

    setTimeout(() => {
      window.location.href = "./login.html";
    }, 2500);
  } catch (erro) {
    mostrarMensagem(traduzErroAuth(erro.code));
    btnCadastro.disabled = false;
    btnCadastro.textContent = "Cadastre-se";
  }
});

// ── Cadastro/login com Google ────────────────────────────────────────────
const btnGoogle = document.getElementById("btn-cadastro-google");
btnGoogle.addEventListener("click", async () => {
  mostrarMensagem("");
  btnGoogle.disabled = true;
  btnGoogle.textContent = "Conectando...";

  try {
    await loginComGoogle();
    mostrarMensagem("Conta conectada! Redirecionando...", "sucesso");
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 1000);
  } catch (erro) {
    mostrarMensagem(traduzErroAuth(erro.code));
    btnGoogle.disabled = false;
    btnGoogle.textContent = "Continuar com Google";
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