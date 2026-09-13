// ── Moderação de avaliações da LOJA (painel admin) ─────────────────────
// Diferente de admin-avaliacoes.js (avaliação de PRODUTO, que exige um
// pedido pago do autor), esta avaliação vem do QR code do balcão físico —
// QUALQUER pessoa manda, sem estar logada. A moderação aqui NÃO é conferir
// "essa pessoa tinha direito de avaliar" (não tem como, e nem faz
// sentido): é decidir o que representa bem a loja antes de ir pra home.

import { protegerPaginaAdmin } from "./admin-auth.js";
import { toast, confirmar } from "../../services/ui-feedback.js";
import { escapeHtml } from "../../services/seguranca.js";
import {
  listarTodas,
  definirAprovacao,
  excluirAvaliacao,
  buscarQuantidadeExibida,
  definirQuantidadeExibida
} from "../../services/avaliacoes-loja.js";

let avaliacoes = [];

const contagem = document.getElementById("contagem-avaliacoes-loja");
const alvoPendentes = document.getElementById("tabela-pendentes");
const alvoPublicadas = document.getElementById("tabela-publicadas");
const campoQtd = document.getElementById("cfg-qtd-exibida");
const btnSalvarQtd = document.getElementById("btn-salvar-qtd");

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
}

function estrelasTexto(nota) {
  const n = Math.max(0, Math.min(5, Number(nota) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function linha(a, pendente) {
  return `
    <tr>
      <td title="${escapeHtml(String(a.nota))} de 5">${estrelasTexto(a.nota)}</td>
      <td>${escapeHtml(a.nome || "—")}</td>
      <td class="admin-col-larga">${escapeHtml(a.texto || "—")}</td>
      <td>${formatarData(a.criadoEm)}</td>
      <td>
        <div class="admin-acoes-linha">
          ${pendente
            ? `<button class="admin-btn admin-btn-primary admin-btn-sm btn-publicar" data-id="${escapeHtml(a.id)}">Publicar</button>`
            : `<button class="admin-btn admin-btn-outline admin-btn-sm btn-despublicar" data-id="${escapeHtml(a.id)}">Tirar do ar</button>`}
          <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir" data-id="${escapeHtml(a.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `;
}

function tabela(lista, pendente) {
  if (lista.length === 0) {
    return `<p class="admin-vazio">${pendente ? "Nada aguardando publicação." : "Nenhuma avaliação publicada ainda."}</p>`;
  }
  return `
    <table class="admin-tabela">
      <thead>
        <tr><th>Nota</th><th>Nome</th><th>Comentário</th><th>Data</th><th>Ações</th></tr>
      </thead>
      <tbody>${lista.map((a) => linha(a, pendente)).join("")}</tbody>
    </table>
  `;
}

function renderizar() {
  const pendentes = avaliacoes.filter((a) => a.aprovada !== true);
  const publicadas = avaliacoes.filter((a) => a.aprovada === true);

  contagem.textContent =
    `${avaliacoes.length} avaliação(ões) — ${pendentes.length} aguardando publicação`;

  alvoPendentes.innerHTML = tabela(pendentes, true);
  alvoPublicadas.innerHTML = tabela(publicadas, false);

  document.querySelectorAll(".btn-publicar").forEach((btn) =>
    btn.addEventListener("click", () => mudarAprovacao(btn.dataset.id, true)));
  document.querySelectorAll(".btn-despublicar").forEach((btn) =>
    btn.addEventListener("click", () => mudarAprovacao(btn.dataset.id, false)));
  document.querySelectorAll(".btn-excluir").forEach((btn) =>
    btn.addEventListener("click", () => remover(btn.dataset.id)));
}

async function mudarAprovacao(id, aprovada) {
  try {
    await definirAprovacao(id, aprovada);
    const a = avaliacoes.find((x) => x.id === id);
    if (a) a.aprovada = aprovada;
    renderizar();
    toast(aprovada ? "Avaliação publicada." : "Avaliação tirada do ar.", "sucesso");
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível atualizar agora. Tente de novo.", "erro");
  }
}

async function remover(id) {
  const ok = await confirmar({
    titulo: "Excluir esta avaliação?",
    descricao: "Some de vez. Se for só para tirar da loja, use \"Tirar do ar\".",
    confirmar: "Excluir",
    destrutivo: true
  });
  if (!ok) return;

  try {
    await excluirAvaliacao(id);
    avaliacoes = avaliacoes.filter((a) => a.id !== id);
    renderizar();
    toast("Avaliação excluída.", "sucesso");
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível excluir agora. Tente de novo.", "erro");
  }
}

btnSalvarQtd.addEventListener("click", async () => {
  btnSalvarQtd.disabled = true;
  try {
    await definirQuantidadeExibida(campoQtd.value);
    toast("Quantidade salva.", "sucesso");
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível salvar agora. Tente de novo.", "erro");
  } finally {
    btnSalvarQtd.disabled = false;
  }
});

protegerPaginaAdmin(async () => {
  try {
    const [lista, quantidade] = await Promise.all([listarTodas(), buscarQuantidadeExibida()]);
    avaliacoes = lista;
    campoQtd.value = quantidade;
    renderizar();
  } catch (erro) {
    console.error(erro);
    alvoPendentes.innerHTML = `<p class="admin-vazio">Não foi possível carregar as avaliações agora.</p>`;
    alvoPublicadas.innerHTML = "";
  }
});
