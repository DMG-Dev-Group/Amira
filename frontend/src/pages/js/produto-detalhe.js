import { buscarProdutoPorId, infoPreco, estoquePorModo, disponivelNoModo, podeSerEntregue } from "../services/produtos.js";
import { listarCategorias } from "../services/categorias.js";
import { observarAuth } from "../services/auth.js";
import { adicionarAoCarrinho } from "../services/carrinho.js";
import { registrarVisita } from "../services/metricas.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";

// ⚠️ Miguel: para mudar o tempo de troca automática das imagens do
// produto, edite só o número abaixo (em milissegundos — 1000 = 1 segundo).
const INTERVALO_TROCA_AUTOMATICA_MS = 4000;

const params = new URLSearchParams(window.location.search);
const produtoId = params.get("id");

const conteudo = document.getElementById("produto-conteudo");
const trilhaNome = document.getElementById("trilha-nome");

let usuarioAtual = null;
let produtoAtual = null;
let categoriasCache = [];

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
    categoriasCache = await listarCategorias();
  } catch (erro) {
    console.error("Erro ao carregar categorias:", erro);
  }

  const p = produtoAtual;
  trilhaNome.textContent = p.nome;
  document.title = `${p.nome} — Amira`;

  registrarVisita(`produto:${p.id}`, "produto");

  // Estoque de varejo e atacado são independentes (A4). O varejo é
  // OPCIONAL (R2 6.1): um produto pode existir só no atacado — nesse
  // caso, esta página não mostra preço/quantidade de varejo.
  const temVarejo = disponivelNoModo(p, "varejo");
  const estoqueVarejo = estoquePorModo(p, "varejo");
  const disponivel = temVarejo && estoqueVarejo > 0;
  const preco = infoPreco(p, "varejo");
  const somenteRetirada = !podeSerEntregue(p);
  const todasImagens = [p.imagemURL, ...(p.imagensExtras || [])].filter(Boolean);
  if (todasImagens.length === 0) todasImagens.push("images/amira-placeholder.svg");

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
        <h1>${escapeHtml(p.nome)}</h1>
        <p class="produto-sku">SKU: ${escapeHtml(p.sku || "—")}</p>

        ${temVarejo ? `
          <div class="produto-preco">
            ${formatarPreco(preco.precoFinal)}
            ${preco.temDesconto ? `
              <span class="preco-antigo">${formatarPreco(preco.precoOriginal)}</span>
              <span class="desconto-badge">-${preco.percentual}%</span>
            ` : ""}
          </div>
        ` : ""}
        ${disponivelNoModo(p, "atacado") ? `
          <p class="produto-preco-atacado">
            ${temVarejo ? "No atacado" : "Produto exclusivo do atacado"}:
            ${formatarPreco(infoPreco(p, "atacado").precoFinal)}/un. para revendedores.
            <a href="atacado.html">Ver modo atacado</a>
          </p>
        ` : ""}
        ${somenteRetirada ? `
          <p class="produto-preco-atacado">
            🏬 Este produto não tem entrega — disponível apenas para retirada na loja
            (Monumental Shopping, 2º piso).
          </p>
        ` : ""}

        ${temVarejo ? `
          <p class="produto-estoque ${disponivel ? "disponivel" : "indisponivel"}">
            ${disponivel ? `Em estoque (${estoqueVarejo} unidades)` : "Produto fora de estoque"}
          </p>
        ` : ""}

        ${disponivel ? `
          <div class="produto-qtd-wrap">
            <div class="produto-qtd-controle">
              <button type="button" id="qtd-menos">−</button>
              <input type="number" id="qtd-input" value="1" min="1" max="${estoqueVarejo}">
              <button type="button" id="qtd-mais">+</button>
            </div>
          </div>
          <div class="produto-acoes">
            <button class="btn-primary" id="btn-add-carrinho">Adicionar ao carrinho</button>
          </div>
          <p class="produto-msg" id="produto-msg" style="display:none;"></p>
        ` : ""}

        <div class="produto-descricao">
          <h3>Descrição</h3>
          <p>${escapeHtml(p.descricao || "Sem descrição disponível.")}</p>
        </div>

        <div class="produto-detalhes-tabela">
          <div><span>Categoria</span><span>${escapeHtml(categoriasCache.find((c) => c.slug === p.categoria)?.nome || p.categoria || "—")}</span></div>
          <div><span>Peso</span><span>${formatarPeso(p.peso)}</span></div>
          <div><span>Código de barras</span><span>${escapeHtml(p.codigoBarras || "—")}</span></div>
        </div>
      </div>
    </div>
  `;

  if (todasImagens.length > 1) {
    configurarCarrossel(todasImagens.length);
  }

  if (disponivel) {
    configurarSeletorQtd();
    configurarBotaoCarrinho();
  }
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
  const msg = document.getElementById("produto-msg");

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
      msg.textContent = "Produto adicionado ao carrinho!";
      msg.style.display = "block";
    } catch (erro) {
      console.error(erro);
      msg.textContent = "Não foi possível adicionar ao carrinho agora.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Adicionar ao carrinho";
    }
  });
}

carregarProduto();
