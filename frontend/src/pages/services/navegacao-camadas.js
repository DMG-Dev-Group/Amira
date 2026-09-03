// ── Navegação pela camada principal — Amira ──────────────────────────
// DONO ÚNICO dos três lugares onde a camada principal de filtros vira
// menu na loja:
//   1. o dropdown "Categorias" da navbar   (#dropdown-categorias-home
//                                            ou #dropdown-categorias-lista)
//   2. a lista de atalhos do rodapé         (#footer-categorias-lista)
//   3. o atalho do menu sanduíche (mobile)  (#mobile-menu-camada-links)
//
// Só a camada PRINCIPAL entra aqui — um menu com todas as camadas
// empilhadas vira uma parede de links no celular. As demais camadas só
// existem no painel de filtros do catálogo (js/produtos-catalogo.js).
//
// Antes, cada página montava esse menu do seu jeito (nav-categorias-home.js,
// o próprio catálogo, a página de iPhones). Agora é um arquivo só.

import { listarCamadas, camadaPrincipal } from "./camadas.js";
import { escapeHtml } from "./seguranca.js";

const ALVOS_DROPDOWN = ["dropdown-categorias-home", "dropdown-categorias-lista"];
const ALVO_RODAPE = "footer-categorias-lista";
const ALVO_MOBILE = "mobile-menu-camada-links";

function linkCatalogo(camadaSlug, opcaoSlug) {
  return `produtos.html?${encodeURIComponent(camadaSlug)}=${encodeURIComponent(opcaoSlug)}`;
}

function preencherDropdowns(camada) {
  const itens = camada.opcoes
    .map((op) => `<li><a href="${linkCatalogo(camada.slug, op.slug)}">${escapeHtml(op.nome)}</a></li>`)
    .join("");

  ALVOS_DROPDOWN.forEach((id) => {
    const lista = document.getElementById(id);
    if (lista) lista.insertAdjacentHTML("afterbegin", itens);
  });

  const rodape = document.getElementById(ALVO_RODAPE);
  if (rodape) rodape.insertAdjacentHTML("afterbegin", itens);
}

function preencherMobile(camada) {
  const alvo = document.getElementById(ALVO_MOBILE);
  if (!alvo) return;

  alvo.innerHTML = camada.opcoes
    .map((op) => `
      <a href="${linkCatalogo(camada.slug, op.slug)}" class="mobile-menu-link mobile-menu-sublink">
        ${escapeHtml(op.nome)}
      </a>`)
    .join("");
}

async function montar() {
  const temAlgumAlvo =
    ALVOS_DROPDOWN.some((id) => document.getElementById(id)) ||
    document.getElementById(ALVO_RODAPE) ||
    document.getElementById(ALVO_MOBILE);

  if (!temAlgumAlvo) return;

  try {
    const principal = camadaPrincipal(await listarCamadas());
    if (!principal || principal.opcoes.length === 0) return;
    preencherDropdowns(principal);
    preencherMobile(principal);
  } catch (erro) {
    console.error("Não foi possível montar o menu de camadas:", erro);
  }
}

montar();
