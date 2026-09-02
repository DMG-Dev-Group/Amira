// ── Seção de iPhones — Amira ───────────────────────────────────────────────
// Os iPhones não são um tipo de dado novo: são produtos comuns da coleção
// "produtos", marcados com uma CATEGORIA cujo slug contém "iphone". Isso
// mantém o painel admin, o carrinho, os pedidos e o frete funcionando sem
// nenhuma alteração — muda só onde eles aparecem na loja.
//
// Para a loja cadastrar: criar a categoria "iPhones" em Admin > Categorias
// (o slug sai automaticamente como "iphones") e escolher essa categoria ao
// cadastrar cada aparelho em Admin > Produtos.
//
// O reconhecimento é por PREFIXO para não quebrar se a loja preferir nomes
// como "iPhone Seminovos" ou "iPhones Lacrados" — todas essas categorias
// aparecem na seção.

import { listarCategorias } from "./categorias.js";
import { listarProdutos } from "./produtos.js";

/** Slug usado quando ainda não existe nenhuma categoria de iPhone cadastrada. */
export const SLUG_IPHONE_PADRAO = "iphones";

/** A categoria pertence à seção de iPhones? (slug ou nome começando com "iphone") */
export function ehCategoriaIphone(categoria) {
  const slug = (categoria?.slug || "").toLowerCase();
  const nome = (categoria?.nome || "").toLowerCase();
  return slug.startsWith("iphone") || nome.startsWith("iphone");
}

/** Categorias cadastradas que formam a seção de iPhones. */
export async function listarCategoriasIphone() {
  const todas = await listarCategorias();
  return todas.filter(ehCategoriaIphone);
}

/**
 * Todos os produtos ativos da seção de iPhones.
 * Sem categoria cadastrada ainda, tenta o slug padrão — assim a seção já
 * funciona se a loja tiver marcado produtos antes de criar a categoria.
 */
export async function listarProdutosIphone() {
  const categorias = await listarCategoriasIphone();
  const slugs = categorias.length > 0
    ? categorias.map((c) => c.slug)
    : [SLUG_IPHONE_PADRAO];

  const listas = await Promise.all(slugs.map((slug) => listarProdutos({ categoria: slug })));

  // Um produto só tem uma categoria, mas a deduplicação protege caso duas
  // categorias de iPhone acabem com o mesmo slug por engano.
  const porId = new Map();
  listas.flat().forEach((p) => porId.set(p.id, p));
  return [...porId.values()];
}
