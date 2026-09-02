// ── Página de iPhones — Amira ──────────────────────────────────────────────
// Vitrine da seção de iPhones. Reaproveita o mesmo card do catálogo (para o
// visual não divergir) e busca os produtos por services/iphones.js, que é a
// mesma regra usada pelo painel admin — assim loja e dashboard nunca contam
// coisas diferentes.

import { listarProdutosIphone } from "../services/iphones.js";
import { listarCategorias } from "../services/categorias.js";
import { infoPreco, estoquePorModo, disponivelNoModo, ordenarProdutos } from "../services/produtos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

const grid = document.getElementById("iphones-grid");
const contagem = document.getElementById("iphones-contagem");
const selectOrdenar = document.getElementById("select-ordenar-iphones");
const dropdownCategoriasLista = document.getElementById("dropdown-categorias-lista");

let produtos = [];

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mesmo card do catálogo (js/produtos-catalogo.js).
function cardProduto(p) {
  const temVarejo = disponivelNoModo(p, "varejo");
  const preco = infoPreco(p, "varejo");
  const estoque = estoquePorModo(p, "varejo");

  return `
    <a class="catalogo-card" href="produto.html?id=${encodeURIComponent(p.id)}">
      <div class="catalogo-card-img">
        <img src="${urlImagemSegura(p.imagemURL)}" alt="${escapeHtml(p.nome)}" loading="lazy">
        ${preco.temDesconto ? `<span class="desconto-selo">-${preco.percentual}%</span>` : ""}
      </div>
      <div class="catalogo-card-info">
        <h3 class="catalogo-card-nome">${escapeHtml(p.nome)}</h3>
        ${temVarejo ? `
          <span class="catalogo-card-preco">
            ${formatarPreco(preco.precoFinal)}
            ${preco.temDesconto ? `<span class="preco-antigo">${formatarPreco(preco.precoOriginal)}</span>` : ""}
          </span>
        ` : `<span class="catalogo-card-preco">Exclusivo atacado</span>`}
        ${p.precoAtacado ? `<span class="catalogo-card-preco-atacado">Atacado: ${formatarPreco(Number(p.precoAtacado))}/un</span>` : ""}
        ${temVarejo && estoque <= 0 ? `<span class="catalogo-card-estoque">Fora de estoque</span>` : ""}
      </div>
    </a>
  `;
}

function renderizar() {
  if (produtos.length === 0) {
    grid.innerHTML = `
      <p class="catalogo-vazio">
        Ainda não temos iPhones publicados aqui. Chame a gente no WhatsApp para
        saber o que está chegando.
      </p>`;
    contagem.textContent = "";
    return;
  }

  const lista = ordenarProdutos(produtos, selectOrdenar.value);
  grid.innerHTML = lista.map(cardProduto).join("");
  contagem.textContent = `${lista.length} ${lista.length === 1 ? "aparelho disponível" : "aparelhos disponíveis"}`;
}

// O dropdown de categorias da navbar é preenchido pelo catálogo; aqui a
// página monta o dela para o menu não vir vazio.
async function montarDropdownCategorias() {
  if (!dropdownCategoriasLista) return;
  try {
    const categorias = await listarCategorias();
    dropdownCategoriasLista.innerHTML = categorias.map(
      (cat) => `<li><a href="produtos.html?categoria=${encodeURIComponent(cat.slug)}">${escapeHtml(cat.nome)}</a></li>`
    ).join("");
  } catch (erro) {
    console.error("Erro ao montar o dropdown de categorias:", erro);
  }
}

selectOrdenar?.addEventListener("change", renderizar);

async function iniciar() {
  montarDropdownCategorias();
  try {
    produtos = await listarProdutosIphone();
    renderizar();
  } catch (erro) {
    console.error("Erro ao carregar os iPhones:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os iPhones agora. Tente novamente em instantes.</p>`;
  }
}

iniciar();
