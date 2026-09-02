// ── Catálogo de produtos — Amira ────────────────────────────────────
// Grade com "sensação de infinito" (B3): os produtos chegam em blocos
// paginados por cursor conforme a pessoa rola a página, em vez de baixar
// a coleção inteira de uma vez (escala com o catálogo — A8).
// Quando há busca por texto ou filtro de preço, carregamos a categoria
// completa uma única vez e filtramos no cliente (o Firestore não tem
// busca full-text nativa) — comportamento documentado como híbrido.

import {
  listarProdutos,
  listarProdutosPaginado,
  filtrarProdutos,
  ordenarProdutos,
  infoPreco,
  estoquePorModo,
  disponivelNoModo
} from "../services/produtos.js";
import { listarCategorias } from "../services/categorias.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

const grid = document.getElementById("catalogo-grid");
const tituloTexto = document.getElementById("catalogo-titulo-texto");
const contagem = document.getElementById("catalogo-contagem");
const selectOrdenar = document.getElementById("select-ordenar");
const buscaInput = document.getElementById("nav-busca-input");
const buscaForm = document.getElementById("nav-busca-form");
const filtroCategoriasLista = document.getElementById("filtro-categorias-lista");
const dropdownCategoriasLista = document.getElementById("dropdown-categorias-lista");
const inputPrecoMin = document.getElementById("filtro-preco-min");
const inputPrecoMax = document.getElementById("filtro-preco-max");
const btnAplicarPreco = document.getElementById("btn-aplicar-preco");
const btnLimparFiltros = document.getElementById("btn-limpar-filtros");
const sentinela = document.getElementById("catalogo-sentinela");

const TAMANHO_PAGINA = 24;

let produtosCarregados = []; // acumulado das páginas já buscadas
let categoriasCache = [];
let categoriaAtual = "";
let termoBusca = "";
let precoMin = null;
let precoMax = null;
let ultimoDoc = null;
let temMais = true;
let carregandoPagina = false;
let modoFiltroCompleto = false; // true = busca/preço ativo (lista completa carregada)

// ── Lê parâmetros da URL (categoria=, busca=) ────────────────────────────
const params = new URLSearchParams(window.location.search);
categoriaAtual = params.get("categoria") || "";
termoBusca = params.get("busca") || "";
if (buscaInput) buscaInput.value = termoBusca;

// ── Monta a lista de categorias nos filtros e no dropdown da navbar ──────
async function montarCategorias() {
  try {
    categoriasCache = await listarCategorias();
  } catch (erro) {
    console.error("Erro ao carregar categorias:", erro);
    categoriasCache = [];
  }

  filtroCategoriasLista.innerHTML = categoriasCache.map(
    (cat) => `<button class="filtro-categoria-item" data-categoria="${escapeHtml(cat.slug)}">${escapeHtml(cat.nome)}</button>`
  ).join("");

  dropdownCategoriasLista.innerHTML = categoriasCache.map(
    (cat) => `<li><a href="produtos.html?categoria=${encodeURIComponent(cat.slug)}"><i class="cat-icon"></i> ${escapeHtml(cat.nome)}</a></li>`
  ).join("");

  document.querySelectorAll(".filtro-categoria-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaAtual = btn.dataset.categoria;
      document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      reiniciarCatalogo();
    });
  });

  // Marca o botão "Todas" ou a categoria certa como ativo, conforme a URL
  const botaoAtivo = document.querySelector(
    `.filtro-categoria-item[data-categoria="${CSS.escape(categoriaAtual)}"]`
  );
  if (botaoAtivo) {
    document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
    botaoAtivo.classList.add("active");
  }
}

// ── Renderização dos cards ────────────────────────────────────────────────
function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

