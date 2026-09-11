import { buscarProdutoPorId, infoPreco, estoquePorModo, disponivelNoModo, podeSerEntregue, filtrosDoProduto } from "../services/produtos.js";
import { listarCamadas, camadaPrincipal } from "../services/camadas.js";
import { produtosRelacionados } from "../services/relacionados.js";
import { observarAuth } from "../services/auth.js";
import { adicionarAoCarrinho } from "../services/carrinho.js";
import { registrarVisita } from "../services/metricas.js";
import { consentiuAnalytics } from "../services/consentimento-cookies.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import { toast } from "../services/ui-feedback.js";

// ⚠️ Miguel: para mudar o tempo de troca automática das imagens do
// produto, edite só o número abaixo (em milissegundos — 1000 = 1 segundo).
const INTERVALO_TROCA_AUTOMATICA_MS = 4000;

const params = new URLSearchParams(window.location.search);
const produtoId = params.get("id");

const conteudo = document.getElementById("produto-conteudo");
const trilhaNome = document.getElementById("trilha-nome");

let usuarioAtual = null;
let produtoAtual = null;
let camadasCache = [];

observarAuth(({ usuario }) => {
  usuarioAtual = usuario;
});

// A busca da navbar/menu mobile é ligada por services/nav-busca.js.

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPeso(gramas) {
  if (!gramas) return "—";
  if (gramas >= 1000) return `${(gramas / 1000).toFixed(2).replace(".00", "")} kg`;
  return `${gramas} g`;
}

// Ícones dos avisos. Traço fino, como o resto da loja — e nada de emoji,
// que muda de desenho (e de tamanho) a cada sistema operacional.
const IC_LOJA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18l-1.2-4.2A1.5 1.5 0 0 0 18.35 3.7H5.65A1.5 1.5 0 0 0 4.2 4.8L3 9Z"/><path d="M4.6 9v10.4a.6.6 0 0 0 .6.6h13.6a.6.6 0 0 0 .6-.6V9"/><path d="M9.6 20v-5.2h4.8V20"/></svg>';
const IC_ETIQUETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 12.3 12.3 20.6a1.6 1.6 0 0 1-2.3 0l-7-7V4.3a1.3 1.3 0 0 1 1.3-1.3h9.3l7.3 7.3a1.6 1.6 0 0 1 0 2.3Z"/><circle cx="7.9" cy="7.9" r="1.25"/></svg>';

function aviso(icone, titulo, corpo) {
  return `
    <div class="produto-aviso">
      <span class="produto-aviso-ic">${icone}</span>
      <div class="produto-aviso-texto">
        <strong>${titulo}</strong>
        <span>${corpo}</span>
      </div>
    </div>
  `;
}

// A opção do produto na camada principal vira a etiqueta acima do nome
// (mesma informação que o card do catálogo mostra). Por isso a camada
// principal NÃO se repete na tabela de detalhes lá embaixo.
function etiquetaPrincipal(produto) {
  const principal = camadaPrincipal(camadasCache);
  if (!principal) return "";
  const slugs = filtrosDoProduto(produto, principal.slug)[principal.slug] || [];
  if (slugs.length === 0) return "";
  return slugs.map((s) => principal.opcoes.find((o) => o.slug === s)?.nome || s).join(", ");
}

// Uma linha por camada de filtro em que o produto tem opção marcada
// (Tipo, Gênero…), mais peso, SKU e código de barras. Campo vazio não
// vira linha: três traços seguidos só ocupavam espaço sem informar nada.
function linhasFicha(produto) {
  const principal = camadaPrincipal(camadasCache);
  const filtros = filtrosDoProduto(produto, principal?.slug || null);

  const linhas = camadasCache
    .filter((camada) => camada.slug !== principal?.slug)
    .map((camada) => {
      const slugs = filtros[camada.slug] || [];
      if (slugs.length === 0) return null;
      const nomes = slugs.map((s) => camada.opcoes.find((o) => o.slug === s)?.nome || s);
      return [camada.nome, nomes.join(", ")];
    })
    .filter(Boolean);

  if (produto.volumeMl) linhas.push(["Volume", `${produto.volumeMl} ml`]);
  if (produto.peso) linhas.push(["Peso", formatarPeso(produto.peso)]);
  if (produto.sku) linhas.push(["SKU", produto.sku]);
  if (produto.codigoBarras) linhas.push(["Código de barras", produto.codigoBarras]);

  return linhas
    .map(([rotulo, valor]) => `<div><span>${escapeHtml(rotulo)}</span><span>${escapeHtml(valor)}</span></div>`)
    .join("");
}

