// ── Código de barras (Code 39) — Amira ────────────────────────────────
// Desenha o código do pedido como barras, em SVG, sem nenhuma dependência.
//
// Por que Code 39: o nosso código de retirada é "AMR-XXXXXX" — letras
// maiúsculas, dígitos e hífen, que é EXATAMENTE o alfabeto do Code 39.
// Ele também dispensa dígito verificador, então cabe em ~40 linhas e
// qualquer leitor de balcão lê. (Code 128 seria mais compacto, mas exige
// checksum e três tabelas.)
//
// Cada caractere vira 9 elementos alternando barra/espaço (5 barras + 4
// espaços), sendo 3 deles largos. "1" = elemento largo, "0" = estreito.
// O caractere "*" delimita início e fim.

const PADROES = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
  "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101",
  "8": "100100100", "9": "001100100", "A": "100001001", "B": "001001001",
  "C": "101001000", "D": "000011001", "E": "100011000", "F": "001011000",
  "G": "000001101", "H": "100001100", "I": "001001100", "J": "000011100",
  "K": "100000011", "L": "001000011", "M": "101000010", "N": "000010011",
  "O": "100010010", "P": "001010010", "Q": "000000111", "R": "100000110",
  "S": "001000110", "T": "000010110", "U": "110000001", "V": "011000001",
  "W": "111000000", "X": "010010001", "Y": "110010000", "Z": "011010000",
  "-": "010000101", ".": "110000100", " ": "011000100", "$": "010101000",
  "/": "010100010", "+": "010001010", "%": "000101010", "*": "010010100"
};

const ESTREITA = 2;   // px por módulo estreito
const LARGA = ESTREITA * 3;
const ALTURA = 56;

/**
 * Gera o SVG de um código de barras Code 39.
 * Caracteres fora do alfabeto são descartados (o código do pedido nunca
 * tem nenhum, mas evita SVG quebrado se alguém passar outra coisa).
 *
 * @param {string} texto
 * @returns {string} markup <svg> pronto para innerHTML
 */
export function svgCodigoBarras(texto) {
  const limpo = String(texto || "").toUpperCase().split("").filter((c) => PADROES[c]).join("");
  if (!limpo) return "";

  const sequencia = `*${limpo}*`;
  const barras = [];
  let x = 0;

  for (const caractere of sequencia) {
    const padrao = PADROES[caractere];
    for (let i = 0; i < padrao.length; i++) {
      const largura = padrao[i] === "1" ? LARGA : ESTREITA;
      // índices pares são barra, ímpares são espaço
      if (i % 2 === 0) barras.push(`<rect x="${x}" y="0" width="${largura}" height="${ALTURA}"/>`);
      x += largura;
    }
    x += ESTREITA; // espaço separador entre caracteres
  }

  const largura = x;
  return `<svg class="cb" viewBox="0 0 ${largura} ${ALTURA}" width="${largura}" height="${ALTURA}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="Código de barras ${limpo}"
    xmlns="http://www.w3.org/2000/svg" fill="currentColor">${barras.join("")}</svg>`;
}
