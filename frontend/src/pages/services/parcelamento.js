// ── Parcelamento no cartão — exibição no checkout ──────────────────────
// Regra (decisão 04/09/2026): só o VALOR TOTAL do carrinho conta.
//   total  > R$ 1.000  -> só 1x sem juros
//   total <= R$ 1.000  -> até 4x sem juros
//
// ⚠️ MANTER EM SINCRONIA com api/_lib/parcelamento.js (o servidor usa a
// mesma regra ao criar a preferência do Mercado Pago).

const LIMITE_REAIS = 1000;

export function parcelasSemJuros(totalReais) {
  return Number(totalReais) > LIMITE_REAIS ? 1 : 4;
}

export function textoParcelamento(totalReais) {
  const n = parcelasSemJuros(totalReais);
  return n <= 1 ? "à vista, sem juros" : `em até ${n}x sem juros`;
}
