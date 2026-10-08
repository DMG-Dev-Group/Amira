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
//   data-movimento="code"       pausa editorial com tipografia e raios da marca

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

  iniciarProgresso(gsap, ScrollTrigger);
  iniciarHero(gsap);
  iniciarEditorial(gsap);
  iniciarParallax(gsap);
  iniciarEssencia(gsap, ScrollTrigger);

  // Conteúdo que chega depois (Firestore) muda alturas: recalcula gatilhos
  let espera;
  new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(() => ScrollTrigger.refresh(), 200); })
    .observe(document.body);
}

function iniciarProgresso(gsap, ScrollTrigger) {
  const linha = document.querySelector(".scroll-progress");
  if (!linha) return;
  gsap.to(linha, {
    scaleX: 1, ease: "none",
    scrollTrigger: { start: 0, end: () => ScrollTrigger.maxScroll(window), scrub: 0.25 },
  });
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

  // A chamada principal é fixa; o conteúdo administrável mora no quadro seguinte.
  animarTitulo();

  // Parallax de saída: a foto afunda devagar e o texto some ao rolar
  gsap.to(hero.querySelector(".hero-carrossel-trilho"), {
    yPercent: 18, ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.7 },
  });
  if (matchMedia("(min-width: 701px)").matches) {
    [
      [".campaign-hero__painel--esquerdo .campaign-hero__media", -1],
      [".campaign-hero__painel--centro .campaign-hero__media", -11],
      [".campaign-hero__painel--direito .campaign-hero__media", -2],
    ].forEach(([seletor, fim]) => {
      const media = hero.querySelector(seletor);
      if (!media) return;
      gsap.fromTo(media, { yPercent: -7 }, {
        yPercent: fim, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.9 },
      });
    });
  }
  gsap.to(hero.querySelector(".hero-conteudo") || {}, {
    autoAlpha: 0, y: -40, ease: "none",
    scrollTrigger: { trigger: hero, start: "35% top", end: "80% top", scrub: true },
  });
}

// A cadência da referência vem de revelar um plano de cada vez. Todas as
// fotografias e palavras continuam visíveis se o GSAP ou ScrollTrigger falhar.
function iniciarEditorial(gsap) {
  const entrada = (alvos, gatilho, distancia = 42) => {
    if (!alvos.length || !gatilho) return;
    gsap.fromTo(alvos,
      { autoAlpha: 0, y: distancia },
      { autoAlpha: 1, y: 0, duration: 1.15, stagger: 0.13,
        scrollTrigger: { trigger: gatilho, start: "top 82%", once: true } });
  };

  const code = document.querySelector('[data-movimento="code"]');
  if (code) {
    entrada([
      code.querySelector(".rotulo"),
      code.querySelector(".campaign-code__sinais"),
      code.querySelector("p"),
      code.querySelector(".campaign-code__sol"),
    ].filter(Boolean), code, 32);
    if (matchMedia("(min-width: 701px)").matches) {
      gsap.fromTo(code.querySelector("h2"), { autoAlpha: 0.22, scale: 0.84 }, {
        autoAlpha: 1, scale: 1, ease: "none",
        scrollTrigger: { trigger: code, start: "top 90%", end: "center 52%", scrub: 0.7 },
      });
      gsap.to(code.querySelector(".campaign-code__linha--esq"), {
        xPercent: -8, ease: "none",
        scrollTrigger: { trigger: code, start: "top bottom", end: "bottom top", scrub: true },
      });
      gsap.to(code.querySelector(".campaign-code__linha--dir"), {
        xPercent: 8, ease: "none",
        scrollTrigger: { trigger: code, start: "top bottom", end: "bottom top", scrub: true },
      });
    } else {
      entrada([code.querySelector("h2")].filter(Boolean), code, 32);
    }
  }

  const intro = document.querySelector(".campaign-intro");
  if (intro) {
    entrada([...intro.querySelectorAll(".campaign-intro__texto > *")], intro);
    const janela = intro.querySelector(".campaign-intro__janela");
    if (janela && matchMedia("(min-width: 701px)").matches) {
      gsap.fromTo(janela, { clipPath: "inset(17% 10%)" }, {
        clipPath: "inset(0% 0%)", ease: "none",
        scrollTrigger: { trigger: intro, start: "top 85%", end: "center 45%", scrub: 0.8 },
      });
    }
  }

  [".categories .secao-cabecalho", ".featured .secao-cabecalho",
    ".vitrine-produtos .secao-cabecalho", ".newsletter-content"].forEach((seletor) => {
    const alvo = document.querySelector(seletor);
    if (alvo) entrada([alvo], alvo);
  });

  const retrato = document.querySelector(".featured-editorial");
  if (retrato) {
    entrada([retrato], retrato, 60);
    if (matchMedia("(min-width: 701px)").matches) {
      gsap.fromTo(retrato, { clipPath: "inset(0 0 20% 0)" }, {
        clipPath: "inset(0 0 0% 0)", ease: "none",
        scrollTrigger: { trigger: retrato, start: "top 88%", end: "center 52%", scrub: 0.8 },
      });
      gsap.fromTo(retrato.querySelector("img"), { scale: 1.12, yPercent: -4 }, {
        scale: 1.04, yPercent: 4, ease: "none",
        scrollTrigger: { trigger: retrato, start: "top bottom", end: "bottom top", scrub: true },
      });
    }
  }

  const ligarDinamicos = () => {
    document.querySelectorAll("#grid-categorias-home .cat-card, #grid-destaques .catalogo-card, #grid-produtos-home .catalogo-card, #highlight-conteudo .highlight-visual, #highlight-conteudo .highlight-content")
      .forEach((alvo) => {
        if (alvo.dataset.entradaAtiva) return;
        alvo.dataset.entradaAtiva = "1";
        entrada([alvo], alvo, 32);
        const foto = alvo.matches(".cat-card")
          ? alvo.querySelector(".cat-imagem-generica")
          : alvo.querySelector(".catalogo-card-img, .highlight-circle");
        if (foto) {
          gsap.fromTo(foto, { clipPath: "inset(0 0 100% 0)" }, {
            clipPath: "inset(0 0 0% 0)", duration: 1.25, ease: "power3.inOut",
            scrollTrigger: { trigger: alvo, start: "top 88%", once: true },
          });
        }
      });
  };
  ligarDinamicos();
  new MutationObserver(ligarDinamicos).observe(document.body, { childList: true, subtree: true });
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
