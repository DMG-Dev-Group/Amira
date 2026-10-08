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
    /* Visual editorial (docs/design.md): cartão claro no canto, filete
       dourado no topo, botões retos. Some do caminho do hero no desktop. */
    .amira-cookie-banner {
      position: fixed;
      right: var(--margem, 1.25rem);
      bottom: calc(1.25rem + env(safe-area-inset-bottom));
      z-index: 9000;
      width: min(400px, calc(100vw - 2rem));
      background: var(--porcelana, #FBF8F5);
      color: var(--tinta, #1C1411);
      border-top: 1px solid var(--ouro, #B98A2C);
      padding: 1.25rem 1.35rem 1.35rem;
      box-shadow: 0 24px 60px -24px rgba(28, 20, 17, 0.45), 0 6px 18px -8px rgba(28, 20, 17, 0.2);
      font-family: var(--f-texto, 'Jost', system-ui, sans-serif);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.4s cubic-bezier(.16,1,.3,1), transform 0.5s cubic-bezier(.16,1,.3,1);
      animation: amira-cookie-entra .7s cubic-bezier(.16,1,.3,1) 1.2s both;
    }
    @keyframes amira-cookie-entra { from { opacity: 0; transform: translateY(18px); } }
    .amira-cookie-banner[hidden] { display: none; }
    .amira-cookie-banner.saindo { opacity: 0; transform: translateY(14px); }
    body:has(.amira-cookie-banner:not([hidden]):not(.saindo)) .whatsapp-btn { opacity: 0; pointer-events: none; }
    .amira-cookie-texto {
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--tinta-2, #5F524C);
    }
    .amira-cookie-texto a { color: var(--tinta, #1C1411); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
    .amira-cookie-acoes { display: flex; gap: 0.5rem; }
    .amira-cookie-btn {
      flex: 1;
      min-height: 44px;
      font-family: inherit;
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      padding: 0 1rem;
      border-radius: 2px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    }
    .amira-cookie-btn--aceitar { background: var(--tinta, #1C1411); color: var(--porcelana, #FBF8F5); }
    .amira-cookie-btn--aceitar:hover { background: var(--marca, #8A5B4E); }
    .amira-cookie-btn--essenciais { background: transparent; color: var(--tinta, #1C1411); border-color: var(--linha-forte, #CDBDB1); }
    .amira-cookie-btn--essenciais:hover { border-color: var(--tinta, #1C1411); }
    .amira-cookie-btn:focus-visible { outline: 1.5px solid var(--ouro, #B98A2C); outline-offset: 3px; }
    @media (max-width: 520px) {
      .amira-cookie-banner { right: 0; bottom: 0; width: 100vw; padding-bottom: calc(1.25rem + env(safe-area-inset-bottom)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .amira-cookie-banner { transition-duration: 0.01ms; animation: none; }
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