async function carregarProduto() {
  if (!produtoId) {
    conteudo.innerHTML = `<p class="catalogo-vazio">Produto não especificado.</p>`;
    return;
  }

  try {
    produtoAtual = await buscarProdutoPorId(produtoId);
  } catch (erro) {
    console.error(erro);
  }

  if (!produtoAtual || produtoAtual.ativo === false) {
    conteudo.innerHTML = `<p class="catalogo-vazio">Este produto não foi encontrado ou não está mais disponível.</p>`;
    return;
  }

  try {
    camadasCache = await listarCamadas();
  } catch (erro) {
    console.error("Erro ao carregar camadas:", erro);
  }

  const p = produtoAtual;
  trilhaNome.textContent = p.nome;
  document.title = `${p.nome} — Amira`;

  if (consentiuAnalytics()) registrarVisita(`produto:${p.id}`, "produto");

  // Estoque é compartilhado varejo/atacado. O varejo é OPCIONAL (R2 6.1):
  // um produto pode existir só no atacado — nesse caso, esta página não
  // mostra preço/quantidade de varejo.
  const temVarejo = disponivelNoModo(p, "varejo");
  const estoque = estoquePorModo(p);
  const disponivel = temVarejo && estoque > 0;
  const preco = infoPreco(p, "varejo");
  const somenteRetirada = !podeSerEntregue(p);
  const todasImagens = [p.imagemURL, ...(p.imagensExtras || [])].filter(Boolean);
  if (todasImagens.length === 0) todasImagens.push("images/amira-placeholder.svg");

  const etiqueta = etiquetaPrincipal(p);

  // Os dois avisos ficam DEPOIS do botão: são condição de compra, não
  // chamada — antes eles empurravam preço e botão para baixo da dobra.
  const avisos = [
    somenteRetirada
      ? aviso(IC_LOJA, "Retirada na loja",
          "Este produto não tem entrega. Retire no Monumental Shopping, 2º piso.")
      : "",
    disponivelNoModo(p, "atacado")
      ? aviso(IC_ETIQUETA,
          `${temVarejo ? "No atacado" : "Exclusivo do atacado"}: ${formatarPreco(infoPreco(p, "atacado").precoFinal)}/un.`,
          `Preço por unidade para revendedores. <a href="atacado.html">Ver modo atacado</a>`)
      : ""
  ].filter(Boolean).join("");

  // Descrição e tabela só entram quando têm conteúdo — "Sem descrição
  // disponível" seguido de três traços deixava a página com cara de vazia.
  const descricao = String(p.descricao || "").trim();
  const linhas = linhasFicha(p);
  const ficha = [
    descricao
      ? `<section class="produto-bloco"><h3>Descrição</h3><p>${escapeHtml(descricao)}</p></section>`
      : "",
    linhas
      ? `<section class="produto-bloco"><h3>Detalhes</h3><div class="produto-detalhes-tabela">${linhas}</div></section>`
      : ""
  ].filter(Boolean).join("");

  conteudo.innerHTML = `
    <div class="produto-layout">
      <div>
        <div class="produto-carrossel" id="produto-carrossel">
          <div class="produto-carrossel-trilho" id="produto-carrossel-trilho">
            ${todasImagens.map((url, i) => `
              <div class="produto-carrossel-slide">
                <img src="${urlImagemSegura(url)}" alt="${escapeHtml(p.nome)} - imagem ${i + 1}" draggable="false">
              </div>
            `).join("")}
          </div>
          ${todasImagens.length > 1 ? `
            <button type="button" class="produto-carrossel-seta produto-carrossel-seta-esq" id="carrossel-seta-esq" aria-label="Imagem anterior">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" class="produto-carrossel-seta produto-carrossel-seta-dir" id="carrossel-seta-dir" aria-label="Próxima imagem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <div class="produto-carrossel-pontos" id="produto-carrossel-pontos">
              ${todasImagens.map((_, i) => `<button type="button" class="ponto-carrossel ${i === 0 ? "active" : ""}" data-indice="${i}" aria-label="Ir para imagem ${i + 1}"></button>`).join("")}
            </div>
          ` : ""}
        </div>
      </div>
      <div class="produto-info">
        ${etiqueta ? `<span class="produto-etiqueta">${escapeHtml(etiqueta)}</span>` : ""}
        <h1>${escapeHtml(p.nome)}</h1>

        ${temVarejo ? `
          <div class="produto-preco">
            <span class="produto-preco-valor">${formatarPreco(preco.precoFinal)}</span>
            ${preco.temDesconto ? `
              <span class="preco-antigo">${formatarPreco(preco.precoOriginal)}</span>
              <span class="desconto-badge">-${preco.percentual}%</span>
            ` : ""}
          </div>
        ` : ""}

        ${temVarejo ? `
          <p class="produto-estoque ${disponivel ? "disponivel" : "indisponivel"}">
            <span class="produto-estoque-ponto" aria-hidden="true"></span>
            ${disponivel ? `Em estoque · ${estoque} ${estoque === 1 ? "unidade" : "unidades"}` : "Fora de estoque"}
          </p>
        ` : ""}

        ${disponivel ? `
          <div class="produto-compra">
            <div class="produto-qtd-controle">
              <button type="button" id="qtd-menos" aria-label="Diminuir quantidade">−</button>
              <input type="number" id="qtd-input" value="1" min="1" max="${estoque}" aria-label="Quantidade">
              <button type="button" id="qtd-mais" aria-label="Aumentar quantidade">+</button>
            </div>
            <button class="btn-primary" id="btn-add-carrinho">Adicionar ao carrinho</button>
          </div>
        ` : ""}

        ${avisos}

        ${ficha ? `<div class="produto-ficha">${ficha}</div>` : ""}
      </div>
    </div>

    <!-- Preenchido depois, por carregarRelacionados(): a lista exige
         baixar o catálogo, e isso não pode atrasar o preço e o botão. -->
    <section class="produto-relacionados" id="produto-relacionados" hidden></section>
  `;

  if (todasImagens.length > 1) {
    configurarCarrossel(todasImagens.length);
  }

  carregarRelacionados(p);

  if (disponivel) {
    configurarSeletorQtd();
    configurarBotaoCarrinho();
  }
}

