// ── Carrinho + checkout — Amira ─────────────────────────────────────
// ARQUITETURA CUSTO ZERO (Spark): os preços exibidos aqui são SEMPRE
// derivados da coleção "produtos" (recarregada ao abrir a página), nunca
// do que está gravado no carrinho. O pedido criado não carrega valores —
// só {produtoId, quantidade, modo} — e o total oficial é conferido pela
// loja na hora do PIX (ver services/pedidos.js).

import { exigirLogin } from "../services/auth.js";
import { db } from "../services/firebase-config.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  obterCarrinho,
  atualizarQuantidade,
  removerDoCarrinho
} from "../services/carrinho.js";
import { calcularFrete, TAXA_RETIRADA_LOJA } from "../services/frete.js";
import { criarPedido } from "../services/pedidos.js";
import {
  buscarProdutoPorId,
  infoPreco,
  estoquePorModo,
  podeSerEntregue
} from "../services/produtos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import {
  obterMinimoAtacadoCarrinho,
  contarUnidadesAtacado
} from "../services/atacado-config.js";
import { toast, carregando } from "../services/ui-feedback.js";

const IC_LIXEIRA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>';
const IC_CAMINHAO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>';
const IC_LOJINHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/></svg>';
const IC_CADEADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

const conteudo = document.getElementById("carrinho-conteudo");

let usuarioAtual = null;
let itensAtuais = [];
let produtosCache = new Map(); // produtoId -> produto (dados FRESCOS do catálogo)
// A entrega ainda não está liberada: por enquanto todo pedido é retirada
// na loja. Trocar para true reativa o seletor, os campos de endereço e o
// cálculo de frete — nada foi apagado.
const ENTREGA_HABILITADA = false;

let modoEntrega = ENTREGA_HABILITADA ? "entrega" : "retirada"; // "entrega" | "retirada"
let freteAtual = { valor: 0, zona: null, encontrado: true };
let minimoAtacado = null;

// Como o carrinho não é mais esvaziado ao criar o pedido, a pessoa pode
// voltar aqui com um pedido aberto e criar outro sem querer. Guardamos o
// último pedido não pago para oferecer "continuar o pagamento".
const CHAVE_PEDIDO_PENDENTE = "amira:pedidoPendente";
const VALIDADE_PENDENTE_MS = 24 * 60 * 60 * 1000;

// Mesmo limite validado em firestore.rules — mudar um lado sem o outro
// faz o pedido ser aceito aqui e recusado lá (ou o contrário).
const MAX_OBSERVACOES = 500;

