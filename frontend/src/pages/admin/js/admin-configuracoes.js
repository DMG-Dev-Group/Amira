import { protegerPaginaAdmin } from "./admin-auth.js";
import { montarUploadFoto } from "../../services/imagem-upload.js";
import { db } from "../../services/firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// ── Atacado ─────────────────────────────────────────────────────────────
const inAtivo = document.getElementById("cfg-atacado-ativo");
const inMinimo = document.getElementById("cfg-atacado-minimo");
const btnSalvarAtacado = document.getElementById("btn-salvar-atacado");
const msgAtacado = document.getElementById("msg-atacado");

// ── PIX ─────────────────────────────────────────────────────────────────
const inPixChave = document.getElementById("cfg-pix-chave");
const inPixNome = document.getElementById("cfg-pix-nome");
const inPixInstrucoes = document.getElementById("cfg-pix-instrucoes");
const btnSalvarPix = document.getElementById("btn-salvar-pix");
const msgPix = document.getElementById("msg-pix");

// ── Banner / carrossel da home ──────────────────────────────────────────
const inHeroTitulo = document.getElementById("cfg-hero-titulo");
const inHeroSubtitulo = document.getElementById("cfg-hero-subtitulo");
const inHeroIntervalo = document.getElementById("cfg-hero-intervalo");
const heroSlots = document.getElementById("hero-slots");
const btnAddHeroFoto = document.getElementById("btn-add-hero-foto");
const btnSalvarHero = document.getElementById("btn-salvar-hero");
const msgHero = document.getElementById("msg-hero");

const MAX_FOTOS_HERO = 6;
// Fotos de fundo são largas; cada uma vira data URI dentro do MESMO
// documento (limite de 1 MB no Firestore), então o orçamento é apertado.
const HERO_MAX_LADO = 1600;
const HERO_ALVO_BYTES = 120 * 1024;

function aviso(el, texto, tipo = "erro") {
  el.textContent = texto;
  el.classList.toggle("sucesso", tipo === "sucesso");
  el.style.display = texto ? "block" : "none";
}

// Cada slot é um montarUploadFoto independente; o valor sai de .valor().
const slotsHero = [];

function adicionarSlotHero(valor = "") {
  if (slotsHero.length >= MAX_FOTOS_HERO) {
    aviso(msgHero, `Máximo de ${MAX_FOTOS_HERO} fotos no carrossel.`);
    return;
  }

  const linha = document.createElement("div");
  linha.className = "hero-slot";

  const caixa = document.createElement("div");
  const btnRemover = document.createElement("button");
  btnRemover.type = "button";
  btnRemover.className = "admin-btn admin-btn-danger admin-btn-sm";
  btnRemover.textContent = "Remover foto";

  linha.append(caixa, btnRemover);
  heroSlots.appendChild(linha);

  const handle = montarUploadFoto(caixa, {
    valor,
    textoVazio: "Escolher foto",
    textoCheio: "Trocar foto",
    placeholder: "../images/amira-placeholder.svg",
    maxLado: HERO_MAX_LADO,
    alvoBytes: HERO_ALVO_BYTES,
    permiteRemover: false
  });

  const registro = { handle, linha };
  slotsHero.push(registro);

  btnRemover.addEventListener("click", () => {
    const i = slotsHero.indexOf(registro);
    if (i >= 0) slotsHero.splice(i, 1);
    linha.remove();
  });
}

function fotosHero() {
  return slotsHero.map((s) => s.handle.valor()).filter(Boolean);
}

async function carregar() {
  const [atacadoSnap, pagamentoSnap, heroSnap] = await Promise.all([
    getDoc(doc(db, "configuracoes", "atacado")),
    getDoc(doc(db, "configuracoes", "pagamento")),
    getDoc(doc(db, "configuracoes", "homeCarrossel"))
  ]);

  const atacado = atacadoSnap.exists() ? atacadoSnap.data() : {};
  inAtivo.checked = atacado.ativo !== false; // padrão: ligado
  inMinimo.value = Number(atacado.qtdMinimaCarrinho) || 6;

  const pag = pagamentoSnap.exists() ? pagamentoSnap.data() : {};
  inPixChave.value = pag.pixChave || "";
  inPixNome.value = pag.pixNome || "";
  inPixInstrucoes.value = pag.instrucoes || "";

  const hero = heroSnap.exists() ? heroSnap.data() : {};
  inHeroTitulo.value = hero.titulo || "";
  inHeroSubtitulo.value = hero.subtitulo || "";
  inHeroIntervalo.value = Number(hero.intervaloMs) ? Number(hero.intervaloMs) / 1000 : 4.5;

  heroSlots.innerHTML = "";
  slotsHero.length = 0;
  const imagens = Array.isArray(hero.imagens) ? hero.imagens.filter(Boolean) : [];
  if (imagens.length === 0) adicionarSlotHero("");
  else imagens.slice(0, MAX_FOTOS_HERO).forEach((url) => adicionarSlotHero(url));
}