// ── "Você também pode gostar" ────────────────────────────────────────────
// Roda DEPOIS da página montada, e em silêncio: se falhar ou não houver
// candidato, a seção simplesmente não aparece. Sugestão é um extra —
// não pode segurar nem quebrar a compra.
async function carregarRelacionados(produto) {
  const alvo = document.getElementById("produto-relacionados");
  if (!alvo) return;

  let lista = [];
  try {
    lista = await produtosRelacionados(produto, 4);
  } catch (erro) {
    console.error("Relacionados indisponíveis:", erro);
    return;
  }
  if (lista.length === 0) return;

  alvo.innerHTML = `
    <h2 class="produto-relacionados__titulo">Você também pode gostar</h2>
    <div class="produto-relacionados__grade">
      ${lista.map((p) => {
        const preco = infoPreco(p, "varejo");
        const semEstoque = estoquePorModo(p) <= 0;
        return `
          <a class="catalogo-card" href="produto.html?id=${encodeURIComponent(p.id)}">
            <div class="catalogo-card-img">
              <img src="${urlImagemSegura(p.imagemURL)}" alt="${escapeHtml(p.nome)}" loading="lazy">
              ${preco.temDesconto ? `<span class="desconto-selo">-${preco.percentual}%</span>` : ""}
              ${semEstoque ? `<span class="catalogo-card-esgotado-selo">Esgotado</span>` : ""}
            </div>
            <div class="catalogo-card-info">
              <h3 class="catalogo-card-nome">${escapeHtml(p.nome)}</h3>
              <span class="catalogo-card-preco">${formatarPreco(preco.precoFinal)}</span>
            </div>
          </a>
        `;
      }).join("")}
    </div>
  `;
  alvo.hidden = false;
}

// ── Carrossel de imagens do produto ──────────────────────────────────────
// Suporta: troca automática por tempo, setas de navegação, pontos
// indicadores clicáveis, e arrastar com o mouse (computador) ou o dedo
// (celular/tablet) para passar as imagens manualmente.
let indiceCarrossel = 0;
let timerCarrossel = null;

