// ── Interface compartilhada da loja — Amira ─────────────────────────────
// Comportamentos da casca (cabeçalho, busca, abertura, transições) que
// valem em todas as páginas. Direção em docs/design.md.
//
// Regras:
// • Nada aqui bloqueia o conteúdo. A abertura some sozinha em ~2,6s (ou no
//   primeiro clique/tecla) e só aparece na 1ª página da sessão — quem
//   decide é o script de partida no topo do <body> de cada página.
// • Sem JS, tudo continua visível (os estados escondidos só valem com
//   html.js, que o próprio script de partida liga).
// • Movimento reduzido: sem abertura, sem cortina, sem GSAP.

const reduzido = matchMedia("(prefers-reduced-motion: reduce)").matches;
const raiz = document.documentElement;

// O rodapé é repetido nas páginas públicas. A identificação legal fica em
// um ponto comum para todas mostrarem os mesmos dados da loja.
document.querySelectorAll(".rodape__base").forEach((base) => {
  if (base.querySelector(".rodape__empresa")) return;
  const empresa = document.createElement("p");
  empresa.className = "rodape__empresa";
  empresa.textContent = "Amira · CNPJ 68.182.038/0001-66";
  base.appendChild(empresa);
});

// ── Abertura (o sol nasce) ──────────────────────────────────────────────
const DURACAO_ABERTURA = 2600;

function encerrarAbertura() {
  const el = document.getElementById("abertura");
  if (!el || el.classList.contains("saindo")) return;
  el.classList.add("saindo");
  raiz.classList.remove("com-abertura");
  document.dispatchEvent(new CustomEvent("amira:abertura-fim"));
  setTimeout(() => el.remove(), 1200);
}

if (document.getElementById("abertura")) {
  const inicio = performance.now();
  const restante = () => Math.max(0, DURACAO_ABERTURA - (performance.now() - inicio));
  setTimeout(encerrarAbertura, restante());
  // pular: qualquer interação encerra na hora
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, encerrarAbertura, { once: true, passive: true })
  );
} else {
  // Sem abertura nesta página: avisa já, para o hero animar de imediato
  queueMicrotask(() => document.dispatchEvent(new CustomEvent("amira:abertura-fim")));
}

/** Promessa que resolve quando a abertura terminou (ou não existe). */
export const aberturaTerminou = new Promise((resolve) => {
  if (!document.getElementById("abertura")) return resolve();
  document.addEventListener("amira:abertura-fim", () => resolve(), { once: true });
});

setTimeout(() => raiz.classList.remove("entrando"), 800);

// ── Faixa de avisos: troca a mensagem a cada 4s ─────────────────────────
const avisos = [...document.querySelectorAll(".faixa-aviso__item")];
if (avisos.length > 1 && !reduzido) {
  let i = 0;
  setInterval(() => {
    const atual = avisos[i];
    i = (i + 1) % avisos.length;
    const prox = avisos[i];
    atual.classList.remove("ativo");
    atual.classList.add("saindo");
    prox.classList.remove("saindo");
    prox.classList.add("ativo");
    setTimeout(() => atual.classList.remove("saindo"), 650);
  }, 4000);
}

// ── Folha de busca ──────────────────────────────────────────────────────
const folha = document.getElementById("busca-folha");
const veu = document.getElementById("busca-veu");
const btnAbrir = document.getElementById("busca-abrir");
const btnFechar = document.getElementById("busca-fechar");
const campo = document.getElementById("nav-busca-input");
let focoAntes = null;

function abrirBusca() {
  if (!folha) return;
  focoAntes = document.activeElement;
  folha.classList.add("aberta");
  veu?.classList.add("aberto");
  btnAbrir?.setAttribute("aria-expanded", "true");
  setTimeout(() => campo?.focus({ preventScroll: true }), 120);
}
function fecharBusca() {
  if (!folha?.classList.contains("aberta")) return;
  folha.classList.remove("aberta");
  veu?.classList.remove("aberto");
  btnAbrir?.setAttribute("aria-expanded", "false");
  const painel = document.getElementById("busca-ao-vivo");
  if (painel) painel.hidden = true;
  if (focoAntes && typeof focoAntes.focus === "function") focoAntes.focus({ preventScroll: true });
}
btnAbrir?.addEventListener("click", abrirBusca);
btnFechar?.addEventListener("click", fecharBusca);
veu?.addEventListener("click", fecharBusca);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharBusca();
  // "/" abre a busca (atalho comum), fora de campos de texto
  if (e.key === "/" && !e.target.closest("input, textarea, select, [contenteditable]")) {
    e.preventDefault();
    abrirBusca();
  }
});
// No catálogo a busca filtra a própria grade: fecha a folha ao enviar
document.getElementById("nav-busca-form")?.addEventListener("submit", () => setTimeout(fecharBusca, 50));
// Quem já chega com ?busca= no catálogo vê o termo no campo; não abre sozinho.

// ── Contador da sacola: um pulso quando muda ────────────────────────────
const contador = document.getElementById("nav-carrinho-contador");
if (contador) {
  let anterior = contador.textContent;
  new MutationObserver(() => {
    if (contador.textContent && contador.textContent !== anterior) {
      contador.classList.remove("pulso");
      void contador.offsetWidth; // reinicia a animação
      contador.classList.add("pulso");
    }
    anterior = contador.textContent;
  }).observe(contador, { childList: true, characterData: true, subtree: true });
}

