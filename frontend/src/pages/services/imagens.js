// ── Tamanho de exibição das imagens — Amira ───────────────────────────
// As fotos enviadas pelo painel moram no ImageKit (services/imagem-upload.js)
// em tamanho cheio. O ImageKit redimensiona e converte (WebP/AVIF) na hora
// pela própria URL, então cada tela pede só o tamanho que vai desenhar:
// um card de 300 px não precisa baixar a foto de 1600 px.
//
// Imagens que NÃO são do ImageKit (data URI antigos, arquivos do próprio
// site, outros https) passam intactas — dá para migrar aos poucos.
//
// Sempre combine com urlImagemSegura()/urlFundoSegura(), que continuam
// sendo a validação de segurança:
//   urlImagemSegura(redimensionada(p.imagemURL, LARGURA.card))

/** Larguras usadas pela loja (px). ~2x o tamanho na tela, para telas retina. */
export const LARGURA = {
  icone: 160,      // busca da navbar, carrinho, meus pedidos
  card: 480,       // cards de catálogo, vitrines, carrosséis
  categoria: 640,  // capas de "Nossas categorias"
  destaque: 800,   // banner "Produto da Estação"
  galeria: 1200,   // fotos da página do produto
  fundo: 1800      // carrossel de fundo da home
};

function ehImageKit(url) {
  try {
    return new URL(url).hostname.endsWith("imagekit.io");
  } catch {
    return false;
  }
}

/**
 * URL da imagem no tamanho pedido. c-at_max: nunca aumenta uma foto menor
 * que a largura, só reduz.
 * @param {string} url
 * @param {number} largura
 */
export function redimensionada(url, largura) {
  const texto = String(url ?? "").trim();
  if (!texto || !largura || !ehImageKit(texto)) return texto;
  const separador = texto.includes("?") ? "&" : "?";
  return `${texto}${separador}tr=w-${Math.round(largura)},c-at_max`;
}
