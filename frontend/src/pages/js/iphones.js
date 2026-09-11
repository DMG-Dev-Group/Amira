// ── Página de iPhones — Amira ──────────────────────────────────────────────
// Vitrine da seção de iPhones. Reaproveita o mesmo card do catálogo (para o
// visual não divergir) e busca os produtos por services/iphones.js, que é a
// mesma regra usada pelo painel admin — assim loja e dashboard nunca contam
// coisas diferentes.

import { listarProdutosIphone, agruparIphones } from "../services/iphones.js";
import { listarCamadas } from "../services/camadas.js";
import { infoPreco, estoquePorModo, disponivelNoModo, ordenarProdutos } from "../services/produtos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

const grid = document.getElementById("iphones-grid");
const contagem = document.getElementById("iphones-contagem");
const selectOrdenar = document.getElementById("select-ordenar-iphones");
const topoAcessorios = document.getElementById("iphones-acessorios-topo");
const gridAcessorios = document.getElementById("iphones-acessorios-grid");
const contagemAcessorios = document.getElementById("iphones-acessorios-contagem");

let aparelhos = [];
let acessorios = [];

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

// Aparelhos e acessórios são prateleiras diferentes da mesma seção — a
// mesma divisão que o painel usa para cadastrar. Sem separar, a contagem
// "N aparelhos disponíveis" contaria capa e cabo junto.
function renderizar() {
  if (aparelhos.length === 0) {
    grid.innerHTML = `
      <p class="catalogo-vazio">
        Ainda não temos iPhones publicados aqui. Chame a gente no WhatsApp para
        saber o que está chegando.
      </p>`;
    contagem.textContent = "";
  } else {
    const lista = ordenarProdutos(aparelhos, selectOrdenar.value);
    grid.innerHTML = lista.map(cardProduto).join("");
    contagem.textContent = `${lista.length} ${lista.length === 1 ? "aparelho disponível" : "aparelhos disponíveis"}`;
  }

  // A seção de acessórios só existe quando há acessório cadastrado.
  const temAcessorios = acessorios.length > 0;
  if (topoAcessorios) topoAcessorios.hidden = !temAcessorios;
  if (gridAcessorios) gridAcessorios.hidden = !temAcessorios;
  if (!temAcessorios) return;

  const lista = ordenarProdutos(acessorios, selectOrdenar.value);
  gridAcessorios.innerHTML = lista.map(cardProduto).join("");
  if (contagemAcessorios) {
    contagemAcessorios.textContent =
      `${lista.length} ${lista.length === 1 ? "acessório disponível" : "acessórios disponíveis"}`;
  }
}

selectOrdenar?.addEventListener("change", renderizar);

async function iniciar() {
  try {
    const camadas = await listarCamadas();
    const produtos = await listarProdutosIphone(camadas);
    ({ aparelhos, acessorios } = agruparIphones(produtos, camadas));
    renderizar();
  } catch (erro) {
    console.error("Erro ao carregar os iPhones:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os iPhones agora. Tente novamente em instantes.</p>`;
  }
}

iniciar();
