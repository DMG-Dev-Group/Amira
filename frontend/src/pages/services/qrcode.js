// ── QR Code — Amira ────────────────────────────────────────────────────
// Desenha o código do pedido como QR, em SVG, sem nenhuma dependência: o
// site não tem build, e uma biblioteca de CDN viraria requisição externa
// e entrada nova na CSP. (Substituiu um Code 39 escrito aqui do mesmo
// jeito — QR lê de qualquer ângulo e pela câmera do celular.)
//
// Escopo de propósito ENXUTO, para caber em código auditável:
//   • modo BYTE, com o texto em UTF-8
//   • nível de correção M (recupera ~15% do símbolo danificado — bom
//     para papel de balcão, que amassa e mancha)
//   • versões 1 a 6 (até 106 bytes) — o código de retirada tem 10
//     caracteres, então sobra folga. O corte na 6 é de propósito: a
//     partir da 7 o símbolo carrega dois blocos de "informação de
//     versão" que este gerador não desenha. Precisar de mais que 108
//     bytes um dia significa implementar isso — não é só mexer na tabela.
//
// Referência: ISO/IEC 18004. Os nomes das etapas seguem a norma para
// quem for conferir depois: codificação → blocos → Reed-Solomon →
// intercalação → desenho → máscara → informação de formato.

// ── Tabelas da norma (nível M) ─────────────────────────────────────────
// [codewords de dados, codewords de correção por bloco, blocos do grupo 1,
//  dados por bloco do grupo 1, blocos do grupo 2, dados por bloco do grupo 2]
import { escapeHtml } from "./seguranca.js";

const VERSOES_M = {
  1:  [16,  10, 1, 16, 0, 0],
  2:  [28,  16, 1, 28, 0, 0],
  3:  [44,  26, 1, 44, 0, 0],
  4:  [64,  18, 2, 32, 0, 0],
  5:  [86,  24, 2, 43, 0, 0],
  6:  [108, 16, 4, 27, 0, 0]
};

// Centros dos padrões de alinhamento por versão (a v1 não tem nenhum).
const ALINHAMENTO = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34]
};

