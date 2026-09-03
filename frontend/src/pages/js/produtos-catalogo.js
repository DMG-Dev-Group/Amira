// ── Catálogo de produtos — Amira ────────────────────────────────────
// Grade com "sensação de infinito" (B3): sem filtro, os produtos chegam
// em blocos paginados por cursor conforme a pessoa rola (escala com o
// catálogo — A8).
//
// FILTROS EM CAMADAS (B): cada camada (Tipo, Origem, Gênero…) é um eixo
// de facetas. Dentro de uma camada as opções SOMAM (OU); entre camadas
// as escolhas se CRUZAM (E). Assim que qualquer filtro (camada, busca ou
// preço) está ativo, o catálogo carrega a lista completa uma vez e cruza
// em memória — o Firestore aceita só um array-contains por consulta, e
// cruzar três camadas no servidor custaria mais leituras e latência do
// que vale neste porte de catálogo (ROADMAP_FUTURO.md §3.2).
//
// Estado na URL: produtos.html?tipo=perfumes,decante&origem=arabe — o
// filtro é compartilhável e sobrevive ao F5. Links antigos com
// ?categoria=slug continuam funcionando, traduzidos para a camada
// principal.

import {
  listarProdutos,
  listarProdutosPaginado,
  filtrarProdutos,
  ordenarProdutos,
  infoPreco,
  estoquePorModo,
  disponivelNoModo
} from "../services/produtos.js";
import { listarCamadas, camadaPrincipal } from "../services/camadas.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

const grid = document.getElementById("catalogo-grid");
const tituloTexto = document.getElementById("catalogo-titulo-texto");
const contagem = document.getElementById("catalogo-contagem");
const selectOrdenar = document.getElementById("select-ordenar");
const buscaInput = document.getElementById("nav-busca-input");
const buscaForm = document.getElementById("nav-busca-form");
const camadasContainer = document.getElementById("filtro-camadas");
const chipsContainer = document.getElementById("filtro-chips");
const inputPrecoMin = document.getElementById("filtro-preco-min");
const inputPrecoMax = document.getElementById("filtro-preco-max");
const btnAplicarPreco = document.getElementById("btn-aplicar-preco");
const btnLimparFiltros = document.getElementById("btn-limpar-filtros");
const sentinela = document.getElementById("catalogo-sentinela");

const TAMANHO_PAGINA = 24;

let produtosCarregados = []; // acumulado das páginas já buscadas
let camadas = [];
let camadaPrincipalSlug = null;
let selecao = {};            // { [camadaSlug]: string[] } — só camadas com opção marcada
let termoBusca = "";
let precoMin = null;
let precoMax = null;
let ultimoDoc = null;
let temMais = true;
let carregandoPagina = false;
let modoFiltroCompleto = false; // true = algum filtro ativo (lista completa carregada)

// ── Lê os filtros da URL ────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
termoBusca = params.get("busca") || "";
if (buscaInput) buscaInput.value = termoBusca;

// ── Seleção ────────────────────────────────────────────────────────────
function marcadas(camadaSlug) {
  return selecao[camadaSlug] || [];
}

function alternarOpcao(camadaSlug, opcaoSlug) {
  const atuais = new Set(marcadas(camadaSlug));
  if (atuais.has(opcaoSlug)) atuais.delete(opcaoSlug);
  else atuais.add(opcaoSlug);

  if (atuais.size === 0) delete selecao[camadaSlug];
  else selecao[camadaSlug] = [...atuais];
}

function temFiltroCamada() {
  return Object.keys(selecao).length > 0;
}

function lerSelecaoDaURL() {
  selecao = {};
  camadas.forEach((camada) => {
    const cru = params.get(camada.slug);
    if (!cru) return;
    const slugsValidos = new Set(camada.opcoes.map((o) => o.slug));
    const escolhidas = cru.split(",").map((s) => s.trim()).filter((s) => slugsValidos.has(s));
    if (escolhidas.length) selecao[camada.slug] = escolhidas;
  });

  // Ponte: link antigo ?categoria=slug vira uma marcação na camada principal.
  const legado = params.get("categoria");
  if (legado && camadaPrincipalSlug) {
    const principal = camadas.find((c) => c.slug === camadaPrincipalSlug);
    if (principal && principal.opcoes.some((o) => o.slug === legado)) {
      const atuais = new Set(marcadas(camadaPrincipalSlug));
      atuais.add(legado);
      selecao[camadaPrincipalSlug] = [...atuais];
    }
  }
}

function escreverSelecaoNaURL() {
  const novaURL = new URL(window.location.href);
  const qs = novaURL.searchParams;
  // limpa chaves de camada e o legado, e regrava a seleção atual
  camadas.forEach((c) => qs.delete(c.slug));
  qs.delete("categoria");
  Object.entries(selecao).forEach(([slug, opcoes]) => {
    if (opcoes.length) qs.set(slug, opcoes.join(","));
  });
  if (termoBusca.trim()) qs.set("busca", termoBusca.trim());
  else qs.delete("busca");
  novaURL.search = qs.toString();
  history.replaceState(null, "", novaURL);
}

