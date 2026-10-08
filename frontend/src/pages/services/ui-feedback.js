// ── Feedback visual — Amira ──────────────────────────────────────────
// Visual da direção editorial (docs/design.md): toast é uma placa escura no
// rodapé da tela com o horizonte dourado marcando o tempo; diálogo com
// título em Bodoni e filete dourado no topo.
//
//   import { toast, carregando, confirmar } from "../services/ui-feedback.js";
//   toast("Conta criada com sucesso.", "sucesso");
//   toast("E-mail ou senha incorretos.", "erro", { titulo: "Não deu certo" });
//   const fim = carregando("Entrando…");  ... fim();
//   if (await confirmar({ titulo: "Sair da conta?", confirmar: "Sair" })) { ... }

const ICONES = {
  sucesso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  erro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5"/><path d="M12 8h.01"/></svg>'
};

const TITULO_PADRAO = { sucesso: "Tudo certo", erro: "Ops", info: "Atenção" };
const DURACAO = { sucesso: 3800, info: 4500, erro: 6500 };

const IC_FECHAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

// CSS injetado uma vez — funciona em qualquer página (loja ou admin),
// independente de qual folha de estilo está carregada. Usa os tokens de
// cor (--surface, --border, --gold, --success, --danger…).
(function injetarEstilo() {
  if (document.getElementById("amira-ui-feedback-css")) return;
  const s = document.createElement("style");
  s.id = "amira-ui-feedback-css";
  s.textContent = `
  .amira-alert{display:grid;grid-template-columns:auto 1fr auto;align-items:start;column-gap:.85rem;padding:1rem 1.1rem;border:1px solid var(--linha,#E5DAD1);border-radius:2px;background:var(--porcelana,#FBF8F5);color:var(--tinta,#1C1411);font-family:var(--f-texto,'Jost',sans-serif)}
  .amira-alert__icone{width:18px;height:18px;margin-top:.15rem;color:var(--tinta-2,#5F524C)}
  .amira-alert__icone svg{width:100%;height:100%;display:block}
  .amira-alert--sucesso .amira-alert__icone{color:var(--sucesso,#2F6B45)}
  .amira-alert--erro .amira-alert__icone{color:var(--perigo,#A3362B)}
  .amira-alert--info .amira-alert__icone{color:var(--ouro,#B98A2C)}
  .amira-alert__corpo{min-width:0}
  .amira-alert__titulo{font-size:.6875rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;line-height:1.4}
  .amira-alert__msg{margin-top:.2rem;font-size:.9rem;line-height:1.5;color:var(--tinta-2,#5F524C)}
  .amira-alert__fechar{width:28px;height:28px;padding:5px;margin:-4px -4px 0 0;border:none;background:none;color:inherit;opacity:.6;cursor:pointer;border-radius:2px;transition:opacity .18s}
  .amira-alert__fechar:hover{opacity:1}
  .amira-alert__fechar svg{width:100%;height:100%}
  /* Toast: placa escura no rodapé da tela, com o horizonte dourado marcando o tempo */
  .amira-toasts{position:fixed;left:50%;bottom:calc(1.5rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column-reverse;gap:.6rem;width:min(92vw,420px);pointer-events:none}
  .amira-toast{position:relative;overflow:hidden;pointer-events:auto;background:var(--tinta,#1C1411);color:var(--porcelana,#FBF8F5);border-color:transparent;box-shadow:0 24px 60px -24px rgba(28,20,17,.55),0 6px 18px -8px rgba(28,20,17,.3);animation:amira-toast-in .55s cubic-bezier(.16,1,.3,1) both}
  .amira-toast .amira-alert__msg{color:color-mix(in srgb,var(--porcelana,#FBF8F5) 78%,transparent)}
  .amira-toast.amira-alert--info .amira-alert__icone,.amira-toast .amira-alert__titulo{color:inherit}
  .amira-toast.amira-alert--sucesso .amira-alert__icone{color:#9FD3A8}
  .amira-toast.amira-alert--erro .amira-alert__icone{color:#F4A094}
  .amira-toast__tempo{position:absolute;left:0;bottom:0;height:1px;width:100%;background:var(--ouro-claro,#E2B84F);transform-origin:left;animation:amira-toast-tempo var(--duracao,4s) linear forwards}
  .amira-toast:hover .amira-toast__tempo{animation-play-state:paused}
  .amira-toast--saindo{animation:amira-toast-out .3s cubic-bezier(.65,0,.35,1) forwards}
  @keyframes amira-toast-in{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes amira-toast-out{to{opacity:0;transform:translateY(10px) scale(.98)}}
  @keyframes amira-toast-tempo{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  /* Carregando: o sol da marca pulsando sobre um véu */
  .amira-loading{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--porcelana,#FBF8F5) 80%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s}
  .amira-loading--on{opacity:1;visibility:visible}
  .amira-loading__box{display:flex;flex-direction:column;align-items:center;gap:1.1rem}
  .amira-loading__ring{width:64px;height:34px;background:var(--ouro,#B98A2C);-webkit-mask:url("/images/sol.svg") center/contain no-repeat;mask:url("/images/sol.svg") center/contain no-repeat;animation:amira-sol 1.6s cubic-bezier(.65,0,.35,1) infinite}
  .amira-loading__txt{font-family:var(--f-texto,'Jost',sans-serif);font-size:.6875rem;letter-spacing:.18em;text-transform:uppercase;color:var(--tinta-2,#5F524C)}
  @keyframes amira-sol{0%,100%{opacity:.35;transform:translateY(4px)}50%{opacity:1;transform:none}}
  .amira-dialog{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:var(--veu,rgba(28,20,17,.42));-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:amira-fade .2s ease both}
  .amira-dialog--saindo{animation:amira-fade .2s ease reverse forwards}
  .amira-dialog__box{width:min(94vw,440px);background:var(--porcelana,#FBF8F5);border-top:1px solid var(--ouro,#B98A2C);padding:2rem;box-shadow:0 24px 60px -24px rgba(28,20,17,.45);font-family:var(--f-texto,'Jost',sans-serif);animation:amira-pop .45s cubic-bezier(.16,1,.3,1) both}
  .amira-dialog__titulo{font-family:var(--f-display,'Bodoni Moda',serif);font-size:1.6rem;line-height:1.15;font-weight:400;color:var(--tinta,#1C1411)}
  .amira-dialog__desc{margin-top:.75rem;font-size:.95rem;line-height:1.6;color:var(--tinta-2,#5F524C)}
  .amira-dialog__acoes{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.75rem;flex-wrap:wrap}
  .amira-dialog__btn{min-height:46px;padding:0 1.4rem;font-family:var(--f-texto,'Jost',sans-serif);font-size:.6875rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;border-radius:2px;border:1px solid transparent;cursor:pointer;transition:background-color .2s,border-color .2s,color .2s}
  .amira-dialog__btn--ghost{background:none;border-color:var(--linha-forte,#CDBDB1);color:var(--tinta,#1C1411)}
  .amira-dialog__btn--ghost:hover{border-color:var(--tinta,#1C1411)}
  .amira-dialog__btn--ok{background:var(--tinta,#1C1411);color:var(--porcelana,#FBF8F5)}
  .amira-dialog__btn--ok:hover{background:var(--marca,#8A5B4E)}
  .amira-dialog__btn--perigo{background:var(--perigo,#A3362B);color:#fff}
  .amira-dialog__btn--perigo:hover{opacity:.9}
  .amira-dialog__btn:focus-visible{outline:1.5px solid var(--ouro,#B98A2C);outline-offset:3px}
  @keyframes amira-fade{from{opacity:0}to{opacity:1}}
  @keyframes amira-pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){.amira-toast,.amira-dialog,.amira-dialog__box,.amira-loading__ring{animation-duration:.01ms}}
  `;
  (document.head || document.documentElement).appendChild(s);
})();

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
 * Aviso pop-up.
 * @param {string} mensagem  descrição (texto simples)
 * @param {"sucesso"|"erro"|"info"} tipo
 * @param {{ titulo?: string, duracao?: number }} [opcoes]
 */