function lerPedidoPendente() {
  try {
    const bruto = localStorage.getItem(CHAVE_PEDIDO_PENDENTE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados?.id || Date.now() - Number(dados.em || 0) > VALIDADE_PENDENTE_MS) {
      localStorage.removeItem(CHAVE_PEDIDO_PENDENTE);
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

function marcarPedidoPendente(id) {
  try {
    localStorage.setItem(CHAVE_PEDIDO_PENDENTE, JSON.stringify({ id, em: Date.now() }));
  } catch {
    /* modo privado / storage bloqueado — seguimos sem o aviso */
  }
}

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Preço unitário REAL do item, derivado do catálogo atual (não do carrinho).
function precoUnitarioReal(item) {
  const produto = produtosCache.get(item.produtoId);
  if (!produto) return 0;
  return infoPreco(produto, item.modo).precoFinal;
}

function subtotalReal(itens) {
  return itens.reduce(
    (soma, item) => soma + Math.round(precoUnitarioReal(item) * 100) * item.quantidade,
    0
  ) / 100;
}

function pesoTotalCarrinho(itens) {
  return itens.reduce((soma, item) => {
    const produto = produtosCache.get(item.produtoId);
    return soma + (Number(produto?.peso) || 0) * item.quantidade;
  }, 0);
}

// Itens que NÃO podem ser entregues (freteDisponivel === false no produto).
function itensSomenteRetirada() {
  return itensAtuais.filter((item) => {
    const produto = produtosCache.get(item.produtoId);
    return produto && !podeSerEntregue(produto);
  });
}

async function carregarProdutosDoCarrinho() {
  const ids = [...new Set(itensAtuais.map((i) => i.produtoId))];
  const produtos = await Promise.all(ids.map((id) => buscarProdutoPorId(id)));
  produtosCache = new Map();
  produtos.forEach((p, i) => {
    if (p) produtosCache.set(ids[i], p);
  });
}

// ── Renderização ──────────────────────────────────────────────────────────
function renderizarCarrinho() {
  if (itensAtuais.length === 0) {
    conteudo.innerHTML = `
      <p class="carrinho-vazio">
        Seu carrinho está vazio.<br><br>
        <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Ver produtos</a>
      </p>
    `;
    return;
  }

  const subtotal = subtotalReal(itensAtuais);
  const somenteRetirada = itensSomenteRetirada();

  // Se algum item é só-retirada, a entrega fica indisponível (R2 item 7).
  if (somenteRetirada.length > 0) {
    modoEntrega = "retirada";
  }

  const pendente = lerPedidoPendente();

  conteudo.innerHTML = `
    ${pendente ? `
      <div class="carrinho-pendente">
        <div>
          <strong>Você tem um pedido aguardando pagamento.</strong>
          <p>Se ainda quer pagar esse, continue por ali — assim não cria um pedido repetido.</p>
        </div>
        <a class="btn-primary" href="pedido-confirmado.html?id=${encodeURIComponent(pendente.id)}">Continuar pagamento</a>
      </div>
    ` : ""}
    <div class="carrinho-layout">
      <div class="carrinho-itens" id="lista-itens"></div>

      <aside class="carrinho-resumo">
        <h2>${ENTREGA_HABILITADA ? "Como você quer receber" : "Retirada"}</h2>

        ${ENTREGA_HABILITADA ? `
          <div class="modo-entrega-opcoes">
            <button type="button" class="modo-entrega-btn ${modoEntrega === "entrega" ? "active" : ""}" data-modo="entrega" ${somenteRetirada.length > 0 ? "disabled" : ""}>
              <span class="modo-entrega-btn__ic">${IC_CAMINHAO}</span>
              <span class="modo-entrega-btn__txt">Entrega</span>
              <span class="modo-entrega-btn__nota">no seu endereço</span>
            </button>
            <button type="button" class="modo-entrega-btn ${modoEntrega === "retirada" ? "active" : ""}" data-modo="retirada">
              <span class="modo-entrega-btn__ic">${IC_LOJINHA}</span>
              <span class="modo-entrega-btn__txt">Retirar na loja</span>
              <span class="modo-entrega-btn__nota">sem frete</span>
            </button>
          </div>
        ` : `
          <div class="modo-entrega-unico">
            <span class="modo-entrega-unico__ic">${IC_LOJINHA}</span>
            <div>
              <strong>Retirada na loja</strong>
              <p>Monumental Shopping, 2º piso — sem custo de frete.</p>
            </div>
          </div>
        `}
        ${ENTREGA_HABILITADA && somenteRetirada.length > 0 ? `
          <p class="carrinho-aviso">
            ${somenteRetirada.length === 1
              ? `O item "${escapeHtml(somenteRetirada[0].nome)}" só está disponível para retirada na loja.`
              : `${somenteRetirada.length} itens do carrinho só estão disponíveis para retirada na loja.`}
            Para receber os demais em casa, faça um pedido separado.
          </p>
        ` : ""}

        <div id="campos-entrega"></div>

        <div class="checkout-campo">
          <label for="checkout-observacoes">Observações (opcional)</label>
          <textarea id="checkout-observacoes" rows="3" maxlength="${MAX_OBSERVACOES}"
            placeholder="Ex.: embrulhar pra presente, ligar antes de entregar, trocar a cor se não tiver a X…"></textarea>
        </div>

        <h2 class="carrinho-resumo__titulo">Resumo</h2>
        <div class="resumo-linha">
          <span>Subtotal</span>
          <span>${formatarPreco(subtotal)}</span>
        </div>
        <div class="resumo-linha" id="linha-frete">
          <span>Frete</span>
          <span id="valor-frete">${modoEntrega === "retirada" ? "Grátis" : "—"}</span>
        </div>
        <div class="resumo-linha total">
          <span>Total</span>
          <span id="valor-total">${formatarPreco(subtotal)}</span>
        </div>
        <p class="frete-zona-info" style="margin-top:0.6rem;">
          Valores calculados com os preços atuais do catálogo. O total é
          confirmado pela loja no pagamento via PIX/WhatsApp.
        </p>
        <p class="carrinho-aviso" id="aviso-atacado" hidden></p>

        <button class="btn-finalizar" id="btn-finalizar">
          <span class="btn-finalizar__ic">${IC_CADEADO}</span>
          <span>Finalizar compra</span>
        </button>
        <p class="carrinho-resumo__seguro">Pagamento por PIX ou cartão na próxima etapa</p>
      </aside>
    </div>
  `;

  renderizarItens();
  renderizarCamposEntrega();
  configurarBotaoFinalizar();
  atualizarAvisoAtacado();

  document.querySelectorAll(".modo-entrega-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      modoEntrega = btn.dataset.modo;
      document.querySelectorAll(".modo-entrega-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarCamposEntrega();
      atualizarResumoFrete();
    });
  });
}

// Mínimo de atacado por CARRINHO (A3) — aviso na interface; a conferência
// final é humana (PIX), e as rules garantem quem PODE comprar atacado.
async function atualizarAvisoAtacado() {
  const aviso = document.getElementById("aviso-atacado");
  if (!aviso) return;

  const unidadesAtacado = contarUnidadesAtacado(itensAtuais);
  if (unidadesAtacado === 0) {
    aviso.hidden = true;
    return;
  }

  if (minimoAtacado === null) {
    minimoAtacado = await obterMinimoAtacadoCarrinho();
  }

  if (unidadesAtacado < minimoAtacado) {
    aviso.textContent = `Atacado: seu carrinho tem ${unidadesAtacado} unidade(s) em modo atacado — o mínimo para fechar o pedido é ${minimoAtacado} unidades (somando todos os produtos).`;
    aviso.classList.remove("carrinho-aviso--ok");
    aviso.hidden = false;
  } else {
    aviso.textContent = `Atacado liberado: ${unidadesAtacado} unidades no carrinho (mínimo: ${minimoAtacado}).`;
    aviso.classList.add("carrinho-aviso--ok");
    aviso.hidden = false;
  }
}

function renderizarItens() {
  const lista = document.getElementById("lista-itens");
  lista.innerHTML = itensAtuais.map((item) => {
    const produto = produtosCache.get(item.produtoId);
    const precoReal = precoUnitarioReal(item);
    const estoque = produto ? estoquePorModo(produto, item.modo) : 0;
    const soRetirada = produto && !podeSerEntregue(produto);

    return `
    <div class="carrinho-item" data-produto-id="${escapeHtml(item.produtoId)}" data-modo="${escapeHtml(item.modo)}">
      <div class="carrinho-item-img">
        <img src="${urlImagemSegura((produto && produto.imagemURL) || item.imagemURL)}" alt="${escapeHtml(item.nome)}">
      </div>
      <div class="carrinho-item-info">
        <h3>${escapeHtml(item.nome)}
          ${item.modo === "atacado" ? '<span class="tag-atacado">ATACADO</span>' : ""}
          ${soRetirada ? '<span class="tag-atacado" title="Este produto não tem entrega">SÓ RETIRADA</span>' : ""}
        </h3>
        <span class="preco-unit">${formatarPreco(precoReal)} / un.</span>
        ${!produto ? `<span class="preco-unit" style="color:var(--danger);">Produto indisponível — remova do carrinho</span>` : ""}
        ${produto && item.quantidade > estoque ? `<span class="preco-unit" style="color:var(--danger);">Só restam ${estoque} em estoque</span>` : ""}
        <div class="carrinho-item-qtd">
          <button type="button" class="btn-qtd-menos">−</button>
          <span class="qtd-valor">${Number(item.quantidade) || 0}</span>
          <button type="button" class="btn-qtd-mais">+</button>
        </div>
      </div>
      <div class="carrinho-item-totais">
        <div class="preco-total">${formatarPreco(precoReal * item.quantidade)}</div>
        <button type="button" class="carrinho-item-remover" aria-label="Remover ${escapeHtml(item.nome)} do carrinho">
          ${IC_LIXEIRA}<span>Remover</span>
        </button>
      </div>
    </div>
  `;
  }).join("");

  lista.querySelectorAll(".carrinho-item").forEach((el) => {
    const produtoId = el.dataset.produtoId;
    const modo = el.dataset.modo;
    const item = itensAtuais.find((i) => i.produtoId === produtoId && i.modo === modo);

    el.querySelector(".btn-qtd-mais").addEventListener("click", async () => {
      await mudarQuantidade(produtoId, modo, item.quantidade + 1);
    });
    el.querySelector(".btn-qtd-menos").addEventListener("click", async () => {
      await mudarQuantidade(produtoId, modo, item.quantidade - 1);
    });
    el.querySelector(".carrinho-item-remover").addEventListener("click", async () => {
      itensAtuais = await removerDoCarrinho(usuarioAtual.uid, produtoId, modo);
      renderizarCarrinho();
      toast(`"${item.nome}" saiu do carrinho.`, "info", { titulo: "Item removido" });
    });
  });
}

async function mudarQuantidade(produtoId, modo, novaQtd) {
  if (novaQtd < 1) return;
  itensAtuais = await atualizarQuantidade(usuarioAtual.uid, produtoId, modo, novaQtd);
  renderizarCarrinho();
}

function renderizarCamposEntrega() {
  const container = document.getElementById("campos-entrega");

  if (modoEntrega === "retirada") {
    // Com a entrega desligada o cartão .modo-entrega-unico já diz onde
    // retirar — repetir aqui só polui.
    container.innerHTML = ENTREGA_HABILITADA
      ? `<p class="frete-zona-info">
           Retire seu pedido no Monumental Shopping, 2º piso — sem custo de frete.
         </p>`
      : "";
    return;
  }

  container.innerHTML = `
    <div class="checkout-campo">
      <label for="checkout-cep">CEP</label>
      <input type="text" id="checkout-cep" placeholder="65000-000" maxlength="9">
    </div>
    <div class="checkout-campo">
      <label for="checkout-endereco">Endereço</label>
      <input type="text" id="checkout-endereco" placeholder="Rua, número, bairro">
    </div>
    <div class="checkout-campo">
      <label for="checkout-bairro">Bairro</label>
      <input type="text" id="checkout-bairro" placeholder="Bairro (usado para calcular o frete)">
    </div>
    <p class="frete-zona-info" id="frete-zona-info"></p>
  `;

  const cepInput = document.getElementById("checkout-cep");
  const bairroInput = document.getElementById("checkout-bairro");
  const enderecoInput = document.getElementById("checkout-endereco");

  cepInput.addEventListener("input", () => {
    let v = cepInput.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, "$1-$2");
    cepInput.value = v;
  });

  cepInput.addEventListener("blur", async () => {
    const cepLimpo = cepInput.value.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;

      enderecoInput.value = `${dados.logradouro || ""}`.trim();
      bairroInput.value = dados.bairro || "";
      atualizarResumoFrete();
    } catch {
      // Silencioso: o usuário ainda pode digitar o bairro manualmente.
    }
  });

  bairroInput.addEventListener("blur", atualizarResumoFrete);

  // Pré-carrega endereço salvo no perfil, se existir
  carregarEnderecoSalvo();
}