// ── Aritmética em GF(256), base do Reed-Solomon ────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function tabelasGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinômio gerador do campo, fixado na norma
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiplicar(a, b) {
  return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Polinômio gerador de grau `grau`. */
function polinomioGerador(grau) {
  let g = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      // O array é do MAIOR grau para o menor: g[0] é o coeficiente de
      // x^n. Multiplicar por x mantém o índice; multiplicar pela raiz
      // α^i desce um grau, ou seja, anda um índice para a direita.
      novo[j] ^= g[j];
      novo[j + 1] ^= multiplicar(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

/** Codewords de correção de erro de um bloco. */
function correcao(dados, quantidade) {
  const gerador = polinomioGerador(quantidade);
  const resto = new Array(quantidade).fill(0);
  for (const byte of dados) {
    const fator = byte ^ resto[0];
    resto.shift();
    resto.push(0);
    if (fator !== 0) {
      for (let i = 0; i < quantidade; i++) resto[i] ^= multiplicar(gerador[i + 1], fator);
    }
  }
  return resto;
}

// ── Codificação dos dados ──────────────────────────────────────────────
function menorVersao(tamanho) {
  for (let v = 1; v <= 6; v++) {
    // 4 bits do indicador de modo + 8 ou 16 bits do contador + os dados
    const bitsContador = 8; // versões 1–9 usam 8 bits no modo byte
    if (VERSOES_M[v][0] * 8 >= 4 + bitsContador + tamanho * 8) return v;
  }
  return null;
}

function codewordsDeDados(bytes, versao) {
  const [totalDados] = VERSOES_M[versao];
  const bits = [];
  const empurrar = (valor, quantos) => {
    for (let i = quantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  empurrar(0b0100, 4);                          // modo byte
  empurrar(bytes.length, 8); // contador de caracteres (8 bits até a v9)
  for (const b of bytes) empurrar(b, 8);

  // terminador (até 4 bits) e alinhamento em byte
  for (let i = 0; i < 4 && bits.length < totalDados * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  // preenchimento alternado definido pela norma
  const ENCHIMENTO = [0xec, 0x11];
  let k = 0;
  while (codewords.length < totalDados) codewords.push(ENCHIMENTO[k++ % 2]);
  return codewords;
}

/** Intercala blocos de dados e de correção, como a norma manda. */
function sequenciaFinal(codewords, versao) {
  const [, ecPorBloco, g1, d1, g2, d2] = VERSOES_M[versao];

  const blocos = [];
  let pos = 0;
  for (let i = 0; i < g1; i++) { blocos.push(codewords.slice(pos, pos + d1)); pos += d1; }
  for (let i = 0; i < g2; i++) { blocos.push(codewords.slice(pos, pos + d2)); pos += d2; }

  const blocosEc = blocos.map((b) => correcao(b, ecPorBloco));

  const saida = [];
  const maiorBloco = Math.max(...blocos.map((b) => b.length));
  for (let i = 0; i < maiorBloco; i++) {
    for (const b of blocos) if (i < b.length) saida.push(b[i]);
  }
  for (let i = 0; i < ecPorBloco; i++) {
    for (const b of blocosEc) saida.push(b[i]);
  }
  return saida;
}

// ── Desenho da matriz ──────────────────────────────────────────────────
function matrizVazia(lado) {
  return Array.from({ length: lado }, () => new Array(lado).fill(null));
}

function porPadraoFixo(m, lado, versao) {
  const marcar = (linha, coluna, valor) => {
    if (linha >= 0 && linha < lado && coluna >= 0 && coluna < lado) m[linha][coluna] = valor;
  };

  // os três localizadores dos cantos, com a faixa de separação
  for (const [ly, lx] of [[0, 0], [0, lado - 7], [lado - 7, 0]]) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const borda = y === -1 || y === 7 || x === -1 || x === 7;
        const anel = y === 0 || y === 6 || x === 0 || x === 6;
        const miolo = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        marcar(ly + y, lx + x, borda ? 0 : (anel || miolo ? 1 : 0));
      }
    }
  }

  // padrões de alinhamento (não entram por cima dos localizadores)
  const centros = ALINHAMENTO[versao];
  for (const cy of centros) {
    for (const cx of centros) {
      const noLocalizador =
        (cy <= 8 && cx <= 8) || (cy <= 8 && cx >= lado - 9) || (cy >= lado - 9 && cx <= 8);
      if (noLocalizador) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const borda = Math.abs(y) === 2 || Math.abs(x) === 2;
          marcar(cy + y, cx + x, borda || (y === 0 && x === 0) ? 1 : 0);
        }
      }
    }
  }

  // linhas de sincronismo
  for (let i = 8; i < lado - 8; i++) {
    const valor = i % 2 === 0 ? 1 : 0;
    m[6][i] = valor;
    m[i][6] = valor;
  }

  // módulo escuro fixo
  m[lado - 8][8] = 1;

  // reserva das áreas de informação de formato (preenchidas no fim)
  for (let i = 0; i <= 8; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][lado - 1 - i] === null) m[8][lado - 1 - i] = 0;
    if (m[lado - 1 - i][8] === null) m[lado - 1 - i][8] = 0;
  }
}

/** Onde os dados NÃO podem entrar (tudo que os padrões fixos ocuparam). */
function mapaReservado(lado, versao) {
  const reserva = matrizVazia(lado);
  porPadraoFixo(reserva, lado, versao);
  return reserva.map((linha) => linha.map((v) => v !== null));
}

function colocarDados(m, reservado, lado, bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let i = 0;
  let subindo = true;
  for (let coluna = lado - 1; coluna > 0; coluna -= 2) {
    if (coluna === 6) coluna--; // a coluna 6 é toda sincronismo
    for (let passo = 0; passo < lado; passo++) {
      const linha = subindo ? lado - 1 - passo : passo;
      for (const c of [coluna, coluna - 1]) {
        if (reservado[linha][c]) continue;
        m[linha][c] = i < bits.length ? bits[i] : 0;
        i++;
      }
    }
    subindo = !subindo;
  }
}

const MASCARAS = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0
];

/** Penalidade de leitura de uma matriz já mascarada (regras 1 a 4). */
function penalidade(m, lado) {
  let total = 0;

  // 1) sequências de 5+ módulos iguais, em linha e em coluna
  for (let i = 0; i < lado; i++) {
    for (const pegar of [(j) => m[i][j], (j) => m[j][i]]) {
      let repetidos = 1;
      for (let j = 1; j < lado; j++) {
        if (pegar(j) === pegar(j - 1)) repetidos++;
        else { if (repetidos >= 5) total += 3 + (repetidos - 5); repetidos = 1; }
      }
      if (repetidos >= 5) total += 3 + (repetidos - 5);
    }
  }

  // 2) blocos 2x2 de mesma cor
  for (let l = 0; l < lado - 1; l++) {
    for (let c = 0; c < lado - 1; c++) {
      const v = m[l][c];
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) total += 3;
    }
  }

  // 3) padrão parecido com localizador (1:1:3:1:1 com faixa clara)
  const ALVO_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const ALVO_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < lado; i++) {
    for (let j = 0; j <= lado - 11; j++) {
      for (const pegar of [(k) => m[i][j + k], (k) => m[j + k][i]]) {
        let casaA = true, casaB = true;
        for (let k = 0; k < 11; k++) {
          const v = pegar(k);
          if (v !== ALVO_A[k]) casaA = false;
          if (v !== ALVO_B[k]) casaB = false;
        }
        if (casaA) total += 40;
        if (casaB) total += 40;
      }
    }
  }

  // 4) desequilíbrio entre claro e escuro
  let escuros = 0;
  for (let l = 0; l < lado; l++) for (let c = 0; c < lado; c++) escuros += m[l][c];
  const proporcao = (escuros * 100) / (lado * lado);
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

  return total;
}

