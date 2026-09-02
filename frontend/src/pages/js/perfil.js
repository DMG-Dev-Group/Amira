import {
  exigirLogin,
  atualizarPerfil,
  alterarSenha,
  logoutUsuario,
  traduzErroAuth,
  solicitarContaRevendedor,
  voltarParaContaCliente
} from "../services/auth.js";
import { formatarCNPJ, validarCNPJ, consultarCNPJ } from "../services/cnpj.js";
import { escapeHtml } from "../services/seguranca.js";
import { db } from "../services/firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let usuarioAtual = null;
let perfilAtual = null;

// ── Elementos ───────────────────────────────────────────────────────────
const avatarImg = document.getElementById("perfil-avatar-img");
const avatarIniciais = document.getElementById("perfil-avatar-iniciais");
const nomeTitulo = document.getElementById("perfil-nome-titulo");
const emailTitulo = document.getElementById("perfil-email-titulo");

const tabs = document.querySelectorAll(".perfil-tab-btn");
const paineis = document.querySelectorAll(".perfil-painel");

const formDados = document.getElementById("form-dados");
const campoNome = document.getElementById("campo-nome");
const campoEmail = document.getElementById("campo-email");
const campoTelefone = document.getElementById("campo-telefone");
const campoFoto = document.getElementById("campo-foto");
const btnSalvarDados = document.getElementById("btn-salvar-dados");
const msgDados = document.getElementById("msg-dados");

const formSenha = document.getElementById("form-senha");
const campoSenhaAtual = document.getElementById("campo-senha-atual");
const campoSenhaNova = document.getElementById("campo-senha-nova");
const campoSenhaConfirma = document.getElementById("campo-senha-confirma");
const btnSalvarSenha = document.getElementById("btn-salvar-senha");
const msgSenha = document.getElementById("msg-senha");
const btnLogout = document.getElementById("btn-logout");

const formEndereco = document.getElementById("form-endereco");
const campoCep = document.getElementById("campo-cep");
const campoEndereco = document.getElementById("campo-endereco");
const campoCidadeUf = document.getElementById("campo-cidade-uf");
const campoComplemento = document.getElementById("campo-complemento");
const btnSalvarEndereco = document.getElementById("btn-salvar-endereco");
const msgEndereco = document.getElementById("msg-endereco");

// ── Helpers de mensagem ─────────────────────────────────────────────────
function mostrarMsg(el, texto, tipo = "erro") {
  el.textContent = texto;
  el.classList.toggle("sucesso", tipo === "sucesso");
}

// ── Abas ────────────────────────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    paineis.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`painel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Avatar (iniciais ou imagem) ──────────────────────────────────────────
function gerarIniciais(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function atualizarAvatar(nome, fotoURL) {
  if (fotoURL) {
    avatarImg.src = fotoURL;
    avatarImg.style.display = "block";
    avatarIniciais.style.display = "none";
    avatarImg.onerror = () => {
      // Link inválido ou imagem fora do ar: volta pras iniciais.
      avatarImg.style.display = "none";
      avatarIniciais.style.display = "flex";
    };
  } else {
    avatarImg.style.display = "none";
    avatarIniciais.style.display = "flex";
    avatarIniciais.textContent = gerarIniciais(nome);
  }
}

// ── Máscara simples de telefone BR ───────────────────────────────────────
campoTelefone.addEventListener("input", () => {
  let v = campoTelefone.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 5) {
    v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  } else if (v.length > 0) {
    v = v.replace(/(\d{0,2})/, "($1");
  }
  campoTelefone.value = v.trim().replace(/-$/, "").replace(/\($/, "");
});

// ── Máscara de CEP ────────────────────────────────────────────────────────
campoCep.addEventListener("input", () => {
  let v = campoCep.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, "$1-$2");
  campoCep.value = v;
});

// Busca automática de endereço via ViaCEP (gratuito, sem necessidade de chave)
campoCep.addEventListener("blur", async () => {
  const cepLimpo = campoCep.value.replace(/\D/g, "");
  if (cepLimpo.length !== 8) return;

  campoEndereco.value = "Buscando...";
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      campoEndereco.value = "";
      mostrarMsg(msgEndereco, "CEP não encontrado. Verifique e tente novamente.");
      return;
    }

    campoEndereco.value = `${dados.logradouro || ""}, ${dados.bairro || ""}`.replace(/^, /, "");
    campoCidadeUf.value = `${dados.localidade} - ${dados.uf}`;
    mostrarMsg(msgEndereco, "");
  } catch {
    campoEndereco.value = "";
    mostrarMsg(msgEndereco, "Não foi possível buscar o CEP agora. Tente novamente.");
  }
});

