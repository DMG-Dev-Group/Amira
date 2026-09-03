// ── Seção de iPhones — Amira ───────────────────────────────────────────────
// Os iPhones não são um tipo de dado novo: são produtos comuns da coleção
// "produtos", marcados na CAMADA PRINCIPAL de filtros com uma opção cujo
// slug começa com "iphone". Isso mantém o painel admin, o carrinho, os
// pedidos e o frete funcionando sem nenhuma alteração — muda só onde eles
// aparecem na loja.
//
// Para a loja cadastrar: em Admin > Camadas de filtro, adicione a opção
// "iPhones" (ou "iPhone Seminovos", "iPhones Lacrados"…) na camada
// principal e marque essa opção ao cadastrar cada aparelho em
// Admin > Produtos. O reconhecimento é por PREFIXO — todas essas opções
// entram na seção.

import { listarCamadas, camadaPrincipal } from "./camadas.js";
import { listarProdutos, filtrosDoProduto } from "./produtos.js";

/** Slug usado como referência quando não há opção de iPhone cadastrada. */
export const SLUG_IPHONE_PADRAO = "iphones";

/** O slug (ou nome) pertence à seção de iPhones? */
export function slugEhIphone(valor) {
  return String(valor || "").toLowerCase().startsWith("iphone");
}

/** Opções da camada principal que formam a seção de iPhones. */
export async function listarOpcoesIphone(camadas = null) {
  const lista = camadas || (await listarCamadas());
  const principal = camadaPrincipal(lista);
  if (!principal) return [];
  return principal.opcoes.filter((o) => slugEhIphone(o.slug) || slugEhIphone(o.nome));
}

/**
 * Filtra uma lista de produtos já carregada, ficando só com os da seção
 * de iPhones. Puro — o painel admin reaproveita sem refazer a busca.
 */
export function filtrarProdutosIphone(produtos, camadas) {
  const principalSlug = camadaPrincipal(camadas)?.slug || null;
  return produtos.filter((p) => {
    const doProduto = filtrosDoProduto(p, principalSlug);
    const naPrincipal = principalSlug ? (doProduto[principalSlug] || []) : [];
    return naPrincipal.some(slugEhIphone) || slugEhIphone(p.categoria);
  });
}

/** Todos os produtos ativos da seção de iPhones. */
export async function listarProdutosIphone() {
  const [camadas, produtos] = await Promise.all([listarCamadas(), listarProdutos()]);
  return filtrarProdutosIphone(produtos, camadas);
}