function configurarCarrossel(totalImagens) {
  const trilho = document.getElementById("produto-carrossel-trilho");
  const carrossel = document.getElementById("produto-carrossel");
  const pontos = document.querySelectorAll(".ponto-carrossel");

  function irPara(indice) {
    indiceCarrossel = ((indice % totalImagens) + totalImagens) % totalImagens; // sempre um índice válido, mesmo "dando a volta"
    trilho.style.transform = `translateX(-${indiceCarrossel * 100}%)`;
    pontos.forEach((p, i) => p.classList.toggle("active", i === indiceCarrossel));
  }

  function proximaImagem() {
    irPara(indiceCarrossel + 1);
  }

  function reiniciarTimer() {
    if (timerCarrossel) clearInterval(timerCarrossel);
    timerCarrossel = setInterval(proximaImagem, INTERVALO_TROCA_AUTOMATICA_MS);
  }

  document.getElementById("carrossel-seta-esq").addEventListener("click", () => {
    irPara(indiceCarrossel - 1);
    reiniciarTimer();
  });
  document.getElementById("carrossel-seta-dir").addEventListener("click", () => {
    irPara(indiceCarrossel + 1);
    reiniciarTimer();
  });
  pontos.forEach((ponto) => {
    ponto.addEventListener("click", () => {
      irPara(Number(ponto.dataset.indice));
      reiniciarTimer();
    });
  });

  // ── Arrastar com mouse ou toque (funciona em computador e celular) ────
  let arrastando = false;
  let posicaoInicialX = 0;

  function iniciarArrasto(x) {
    arrastando = true;
    posicaoInicialX = x;
    trilho.style.transition = "none"; // some durante o arrasto, para acompanhar o dedo/mouse sem atraso
    if (timerCarrossel) clearInterval(timerCarrossel);
  }

  function moverArrasto(x) {
    if (!arrastando) return;
    const diferenca = x - posicaoInicialX;
    trilho.style.transform = `translateX(calc(-${indiceCarrossel * 100}% + ${diferenca}px))`;
  }

  function finalizarArrasto(x) {
    if (!arrastando) return;
    arrastando = false;
    trilho.style.transition = ""; // volta a ter a transição suave de novo

    const diferenca = x - posicaoInicialX;
    const limiarArrastoPx = 50; // precisa arrastar pelo menos isso para trocar de imagem

    if (diferenca > limiarArrastoPx) {
      irPara(indiceCarrossel - 1);
    } else if (diferenca < -limiarArrastoPx) {
      irPara(indiceCarrossel + 1);
    } else {
      irPara(indiceCarrossel); // arrasto pequeno demais: volta para a imagem atual
    }
    reiniciarTimer();
  }

  // Mouse (computador)
  carrossel.addEventListener("mousedown", (e) => iniciarArrasto(e.clientX));
  window.addEventListener("mousemove", (e) => moverArrasto(e.clientX));
  window.addEventListener("mouseup", (e) => finalizarArrasto(e.clientX));

  // Toque (celular/tablet)
  carrossel.addEventListener("touchstart", (e) => iniciarArrasto(e.touches[0].clientX), { passive: true });
  carrossel.addEventListener("touchmove", (e) => moverArrasto(e.touches[0].clientX), { passive: true });
  carrossel.addEventListener("touchend", (e) => finalizarArrasto(e.changedTouches[0].clientX));

  reiniciarTimer();
}

function configurarSeletorQtd() {
  const input = document.getElementById("qtd-input");
  document.getElementById("qtd-menos").addEventListener("click", () => {
    input.value = Math.max(1, Number(input.value) - 1);
  });
  document.getElementById("qtd-mais").addEventListener("click", () => {
    input.value = Math.min(estoquePorModo(produtoAtual, "varejo"), Number(input.value) + 1);
  });
}

function configurarBotaoCarrinho() {
  const btn = document.getElementById("btn-add-carrinho");

  btn.addEventListener("click", async () => {
    if (!usuarioAtual) {
      window.location.href = `login.html`;
      return;
    }

    const quantidade = Number(document.getElementById("qtd-input").value) || 1;

    btn.disabled = true;
    btn.textContent = "Adicionando...";

    try {
      await adicionarAoCarrinho(usuarioAtual.uid, {
        produtoId: produtoAtual.id,
        nome: produtoAtual.nome,
        imagemURL: produtoAtual.imagemURL || "",
        // Preço de EXIBIÇÃO no carrinho (já com desconto). O valor cobrado
        // é recalculado no servidor pela Cloud Function criarPedido.
        precoUnitario: infoPreco(produtoAtual, "varejo").precoFinal,
        pesoUnitario: produtoAtual.peso || 0,
        quantidade,
        modo: "varejo"
      });
      toast(`${quantidade}× "${produtoAtual.nome}" no carrinho.`, "sucesso", { titulo: "Adicionado" });
    } catch (erro) {
      console.error(erro);
      toast("Não foi possível adicionar ao carrinho agora. Tente novamente.", "erro");
    } finally {
      btn.disabled = false;
      btn.textContent = "Adicionar ao carrinho";
    }
  });
}

carregarProduto();
