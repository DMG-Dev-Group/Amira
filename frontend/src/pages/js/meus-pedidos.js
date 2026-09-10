// ── Histórico de compras — Amira ──────────────────────────────────────
// Lista os pedidos do cliente (mais recentes primeiro). Cada card leva ao
// comprovante, que é a "prova de compra" com código de retirada.
// A consulta usa o índice composto uidComprador + criadoEm (firestore.indexes.json).

import { exigirLogin } from "../services/auth.js";
import {
  listarPedidosDoUsuario,
  derivarTotaisDePedidos,
  codigoRetirada,
  rotuloStatus,
  tomDoStatus
} from "../services/pedidos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

const lista = document.getElementById("mp-lista");
const contagem = document.getElementById("mp-contagem");

const MAX_MINIATURAS = 4;

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
}

function miniaturas(itensDetalhados) {
  const comImagem = itensDetalhados.filter((i) => i.imagemURL);
  const visiveis = comImagem.slice(0, MAX_MINIATURAS);
  const resto = itensDetalhados.length - visiveis.length;

  return `
    <div class="mp-card__miniaturas">
      ${visiveis.map((i) => `
        <img src="${urlImagemSegura(i.imagemURL)}" alt="${escapeHtml(i.nome)}" loading="lazy">
      `).join("")}
      ${resto > 0 ? `<span class="mp-card__mais">+${resto}</span>` : ""}
    </div>
  `;
}

function card(pedido, totais) {
  const qtdItens = (pedido.itens || []).reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const tom = tomDoStatus(pedido);

  return `
    <a class="mp-card" href="comprovante.html?id=${encodeURIComponent(pedido.id)}">
      <div class="mp-card__topo">
        <span class="mp-card__codigo">${escapeHtml(codigoRetirada(pedido.id))}</span>
        <span class="mp-selo mp-selo--${tom}">${escapeHtml(rotuloStatus(pedido.status))}</span>
      </div>
      ${miniaturas(totais.itensDetalhados)}
      <div class="mp-card__rodape">
        <span>
          ${qtdItens} item${qtdItens === 1 ? "" : "s"} ·
          ${pedido.modoEntrega === "retirada" ? "Retirada" : "Entrega"} ·
          <span class="mp-card__data">${formatarData(pedido.criadoEm)}</span>
        </span>
        <span class="mp-card__total">${formatarPreco(totais.total)}</span>
      </div>
    </a>
  `;
}

function vazio() {
  return `
    <div class="mp-vazio">
      <p>Você ainda não fez nenhum pedido.</p>
      <a href="produtos.html" class="btn-primary">Ver produtos</a>
    </div>
  `;
}

exigirLogin(async ({ usuario }) => {
  try {
    const pedidos = await listarPedidosDoUsuario(usuario.uid);

    if (pedidos.length === 0) {
      contagem.textContent = "";
      lista.innerHTML = vazio();
      return;
    }

    const totais = await derivarTotaisDePedidos(pedidos);
    contagem.textContent = `${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}`;

    lista.className = "mp-lista";
    lista.innerHTML = pedidos
      .map((p) => card(p, totais.get(p.id) || { itensDetalhados: [], total: 0 }))
      .join("");
  } catch (erro) {
    console.error("Erro ao carregar o histórico de pedidos:", erro);
    contagem.textContent = "";
    lista.innerHTML = `<p class="carrinho-vazio">Não foi possível carregar seus pedidos agora. Tente novamente em instantes.</p>`;
  }
});
