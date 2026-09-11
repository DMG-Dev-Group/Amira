// ── Home dinâmica — Amira ───────────────────────────────────────────
// Seções da home carregadas do Firestore: carrossel de anúncio (B1),
// destaques, seção de produtos (B2), categorias e banner "Produto da
// Estação". Todo texto dinâmico passa por escapeHtml e toda imagem por
// urlImagemSegura (C4).

import { listarDestaques, listarBannerHero, listarProdutosRecentes, infoPreco, disponivelNoModo, estoquePorModo } from "./produtos.js";
import { listarCamadas, camadaPrincipal } from "./camadas.js";
import { produtoEhIphone, opcoesSemIphone, listarProdutosIphone } from "./iphones.js";
import { observarAuth } from "./auth.js";
import { adicionarAoCarrinho } from "./carrinho.js";
import { ativarReveals } from "./script.js";
import { escapeHtml, urlImagemSegura, urlFundoSegura } from "./seguranca.js";
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let usuarioLogado = null;
observarAuth(({ usuario }) => {
  usuarioLogado = usuario;
});

// ── As duas linhas da loja ────────────────────────────────────────────
// Perfumaria e iPhones são independentes: aparelho e acessório não entram
// em "Nossos produtos" nem em "Os mais amados" — eles têm o carrossel
// próprio logo abaixo e a página iphones.html. Ver services/iphones.js.
//
// Uma promessa só para a home inteira: cinco seções precisam das camadas
// e não faz sentido cada uma pagar a própria leitura.
const camadasDaHome = listarCamadas().catch((erro) => {
  console.error("Camadas indisponíveis na home:", erro);
  return [];
});

/** Predicado pronto para as vitrines de perfumaria (produto => excluir?). */
async function ehDaLinhaIphone() {
  const camadas = await camadasDaHome;
  return (produto) => produtoEhIphone(produto, camadas);
}

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Preço do card (mesmo formato do catálogo). Produtos sem preço de
// varejo são vendidos só no atacado (R2 6.1).
function precoCardHtml(p) {
  if (!disponivelNoModo(p, "varejo")) {
    return `<span class="catalogo-card-preco">Exclusivo atacado</span>`;
  }
  const preco = infoPreco(p, "varejo");
  return `
    <span class="catalogo-card-preco">
      ${formatarPreco(preco.precoFinal)}
      ${preco.temDesconto ? `<span class="preco-antigo">${formatarPreco(preco.precoOriginal)}</span>` : ""}
    </span>
  `;
}

// ── Carrossel de anúncio (B1) ─────────────────────────────────────────────
// Fotos da marca passando automaticamente, sem navegação manual (é
// divulgação da loja, não de um produto). TUDO é editável em
// Admin → Configurações → "Banner da home", que grava em
// configuracoes/homeCarrossel:
//   { imagens: [dataURI|url, ...], titulo, subtitulo, intervaloMs }
// Sem esse documento, valem os padrões abaixo.
const IMAGENS_CARROSSEL_PADRAO = [
  "images/look_rosa.jpeg",
  "images/look_amarelo.jpeg",
  "images/look_vinho.jpeg",
  "images/look_branco.jpeg"
];
const INTERVALO_CARROSSEL_PADRAO_MS = 4500;
const TITULO_PADRAO = "Sua *essência*, nossa paixão";
const SUBTITULO_PADRAO = "Perfumes, maquiagem e acessórios que contam a sua história.";