/** 15 bits de informação de formato: nível M + máscara, com BCH e XOR. */
function bitsDeFormato(mascara) {
  const dados = (0b00 << 3) | mascara; // 00 = nível M
  let bch = dados << 10;
  for (let i = 14; i >= 10; i--) {
    if ((bch >> i) & 1) bch ^= 0b10100110111 << (i - 10);
  }
  return ((dados << 10) | bch) ^ 0b101010000010010;
}

function gravarFormato(m, lado, mascara) {
  const bits = bitsDeFormato(mascara);
  const bit = (i) => (bits >> i) & 1;

  // Cópia 1, em volta do localizador de cima à esquerda.
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);

  // Cópia 2, dividida entre os outros dois localizadores.
  for (let i = 0; i <= 7; i++) m[8][lado - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) m[lado - 15 + i][8] = bit(i);

  m[lado - 8][8] = 1; // módulo escuro, sempre
}

/**
 * Gera a matriz de módulos do QR (true = escuro).
 * @param {string} texto
 * @returns {boolean[][]|null} null se o texto não couber
 */
export function matrizQr(texto) {
  // UTF-8 no texto INTEIRO. Misturar (Latin-1 no que cabe, UTF-8 no
  // resto) produz uma sequência que não é nenhum dos dois: o leitor
  // decodifica e devolve lixo. Leitor moderno detecta UTF-8 sozinho.
  const bytes = Array.from(new TextEncoder().encode(String(texto ?? "")));
  if (bytes.length === 0) return null;

  const versao = menorVersao(bytes.length);
  if (!versao) return null;

  const lado = 17 + versao * 4;
  const sequencia = sequenciaFinal(codewordsDeDados(bytes, versao), versao);
  const reservado = mapaReservado(lado, versao);

  let melhor = null;
  let melhorNota = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const m = matrizVazia(lado);
    porPadraoFixo(m, lado, versao);
    colocarDados(m, reservado, lado, sequencia);
    for (let l = 0; l < lado; l++) {
      for (let c = 0; c < lado; c++) {
        if (!reservado[l][c] && MASCARAS[mascara](l, c)) m[l][c] ^= 1;
      }
    }
    gravarFormato(m, lado, mascara);

    const nota = penalidade(m, lado);
    if (nota < melhorNota) { melhorNota = nota; melhor = m; }
  }

  return melhor.map((linha) => linha.map((v) => v === 1));
}

const MARGEM = 4; // "zona quieta" exigida pela norma, em módulos

/**
 * Gera o SVG de um QR Code.
 *
 * O desenho sai em módulos (1 unidade = 1 módulo) e o tamanho real fica
 * por conta do CSS — mesmo acerto do código de barras: com largura fixa
 * no SVG e no CSS, o navegador reescalava e as bordas saíam tortas.
 *
 * @param {string} texto
 * @param {string} [rotulo] descrição para leitor de tela
 * @returns {string} markup <svg> pronto para innerHTML
 */
export function svgQrCode(texto, rotulo) {
  const matriz = matrizQr(texto);
  if (!matriz) return "";

  const lado = matriz.length;
  const total = lado + MARGEM * 2;

  // Um <rect> por sequência horizontal de módulos escuros, em vez de um
  // por módulo: mesmo desenho, com uma fração dos nós.
  const partes = [];
  for (let l = 0; l < lado; l++) {
    let inicio = -1;
    for (let c = 0; c <= lado; c++) {
      const escuro = c < lado && matriz[l][c];
      if (escuro && inicio === -1) inicio = c;
      if (!escuro && inicio !== -1) {
        partes.push(`<rect x="${inicio + MARGEM}" y="${l + MARGEM}" width="${c - inicio}" height="1"/>`);
        inicio = -1;
      }
    }
  }

  const descricao = escapeHtml(rotulo || `QR Code ${texto}`);
  return `<svg class="qr" viewBox="0 0 ${total} ${total}" role="img" aria-label="${descricao}"
    shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${partes.join("")}</svg>`;
}