// ── Aba Atacado/Revenda (A5) ─────────────────────────────────────────────
const painelRevendedorStatus = document.getElementById("revendedor-status");
const formRevendedor = document.getElementById("form-revendedor");
const campoCnpj = document.getElementById("campo-cnpj");
const campoRazaoSocial = document.getElementById("campo-razao-social");
const btnSolicitarRevenda = document.getElementById("btn-solicitar-revenda");
const msgRevendedor = document.getElementById("msg-revendedor");
const cnpjStatusPerfil = document.getElementById("cnpj-status-perfil");
const blocoVoltarCliente = document.getElementById("bloco-voltar-cliente");
const btnVoltarCliente = document.getElementById("btn-voltar-cliente");

let infoEmpresaConsultada = null;

campoCnpj?.addEventListener("input", () => {
  campoCnpj.value = formatarCNPJ(campoCnpj.value);
  cnpjStatusPerfil.textContent = "";
  infoEmpresaConsultada = null;
});

campoCnpj?.addEventListener("blur", async () => {
  const cnpj = campoCnpj.value.trim();
  if (!cnpj) return;

  if (!validarCNPJ(cnpj)) {
    cnpjStatusPerfil.textContent = "Verifique os números do CNPJ digitado.";
    return;
  }

  cnpjStatusPerfil.textContent = "Consultando dados públicos do CNPJ...";
  const resultado = await consultarCNPJ(cnpj);
  if (!resultado) {
    cnpjStatusPerfil.textContent = "Não foi possível verificar automaticamente — você pode continuar mesmo assim.";
    return;
  }
  infoEmpresaConsultada = resultado;
  if (resultado.razaoSocial && !campoRazaoSocial.value.trim()) {
    campoRazaoSocial.value = resultado.razaoSocial;
  }
  cnpjStatusPerfil.textContent = resultado.provavelMEI
    ? "✓ Identificado como MEI."
    : `✓ CNPJ encontrado${resultado.porte ? ` — porte: ${resultado.porte}` : ""}.`;
});

function renderizarStatusRevendedor() {
  if (!painelRevendedorStatus) return;

  const status = perfilAtual?.statusRevendedor || "";
  const ehRevendedor = perfilAtual?.tipoConta === "revendedor";
  let html = "";

  formRevendedor.style.display = "none";
  blocoVoltarCliente.style.display = "none";

  if (ehRevendedor && status === "aprovado") {
    html = `
      <div class="perfil-campo">
        <p><strong>Conta de revendedor aprovada.</strong></p>
        <p style="color:var(--text-muted); font-size:0.85rem;">
          CNPJ: ${escapeHtml(perfilAtual.cnpj || "—")} · ${escapeHtml(perfilAtual.razaoSocial || "")}
        </p>
        <a href="atacado.html" class="btn-primary" style="text-decoration:none; display:inline-block; margin-top:0.6rem;">Ir para o atacado</a>
      </div>
    `;
    blocoVoltarCliente.style.display = "block";
  } else if (ehRevendedor && status === "pendente") {
    html = `
      <div class="perfil-campo">
        <p><strong>Solicitação em análise.</strong></p>
        <p style="color:var(--text-muted); font-size:0.85rem;">
          Seu CNPJ ${escapeHtml(perfilAtual.cnpj || "")} está aguardando aprovação da loja. Avisaremos por e-mail.
        </p>
      </div>
    `;
    blocoVoltarCliente.style.display = "block";
  } else if (ehRevendedor && status === "rejeitado") {
    html = `
      <div class="perfil-campo">
        <p><strong>Solicitação não aprovada.</strong></p>
        <p style="color:var(--text-muted); font-size:0.85rem;">
          Você pode revisar os dados e enviar uma nova solicitação abaixo, ou falar com a loja pelo WhatsApp.
        </p>
      </div>
    `;
    formRevendedor.style.display = "block";
    if (perfilAtual.cnpj) campoCnpj.value = formatarCNPJ(perfilAtual.cnpj);
    if (perfilAtual.razaoSocial) campoRazaoSocial.value = perfilAtual.razaoSocial;
  } else if (!ehRevendedor && status === "aprovado") {
    // Já foi aprovado antes e voltou para cliente — reativar é imediato.
    html = `
      <div class="perfil-campo">
        <p><strong>Sua aprovação de revendedor está guardada.</strong></p>
        <p style="color:var(--text-muted); font-size:0.85rem;">Reative o modo revendedor para voltar a comprar no atacado.</p>
        <button type="button" class="btn-primary" id="btn-reativar-revenda" style="margin-top:0.6rem;">Reativar conta de revendedor</button>
      </div>
    `;
  } else {
    formRevendedor.style.display = "block";
  }

  painelRevendedorStatus.innerHTML = html;

  document.getElementById("btn-reativar-revenda")?.addEventListener("click", async () => {
    try {
      // Só o tipoConta muda — statusRevendedor "aprovado" fica intacto
      // (a allowlist de atualizarPerfil não cobre tipoConta; usamos a
      // função dedicada com os dados já existentes no perfil).
      await solicitarContaRevendedorReativando();
      perfilAtual.tipoConta = "revendedor";
      renderizarStatusRevendedor();
    } catch (erro) {
      console.error(erro);
      alert("Não foi possível reativar agora. Tente novamente.");
    }
  });
}