function renderizarLista(produtos, { acrescentar = false } = {}) {
  if (!acrescentar && produtos.length === 0) {
    grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto encontrado com esses filtros.</p>`;
    return;
  }

  const html = produtos.map(cardProduto).join("");
  if (acrescentar) {
    grid.insertAdjacentHTML("beforeend", html);
  } else {
    grid.innerHTML = html;
  }
}

function atualizarContagem(qtdVisivel) {
  const sufixo = !modoFiltroCompleto && temMais ? "+" : "";
  contagem.textContent = `${qtdVisivel}${sufixo} produto${qtdVisivel === 1 ? "" : "s"} encontrado${qtdVisivel === 1 ? "" : "s"}`;
}

// ── Modo paginado (navegação normal, sem busca/preço) ─────────────────────
async function carregarProximaPagina() {
  if (carregandoPagina || !temMais || modoFiltroCompleto) return;
  carregandoPagina = true;

  try {
    const pagina = await listarProdutosPaginado({
      categoria: categoriaAtual || null,
      tamanhoPagina: TAMANHO_PAGINA,
      aposDoc: ultimoDoc
    });

    const primeiraPagina = produtosCarregados.length === 0;
    produtosCarregados = produtosCarregados.concat(pagina.produtos);
    ultimoDoc = pagina.ultimoDoc;
    temMais = pagina.temMais;

    const lista = ordenarProdutos(produtosCarregados, selectOrdenar.value);
    renderizarLista(lista, { acrescentar: false });
    if (primeiraPagina && lista.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto nesta categoria ainda.</p>`;
    }
    atualizarContagem(lista.length);
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    if (produtosCarregados.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os produtos agora. Tente novamente em instantes.</p>`;
    }
  } finally {
    carregandoPagina = false;
  }
}

// ── Modo filtro completo (busca por texto e/ou faixa de preço) ────────────
async function carregarListaCompletaEFiltrar() {
  grid.innerHTML = `<p class="catalogo-loading">Carregando produtos...</p>`;
  try {
    produtosCarregados = await listarProdutos({ categoria: categoriaAtual || null });
    temMais = false;
    aplicarFiltrosERenderizar();
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os produtos agora. Tente novamente em instantes.</p>`;
  }
}

function aplicarFiltrosERenderizar() {
  let lista = filtrarProdutos(produtosCarregados, { termo: termoBusca, precoMin, precoMax });
  lista = ordenarProdutos(lista, selectOrdenar.value);
  renderizarLista(lista);
  atualizarContagem(lista.length);
}

// ── Orquestração ──────────────────────────────────────────────────────────
function haFiltrosAtivos() {
  return Boolean(termoBusca.trim()) || precoMin !== null || precoMax !== null;
}

async function reiniciarCatalogo() {
  produtosCarregados = [];
  ultimoDoc = null;
  temMais = true;
  modoFiltroCompleto = haFiltrosAtivos();

  const catInfo = categoriasCache.find((c) => c.slug === categoriaAtual);
  tituloTexto.textContent = catInfo ? catInfo.nome : "Todos os produtos";

  if (modoFiltroCompleto) {
    await carregarListaCompletaEFiltrar();
  } else {
    grid.innerHTML = `<p class="catalogo-loading">Carregando produtos...</p>`;
    await carregarProximaPagina();
  }
}

// Sentinela do scroll infinito: quando entra na tela, busca o próximo bloco.
if (sentinela) {
  const observador = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) {
      carregarProximaPagina();
    }
  }, { rootMargin: "600px 0px" });
  observador.observe(sentinela);
}

// ── Eventos ───────────────────────────────────────────────────────────────
function aoBuscar(termo) {
  termoBusca = termo.trim();
  if (buscaInput) buscaInput.value = termoBusca;
  reiniciarCatalogo();
}

buscaForm?.addEventListener("submit", (evento) => {
  evento.preventDefault();
  aoBuscar(buscaInput.value);
});


selectOrdenar.addEventListener("change", () => {
  if (modoFiltroCompleto) {
    aplicarFiltrosERenderizar();
  } else {
    const lista = ordenarProdutos(produtosCarregados, selectOrdenar.value);
    renderizarLista(lista);
    atualizarContagem(lista.length);
  }
});

btnAplicarPreco.addEventListener("click", () => {
  precoMin = inputPrecoMin.value ? Number(inputPrecoMin.value) : null;
  precoMax = inputPrecoMax.value ? Number(inputPrecoMax.value) : null;
  reiniciarCatalogo();
});

btnLimparFiltros.addEventListener("click", () => {
  termoBusca = "";
  precoMin = null;
  precoMax = null;
  categoriaAtual = "";
  if (buscaInput) buscaInput.value = "";
  inputPrecoMin.value = "";
  inputPrecoMax.value = "";
  selectOrdenar.value = "relevancia";
  document.querySelectorAll(".filtro-categoria-item").forEach((b) => b.classList.remove("active"));
  const botaoTodas = document.querySelector('.filtro-categoria-item[data-categoria=""]');
  if (botaoTodas) botaoTodas.classList.add("active");
  reiniciarCatalogo();
});

// ── Inicialização ──────────────────────────────────────────────────────────
async function iniciar() {
  await montarCategorias();
  await reiniciarCatalogo();
}
iniciar();
