// ── Sidebar do Painel Admin ──────────────────────────────────────────────
// Montada via JS para evitar duplicar o mesmo HTML em cada página do
// painel. Marca o item ativo conforme a página atual. No mobile, vira uma
// barra superior com um botão hambúrguer que abre a navegação em dropdown.

const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "") || "index";

const itensMenu = [
  { id: "index", href: "index.html", label: "Dashboard" },
  { id: "produtos", href: "produtos.html", label: "Produtos" },
  { id: "categorias", href: "categorias.html", label: "Categorias" },
  { id: "pedidos", href: "pedidos.html", label: "Pedidos" },
  { id: "revendedores", href: "revendedores.html", label: "Revendedores" }
];

function montarSidebar() {
  const container = document.getElementById("admin-sidebar-slot");
  if (!container) return;

  container.innerHTML = `
    <aside class="admin-sidebar" id="admin-sidebar">
      <div class="admin-sidebar-top">
        <div class="admin-logo">
          <a href="../index.html" class="admin_logo_nome">Amira</a>
          <small>Painel Admin</small>
        </div>
        <button class="admin-sidebar-toggle" id="admin-sidebar-toggle" aria-label="Abrir menu" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
      <nav class="admin-nav">
        ${itensMenu.map((item) => `
          <a href="${item.href}" class="${item.id === paginaAtual ? "active" : ""}">
            ${item.label}
          </a>
        `).join("")}
      </nav>
      <div class="admin-sidebar-rodape">
        <a href="../index.html">← Voltar para a loja</a>
        <a href="#" id="admin-btn-logout">Sair da conta</a>
        <div class="admin-tema-wrap">
          <button id="theme-toggle-admin" class="theme-toggle" aria-label="Alternar tema claro e escuro">
            <span class="theme-icon theme-icon--moon">🌙</span>
            <span class="theme-icon theme-icon--sun">☀️</span>
            <span class="theme-toggle__circle"></span>
          </button>
        </div>
      </div>
    </aside>
  `;

  // O switch de tema é ligado por services/tema.js, que roda DEPOIS deste
  // script (ordem dos <script> na página) — o botão precisa existir antes.

  const sidebar = document.getElementById("admin-sidebar");
  const toggle = document.getElementById("admin-sidebar-toggle");

  if (sidebar && toggle) {
    toggle.addEventListener("click", () => {
      const aberto = sidebar.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(aberto));
    });

    // Fecha o menu ao navegar para outra página do painel (mobile)
    sidebar.querySelectorAll(".admin-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        sidebar.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
}

montarSidebar();
