import { observarAuth } from "./auth.js";
import { obterCarrinho } from "./carrinho.js";

const slot = document.getElementById("nav-carrinho-slot");
const mobileLink = document.getElementById("mobile-nav-carrinho");
const mobileBadge = document.getElementById("mobile-carrinho-badge");

if (slot || mobileLink) {
  observarAuth(async ({ usuario }) => {
    if (!usuario) {
      if (slot) slot.innerHTML = "";
      if (mobileLink) mobileLink.style.display = "none";
      return;
    }

    let quantidadeTotal = 0;
    try {
      const itens = await obterCarrinho(usuario.uid);
      quantidadeTotal = itens.reduce((soma, i) => soma + i.quantidade, 0);
    } catch (erro) {
      console.error("Erro ao carregar contador do carrinho:", erro);
    }

    if (slot) {
      slot.innerHTML = `
        <a href="carrinho.html" class="nav-carrinho-btn" aria-label="Ver carrinho">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          ${quantidadeTotal > 0 ? `<span class="nav-carrinho-contador">${quantidadeTotal}</span>` : ""}
        </a>
      `;
    }

    if (mobileLink) {
      mobileLink.style.display = "flex";
      if (mobileBadge) {
        mobileBadge.textContent = quantidadeTotal > 0 ? String(quantidadeTotal) : "";
        mobileBadge.style.display = quantidadeTotal > 0 ? "flex" : "none";
      }
    }
  });
}
