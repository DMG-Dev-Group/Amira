// ── Consentimento de cookies (LGPD) — Amira ─────────────────────────────
// Banner de primeira visita: a pessoa "Aceita todos" ou usa "Só
// essenciais". A escolha fica em localStorage. Os cookies/armazenamento
// ESSENCIAIS (login, tema, carrinho, esta própria escolha) não dependem
// de consentimento; os ANALÍTICOS (contagem de visitas — services/
// registrar-visita-auto.js) só rodam se a pessoa aceitar.
//
// Este arquivo injeta o próprio HTML e CSS para funcionar em qualquer
// página sem precisar editar cada HTML/CSS da loja.
//
// API pública:
//   consentiuAnalytics()        -> boolean
//   abrirGerenciadorCookies()   -> reabre o banner (link "Cookies" do rodapé)
// Evento em window: "amira:consentimento" quando a escolha muda.

const CHAVE = "amiraConsentimentoCookies";
const VERSAO_POLITICA = "2026-09-03";
const LINK_POLITICA = "privacidade.html#cookies";

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (typeof dados.analiticos !== "boolean") return null;
    return dados;
  } catch {
    return null;
  }
}

function salvar(analiticos) {
  const dados = { analiticos, versao: VERSAO_POLITICA, em: new Date().toISOString() };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // localStorage indisponível — a escolha vale só para esta navegação.
  }
  window.dispatchEvent(new CustomEvent("amira:consentimento", { detail: dados }));
  return dados;
}

/** A pessoa autorizou as métricas analíticas? */
export function consentiuAnalytics() {
  return ler()?.analiticos === true;
}

// ── UI ─────────────────────────────────────────────────────────────────
let elementoBanner = null;

function injetarEstilo() {
  if (document.getElementById("amira-cookie-estilo")) return;
  const estilo = document.createElement("style");
  estilo.id = "amira-cookie-estilo";
  estilo.textContent = `
    .amira-cookie-banner {
      position: fixed;
      left: 50%;
      bottom: 1rem;
      transform: translateX(-50%) translateY(0);
      z-index: 9000;
      width: min(680px, calc(100vw - 2rem));
      background: #241A17;
      color: #FEF5EF;
      border: 1px solid rgba(236, 193, 160, 0.28);
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      font-family: 'Jost', system-ui, sans-serif;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1.25rem;
      opacity: 1;
      transition: opacity 0.28s ease, transform 0.28s ease;
    }
    .amira-cookie-banner[hidden] { display: none; }
    .amira-cookie-banner.saindo {
      opacity: 0;
      transform: translateX(-50%) translateY(12px);
    }
    .amira-cookie-texto {
      flex: 1 1 260px;
      font-size: 0.86rem;
      line-height: 1.55;
      color: rgba(254, 245, 239, 0.82);
    }
    .amira-cookie-texto a { color: #ECC1A0; }
    .amira-cookie-acoes {
      display: flex;
      gap: 0.55rem;
      flex-wrap: wrap;
    }
    .amira-cookie-btn {
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 0.6rem 1.1rem;
      border-radius: 7px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: opacity 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }
    .amira-cookie-btn--aceitar { background: #8A5B4E; color: #FEF5EF; }
    .amira-cookie-btn--aceitar:hover { background: #75463B; }
    .amira-cookie-btn--essenciais {
      background: transparent;
      color: #FEF5EF;
      border-color: rgba(236, 193, 160, 0.4);
    }
    .amira-cookie-btn--essenciais:hover { border-color: #ECC1A0; }
    .amira-cookie-btn:focus-visible { outline: 2px solid #ECC1A0; outline-offset: 2px; }
    @media (max-width: 520px) {
      .amira-cookie-banner { bottom: 0; border-radius: 12px 12px 0 0; width: 100vw; }
      .amira-cookie-acoes, .amira-cookie-btn { width: 100%; }
      .amira-cookie-btn { text-align: center; }
    }
    @media (prefers-reduced-motion: reduce) {
      .amira-cookie-banner { transition-duration: 0.01ms; }
    }
  `;
  document.head.appendChild(estilo);
}

function fecharComAnimacao() {
  if (!elementoBanner) return;
  elementoBanner.classList.add("saindo");
  setTimeout(() => {
    elementoBanner?.remove();
    elementoBanner = null;
  }, 300);
}

function montarBanner() {
  if (elementoBanner) return;
  injetarEstilo();

  elementoBanner = document.createElement("div");
  elementoBanner.className = "amira-cookie-banner";
  elementoBanner.setAttribute("role", "dialog");
  elementoBanner.setAttribute("aria-label", "Aviso de cookies e privacidade");
  elementoBanner.innerHTML = `
    <p class="amira-cookie-texto">
      Usamos cookies essenciais para o site funcionar e, com a sua autorização, cookies
      analíticos para entender as visitas. Veja a
      <a href="${LINK_POLITICA}">Política de Privacidade e Cookies</a>.
    </p>
    <div class="amira-cookie-acoes">
      <button type="button" class="amira-cookie-btn amira-cookie-btn--essenciais" data-escolha="essenciais">Só essenciais</button>
      <button type="button" class="amira-cookie-btn amira-cookie-btn--aceitar" data-escolha="aceitar">Aceitar todos</button>
    </div>
  `;

  elementoBanner.querySelectorAll("[data-escolha]").forEach((btn) => {
    btn.addEventListener("click", () => {
      salvar(btn.dataset.escolha === "aceitar");
      fecharComAnimacao();
    });
  });

  document.body.appendChild(elementoBanner);
}

/** Reabre o banner para a pessoa rever a escolha (link "Cookies" no rodapé). */
export function abrirGerenciadorCookies() {
  montarBanner();
}

// Liga qualquer elemento com [data-abrir-cookies] para reabrir o banner
// (ex.: link "Cookies" no rodapé), sem cada página precisar importar nada.
function ligarGatilhos() {
  document.querySelectorAll("[data-abrir-cookies]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      abrirGerenciadorCookies();
    });
  });
}

function iniciar() {
  ligarGatilhos();
  if (!ler()) montarBanner(); // banner só na primeira visita (sem escolha salva)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar, { once: true });
} else {
  iniciar();
}
