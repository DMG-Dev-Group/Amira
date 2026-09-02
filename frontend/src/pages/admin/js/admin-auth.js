// ── Proteção de acesso + logout — Painel Admin ─────────────────────────────
// Usado em toda página do painel: garante que só quem tem role "admin"
// acesse, e liga o botão de logout da sidebar.

import { exigirAdmin, logoutUsuario } from "../../services/auth.js";

/**
 * Protege a página atual e executa o callback quando confirmado que o
 * usuário é admin. Substitui o conteúdo por uma tela de "acesso negado"
 * brevemente antes de redirecionar, caso não seja admin.
 */
export function protegerPaginaAdmin(callback) {
  return exigirAdmin(({ usuario, perfil }) => {
    callback({ usuario, perfil });

    // Liga o botão de logout da sidebar (montada por admin-sidebar.js,
    // que roda antes deste script na ordem de <script> da página).
    const btnLogout = document.getElementById("admin-btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", async (evento) => {
        evento.preventDefault();
        const confirmar = confirm("Deseja sair do painel administrativo?");
        if (confirmar) {
          await logoutUsuario();
          window.location.href = "../index.html";
        }
      });
    }
  }, "../login.html");
}
