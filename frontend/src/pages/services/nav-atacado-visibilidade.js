// ── Botão "Atacado" na navbar ───────────────────────────────────────────────
// O botão aparece para TODO MUNDO (A5) — inclusive visitantes sem conta.
// A página de atacado é quem explica, conforme o status de cada um, o que
// falta para liberar a compra (CNPJ, aprovação etc.). Manter este arquivo
// (mesmo simples) preserva o ponto único de controle caso a visibilidade
// volte a depender de regra no futuro.

const botaoAtacado = document.getElementById("nav-btn-atacado");

if (botaoAtacado) {
  botaoAtacado.style.display = "";
}
