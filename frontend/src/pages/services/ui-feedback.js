// ── Feedback visual — Amira ──────────────────────────────────────────
// Baseado no visual de "Alert" do shadcn/ui: card discreto, borda 1px,
// canto arredondado, título em destaque + descrição suave.
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
  .amira-alert{display:grid;grid-template-columns:auto 1fr auto;align-items:start;column-gap:.75rem;padding:1rem 1.05rem;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text-main);font-family:'Jost',sans-serif}
  .amira-alert__icone{width:18px;height:18px;margin-top:.1rem;color:var(--text-muted)}
  .amira-alert__icone svg{width:100%;height:100%;display:block}
  .amira-alert--sucesso .amira-alert__icone{color:var(--success)}
  .amira-alert--erro .amira-alert__icone{color:var(--danger)}
  .amira-alert--info .amira-alert__icone{color:var(--gold)}
  .amira-alert__corpo{min-width:0}
  .amira-alert__titulo{font-size:.9rem;font-weight:600;line-height:1.35}
  .amira-alert--sucesso .amira-alert__titulo{color:var(--success)}
  .amira-alert--erro .amira-alert__titulo{color:var(--danger)}
  .amira-alert--info .amira-alert__titulo{color:var(--gold)}
  .amira-alert__msg{margin-top:.15rem;font-size:.84rem;line-height:1.5;color:var(--text-muted)}
  .amira-alert__fechar{width:22px;height:22px;padding:3px;border:none;background:none;color:var(--text-muted);cursor:pointer;border-radius:6px;transition:color .15s,background .15s}
  .amira-alert__fechar:hover{color:var(--text-main);background:var(--bg)}
  .amira-alert__fechar svg{width:100%;height:100%}
  .amira-toasts{position:fixed;top:4.5rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:.6rem;width:min(94vw,440px);pointer-events:none}
  .amira-toast{pointer-events:auto;box-shadow:0 14px 40px -12px rgba(0,0,0,.5),0 2px 10px rgba(0,0,0,.22);animation:amira-toast-in .3s cubic-bezier(.2,.7,.2,1) both}
  .amira-toast--saindo{animation:amira-toast-out .24s ease forwards}
  @keyframes amira-toast-in{from{opacity:0;transform:translateY(-12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes amira-toast-out{to{opacity:0;transform:translateY(-8px) scale(.98)}}
  .amira-loading{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg) 72%,transparent);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s}
  .amira-loading--on{opacity:1;visibility:visible}
  .amira-loading__box{display:flex;flex-direction:column;align-items:center;gap:1rem;padding:2rem 2.4rem;border-radius:16px;background:var(--surface);border:1px solid var(--border);box-shadow:0 20px 50px -12px rgba(0,0,0,.5)}
  .amira-loading__ring{width:38px;height:38px;border-radius:50%;border:3px solid var(--border);border-top-color:var(--gold);animation:amira-spin .8s linear infinite}
  .amira-loading__txt{font-family:'Jost',sans-serif;font-size:.85rem;letter-spacing:.04em;color:var(--text-muted)}
  @keyframes amira-spin{to{transform:rotate(360deg)}}
  .amira-dialog{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:color-mix(in srgb,var(--bg) 55%,rgba(0,0,0,.5));backdrop-filter:blur(2px);animation:amira-fade .16s ease both}
  .amira-dialog--saindo{animation:amira-fade .16s ease reverse forwards}
  .amira-dialog__box{width:min(94vw,420px);background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.5rem;box-shadow:0 24px 60px -14px rgba(0,0,0,.55);font-family:'Jost',sans-serif;animation:amira-pop .2s cubic-bezier(.2,.7,.2,1) both}
  .amira-dialog__titulo{font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:500;color:var(--text-main)}
  .amira-dialog__desc{margin-top:.5rem;font-size:.88rem;line-height:1.55;color:var(--text-muted)}
  .amira-dialog__acoes{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.5rem;flex-wrap:wrap}
  .amira-dialog__btn{font-family:'Jost',sans-serif;font-size:.82rem;font-weight:500;letter-spacing:.04em;padding:.6rem 1.1rem;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .15s,border-color .15s,opacity .15s}
  .amira-dialog__btn--ghost{background:none;border-color:var(--border);color:var(--text-main)}
  .amira-dialog__btn--ghost:hover{background:var(--bg)}
  .amira-dialog__btn--ok{background:var(--brand);color:var(--on-brand)}
  .amira-dialog__btn--ok:hover{background:var(--brand-strong)}
  .amira-dialog__btn--perigo{background:var(--danger);color:#fff}
  .amira-dialog__btn--perigo:hover{opacity:.9}
  .amira-dialog__btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  @keyframes amira-fade{from{opacity:0}to{opacity:1}}
  @keyframes amira-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
  @media (prefers-reduced-motion: reduce){.amira-toast,.amira-dialog,.amira-dialog__box{animation-duration:.01ms}}
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
  `;
  el.querySelector(".amira-alert__titulo").textContent = titulo;
  el.querySelector(".amira-alert__msg").textContent = mensagem;

  const fechar = () => {
    el.classList.add("amira-toast--saindo");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector(".amira-alert__fechar").addEventListener("click", fechar);

  garantirPilha().appendChild(el);

  let timer = setTimeout(fechar, opcoes.duracao || DURACAO[t]);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(fechar, 1800); });

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
