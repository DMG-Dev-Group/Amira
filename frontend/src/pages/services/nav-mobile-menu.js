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

  // Categorias expande os atalhos no próprio painel; os demais links fecham
  // o menu porque iniciam uma navegação.
  panel.querySelectorAll("a.mobile-menu-link").forEach((link) => {
    if (link.classList.contains("mobile-menu-category-toggle")) {
      link.addEventListener("click", (evento) => {
        evento.preventDefault();
        const grupo = link.closest(".mobile-menu-category-group");
        const aberto = grupo.classList.toggle("open");
        link.setAttribute("aria-expanded", String(aberto));
      });
      return;
    }

    link.addEventListener("click", fechar);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fechar();
  });
}