// Reativação: volta tipoConta para "revendedor" sem tocar no status
// (statusRevendedor "aprovado" fica intacto — as rules permitem porque
// o status não muda).
async function solicitarContaRevendedorReativando() {
  await updateDoc(doc(db, "usuarios", usuarioAtual.uid), {
    tipoConta: "revendedor",
    atualizadoEm: serverTimestamp()
  });
}

formRevendedor?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgRevendedor, "");

  const cnpj = campoCnpj.value.trim();
  const razaoSocial = campoRazaoSocial.value.trim();

  if (!cnpj || !razaoSocial) {
    mostrarMsg(msgRevendedor, "Informe o CNPJ e a razão social da sua loja.");
    return;
  }
  if (!validarCNPJ(cnpj)) {
    mostrarMsg(msgRevendedor, "CNPJ inválido. Verifique os números digitados.");
    return;
  }

  btnSolicitarRevenda.disabled = true;
  btnSolicitarRevenda.textContent = "Enviando...";

  try {
    await solicitarContaRevendedor(usuarioAtual, {
      cnpj,
      razaoSocial,
      provavelMEI: infoEmpresaConsultada?.provavelMEI ?? null,
      porteEmpresa: infoEmpresaConsultada?.porte ?? null
    });
    perfilAtual = { ...perfilAtual, tipoConta: "revendedor", cnpj, razaoSocial, statusRevendedor: "pendente" };
    mostrarMsg(msgRevendedor, "Solicitação enviada! Avisaremos quando for aprovada.", "sucesso");
    renderizarStatusRevendedor();
  } catch (erro) {
    console.error(erro);
    mostrarMsg(msgRevendedor, "Não foi possível enviar agora. Tente novamente.");
  } finally {
    btnSolicitarRevenda.disabled = false;
    btnSolicitarRevenda.textContent = "Solicitar conta de revendedor";
  }
});

btnVoltarCliente?.addEventListener("click", async () => {
  const confirmar = confirm("Usar sua conta como cliente comum? Você pode voltar ao modo revendedor quando quiser.");
  if (!confirmar) return;
  try {
    await voltarParaContaCliente(usuarioAtual);
    perfilAtual = { ...perfilAtual, tipoConta: "cliente" };
    renderizarStatusRevendedor();
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível alterar agora. Tente novamente.");
  }
});