async function carregarEnderecoSalvo() {
  try {
    const ref = doc(db, "usuarios", usuarioAtual.uid, "dados", "endereco");
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const e = snap.data();
    const cepInput = document.getElementById("checkout-cep");
    const enderecoInput = document.getElementById("checkout-endereco");
    if (!cepInput || cepInput.value) return; // não sobrescreve o que o usuário já digitou

    cepInput.value = e.cep || "";
    enderecoInput.value = `${e.endereco || ""}${e.complemento ? ", " + e.complemento : ""}`;

    // Tenta extrair o bairro do endereço salvo (formato "Rua, Bairro")
    const partesEndereco = (e.endereco || "").split(",");
    const bairroInput = document.getElementById("checkout-bairro");
    if (partesEndereco.length > 1 && bairroInput) {
      bairroInput.value = partesEndereco[1].trim();
      atualizarResumoFrete();
    }
  } catch (erro) {
    console.error("Erro ao carregar endereço salvo:", erro);
  }
}

function atualizarResumoFrete() {
  const subtotal = subtotalReal(itensAtuais);
  const valorFreteEl = document.getElementById("valor-frete");
  const valorTotalEl = document.getElementById("valor-total");
  const zonaInfoEl = document.getElementById("frete-zona-info");

  if (modoEntrega === "retirada") {
    freteAtual = { valor: TAXA_RETIRADA_LOJA, zona: null, encontrado: true };
    valorFreteEl.textContent = "Grátis";
    valorTotalEl.textContent = formatarPreco(subtotal + TAXA_RETIRADA_LOJA);
    return;
  }

  const bairroInput = document.getElementById("checkout-bairro");
  const bairro = bairroInput?.value.trim();

  if (!bairro) {
    valorFreteEl.textContent = "Informe o bairro";
    valorTotalEl.textContent = formatarPreco(subtotal);
    return;
  }

  const peso = pesoTotalCarrinho(itensAtuais);
  freteAtual = calcularFrete(bairro, peso);

  valorFreteEl.textContent = formatarPreco(freteAtual.valor);
  valorTotalEl.textContent = formatarPreco(subtotal + freteAtual.valor);

  if (zonaInfoEl) {
    if (freteAtual.encontrado) {
      zonaInfoEl.textContent = `Região: ${freteAtual.zona.nome}`;
      zonaInfoEl.classList.remove("alerta");
    } else {
      zonaInfoEl.textContent = "Não localizamos esse bairro automaticamente — confirmaremos o frete por WhatsApp antes do envio.";
      zonaInfoEl.classList.add("alerta");
    }
  }
}

