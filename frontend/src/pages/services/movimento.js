// ── Movimento autoral (GSAP) — Amira ────────────────────────────────────
// Carregado sob demanda pelo services/interface.js, só em páginas com
// [data-movimento] e sem prefers-reduced-motion. Tudo aqui é camada por
// cima de um conteúdo que JÁ está visível: se o GSAP não carregar, nada
// some e nada quebra.
//
// Ganchos no HTML:
//   data-movimento="hero"       título do hero entra palavra a palavra
//                               (depois da abertura); foto e texto fazem
//                               parallax ao rolar
//   data-movimento="parallax"   imagem desliza devagar dentro da moldura
//   data-movimento="essencia"   frasco 3D gira com o scroll, com texto breve

import { aberturaTerminou } from "./interface.js";

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

// Quebra o texto de um elemento em palavras animáveis, preservando <em>
// e <br> (o título do hero vem do admin com *palavra* → <em>).
function quebrarEmPalavras(el) {
  if (el.dataset.quebrado) return el.querySelectorAll(".palavra__dentro");
  const embrulhar = (no) => {
    if (no.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      no.textContent.split(/(\s+)/).forEach((parte) => {
        if (!parte) return;
        if (/^\s+$/.test(parte)) { frag.appendChild(document.createTextNode(parte)); return; }
        const fora = document.createElement("span");
        fora.className = "palavra";
        const dentro = document.createElement("span");
        dentro.className = "palavra__dentro";
        dentro.textContent = parte;
        fora.appendChild(dentro);
        frag.appendChild(fora);
      });
      no.replaceWith(frag);
    } else if (no.nodeType === Node.ELEMENT_NODE && no.tagName !== "BR") {
      [...no.childNodes].forEach(embrulhar);
    }
  };
  [...el.childNodes].forEach(embrulhar);
  el.dataset.quebrado = "1";
  return el.querySelectorAll(".palavra__dentro");
}

// 3D só onde faz sentido: tela grande, ponteiro fino, sem economia de dados
function aparelhoAguenta3D() {
  const conexao = navigator.connection || {};
  if (conexao.saveData || /2g/.test(conexao.effectiveType || "")) return false;
  if (!matchMedia("(min-width: 900px) and (pointer: fine)").matches) return false;
  if ((navigator.hardwareConcurrency || 4) < 4) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export async function iniciar() {
  await carregarScript("vendor/gsap.min.js");
  await carregarScript("vendor/ScrollTrigger.min.js");
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "expo.out", duration: 1.1 });
  document.documentElement.classList.add("com-gsap");

  iniciarHero(gsap);
  iniciarParallax(gsap);
  iniciarEssencia(gsap, ScrollTrigger);

  // Conteúdo que chega depois (Firestore) muda alturas: recalcula gatilhos
  let espera;
  new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(() => ScrollTrigger.refresh(), 200); })
    .observe(document.body);
}

// ── Hero ────────────────────────────────────────────────────────────────
function iniciarHero(gsap) {
  const hero = document.querySelector('[data-movimento="hero"]');
  if (!hero) return;
  let animado = false;

  const animarTitulo = async () => {
    if (animado) return;
    const titulo = hero.querySelector(".hero-title");
    if (!titulo) return;
    animado = true;
    const palavras = quebrarEmPalavras(titulo);
    const apoio = hero.querySelectorAll(".hero-subtitle, .hero-acoes, .hero-rotulo, .hero-indicadores");
    await aberturaTerminou;
    gsap.fromTo(palavras, { yPercent: 110 }, { yPercent: 0, duration: 1.3, stagger: 0.07, delay: 0.1 });
    gsap.fromTo(apoio, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.1, delay: 0.55 });
  };

  // O título do painel pode chegar depois do GSAP; animamos o texto final.
  // O prazo de reserva cobre páginas offline em que o HTML inicial fica.
  document.addEventListener("amira:hero-atualizado", animarTitulo, { once: true });
  if (hero.querySelectorAll(".hero-slide").length > 1) animarTitulo();
  else setTimeout(animarTitulo, 2400);

  // Parallax de saída: a foto afunda devagar e o texto some ao rolar
  gsap.to(hero.querySelector(".hero-carrossel-trilho"), {
    yPercent: 18, ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
  });
  gsap.to(hero.querySelector(".hero-conteudo") || {}, {
    autoAlpha: 0, y: -40, ease: "none",
    scrollTrigger: { trigger: hero, start: "35% top", end: "80% top", scrub: true },
  });
}

// ── Parallax de imagens editoriais ──────────────────────────────────────
function iniciarParallax(gsap) {
  const alvos = () => document.querySelectorAll('[data-movimento="parallax"]:not([data-parallax-ok])');
  const ligar = () => alvos().forEach((el) => {
    el.dataset.parallaxOk = "1";
    gsap.fromTo(el, { yPercent: -6 }, {
      yPercent: 6, ease: "none",
      scrollTrigger: { trigger: el.parentElement || el, start: "top bottom", end: "bottom top", scrub: true },
    });
  });
  ligar();
  // imagens montadas depois (banner "Produto da estação")
  new MutationObserver(ligar).observe(document.body, { childList: true, subtree: true });
}

// ── "Sua essência": uma pausa editorial curta com o frasco 3D ──────────
function iniciarEssencia(gsap, ScrollTrigger) {
  const secao = document.querySelector('[data-movimento="essencia"]');
  if (!secao) return;
  const frases = secao.querySelectorAll(".essencia__frase");
  const palco = secao.querySelector(".essencia__palco");
  let frasco = null;

  frases.forEach((f, i) => {
    gsap.from(f, {
      opacity: 0.25, y: 24, delay: i * 0.08, duration: 0.9,
      scrollTrigger: { trigger: secao, start: "top 78%", once: true },
    });
  });
  const giro = ScrollTrigger.create({
    trigger: secao,
    start: "top bottom",
    end: "bottom top",
    onUpdate: (st) => frasco?.definirProgresso(st.progress),
  });

  if (palco && aparelhoAguenta3D()) {
    import("../vendor/frasco-3d.js")
      .then(({ montarFrasco }) => {
        frasco = montarFrasco(palco);
        palco.classList.add("com-3d");           // esconde a foto de reserva
        frasco.definirProgresso(giro.progress);
      })
      .catch((e) => console.warn("[Amira] frasco 3D indisponível:", e));
  }
  ScrollTrigger.refresh();
}
