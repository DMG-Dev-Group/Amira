import { observarAuth } from "./auth.js";

// Cada par [link, label] representa um ponto de entrada da conta na navbar:
// o botão de conta padrão (desktop) e o item "Perfil" do menu mobile.
const alvos = [
  {
    link: document.getElementById("nav-account-btn"),
    label: document.getElementById("nav-account-label"),
  },
  {
    link: document.getElementById("mobile-nav-perfil"),
    label: document.getElementById("mobile-nav-perfil-label"),
  },
].filter((alvo) => alvo.link && alvo.label);

if (alvos.length > 0) {
  observarAuth(({ usuario, perfil }) => {
    if (!usuario) {
      alvos.forEach(({ link, label }) => {
        link.setAttribute("href", "login.html");
        label.textContent = "Entrar";
      });
      return;
    }

    const primeiroNome = (perfil?.nome || usuario.displayName || "Conta").split(" ")[0];
    const destino =
      perfil?.role === "admin" ? "admin/index.html" : "perfil.html";

    alvos.forEach(({ link, label }) => {
      link.setAttribute("href", destino);
      label.textContent = primeiroNome;
    });
  });
}