export function toast(mensagem, tipo = "info", opcoes = {}) {
  if (!mensagem) return () => {};
  const t = ICONES[tipo] ? tipo : "info";
  const titulo = opcoes.titulo || TITULO_PADRAO[t];

  const el = document.createElement("div");
  el.className = `amira-alert amira-alert--${t} amira-toast`;
  el.setAttribute("role", t === "erro" ? "alert" : "status");
  el.innerHTML = `
    <span class="amira-alert__icone">${ICONES[t]}</span>
    <div class="amira-alert__corpo">
      <p class="amira-alert__titulo"></p>
      <p class="amira-alert__msg"></p>
    </div>
    <button class="amira-alert__fechar" aria-label="Fechar">${IC_FECHAR}</button>
    <span class="amira-toast__tempo" aria-hidden="true"></span>
  `;
  const duracao = opcoes.duracao || DURACAO[t];
  el.style.setProperty("--duracao", `${duracao}ms`);
  el.querySelector(".amira-alert__titulo").textContent = titulo;
  el.querySelector(".amira-alert__msg").textContent = mensagem;

  const fechar = () => {
    el.classList.add("amira-toast--saindo");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector(".amira-alert__fechar").addEventListener("click", fechar);

  garantirPilha().appendChild(el);

  // O tempo restante acompanha a barra dourada (que pausa no hover)
  let restante = duracao, inicio = Date.now();
  let timer = setTimeout(fechar, restante);
  el.addEventListener("mouseenter", () => { clearTimeout(timer); restante -= Date.now() - inicio; });
  el.addEventListener("mouseleave", () => { inicio = Date.now(); timer = setTimeout(fechar, Math.max(restante, 1200)); });

  return fechar;
}

// ── Overlay de carregamento ──────────────────────────────────────────
let overlay = null;
let contadorCarregando = 0;

/**
 * Mostra um overlay de carregamento. Retorna uma função para removê-lo.
 * Aninha: só some quando todas as chamadas terminarem.
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
    if (contadorCarregando === 0 && overlay) overlay.classList.remove("amira-loading--on");
  };
}

// ── Diálogo de confirmação (estilo AlertDialog do shadcn) ────────────
/**
 * Substitui o window.confirm() com um diálogo no visual da loja.
 * @param {{
 *   titulo?: string, descricao?: string,
 *   confirmar?: string, cancelar?: string, destrutivo?: boolean
 * }} [opcoes]
 * @returns {Promise<boolean>}
 */
export function confirmar(opcoes = {}) {
  const {
    titulo = "Tem certeza?",
    descricao = "",
    confirmar: rotuloOk = "Confirmar",
    cancelar: rotuloCancelar = "Cancelar",
    destrutivo = false
  } = opcoes;

  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "amira-dialog";
    back.innerHTML = `
      <div class="amira-dialog__box" role="alertdialog" aria-modal="true" aria-labelledby="amira-dlg-t">
        <p class="amira-dialog__titulo" id="amira-dlg-t"></p>
        ${descricao ? `<p class="amira-dialog__desc"></p>` : ""}
        <div class="amira-dialog__acoes">
          <button class="amira-dialog__btn amira-dialog__btn--ghost" data-r="0"></button>
          <button class="amira-dialog__btn ${destrutivo ? "amira-dialog__btn--perigo" : "amira-dialog__btn--ok"}" data-r="1"></button>
        </div>
      </div>
    `;
    back.querySelector(".amira-dialog__titulo").textContent = titulo;
    if (descricao) back.querySelector(".amira-dialog__desc").textContent = descricao;
    back.querySelector('[data-r="0"]').textContent = rotuloCancelar;
    back.querySelector('[data-r="1"]').textContent = rotuloOk;

    const fechar = (valor) => {
      back.classList.add("amira-dialog--saindo");
      setTimeout(() => back.remove(), 200);
      document.removeEventListener("keydown", onKey);
      resolve(valor);
    };
    const onKey = (e) => {
      if (e.key === "Escape") fechar(false);
      if (e.key === "Enter") fechar(true);
    };

    back.addEventListener("click", (e) => { if (e.target === back) fechar(false); });
    back.querySelectorAll("[data-r]").forEach((b) =>
      b.addEventListener("click", () => fechar(b.dataset.r === "1"))
    );
    document.addEventListener("keydown", onKey);

    document.body.appendChild(back);
    back.querySelector('[data-r="0"]').focus();
  });
}
