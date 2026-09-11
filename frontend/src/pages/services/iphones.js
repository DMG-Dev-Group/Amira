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
//
// ⚠️ AS DUAS LINHAS SÃO INDEPENDENTES. Perfumaria e iPhones não se
// misturam em nenhuma vitrine: quem é da seção de iPhones NÃO aparece no
// catálogo (produtos.html), nem em "Nossos produtos", nem em "Os mais
// amados", nem nos menus de categoria — só no carrossel da home e em
// iphones.html. Quem faz esse corte são filtrarProdutosPerfumaria() e
// opcoesSemIphone(), chamadas em cada vitrine da linha de perfumaria.

import { listarCamadas, camadaPrincipal } from "./camadas.js";
import { listarProdutos, filtrosDoProduto } from "./produtos.js";

/** Slug usado como referência quando não há opção de iPhone cadastrada. */
export const SLUG_IPHONE_PADRAO = "iphones";

/** O slug (ou nome) pertence à seção de iPhones? */
export function slugEhIphone(valor) {
  return String(valor || "").toLowerCase().startsWith("iphone");
}

// ── Divisão interna da seção: aparelhos x acessórios ───────────────────
// Dentro da seção existem duas prateleiras diferentes: os APARELHOS e os
// ACESSÓRIOS (capa, cabo, película…). A distinção é por nome da opção:
// qualquer opção da seção que fale em "acessório" cai na segunda.
//
// Para a loja: crie DUAS opções na camada principal, ambas começando com
// "iphone" (é o prefixo que define a seção):
//   • "iPhones"             → aparelhos
//   • "iPhones — Acessórios" → acessórios
export const GRUPO_APARELHOS = "aparelhos";
export const GRUPO_ACESSORIOS = "acessorios";

/** A opção da seção de iPhones é de acessório? */
export function ehAcessorioIphone(valor) {
  return /acess/i.test(String(valor || ""));
}

/** Em qual prateleira da seção esta opção entra. */
export function grupoDaOpcao(opcao) {
  return ehAcessorioIphone(opcao?.slug) || ehAcessorioIphone(opcao?.nome)
    ? GRUPO_ACESSORIOS
    : GRUPO_APARELHOS;
}

/** Em qual prateleira o produto entra (aparelhos é o padrão). */
export function grupoDoProduto(produto, camadas) {
  const principal = camadaPrincipal(camadas);
  const slugs = principal ? (filtrosDoProduto(produto, principal.slug)[principal.slug] || []) : [];
  const daSecao = slugs.filter(slugEhIphone);

  // olha primeiro pelos slugs marcados; cai no nome da opção quando o slug
  // não denuncia (ex.: slug "iphone-2" com nome "iPhones — Acessórios")
  if (daSecao.some(ehAcessorioIphone)) return GRUPO_ACESSORIOS;

  const opcoes = principal?.opcoes || [];
  const casadas = opcoes.filter((o) => daSecao.includes(o.slug));
  if (casadas.some((o) => ehAcessorioIphone(o.nome))) return GRUPO_ACESSORIOS;

  return GRUPO_APARELHOS;
}

/**
 * Separa os produtos da seção nas duas prateleiras.
 * @returns {{aparelhos: Array, acessorios: Array}}
 */
export function agruparIphones(produtos, camadas) {
  const daSecao = filtrarProdutosIphone(produtos, camadas);
  const grupos = { [GRUPO_APARELHOS]: [], [GRUPO_ACESSORIOS]: [] };
  for (const p of daSecao) grupos[grupoDoProduto(p, camadas)].push(p);
  return { aparelhos: grupos[GRUPO_APARELHOS], acessorios: grupos[GRUPO_ACESSORIOS] };
}

/** Opções da camada principal que formam a seção de iPhones. */
export async function listarOpcoesIphone(camadas = null) {
  const lista = camadas || (await listarCamadas());
  const principal = camadaPrincipal(lista);
  if (!principal) return [];
  return principal.opcoes.filter((o) => slugEhIphone(o.slug) || slugEhIphone(o.nome));
}

/**
 * O produto pertence à seção de iPhones? (aparelho OU acessório)
 * Puro — é o predicado que separa as duas linhas da loja, e tanto a
 * vitrine de iPhones quanto as de perfumaria decidem por ele.
 */
export function produtoEhIphone(produto, camadas) {
  const principalSlug = camadaPrincipal(camadas)?.slug || null;
  const doProduto = filtrosDoProduto(produto, principalSlug);
  const naPrincipal = principalSlug ? (doProduto[principalSlug] || []) : [];
  return naPrincipal.some(slugEhIphone) || slugEhIphone(produto.categoria);
}

/**
 * Filtra uma lista de produtos já carregada, ficando só com os da seção
 * de iPhones. Puro — o painel admin reaproveita sem refazer a busca.
 */
export function filtrarProdutosIphone(produtos, camadas) {
  return produtos.filter((p) => produtoEhIphone(p, camadas));
}

/**
 * O complemento: só a linha de PERFUMARIA. É o que toda vitrine de
 * perfume (catálogo, "Nossos produtos", destaques) precisa chamar para os
 * aparelhos não vazarem para o meio dos perfumes.
 */
export function filtrarProdutosPerfumaria(produtos, camadas) {
  return produtos.filter((p) => !produtoEhIphone(p, camadas));
}

/**
 * Opções da camada principal que NÃO são da seção de iPhones — os menus
 * de categoria e o painel de filtros do catálogo montam a partir daqui.
 * Sem isso, "iPhones" apareceria como categoria de perfumaria e levaria a
 * um catálogo vazio, já que o catálogo não mostra mais esses produtos.
 */
export function opcoesSemIphone(opcoes) {
  return (opcoes || []).filter((o) => !slugEhIphone(o.slug) && !slugEhIphone(o.nome));
}

/**
 * Todos os produtos ativos da seção de iPhones.
 * @param {Array|null} camadas  passe as camadas já carregadas para
 *   economizar uma leitura (a home carrega uma vez e reaproveita).
 */
export async function listarProdutosIphone(camadas = null) {
  const [lista, produtos] = await Promise.all([
    camadas ? Promise.resolve(camadas) : listarCamadas(),
    listarProdutos()
  ]);
  return filtrarProdutosIphone(produtos, lista);
}