btnSalvarAtacado.addEventListener("click", async () => {
  aviso(msgAtacado, "");
  const minimo = Number(inMinimo.value) || 0;
  if (minimo < 1) {
    aviso(msgAtacado, "O mínimo por carrinho precisa ser pelo menos 1.");
    return;
  }
  btnSalvarAtacado.disabled = true;
  btnSalvarAtacado.textContent = "Salvando...";
  try {
    await setDoc(
      doc(db, "configuracoes", "atacado"),
      { ativo: inAtivo.checked, qtdMinimaCarrinho: minimo, atualizadoEm: serverTimestamp() },
      { merge: true }
    );
    aviso(msgAtacado, "Configuração de atacado salva.", "sucesso");
  } catch (erro) {
    console.error(erro);
    aviso(msgAtacado, "Não foi possível salvar agora. Tente novamente.");
  } finally {
    btnSalvarAtacado.disabled = false;
    btnSalvarAtacado.textContent = "Salvar atacado";
  }
});

btnSalvarPix.addEventListener("click", async () => {
  aviso(msgPix, "");
  btnSalvarPix.disabled = true;
  btnSalvarPix.textContent = "Salvando...";
  try {
    await setDoc(
      doc(db, "configuracoes", "pagamento"),
      {
        pixChave: inPixChave.value.trim(),
        pixNome: inPixNome.value.trim(),
        instrucoes: inPixInstrucoes.value.trim(),
        atualizadoEm: serverTimestamp()
      },
      { merge: true }
    );
    aviso(msgPix, "Dados de PIX salvos.", "sucesso");
  } catch (erro) {
    console.error(erro);
    aviso(msgPix, "Não foi possível salvar agora. Tente novamente.");
  } finally {
    btnSalvarPix.disabled = false;
    btnSalvarPix.textContent = "Salvar PIX";
  }
});

btnAddHeroFoto.addEventListener("click", () => {
  aviso(msgHero, "");
  adicionarSlotHero("");
});

btnSalvarHero.addEventListener("click", async () => {
  aviso(msgHero, "");

  const imagens = fotosHero();
  const segundos = Number(inHeroIntervalo.value);
  if (!Number.isFinite(segundos) || segundos < 2 || segundos > 30) {
    aviso(msgHero, "O intervalo precisa ficar entre 2 e 30 segundos.");
    return;
  }

  // Todas as fotos vão como data URI no MESMO documento — o Firestore
  // corta em 1 MB. Barramos antes de tentar gravar.
  const pesoAprox = imagens.reduce((s, u) => s + u.length, 0);
  if (pesoAprox > 900 * 1024) {
    aviso(msgHero, "As fotos somadas ficaram grandes demais. Use menos fotos ou imagens menores.");
    return;
  }

  btnSalvarHero.disabled = true;
  btnSalvarHero.textContent = "Salvando...";
  try {
    await setDoc(
      doc(db, "configuracoes", "homeCarrossel"),
      {
        imagens,
        titulo: inHeroTitulo.value.trim(),
        subtitulo: inHeroSubtitulo.value.trim(),
        intervaloMs: Math.round(segundos * 1000),
        atualizadoEm: serverTimestamp()
      },
      { merge: true }
    );
    aviso(msgHero, "Banner da home salvo. Recarregue a página inicial para ver.", "sucesso");
  } catch (erro) {
    console.error(erro);
    aviso(msgHero, "Não foi possível salvar agora. Se as fotos forem muito grandes, troque por versões menores.");
  } finally {
    btnSalvarHero.disabled = false;
    btnSalvarHero.textContent = "Salvar banner";
  }
});

protegerPaginaAdmin(() => {
  carregar().catch((erro) => {
    console.error("Erro ao carregar configurações:", erro);
    aviso(msgAtacado, "Não foi possível carregar as configurações.");
  });
});