// O título aceita *palavra* para destacar em itálico dourado — é o único
// "markup" que o admin precisa, e nada além disso escapa do escapeHtml.
function tituloComDestaque(texto) {
  return escapeHtml(texto)
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

async function iniciarCarrosselAnuncio() {
  const container = document.getElementById("hero-carrossel");
  if (!container) return;

  let imagens = IMAGENS_CARROSSEL_PADRAO;
  let intervalo = INTERVALO_CARROSSEL_PADRAO_MS;
  let titulo = TITULO_PADRAO;
  let subtitulo = SUBTITULO_PADRAO;

  try {
    const snap = await getDoc(doc(db, "configuracoes", "homeCarrossel"));
    if (snap.exists()) {
      const dados = snap.data();
      if (Array.isArray(dados.imagens) && dados.imagens.length > 0) {
        imagens = dados.imagens;
      }
      if (Number(dados.intervaloMs) >= 1500) {
        intervalo = Number(dados.intervaloMs);
      }
      if (typeof dados.titulo === "string" && dados.titulo.trim()) {
        titulo = dados.titulo.trim();
      }
      if (typeof dados.subtitulo === "string" && dados.subtitulo.trim()) {
        subtitulo = dados.subtitulo.trim();
      }
    }
  } catch (erro) {
    console.error("Carrossel: usando conteúdo padrão (config indisponível):", erro);
  }

  container.innerHTML = `
    ${imagens.map((url, i) => `
      <div class="hero-slide ${i === 0 ? "ativa" : ""}" style="background-image:url('${urlFundoSegura(url)}')"></div>
    `).join("")}
    <div class="hero-slide-overlay"></div>
    <div class="hero-slide-conteudo">
      <h1 class="hero-title">${tituloComDestaque(titulo)}</h1>
      ${subtitulo ? `<p class="hero-subtitle">${escapeHtml(subtitulo)}</p>` : ""}
    </div>
  `;

  if (imagens.length <= 1) return;

  const slides = container.querySelectorAll(".hero-slide");
  let indice = 0;
  setInterval(() => {
    slides[indice].classList.remove("ativa");
    indice = (indice + 1) % slides.length;
    slides[indice].classList.add("ativa");
  }, intervalo);
}

// ── Carrossel de iPhones da home ──────────────────────────────────────────
// Esta é a vitrine da linha de iPhones — a única da home, já que aparelho
// e acessório não entram nas seções de perfumaria (ver o topo do arquivo).
// Por isso o carrossel mostra os PRODUTOS de verdade, cada card levando
// direto para a página do aparelho.
//
// Ordem: quem estiver marcado como destaque na aba de iPhones vem antes;
// o resto segue a ordem da coleção (mais recentes primeiro).
//
// Sem nenhum aparelho cadastrado o carrossel não fica vazio: cai nas fotos
// de configuracoes/homeIphones — { imagens: ["https://...", ...] } — e, na
// falta delas, nas ilustrações que já vêm no HTML. Nos dois casos o card
// leva para iphones.html.
const MIN_CARTOES_CARROSSEL = 6;

function cartaoProdutoIphone(p, duplicata) {
  const temVarejo = disponivelNoModo(p, "varejo");
  const preco = infoPreco(p, "varejo");
  const esgotado = temVarejo && estoquePorModo(p, "varejo") <= 0;

  return `
    <a class="carousel-card carousel-card--produto" href="produto.html?id=${encodeURIComponent(p.id)}"
       ${duplicata ? 'aria-hidden="true" tabindex="-1"' : ""}>
      <img src="${urlImagemSegura(p.imagemURL)}" alt="${duplicata ? "" : escapeHtml(p.nome)}" loading="lazy">
      ${esgotado ? `<span class="carousel-card-selo">Esgotado</span>` : ""}
      <div class="carousel-card-info">
        <span class="carousel-card-nome">${escapeHtml(p.nome)}</span>
        <span class="carousel-card-preco">
          ${temVarejo ? formatarPreco(preco.precoFinal) : "Exclusivo atacado"}
        </span>
      </div>
    </a>
  `;
}

function cartaoFotoIphone(url, duplicata) {
  return `
    <a class="carousel-card" href="iphones.html"
       ${duplicata ? 'aria-hidden="true" tabindex="-1"' : 'aria-label="Ver os iPhones disponíveis"'}>
      <img src="${urlImagemSegura(url)}" alt="${duplicata ? "" : "iPhone disponível na Amira"}" loading="lazy">
    </a>
  `;
}

async function carregarGaleriaIphones() {
  const trilho = document.getElementById("carouselTrack");
  if (!trilho) return;

  // 1) os aparelhos cadastrados
  let itens = [];
  try {
    const produtos = await listarProdutosIphone(await camadasDaHome);
    itens = produtos
      .slice()
      .sort((a, b) => Number(b.destaque === true) - Number(a.destaque === true))
      .map((p) => (duplicata) => cartaoProdutoIphone(p, duplicata));
  } catch (erro) {
    console.error("Carrossel de iPhones: não foi possível listar os aparelhos:", erro);
  }

  // 2) sem aparelhos, as fotos publicadas pelo painel
  if (itens.length === 0) {
    try {
      const snap = await getDoc(doc(db, "configuracoes", "homeIphones"));
      if (snap.exists() && Array.isArray(snap.data().imagens)) {
        itens = snap.data().imagens
          .filter(Boolean)
          .map((url) => (duplicata) => cartaoFotoIphone(url, duplicata));
      }
    } catch (erro) {
      console.error("Carrossel de iPhones: mantendo as imagens padrão:", erro);
    }
  }

  // 3) sem nada disso, ficam as ilustrações que já estão no HTML
  if (itens.length === 0) return;

  // O loop da animação desloca -50%, então o trilho precisa do conteúdo
  // duplicado. Com poucos cartões o trilho fica menor que a tela e o
  // deslocamento aparece como um salto — repetir antes de duplicar resolve.
  const base = [];
  while (base.length < MIN_CARTOES_CARROSSEL) base.push(...itens);

  const metade = (duplicata) => base.map((montar) => montar(duplicata)).join("");
  trilho.innerHTML = metade(false) + metade(true);
}

// ── "Nossas categorias" ───────────────────────────────────────────────────
// São as opções da CAMADA PRINCIPAL de filtros (services/camadas.js). A
// capa de cada card é a "imagemURL" da opção; o link já leva o filtro
// aplicado no catálogo (?<slugCamada>=<slugOpcao>).
async function carregarCategoriasVisuais() {
  const grid = document.getElementById("grid-categorias-home");
  if (!grid) return;

  try {
    const principal = camadaPrincipal(await camadasDaHome);
    // A seção de iPhones não é uma categoria de perfumaria: ela tem
    // carrossel e página próprios, e o catálogo não mostra esses produtos
    // — o card levaria a uma grade vazia.
    const opcoes = opcoesSemIphone(principal?.opcoes);

    if (!principal || opcoes.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Nenhuma categoria cadastrada ainda.</p>`;
      return;
    }

    grid.innerHTML = opcoes.map((op) => `
      <a class="cat-card reveal" href="produtos.html?${encodeURIComponent(principal.slug)}=${encodeURIComponent(op.slug)}" style="text-decoration:none; display:block;">
        <div class="cat-imagem-generica">
          <img src="${urlImagemSegura(op.imagemURL)}" alt="${escapeHtml(op.nome)}">
        </div>
        <div class="cat-overlay"></div>
        <div class="cat-label">
          <span class="cat-name">${escapeHtml(op.nome)}</span>
        </div>
        <div class="cat-arrow">→</div>
      </a>
    `).join("");

    ativarReveals(grid);

  } catch (erro) {
    console.error("Erro ao carregar categorias na home:", erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar as categorias agora.</p>`;
  }
}

// ── Destaques ("Os mais amados") ────────────────────────────────────────
async function carregarDestaques() {
  const grid = document.getElementById("grid-destaques");
  if (!grid) return;

  try {
    const produtos = await listarDestaques(8, { excluir: await ehDaLinhaIphone() });

    if (produtos.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Nenhum produto em destaque no momento.</p>`;
      return;
    }

    // Mesmo card do catálogo (R2 4.1/4.2): tamanho e imagem centralizada
    // idênticos aos da página de produtos, + botão de adicionar.
    grid.innerHTML = produtos.map((p) => `
      <div class="catalogo-card destaque-card reveal">
        <a href="produto.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none; display:block;">
          <div class="catalogo-card-img">
            <img src="${urlImagemSegura(p.imagemURL)}" alt="${escapeHtml(p.nome)}" loading="lazy">
            ${infoPreco(p).temDesconto ? `<span class="desconto-selo">-${infoPreco(p).percentual}%</span>` : ""}
          </div>
          <div class="catalogo-card-info">
            <h3 class="catalogo-card-nome">${escapeHtml(p.nome)}</h3>
            ${precoCardHtml(p)}
          </div>
        </a>
        ${disponivelNoModo(p, "varejo") ? `
          <button class="product-add" data-id="${escapeHtml(p.id)}" title="Adicionar ao carrinho">+</button>
        ` : ""}
      </div>
    `).join("");

    ativarReveals(grid);

    grid.querySelectorAll(".product-add").forEach((btn) => {
      btn.addEventListener("click", () => adicionarProdutoAoCarrinho(btn, produtos));
    });
  } catch (erro) {
    console.error("Erro ao carregar destaques:", erro);
    grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Não foi possível carregar os destaques agora.</p>`;
  }
}

// ── Seção de produtos (B2): recentes + botão "Ver mais" ──────────────────
async function carregarProdutosHome() {
  const grid = document.getElementById("grid-produtos-home");
  if (!grid) return;

  try {
    const produtos = await listarProdutosRecentes(8, { excluir: await ehDaLinhaIphone() });

    if (produtos.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Os produtos aparecerão aqui em breve.</p>`;
      return;
    }

    grid.innerHTML = produtos.map((p) => `
      <a class="catalogo-card reveal" href="produto.html?id=${encodeURIComponent(p.id)}">
        <div class="catalogo-card-img">
          <img src="${urlImagemSegura(p.imagemURL)}" alt="${escapeHtml(p.nome)}" loading="lazy">
          ${infoPreco(p).temDesconto ? `<span class="desconto-selo">-${infoPreco(p).percentual}%</span>` : ""}
        </div>
        <div class="catalogo-card-info">
          <h3 class="catalogo-card-nome">${escapeHtml(p.nome)}</h3>
          ${precoCardHtml(p)}
        </div>
      </a>
    `).join("");

    ativarReveals(grid);
  } catch (erro) {
    console.error("Erro ao carregar a vitrine de produtos:", erro);
    grid.innerHTML = `<p class="catalogo-vazio" style="padding:2rem;">Não foi possível carregar os produtos agora.</p>`;
  }
}

async function adicionarProdutoAoCarrinho(btn, produtos) {
  if (!usuarioLogado) {
    window.location.href = "login.html";
    return;
  }

  const produto = produtos.find((p) => p.id === btn.dataset.id);
  if (!produto) return;

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";

  try {
    await adicionarAoCarrinho(usuarioLogado.uid, {
      produtoId: produto.id,
      nome: produto.nome,
      imagemURL: produto.imagemURL || "",
      precoUnitario: infoPreco(produto, "varejo").precoFinal,
      pesoUnitario: produto.peso || 0,
      quantidade: 1,
      modo: "varejo"
    });
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 1200);
  } catch (erro) {
    console.error(erro);
    btn.textContent = "!";
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 1200);
  }
}

// ── Banner "Produto da Estação" (carrossel com setas) ────────────────────
let produtosBanner = [];
let indiceBanner = 0;

function renderizarBanner() {
  const container = document.getElementById("highlight-conteudo");
  const nav = document.getElementById("highlight-nav");
  const contador = document.getElementById("highlight-contador");

  if (produtosBanner.length === 0) {
    container.innerHTML = `<p class="catalogo-vazio">Nenhum produto configurado para este banner ainda.</p>`;
    nav.style.display = "none";
    return;
  }

  const p = produtosBanner[indiceBanner];
  const preco = infoPreco(p, "varejo");

  container.innerHTML = `
    <div class="highlight-visual reveal">
      <div class="highlight-circle">
        <img src="${urlImagemSegura(p.bannerImagemURL || p.imagemURL)}" alt="${escapeHtml(p.nome)}">
      </div>
      ${p.bannerEtiqueta ? `<div class="highlight-tag">${escapeHtml(p.bannerEtiqueta)}</div>` : ""}
    </div>
    <div class="highlight-content reveal reveal-delay-1">
      <span class="section-eyebrow2">${escapeHtml(p.bannerNomeSecao || "Produto da estação")}</span>
      <h2 class="highlight-title">${escapeHtml(p.bannerTitulo || p.nome)}</h2>
      <p class="highlight-text">${escapeHtml(p.bannerTexto || p.descricao || "")}</p>
      ${(p.bannerTags && p.bannerTags.length > 0) ? `
        <div class="highlight-notes">
          ${p.bannerTags.map((tag) => `<span class="note-pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="highlight-price">
        ${disponivelNoModo(p, "varejo") ? `
          <small>A partir de</small>
          ${formatarPreco(preco.precoFinal)}
          ${preco.temDesconto ? `<span class="preco-antigo">${formatarPreco(preco.precoOriginal)}</span>` : ""}
        ` : `<small>Exclusivo atacado</small>`}
      </div>
      <a href="produto.html?id=${encodeURIComponent(p.id)}" class="btn-primary">
        Quero este produto
      </a>
    </div>
  `;

  ativarReveals(container);

  if (produtosBanner.length > 1) {
    nav.style.display = "flex";
    contador.textContent = `${indiceBanner + 1} / ${produtosBanner.length}`;
  } else {
    nav.style.display = "none";
  }
}

async function carregarBannerHero() {
  try {
    produtosBanner = await listarBannerHero();
    indiceBanner = 0;
    renderizarBanner();
  } catch (erro) {
    console.error("Erro ao carregar banner:", erro);
    document.getElementById("highlight-conteudo").innerHTML =
      `<p class="catalogo-vazio">Não foi possível carregar esta seção agora.</p>`;
  }
}

document.getElementById("highlight-prev")?.addEventListener("click", () => {
  indiceBanner = (indiceBanner - 1 + produtosBanner.length) % produtosBanner.length;
  renderizarBanner();
});

document.getElementById("highlight-next")?.addEventListener("click", () => {
  indiceBanner = (indiceBanner + 1) % produtosBanner.length;
  renderizarBanner();
});

// ── Inicialização ──────────────────────────────────────────────────────────
iniciarCarrosselAnuncio();
carregarGaleriaIphones();
carregarDestaques();
carregarProdutosHome();
carregarCategoriasVisuais();
carregarBannerHero();
