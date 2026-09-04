import { protegerPaginaAdmin } from "./admin-auth.js";
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

function aviso(el, texto, tipo = "erro") {
  el.textContent = texto;
  el.classList.toggle("sucesso", tipo === "sucesso");
  el.style.display = texto ? "block" : "none";
}

async function carregar() {
  const [atacadoSnap, pagamentoSnap] = await Promise.all([
    getDoc(doc(db, "configuracoes", "atacado")),
    getDoc(doc(db, "configuracoes", "pagamento"))
  ]);

  const atacado = atacadoSnap.exists() ? atacadoSnap.data() : {};
  inAtivo.checked = atacado.ativo !== false; // padrão: ligado
  inMinimo.value = Number(atacado.qtdMinimaCarrinho) || 6;

  const pag = pagamentoSnap.exists() ? pagamentoSnap.data() : {};
  inPixChave.value = pag.pixChave || "";
  inPixNome.value = pag.pixNome || "";
  inPixInstrucoes.value = pag.instrucoes || "";
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

protegerPaginaAdmin(() => {
  carregar().catch((erro) => {
    console.error("Erro ao carregar configurações:", erro);
    aviso(msgAtacado, "Não foi possível carregar as configurações.");
  });
});
