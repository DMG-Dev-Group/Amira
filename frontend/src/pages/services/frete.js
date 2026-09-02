// ── Serviço de Frete — Amira ──────────────────────────────────────
// A loja fica no Monumental Shopping (Renascença) e entrega SOMENTE dentro
// de São Luís - MA. Sem API paga de transportadora: o frete é calculado por
// zona da cidade (distância aproximada até a loja) + peso do pedido.
//
// ⚠️ Os valores abaixo são ESTIMATIVAS DE PARTIDA. Miguel: ajuste os preços
// em ZONAS e FAIXAS_PESO conforme sua realidade (gasolina, motoboy, etc.)
// — é só editar os números, a lógica não precisa mudar.

export const TAXA_RETIRADA_LOJA = 0;

// Zonas por proximidade ao Monumental Shopping (Renascença).
// "valorBase" é o frete para até 1kg; pedidos mais pesados somam FAIXAS_PESO.
export const ZONAS = [
  {
    id: "zona1",
    nome: "Renascença e proximidades",
    valorBase: 8,
    bairros: [
      "renascença", "renascenca", "renascença ii", "renascenca ii",
      "ponta d'areia", "ponta d areia", "ponta da areia",
      "calhau", "jardim renascença", "jardim renascenca",
      "jardim são cristóvão", "jardim sao cristovao",
      "ponta do farol", "ponta farol", "ponta d'areia"
    ]
  },
  {
    id: "zona2",
    nome: "Cohama, Vinhais e entorno",
    valorBase: 12,
    bairros: [
      "cohama", "cohafuma", "jaracaty", "jaracati",
      "jardim são francisco", "jardim sao francisco", "são francisco", "sao francisco",
      "monte castelo", "madre deus", "vinhais", "recanto dos vinhais",
      "fátima", "fatima"
    ]
  },
  {
    id: "zona3",
    nome: "Centro e região",
    valorBase: 15,
    bairros: [
      "centro", "joão paulo", "joao paulo", "cohab", "cohab anil",
      "cohab anil iv", "liberdade", "olho d'água", "olho dagua", "olho d agua",
      "desterro", "praia grande", "são francisco centro"
    ]
  },
  {
    id: "zona4",
    nome: "Cohatrac, Turu e adjacências",
    valorBase: 18,
    bairros: [
      "cohatrac", "cohatrac i", "cohatrac ii", "cohatrac iii", "cohatrac iv",
      "turu", "conjunto habitacional turu", "coroado", "coroadinho",
      "jardim america", "jardim américa", "cohajap", "cohaserma"
    ]
  },
  {
    id: "zona5",
    nome: "Itaqui, Anil e demais bairros",
    valorBase: 24,
    bairros: [
      "itaqui", "anil", "cruzeiro do anil", "cutim", "cutim anil",
      "maiobinha", "maiobão", "maiobao", "pedrinhas", "forquilha",
      "ipase", "jabaquara", "coroado", "diamante", "filipinho"
    ]
  }
];

// Adicional por faixa de peso do pedido inteiro (em gramas).
const FAIXAS_PESO = [
  { limiteAteGramas: 1000, adicional: 0 },
  { limiteAteGramas: 3000, adicional: 5 },
  { limiteAteGramas: 6000, adicional: 10 },
  { limiteAteGramas: Infinity, adicional: 18 }
];

/**
 * Identifica a zona a partir do nome do bairro (texto livre digitado ou
 * vindo do ViaCEP). Faz comparação simples ignorando acentos/maiúsculas.
 * Retorna null se não encontrar — nesse caso, a loja deve avaliar manualmente.
 */
export function identificarZona(bairro) {
  if (!bairro) return null;
  const normalizado = bairro
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  for (const zona of ZONAS) {
    const encontrou = zona.bairros.some((b) => {
      const bNormalizado = b.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normalizado.includes(bNormalizado) || bNormalizado.includes(normalizado);
    });
    if (encontrou) return zona;
  }
  return null;
}

function adicionalPorPeso(pesoTotalGramas) {
  const faixa = FAIXAS_PESO.find((f) => pesoTotalGramas <= f.limiteAteGramas);
  return faixa ? faixa.adicional : FAIXAS_PESO[FAIXAS_PESO.length - 1].adicional;
}

/**
 * Calcula o frete final.
 * @param {string} bairro - bairro de entrega (digitado ou do ViaCEP)
 * @param {number} pesoTotalGramas - soma do peso de todos os itens do carrinho
 * @returns {{ valor: number, zona: object|null, encontrado: boolean }}
 */
export function calcularFrete(bairro, pesoTotalGramas = 0) {
  const zona = identificarZona(bairro);

  if (!zona) {
    // Bairro não mapeado: usamos a zona mais cara como estimativa segura,
    // e marcamos encontrado:false para a UI avisar que será confirmado.
    const zonaPadrao = ZONAS[ZONAS.length - 1];
    return {
      valor: zonaPadrao.valorBase + adicionalPorPeso(pesoTotalGramas),
      zona: null,
      encontrado: false
    };
  }

  return {
    valor: zona.valorBase + adicionalPorPeso(pesoTotalGramas),
    zona,
    encontrado: true
  };
}
