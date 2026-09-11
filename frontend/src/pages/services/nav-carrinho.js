// ── Contador do carrinho na navbar ─────────────────────────────────────
// O ÍCONE é HTML estático (está no markup de cada página, ao lado de
// Atacado e iPhones). Antes este módulo criava o ícone inteiro, mas só
// depois de o Firebase responder — ele aparecia atrasado, "pulando" na
// barra enquanto o botão de iPhones já estava lá desde o primeiro
// desenho. Aqui só o NÚMERO é dinâmico.
//
// O ícone aparece para todo mundo, inclusive quem não entrou: adicionar
// ao carrinho já exige login em toda a loja, e clicar deslogado leva
// para o login — o mesmo caminho de antes, sem o ícone piscando.

import { observarAuth } from "./auth.js";
import { obterCarrinho } from "./carrinho.js";

const contador = document.getElementById("nav-carrinho-contador");
const mobileLink = document.getElementById("mobile-nav-carrinho");
const mobileBadge = document.getElementById("mobile-carrinho-badge");

function pintar(quantidade) {
  if (contador) {
    contador.textContent = quantidade > 0 ? String(quantidade) : "";
    contador.hidden = quantidade <= 0;
  }
  if (mobileBadge) {
    mobileBadge.textContent = quantidade > 0 ? String(quantidade) : "";
    mobileBadge.style.display = quantidade > 0 ? "flex" : "none";
  }
}

if (contador || mobileLink) {
  observarAuth(async ({ usuario }) => {
    if (!usuario) {
      // O link do menu lateral continua escondido para quem não entrou —
      // lá o espaço é de uma lista, não da barra, e não há "pulo".
      if (mobileLink) mobileLink.style.display = "none";
      pintar(0);
      return;
    }

    if (mobileLink) mobileLink.style.display = "flex";

    try {
      const itens = await obterCarrinho(usuario.uid);
      pintar(itens.reduce((soma, i) => soma + i.quantidade, 0));
    } catch (erro) {
      console.error("Erro ao carregar contador do carrinho:", erro);
      pintar(0);
    }
  });
}
