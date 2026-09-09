// ── Preço e frete no servidor ─────────────────────────────────────────
// Port CJS de frontend/src/pages/services/produtos.js (infoPreco) e
// services/frete.js (calcularFrete). É o que /api/pagamento usa para
// RECALCULAR o total antes de cobrar — não pode confiar no cliente.
//
// ⚠️ MANTER EM SINCRONIA com aqueles dois arquivos. Se a regra de
// desconto ou a tabela de frete mudar lá, mudar aqui também.

// ── Preço de exibição de um produto (com desconto do admin) ────────────
function precoFinal(produto, modo) {
  if (modo === "atacado") {
    return Number(produto.precoAtacado) || 0;
  }
  const base = Number(produto.precoVarejo) || 0;
  const pct = Number(produto.descontoPercentual) || 0;
  if (produto.descontoAtivo === true && pct >= 1 && pct <= 90) {
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

// ── Frete por zona de São Luís (cópia de services/frete.js) ────────────
const ZONAS = [
  { nome: "Renascença e proximidades", valorBase: 8, bairros: ["renascenca", "renascenca ii", "ponta d areia", "ponta da areia", "calhau", "jardim renascenca", "jardim sao cristovao", "ponta do farol", "ponta farol"] },
  { nome: "Cohama, Vinhais e entorno", valorBase: 12, bairros: ["cohama", "cohafuma", "jaracaty", "jaracati", "jardim sao francisco", "sao francisco", "monte castelo", "madre deus", "vinhais", "recanto dos vinhais", "fatima"] },
  { nome: "Centro e região", valorBase: 15, bairros: ["centro", "joao paulo", "cohab", "cohab anil", "cohab anil iv", "liberdade", "olho dagua", "olho d agua", "desterro", "praia grande"] },
  { nome: "Cohatrac, Turu e adjacências", valorBase: 18, bairros: ["cohatrac", "cohatrac i", "cohatrac ii", "cohatrac iii", "cohatrac iv", "turu", "coroado", "coroadinho", "jardim america", "cohajap", "cohaserma"] },
  { nome: "Itaqui, Anil e demais bairros", valorBase: 24, bairros: ["itaqui", "anil", "cruzeiro do anil", "cutim", "cutim anil", "maiobinha", "maiobao", "pedrinhas", "forquilha", "ipase", "jabaquara", "diamante", "filipinho"] }
];

const FAIXAS_PESO = [
  { limiteAteGramas: 1000, adicional: 0 },
  { limiteAteGramas: 3000, adicional: 5 },
  { limiteAteGramas: 6000, adicional: 10 },
  { limiteAteGramas: Infinity, adicional: 18 }
];

function normalizar(txt) {
  return String(txt || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function adicionalPorPeso(pesoGramas) {
  const faixa = FAIXAS_PESO.find((f) => pesoGramas <= f.limiteAteGramas);
  return faixa ? faixa.adicional : FAIXAS_PESO[FAIXAS_PESO.length - 1].adicional;
}

function calcularFrete(bairro, pesoGramas) {
  const alvo = normalizar(bairro);
  const zona = alvo
    ? ZONAS.find((z) => z.bairros.some((b) => alvo.includes(b) || b.includes(alvo)))
    : null;
  const base = zona ? zona.valorBase : ZONAS[ZONAS.length - 1].valorBase; // zona não mapeada = a mais cara
  return {
    valor: base + adicionalPorPeso(Number(pesoGramas) || 0),
    zonaNome: zona ? zona.nome : null,
    encontrado: Boolean(zona)
  };
}

module.exports = { precoFinal, calcularFrete };
