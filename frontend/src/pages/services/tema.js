// ── Tema claro/escuro — Amira ───────────────────────────────────────
// Único responsável pelo switch de tema em TODAS as páginas (loja, atacado
// e painel admin). Antes, essa lógica vivia em script.js — que era incluído
// como script clássico apesar de conter `export`, o que quebrava com
// SyntaxError e deixava o switch morto fora da home (A6).
//
// Funciona com qualquer botão que tenha a classe .theme-toggle e aplica
// body[data-theme="light"|"dark"], que o CSS usa para trocar as variáveis
// de cor (B4/B5). A escolha fica salva em localStorage.

const CHAVE_TEMA = "amiraTheme";
// Chave usada antes do rebrand — lida uma única vez para migrar a escolha
// de quem já tinha visitado o site; depois disso só a chave nova é usada.
const CHAVE_TEMA_LEGADA = "floraTheme";

function aplicarTema(tema) {
  document.body.dataset.theme = tema;
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.classList.toggle("active", tema === "light");
  });
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // localStorage indisponível — o tema só não persiste entre páginas.
  }
}

function temaInicial() {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA) ?? localStorage.getItem(CHAVE_TEMA_LEGADA);
    if (salvo === "light" || salvo === "dark") return salvo;
  } catch {
    // segue para a preferência do sistema
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

document.querySelectorAll(".theme-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const proximo = document.body.dataset.theme === "light" ? "dark" : "light";
    aplicarTema(proximo);
  });
});

aplicarTema(temaInicial());