// ── Validações de UX antes de criar o pedido ─────────────────────────────
// (as garantias de permissão/shape são das firestore.rules; aqui é para o
// cliente não criar um pedido que a loja teria que recusar depois)
async function validarAntesDeFinalizar() {
  // Produtos removidos do catálogo
  const removidos = itensAtuais.filter((i) => !produtosCache.get(i.produtoId));
  if (removidos.length > 0) {
    toast("Há itens indisponíveis no carrinho — remova-os para continuar.", "erro");
    return false;
  }

  // Estoque atual (informativo — a loja confirma na conferência)
  const semEstoque = itensAtuais.filter((i) => {
    const produto = produtosCache.get(i.produtoId);
    return i.quantidade > estoquePorModo(produto, i.modo);
  });
  if (semEstoque.length > 0) {
    toast(`Estoque insuficiente de "${semEstoque[0].nome}" — ajuste a quantidade.`, "erro");
    return false;
  }

  // Entrega com item só-retirada (R2 item 7)
  if (modoEntrega === "entrega" && itensSomenteRetirada().length > 0) {
    toast("Um dos itens do carrinho só está disponível para retirada na loja.", "erro");
    return false;
  }

  // Mínimo de atacado por carrinho (A3)
  const unidadesAtacado = contarUnidadesAtacado(itensAtuais);
  if (unidadesAtacado > 0) {
    if (minimoAtacado === null) minimoAtacado = await obterMinimoAtacadoCarrinho();
    if (unidadesAtacado < minimoAtacado) {
      toast(`O pedido de atacado exige no mínimo ${minimoAtacado} unidades no carrinho (você tem ${unidadesAtacado}). Adicione mais itens ou mude-os para o varejo.`, "erro", { titulo: "Falta pouco" });
      return false;
    }
  }

  return true;
}

