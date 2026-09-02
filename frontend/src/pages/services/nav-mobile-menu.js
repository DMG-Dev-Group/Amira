// ── Menu mobile (hambúrguer com ícone de usuário) ──────────────────────────
// Controla a abertura/fechamento do painel lateral exibido em telas ≤900px,
// com os atalhos de Perfil, Categorias, Contato, Carrinho e o switch de tema.

const btn = document.getElementById("mobile-menu-btn");
const panel = document.getElementById("mobile-menu-panel");
const overlay = document.getElementById("mobile-menu-overlay");
const closeBtn = document.getElementById("mobile-menu-close");

if (btn && panel && overlay) {
  const abrir = () => {
    panel.classList.add("open");
    overlay.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };

  const fechar = () => {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    btn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };

  btn.addEventListener("click", abrir);
  overlay.addEventListener("click", fechar);
  if (closeBtn) closeBtn.addEventListener("click", fechar);

  // Fecha o painel automaticamente ao navegar por um dos links (exceto o
  // botão de tema, que não deve fechar o menu ao ser clicado).
  panel.querySelectorAll("a.mobile-menu-link").forEach((link) => {
    link.addEventListener("click", fechar);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fechar();
  });
}