// ── Horizonte: o filete dourado se desenha quando o título entra ────────
const observaHorizonte = new IntersectionObserver((entradas) => {
  entradas.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("visible");
    observaHorizonte.unobserve(e.target);
  });
}, { threshold: 0.6 });

function ativarHorizontes(raizBusca = document) {
  raizBusca.querySelectorAll(".horizonte:not(.visible)").forEach((el) => observaHorizonte.observe(el));
}
ativarHorizontes();

// ── Esqueletos: "Carregando…" dentro de uma grade vira cards fantasmas ───
// Os scripts das páginas escrevem <p class="catalogo-loading"> enquanto
// buscam; aqui ele é trocado por cards do mesmo tamanho (sem salto de
// layout quando os produtos chegam).
const SELETOR_GRADES = ".vitrine-grid, .catalogo-grid, .products-grid, .produto-relacionados__grade";

function esqueletoPara(grade) {
  const n = grade.classList.contains("catalogo-grid") ? 8 : 4;
  const card = '<div class="esqueleto-card" aria-hidden="true"><div class="esqueleto-card__img"></div><div class="esqueleto-card__linha"></div><div class="esqueleto-card__linha"></div></div>';
  return `<div class="esqueleto" role="status" aria-label="Carregando produtos">${card.repeat(n)}</div>`;
}

function trocarCarregando(grade) {
  const aviso = grade.querySelector(":scope > .catalogo-loading");
  if (aviso) aviso.outerHTML = esqueletoPara(grade);
}

document.querySelectorAll(SELETOR_GRADES).forEach((grade) => {
  trocarCarregando(grade);
  new MutationObserver(() => trocarCarregando(grade)).observe(grade, { childList: true });
});

// Novos títulos com .horizonte que os scripts inserem (ex.: seções
// montadas depois do Firestore)
new MutationObserver((mut) => {
  for (const m of mut) {
    m.addedNodes.forEach((n) => { if (n.nodeType === 1) ativarHorizontes(n.parentNode || document); });
  }
}).observe(document.body, { childList: true, subtree: true });

// ── Cortina entre páginas ───────────────────────────────────────────────
// Um véu na cor do fundo cobre a página por ~300ms antes de navegar: a
// troca fica contínua em vez de piscar branco. Só links internos simples.
if (!reduzido) {
  const cortina = document.createElement("div");
  cortina.className = "cortina";
  cortina.setAttribute("aria-hidden", "true");
  document.body.appendChild(cortina);

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.semCortina !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // âncora
    if (/^(mailto|tel|javascript):/.test(a.getAttribute("href"))) return;
    e.preventDefault();
    cortina.classList.add("ativa");
    setTimeout(() => { location.href = url.href; }, 300);
  });
  // Voltar pelo histórico (bfcache) não pode reabrir com a cortina fechada
  window.addEventListener("pageshow", (e) => { if (e.persisted) cortina.classList.remove("ativa"); });
}

// ── Movimento (GSAP) sob demanda ────────────────────────────────────────
// Só baixa o GSAP quando a página pede ([data-movimento]) e depois que o
// navegador está livre — o conteúdo nunca espera por ele.
if (!reduzido && document.querySelector("[data-movimento]")) {
  const carregar = () => import("./movimento.js?v=20261008-editorial2").then((m) => m.iniciar()).catch((e) => console.warn("[Amira] movimento indisponível:", e));
  if ("requestIdleCallback" in window) requestIdleCallback(carregar, { timeout: 1200 });
  else setTimeout(carregar, 300);
}

// ── Trilhos horizontais: setas [data-trilho] rolam ~80% da largura ──────
document.addEventListener("click", (e) => {
  const seta = e.target.closest("[data-trilho]");
  if (!seta) return;
  const trilho = document.getElementById(seta.dataset.trilho);
  if (!trilho) return;
  trilho.scrollBy({ left: Number(seta.dataset.dir || 1) * trilho.clientWidth * 0.8, behavior: reduzido ? "auto" : "smooth" });
});

// ── Gaveta de filtros do catálogo (celular/tablet) ───────────────────────
const painelFiltros = document.getElementById("catalogo-filtros");
const abreFiltros = document.querySelector("[data-abre-filtros]");
if (painelFiltros && abreFiltros) {
  const alternar = (abrir) => {
    painelFiltros.classList.toggle("aberto", abrir);
    document.body.classList.toggle("filtros-abertos", abrir);
    abreFiltros.setAttribute("aria-expanded", String(abrir));
    if (abrir) painelFiltros.querySelector("input, button")?.focus({ preventScroll: true });
    else abreFiltros.focus({ preventScroll: true });
  };
  abreFiltros.addEventListener("click", () => alternar(!painelFiltros.classList.contains("aberto")));
  document.querySelectorAll("[data-fecha-filtros]").forEach((el) => el.addEventListener("click", () => alternar(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && painelFiltros.classList.contains("aberto")) alternar(false); });
}