// ── Finalizar compra ────────────────────────────────────────────────────
function configurarBotaoFinalizar() {
  const btn = document.getElementById("btn-finalizar");

  btn.addEventListener("click", async () => {
    let endereco = null;
    if (modoEntrega === "entrega") {
      const cep = document.getElementById("checkout-cep")?.value.trim();
      const enderecoTexto = document.getElementById("checkout-endereco")?.value.trim();
      const bairro = document.getElementById("checkout-bairro")?.value.trim();

      if (!cep || cep.replace(/\D/g, "").length !== 8 || !enderecoTexto || !bairro) {
        toast("Preencha CEP (completo), endereço e bairro para continuar.", "erro");
        return;
      }
      endereco = { cep, endereco: enderecoTexto, bairro };
      atualizarResumoFrete();
    }

    if (!(await validarAntesDeFinalizar())) return;

    const observacoes = document.getElementById("checkout-observacoes")?.value.trim().slice(0, MAX_OBSERVACOES) || "";

    btn.disabled = true;
    btn.textContent = "Criando pedido...";
    const fimCarregando = carregando("Criando seu pedido…");

    try {
      const pedidoRef = await criarPedido({
        uidComprador: usuarioAtual.uid,
        itens: itensAtuais,
        modoEntrega,
        endereco,
        observacoes
      });

      // O carrinho NÃO é esvaziado aqui: se a pessoa desistir no meio do
      // pagamento, os itens precisam continuar lá. Quem esvazia é a tela
      // de pedido, quando o pagamento é efetivamente aprovado.
      marcarPedidoPendente(pedidoRef.id);

      toast("Pedido criado! Estamos te levando para o pagamento.", "sucesso", { titulo: "Tudo pronto" });

      setTimeout(() => {
        window.location.href = `pedido-confirmado.html?id=${encodeURIComponent(pedidoRef.id)}`;
      }, 1100);
    } catch (erro) {
      console.error(erro);
      fimCarregando();
      toast(
        erro?.code === "permission-denied"
          ? "Não foi possível criar o pedido — confirme seu e-mail e, para atacado, aguarde a aprovação da sua conta."
          : "Não foi possível finalizar o pedido agora. Tente novamente.",
        "erro"
      );
      btn.disabled = false;
      btn.textContent = "Finalizar compra";
    }
  });
}

// ── Inicialização ──────────────────────────────────────────────────────────
exigirLogin(async ({ usuario }) => {
  usuarioAtual = usuario;
  itensAtuais = await obterCarrinho(usuario.uid);
  await carregarProdutosDoCarrinho();
  renderizarCarrinho();
});
