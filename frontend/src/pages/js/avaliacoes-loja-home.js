// ── Seção "Avaliações da loja" na home ──────────────────────────────────
// Mostra as avaliações PUBLICADAS (aprovadas pelo admin, ver
// admin/js/admin-avaliacoes-loja.js), até o limite que o admin configurou
// (services/avaliacoes-loja.js: buscarQuantidadeExibida). Sem nenhuma
// publicada, a seção inteira fica escondida — mesma lógica de "sem
// avaliação e sem direito de escrever, a seção não aparece" já usada em
// js/produto-detalhe.js.

import { listarAprovadas, buscarQuantidadeExibida } from "../services/avaliacoes-loja.js";
import { escapeHtml } from "../services/seguranca.js";

const IC_ESTRELA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.4 2.6 5.3 5.8.85-4.2 4.1 1 5.78L12 16.7l-5.2 2.73 1-5.78-4.2-4.1 5.8-.85Z"/></svg>';

function estrelas(nota) {
  const cheias = Math.round(Number(nota) || 0);
  return `<span class="estrelas" role="img" aria-label="${cheias} de 5">${
    [1, 2, 3, 4, 5].map((i) => `<span class="estrela ${i <= cheias ? "cheia" : ""}">${IC_ESTRELA}</span>`).join("")
  }</span>`;
}

function iniciais(nome) {
  if (!nome) return "?";
  const partes = String(nome).trim().split(/\s+/);
  const primeira = partes[0]?.[0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function mesAno(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function cartao(a) {
  return `
    <div class="review-card">
      <div class="review-stars">${estrelas(a.nota)}</div>
      ${a.texto ? `<p class="review-text">"${escapeHtml(a.texto)}"</p>` : ""}
      <div class="reviewer">
        <span class="reviewer-avatar">${escapeHtml(iniciais(a.nome))}</span>
        <div>
          <p class="reviewer-name">${escapeHtml(a.nome || "Cliente")}</p>
          <p class="reviewer-city">${escapeHtml(mesAno(a.criadoEm))}</p>
        </div>
      </div>
    </div>
  `;
}

async function montar() {
  const secao = document.getElementById("avaliacoes-loja-secao");
  const grid = document.getElementById("grid-avaliacoes-loja");
  if (!secao || !grid) return;

  let lista = [];
  try {
    const quantidade = await buscarQuantidadeExibida();
    lista = await listarAprovadas(quantidade);
  } catch (erro) {
    console.error("Avaliações da loja indisponíveis:", erro);
    return;
  }
  if (lista.length === 0) return;

  grid.innerHTML = lista.map(cartao).join("");
  secao.hidden = false;
}

montar();