// ── Monta o painel de filtros (uma seção por camada) ────────────────────
function montarPainelCamadas() {
  if (!camadasContainer) return;

  camadasContainer.innerHTML = camadas.map((camada) => `
    <div class="filtro-grupo" data-camada="${escapeHtml(camada.slug)}">
      <h3>${escapeHtml(camada.nome)}</h3>
      <div class="filtro-opcoes">
        ${camada.opcoes.map((op) => `
          <label class="filtro-opcao">
            <input type="checkbox" data-camada="${escapeHtml(camada.slug)}" value="${escapeHtml(op.slug)}"
              ${marcadas(camada.slug).includes(op.slug) ? "checked" : ""}>
            <span>${escapeHtml(op.nome)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");

  camadasContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      alternarOpcao(cb.dataset.camada, cb.value);
      reiniciarCatalogo();
    });
  });
}

function nomeOpcao(camadaSlug, opcaoSlug) {
  const camada = camadas.find((c) => c.slug === camadaSlug);
  return camada?.opcoes.find((o) => o.slug === opcaoSlug)?.nome || opcaoSlug;
}

function montarChips() {
  if (!chipsContainer) return;
  const chips = [];
  Object.entries(selecao).forEach(([camadaSlug, opcoes]) => {
    opcoes.forEach((op) => {
      chips.push(`
        <button class="filtro-chip" data-camada="${escapeHtml(camadaSlug)}" data-opcao="${escapeHtml(op)}">
          ${escapeHtml(nomeOpcao(camadaSlug, op))}
          <span aria-hidden="true">×</span>
        </button>`);
    });
  });
  chipsContainer.innerHTML = chips.join("");
  chipsContainer.hidden = chips.length === 0;

  chipsContainer.querySelectorAll(".filtro-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      alternarOpcao(chip.dataset.camada, chip.dataset.opcao);
      sincronizarCheckboxes();
      reiniciarCatalogo();
    });
  });
}

function sincronizarCheckboxes() {
  if (!camadasContainer) return;
  camadasContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = marcadas(cb.dataset.camada).includes(cb.value);
  });
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

function atualizarTitulo() {
  // Título específico só quando há exatamente uma opção marcada, e ela é
  // da camada principal (o caso "cliente clicou numa categoria").
  const totalMarcadas = Object.values(selecao).reduce((n, arr) => n + arr.length, 0);
  const soPrincipal = Object.keys(selecao).length === 1 && selecao[camadaPrincipalSlug]?.length === 1;
  if (totalMarcadas === 1 && soPrincipal) {
    tituloTexto.textContent = nomeOpcao(camadaPrincipalSlug, selecao[camadaPrincipalSlug][0]);
  } else {
    tituloTexto.textContent = "Todos os produtos";
  }
}

// ── Modo paginado (navegação normal, sem filtro) ─────────────────────────
async function carregarProximaPagina() {
  if (carregandoPagina || !temMais || modoFiltroCompleto) return;
  carregandoPagina = true;

  try {
    const pagina = await listarProdutosPaginado({
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
      grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto no catálogo ainda.</p>`;
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

// ── Modo filtro completo (camada, busca e/ou faixa de preço) ─────────────
async function carregarListaCompletaEFiltrar() {
  grid.innerHTML = `<p class="catalogo-loading">Carregando produtos...</p>`;
  try {
    produtosCarregados = await listarProdutos();
    temMais = false;
    aplicarFiltrosERenderizar();
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar os produtos agora. Tente novamente em instantes.</p>`;
  }
}

function aplicarFiltrosERenderizar() {
  let lista = filtrarProdutos(produtosCarregados, {
    termo: termoBusca,
    precoMin,
    precoMax,
    selecaoCamadas: selecao,
    camadaPrincipalSlug
  });
  lista = ordenarProdutos(lista, selectOrdenar.value);
  renderizarLista(lista);
  atualizarContagem(lista.length);
}

// ── Orquestração ──────────────────────────────────────────────────────────
function haFiltrosAtivos() {
  return Boolean(termoBusca.trim()) || precoMin !== null || precoMax !== null || temFiltroCamada();
}

async function reiniciarCatalogo() {
  produtosCarregados = [];
  ultimoDoc = null;
  temMais = true;
  modoFiltroCompleto = haFiltrosAtivos();

  escreverSelecaoNaURL();
  montarChips();
  atualizarTitulo();

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
  selecao = {};
  if (buscaInput) buscaInput.value = "";
  inputPrecoMin.value = "";
  inputPrecoMax.value = "";
  selectOrdenar.value = "relevancia";
  sincronizarCheckboxes();
  reiniciarCatalogo();
});

// ── Inicialização ──────────────────────────────────────────────────────────
async function iniciar() {
  try {
    camadas = await listarCamadas();
  } catch (erro) {
    console.error("Erro ao carregar as camadas de filtro:", erro);
    camadas = [];
  }
  camadaPrincipalSlug = camadaPrincipal(camadas)?.slug || null;

  lerSelecaoDaURL();
  montarPainelCamadas();
  await reiniciarCatalogo();
}
iniciar();
