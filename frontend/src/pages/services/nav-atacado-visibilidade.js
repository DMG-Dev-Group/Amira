// ── Visibilidade do "Atacado" na navbar ────────────────────────────────────
// O botão aparece para TODO MUNDO (A5) — inclusive visitantes sem conta —
// DESDE QUE o modo atacado esteja ligado (configuracoes/atacado.ativo).
// Ponto único de controle: a página de atacado é quem explica, conforme o
// status de cada um, o que falta para liberar a compra.

import { atacadoEstaAtivo } from "./atacado-config.js";

const alvos = [
  document.getElementById("nav-btn-atacado"),
  document.getElementById("mobile-nav-atacado")
].filter(Boolean);

if (alvos.length) {
  atacadoEstaAtivo()
    .then((ativo) => {
      alvos.forEach((el) => { el.style.display = ativo ? "" : "none"; });
    })
    .catch(() => {
      // Em erro, mantém o botão visível (o padrão é atacado ligado).
    });
}