// ── Carregar dados do usuário ────────────────────────────────────────────
exigirLogin(async ({ usuario, perfil }) => {
  usuarioAtual = usuario;
  perfilAtual = perfil || {};
  renderizarStatusRevendedor();

  // Link direto para a aba de revenda (ex.: atacado.html → perfil.html#revendedor)
  if (window.location.hash === "#revendedor") {
    document.getElementById("tab-revendedor")?.click();
  }

  const nome = perfil?.nome || usuario.displayName || "";
  const fotoURL = perfil?.fotoURL || usuario.photoURL || "";

  nomeTitulo.textContent = nome || "Minha Conta";
  emailTitulo.textContent = usuario.email;
  atualizarAvatar(nome, fotoURL);

  campoNome.value = nome;
  campoEmail.value = usuario.email;
  campoTelefone.value = perfil?.telefone || "";
  campoFoto.value = fotoURL;

  // Carrega endereço salvo, se existir
  try {
    const refEndereco = doc(db, "usuarios", usuario.uid, "dados", "endereco");
    const snap = await getDoc(refEndereco);
    if (snap.exists()) {
      const e = snap.data();
      campoCep.value = e.cep || "";
      campoEndereco.value = e.endereco || "";
      campoCidadeUf.value = e.cidadeUf || "";
      campoComplemento.value = e.complemento || "";
    }
  } catch (erro) {
    console.error("Erro ao carregar endereço:", erro);
  }
});

// ── Salvar dados pessoais ────────────────────────────────────────────────
formDados.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgDados, "");

  const nome = campoNome.value.trim();
  const telefone = campoTelefone.value.trim();
  const fotoURL = campoFoto.value.trim();

  if (!nome) {
    mostrarMsg(msgDados, "O nome não pode ficar em branco.");
    return;
  }

  btnSalvarDados.disabled = true;
  btnSalvarDados.textContent = "Salvando...";

  try {
    await atualizarPerfil(usuarioAtual, { nome, telefone, fotoURL });
    nomeTitulo.textContent = nome;
    atualizarAvatar(nome, fotoURL);
    mostrarMsg(msgDados, "Dados atualizados com sucesso!", "sucesso");
  } catch (erro) {
    mostrarMsg(msgDados, traduzErroAuth(erro.code));
  } finally {
    btnSalvarDados.disabled = false;
    btnSalvarDados.textContent = "Salvar alterações";
  }
});

// ── Alterar senha ─────────────────────────────────────────────────────────
formSenha.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgSenha, "");

  const senhaAtual = campoSenhaAtual.value;
  const novaSenha = campoSenhaNova.value;
  const confirma = campoSenhaConfirma.value;

  if (novaSenha.length < 6) {
    mostrarMsg(msgSenha, "A nova senha precisa ter pelo menos 6 caracteres.");
    return;
  }
  if (novaSenha !== confirma) {
    mostrarMsg(msgSenha, "As senhas não coincidem.");
    return;
  }

  btnSalvarSenha.disabled = true;
  btnSalvarSenha.textContent = "Alterando...";

  try {
    await alterarSenha(usuarioAtual, senhaAtual, novaSenha);
    mostrarMsg(msgSenha, "Senha alterada com sucesso!", "sucesso");
    formSenha.reset();
  } catch (erro) {
    mostrarMsg(msgSenha, traduzErroAuth(erro.code));
  } finally {
    btnSalvarSenha.disabled = false;
    btnSalvarSenha.textContent = "Alterar senha";
  }
});

// ── Logout ────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  const confirmar = confirm("Deseja sair da sua conta?");
  if (!confirmar) return;
  await logoutUsuario();
  window.location.href = "./index.html";
});

// ── Salvar endereço ───────────────────────────────────────────────────────
formEndereco.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgEndereco, "");

  const cep = campoCep.value.trim();
  const endereco = campoEndereco.value.trim();
  const cidadeUf = campoCidadeUf.value.trim();
  const complemento = campoComplemento.value.trim();

  if (!cep || !endereco) {
    mostrarMsg(msgEndereco, "Informe o CEP e aguarde o endereço ser preenchido.");
    return;
  }

  btnSalvarEndereco.disabled = true;
  btnSalvarEndereco.textContent = "Salvando...";

  try {
    const refEndereco = doc(db, "usuarios", usuarioAtual.uid, "dados", "endereco");
    await setDoc(refEndereco, {
      cep,
      endereco,
      cidadeUf,
      complemento,
      atualizadoEm: serverTimestamp()
    });
    mostrarMsg(msgEndereco, "Endereço salvo com sucesso!", "sucesso");
  } catch (erro) {
    console.error(erro);
    mostrarMsg(msgEndereco, "Não foi possível salvar o endereço. Tente novamente.");
  } finally {
    btnSalvarEndereco.disabled = false;
    btnSalvarEndereco.textContent = "Salvar endereço";
  }
});
