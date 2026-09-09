// ── Regra de parcelamento SEM juros — decisão 04/09/2026 ────────────────
// Só o VALOR TOTAL do carrinho conta (sem distinção por categoria):
//   total  > R$ 1.000  -> só 1x sem juros  (juros a partir de 2x)
//   total <= R$ 1.000  -> até 4x sem juros (juros a partir de 5x)
//
// Acima do limite, o acréscimo é o da tabela do adquirente — o próprio
// Mercado Pago calcula e mostra na tela dele.
//
// ⚠️ MANTER EM SINCRONIA com frontend/src/pages/services/parcelamento.js
// (o front usa a mesma regra para exibir "em até Nx sem juros" no checkout).

const LIMITE_REAIS = 1000;

function parcelasSemJuros(totalReais) {
  return Number(totalReais) > LIMITE_REAIS ? 1 : 4;
}

module.exports = { parcelasSemJuros, LIMITE_REAIS };
