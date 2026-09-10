// ── Feedback visual — Amira ──────────────────────────────────────────
// Toasts (avisos pop-up) e overlay de carregamento, no visual da loja.
// Substitui os "textinhos escondidos" abaixo dos formulários.
//
//   import { toast, carregando } from "../services/ui-feedback.js";
//   toast("Conta criada!", "sucesso");
//   toast("E-mail ou senha incorretos.", "erro");
//   const fim = carregando("Entrando...");  ... fim();

const ICONES = {
  sucesso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  erro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5"/><path d="M12 8h.01"/></svg>'
};

const DURACAO = { sucesso: 3500, info: 4000, erro: 6000 };

let pilha = null;

function garantirPilha() {
  if (pilha && document.body.contains(pilha)) return pilha;
  pilha = document.createElement("div");
  pilha.className = "amira-toasts";
  pilha.setAttribute("role", "status");
  pilha.setAttribute("aria-live", "polite");
  document.body.appendChild(pilha);
  return pilha;
}

/**
 * Mostra um aviso pop-up.
 * @param {string} mensagem  texto simples (não HTML)
 * @param {"sucesso"|"erro"|"info"} tipo
 * @param {{ duracao?: number }} [opcoes]
 */
export function toast(mensagem, tipo = "info", opcoes = {}) {
  if (!mensagem) return;
  const t = ICONES[tipo] ? tipo : "info";
  const el = document.createElement("div");
  el.className = `amira-toast amira-toast--${t}`;
  el.innerHTML = `
    <span class="amira-toast__icone">${ICONES[t]}</span>
    <span class="amira-toast__msg"></span>
    <button class="amira-toast__fechar" aria-label="Fechar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".amira-toast__msg").textContent = mensagem;

  const fechar = () => {
    el.classList.add("amira-toast--saindo");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    // fallback caso a animação não dispare (reduced-motion)
    setTimeout(() => el.remove(), 400);
  };

  el.querySelector(".amira-toast__fechar").addEventListener("click", fechar);

  garantirPilha().appendChild(el);

  let timer = setTimeout(fechar, opcoes.duracao || DURACAO[t]);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(fechar, 1500); });

  return fechar;
}

let overlay = null;
let contadorCarregando = 0;

/**
 * Mostra um overlay de carregamento. Retorna uma função para removê-lo.
 * Aninha: só some quando todas as chamadas terminarem.
 * @param {string} [texto]
 * @returns {() => void}
 */
export function carregando(texto = "Carregando…") {
  contadorCarregando++;
  if (!overlay || !document.body.contains(overlay)) {
    overlay = document.createElement("div");
    overlay.className = "amira-loading";
    overlay.innerHTML = `
      <div class="amira-loading__box">
        <span class="amira-loading__ring"></span>
        <span class="amira-loading__txt"></span>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector(".amira-loading__txt").textContent = texto;
  overlay.classList.add("amira-loading--on");

  let encerrado = false;
  return function fim() {
    if (encerrado) return;
    encerrado = true;
    contadorCarregando = Math.max(0, contadorCarregando - 1);
    if (contadorCarregando === 0 && overlay) {
      overlay.classList.remove("amira-loading--on");
    }
  };
}
