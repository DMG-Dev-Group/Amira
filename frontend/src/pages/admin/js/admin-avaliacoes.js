// ── Moderação de avaliações (painel admin) ─────────────────────────────
// Publicar uma avaliação aqui NÃO é curadoria de gosto: é o controle de
// segurança. As firestore.rules conseguem exigir que quem escreve tenha
// um pedido PAGO, mas não conseguem conferir que aquele pedido continha
// ESTE produto — rules não fazem laço sobre "itens". Sem esta tela,
// alguém com um pedido pago poderia avaliar qualquer item do catálogo.
//
// Por isso a tabela mostra o pedido citado: dá para abrir e conferir.

import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast } from "../../services/ui-feedback.js";
import { escapeHtml } from "../../services/seguranca.js";
import { listarTodas, definirAprovacao, excluirAvaliacao } from "../../services/avaliacoes.js";
import { listarProdutos } from "../../services/produtos.js";

let avaliacoes = [];
let nomePorProduto = new Map();

const contagem = document.getElementById("contagem-avaliacoes");
const alvoPendentes = document.getElementById("tabela-pendentes");
const alvoPublicadas = document.getElementById("tabela-publicadas");

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
  const produto = nomePorProduto.get(a.produtoId);
  return `
    <tr>
      <td>
        ${produto
          ? `<a href="../produto.html?id=${encodeURIComponent(a.produtoId)}" target="_blank" rel="noopener">${escapeHtml(produto)}</a>`
          : `<span class="admin-dica">produto removido (${escapeHtml(a.produtoId)})</span>`}
      </td>
      <td title="${escapeHtml(String(a.nota))} de 5">${estrelasTexto(a.nota)}</td>
      <td>${escapeHtml(a.nomeAutor || "—")}</td>
      <td class="admin-col-larga">${escapeHtml(a.texto || "—")}</td>
      <td><a href="pedidos.html" title="Pedido ${escapeHtml(a.pedidoId)}">${escapeHtml(String(a.pedidoId).slice(-6))}</a></td>
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
        <tr>
          <th>Produto</th><th>Nota</th><th>Cliente</th><th>Comentário</th>
          <th>Pedido</th><th>Data</th><th>Ações</th>
        </tr>
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

protegerPaginaAdmin(async () => {
  try {
    // Os produtos vêm junto só para mostrar o NOME em vez do id — sem
    // isso a tela vira uma lista de códigos.
    const [lista, produtos] = await Promise.all([listarTodas(), listarProdutos().catch(() => [])]);
    avaliacoes = lista;
    nomePorProduto = new Map(produtos.map((p) => [p.id, p.nome]));
    renderizar();
  } catch (erro) {
    console.error(erro);
    alvoPendentes.innerHTML = `<p class="admin-vazio">Não foi possível carregar as avaliações agora.</p>`;
    alvoPublicadas.innerHTML = "";
  }
});
