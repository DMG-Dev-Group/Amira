// ── Produtos relacionados — Amira ──────────────────────────────────────
// "Você também pode gostar" na página do produto.
//
// A relação sai dos FILTROS que o produto já tem (services/camadas.js) —
// nenhuma coleção nova, nenhum campo novo para o admin preencher. Quanto
// mais opções dois produtos compartilham, mais parecidos eles são.
//
// A camada PRINCIPAL pesa mais que as outras de propósito: dois perfumes
// árabes se parecem mais entre si do que um perfume árabe e um body
// splash que por acaso são ambos femininos.
//
// ⚠️ A separação das duas linhas vale aqui também: aparelho só sugere
// aparelho e acessório, perfume só sugere perfume. Sem isso, a página de
// um iPhone de R$ 7.500 sugeriria decant de R$ 40 (ver services/iphones.js).

import { listarProdutosPorOpcoes, filtrosDoProduto, disponivelNoModo, estoquePorModo } from "./produtos.js";
import { listarCamadas, camadaPrincipal } from "./camadas.js";
import { produtoEhIphone } from "./iphones.js";

const PESO_PRINCIPAL = 3;
const PESO_OUTRAS = 1;

// Quantos candidatos pedir ao servidor. A lista sai já restrita a quem
// divide alguma opção da camada principal com o produto (o que mais pesa
// na pontuação), então um punhado basta para escolher os `max` melhores —
// antes a seção baixava o catálogo inteiro.
const POOL_CANDIDATOS = 24;

function pontuar(produto, alvoFiltros, camadas, principalSlug) {
  const meus = filtrosDoProduto(produto, principalSlug);
  let pontos = 0;
  for (const camada of camadas) {
    const doAlvo = alvoFiltros[camada.slug] || [];
    const doOutro = meus[camada.slug] || [];
    const comuns = doOutro.filter((o) => doAlvo.includes(o)).length;
    pontos += comuns * (camada.slug === principalSlug ? PESO_PRINCIPAL : PESO_OUTRAS);
  }
  return pontos;
}

/**
 * Produtos parecidos com o dado, da mesma linha, já ordenados.
 * Devolve menos que `max` quando não há candidatos suficientes — a
 * página esconde a seção nesse caso, em vez de completar com qualquer um.
 *
 * @param {object} produto
 * @param {number} [max]
 * @returns {Promise<Array>}
 */
export async function produtosRelacionados(produto, max = 4) {
  const camadas = await listarCamadas();
  const principalSlug = camadaPrincipal(camadas)?.slug || null;
  const alvoFiltros = filtrosDoProduto(produto, principalSlug);
  const alvoEhIphone = produtoEhIphone(produto, camadas);

  // a camada principal primeiro; sem nada marcado nela, a 1ª que tiver
  const camadaBusca = [principalSlug, ...camadas.map((c) => c.slug)]
    .find((slug) => slug && (alvoFiltros[slug] || []).length > 0);
  if (!camadaBusca) return [];

  // +1: o próprio produto pode vir na lista
  const todos = await listarProdutosPorOpcoes(camadaBusca, alvoFiltros[camadaBusca], {
    limite: POOL_CANDIDATOS + 1
  });

  const candidatos = todos
    .filter((p) => p.id !== produto.id)
    // mesma linha da loja (perfumaria x iPhones)
    .filter((p) => produtoEhIphone(p, camadas) === alvoEhIphone)
    // sem preço de varejo não dá para comprar por aqui; sugerir confunde
    .filter((p) => disponivelNoModo(p, "varejo"))
    .map((p) => ({ produto: p, pontos: pontuar(p, alvoFiltros, camadas, principalSlug) }))
    // zero em comum não é sugestão, é preenchimento
    .filter((c) => c.pontos > 0);

  candidatos.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    // empate: quem tem estoque aparece antes
    const ea = estoquePorModo(a.produto) > 0 ? 1 : 0;
    const eb = estoquePorModo(b.produto) > 0 ? 1 : 0;
    return eb - ea;
  });

  return candidatos.slice(0, max).map((c) => c.produto);
}
