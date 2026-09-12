// ── Confirmação de pedido + pagamento ────────────────────────────────────
// O pedido nasce "aguardando_pagamento". Formas de pagar, na ordem:
//   1. PIX na própria página — /api/pix devolve o QR Code + copia-e-cola;
//      a página faz polling e vira "pago" sozinha quando o webhook confirma.
//   2. Cartão — /api/pagamento cria a preferência do Mercado Pago e
//      redireciona para o checkout (parcelamento etc.).
//   3. Fallback PIX manual + WhatsApp — se as funções falharem. Dados de
//      configuracoes/pagamento (Admin → Configurações).

import { exigirLogin } from "../services/auth.js";
import {
  buscarPedidoPorId,
  derivarTotaisDoPedido,
  codigoRetirada,
  cancelarPedido,
  podeCancelar
} from "../services/pedidos.js";
import { esvaziarCarrinho } from "../services/carrinho.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import { svgQrCode } from "../services/qrcode.js";
import { textoParcelamento } from "../services/parcelamento.js";
import { toast, confirmar, carregando } from "../services/ui-feedback.js";
import { db, auth } from "../services/firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const WHATSAPP_LOJA = "5598984853656";
const POLL_MS = 6000;
const POLL_MAX = 10 * 60 * 1000;

const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id");
const conteudo = document.getElementById("confirmacao-conteudo");

// ── Ícones ────────────────────────────────────────────────────────────
const IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const IC_PIX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.7" y="6.7" width="10.6" height="10.6" rx="2.4" transform="rotate(45 12 12)"/></svg>';
const IC_CARTAO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>';
const IC_LOJA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>';
// Mesmo ícone usado em js/comprovante.js — mantém o traço do WhatsApp
// consistente entre as duas páginas.
const IC_ZAP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.26.86 5.82 2.41a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23M8.53 7.33c-.16 0-.43.06-.65.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.72 2.63 4.18 3.69.58.25 1.04.4 1.4.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.47-.28-.24-.12-1.44-.71-1.66-.79-.23-.08-.39-.12-.56.12-.16.25-.63.79-.77.95-.14.17-.29.19-.53.07-.25-.13-1.06-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.12.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.77-1.83-.2-.48-.4-.42-.55-.42-.14 0-.3-.02-.46-.02"/></svg>';

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function buscarConfigPagamento() {
  try {
    const snap = await getDoc(doc(db, "configuracoes", "pagamento"));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// As funções de pagamento exigem o ID token: elas gravam com o Admin SDK,
// que passa por cima das firestore.rules, então é o token que prova de
// quem é o pedido. Ver api/pix.js e api/pagamento.js.
async function chamarPagamento(rota, corpo) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre na sua conta para pagar.");
  const idToken = await usuario.getIdToken();
  return fetch(rota, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(corpo)
  });
}

// ── Fallback: PIX manual + WhatsApp ─────────────────────────────────────
function blocoPixManual(pedido, config, total) {
  const linkWhatsApp = `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(
    `Olá! Fiz o pedido ${pedido.id} no valor de ${formatarPreco(total)} e quero combinar o pagamento.`
  )}`;
  const temPix = Boolean(config?.pixChave);

  return `
    <div class="pc-card">
      <h3 class="pc-card__titulo">PIX manual</h3>
      ${temPix ? `
        <p class="pc-linha">Chave: <code>${escapeHtml(config.pixChave)}</code>
          <button type="button" class="pc-btn-txt" id="btn-copiar-pix">copiar</button></p>
        ${config.pixNome ? `<p class="pc-linha pc-muted">Favorecido: ${escapeHtml(config.pixNome)}</p>` : ""}
        <p class="pc-linha">Valor: <strong>${formatarPreco(total)}</strong></p>
        <p class="pc-linha pc-muted">Depois de pagar, envie o comprovante no WhatsApp para agilizar.</p>
      ` : `
        <p class="pc-linha pc-muted">O pagamento é combinado com a loja — chame no WhatsApp que enviamos as instruções.</p>
      `}
      ${config?.instrucoes ? `<p class="pc-linha pc-muted">${escapeHtml(config.instrucoes)}</p>` : ""}
      <a href="${linkWhatsApp}" target="_blank" rel="noopener" class="btn-primary pc-btn-bloco">Combinar no WhatsApp</a>
    </div>
  `;
}

function blocoPago(pedido) {
  const retirada = pedido?.modoEntrega === "retirada";
  const linkZap = `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(
    `Olá! Fiz o pedido ${codigoRetirada(pedido.id)} e quero combinar a retirada.`
  )}`;
  return `
    <div class="pc-sucesso">
      <span class="pc-sucesso__icone">${IC_CHECK}</span>
      <div>
        <h3>Pagamento confirmado</h3>
        <p class="pc-muted">Recebemos seu pagamento — já estamos preparando tudo.</p>
      </div>
    </div>
    ${retirada ? `
      <div class="pc-card pc-retirada">
        <h3 class="pc-card__titulo">Código de retirada</h3>
        <p class="pc-muted">Mostre este código no balcão para retirar o pedido.</p>
        <p class="pc-codigo">${escapeHtml(codigoRetirada(pedido.id))}</p>
        <div class="cp-qr">${svgQrCode(codigoRetirada(pedido.id), `QR Code do pedido ${codigoRetirada(pedido.id)}`)}</div>
      </div>
    ` : ""}
    <a href="comprovante.html?id=${encodeURIComponent(pedido.id)}" class="btn-primary pc-btn-bloco">
      Ver comprovante do pedido
    </a>
    <a href="${linkZap}" target="_blank" rel="noopener" class="pc-btn-zap pc-btn-bloco">
      <span class="pc-btn-zap__ic">${IC_ZAP}</span> Conversar com loja para combinar retirada
    </a>
  `;
}

// ── Escolha de pagamento ──────────────────────────────────────────────
function blocoPagamento(pedido, total) {
  if (pedido.pagamento?.status === "aprovado") return blocoPago(pedido);

  const recusado = pedido.pagamento?.status === "recusado";

  return `
    <div class="pc-card">
      <h3 class="pc-card__titulo">Como pagar</h3>
      ${recusado ? `<p class="pc-linha pc-erro">O pagamento anterior não foi aprovado. Tente de novo:</p>` : ""}
      <div class="pc-metodos">
        <button class="pc-metodo" id="btn-pix">
          <span class="pc-metodo__icone">${IC_PIX}</span>
          <span class="pc-metodo__nome">PIX</span>
          <span class="pc-metodo__nota">na hora</span>
        </button>
        <button class="pc-metodo" id="btn-cartao">
          <span class="pc-metodo__icone">${IC_CARTAO}</span>
          <span class="pc-metodo__nome">Cartão</span>
          <span class="pc-metodo__nota">${escapeHtml(textoParcelamento(total))}</span>
        </button>
      </div>
      <div id="pix-area"></div>
    </div>
    <div id="area-pix-manual" hidden></div>
  `;
}

// ── PIX na página ──────────────────────────────────────────────────────
async function pagarComPix() {
  const area = document.getElementById("pix-area");
  const btnPix = document.getElementById("btn-pix");
  const btnCartao = document.getElementById("btn-cartao");
  btnPix.classList.add("pc-metodo--carregando");
  btnPix.disabled = true;
  btnCartao.disabled = true;
  area.innerHTML = "";

  try {
    const resp = await chamarPagamento("/api/pix", { pedidoId });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[/api/pix]", resp.status, dados);
      throw new Error(dados.erro || `HTTP ${resp.status}`);
    }
    if (!dados.copiaECola) throw new Error("Resposta sem código PIX");

    document.getElementById("btn-pix").hidden = true;
    document.getElementById("btn-cartao").hidden = true;

    area.innerHTML = `
      <div class="pc-pix">
        ${dados.qrCodeBase64
          ? `<img class="pc-pix__qr" alt="QR Code PIX" src="${urlImagemSegura("data:image/png;base64," + dados.qrCodeBase64)}">`
          : ""}
        <p class="pc-linha">Escaneie o QR Code no app do banco, ou copie o código:</p>
        <div class="pc-pix__copia">
          <input type="text" id="pix-codigo" readonly value="${escapeHtml(dados.copiaECola)}">
          <button type="button" class="btn-outline" id="btn-copiar-codigo">Copiar</button>
        </div>
        <p class="pc-pix__espera" id="pix-status">
          <span class="pc-spinner"></span> Aguardando o pagamento — a página atualiza sozinha.
        </p>
      </div>
    `;

    document.getElementById("btn-copiar-codigo").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(dados.copiaECola);
        toast("Código PIX copiado", "sucesso");
      } catch {
        document.getElementById("pix-codigo").select();
        toast("Selecione e copie com Ctrl+C", "info");
      }
    });

    iniciarPolling();
  } catch (erro) {
    console.error("PIX indisponível:", erro);
    toast("Não foi possível gerar o PIX agora. Tente o cartão ou o PIX manual.", "erro");
    revelarPixManual();
    btnPix.classList.remove("pc-metodo--carregando");
    btnPix.disabled = false;
    btnCartao.disabled = false;
  }
}

// ── Cartão (redirect Checkout Pro) ────────────────────────────────────
async function pagarComCartao() {
  const btn = document.getElementById("btn-cartao");
  const btnPix = document.getElementById("btn-pix");
  btn.classList.add("pc-metodo--carregando");
  btn.disabled = true;
  btnPix.disabled = true;

  try {
    const resp = await chamarPagamento("/api/pagamento", { pedidoId });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[/api/pagamento]", resp.status, dados);
      throw new Error(dados.erro || `HTTP ${resp.status}`);
    }
    const url = dados.init_point || dados.sandbox_init_point;
    if (!url) throw new Error("Resposta sem URL de checkout");
    // Confere o destino antes de sair do site: a URL vem da resposta do
    // Mercado Pago, mas quem redireciona é esta página — e um redirect
    // aberto é phishing pronto se um dia essa resposta for adulterada.
    if (!/^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.[a-z]{2})?\//i.test(url)) {
      throw new Error("URL de checkout inesperada");
    }
    window.location.href = url;
  } catch (erro) {
    console.error("Cartão indisponível:", erro);
    toast("Cartão indisponível agora. Tente o PIX ou o PIX manual.", "erro");
    revelarPixManual();
    btn.classList.remove("pc-metodo--carregando");
    btn.disabled = false;
    btnPix.disabled = false;
  }
}

let configAtual = null;
let pedidoAtual = null;
let totalAtual = 0;

function revelarPixManual() {
  const area = document.getElementById("area-pix-manual");
  if (area && area.hidden) {
    area.innerHTML = blocoPixManual(pedidoAtual, configAtual, totalAtual);
    area.hidden = false;
    document.getElementById("btn-copiar-pix")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(configAtual.pixChave);
        toast("Chave PIX copiada", "sucesso");
      } catch {
        toast("Copie a chave manualmente", "info");
      }
    });
  }
}

// ── Carrinho ──────────────────────────────────────────────────────────
// O checkout NÃO esvazia mais o carrinho ao criar o pedido — se a pessoa
// abandonar o pagamento, os itens continuam lá. O carrinho só é limpo
// quando o pagamento é efetivamente aprovado.
let uidAtual = null;
let carrinhoLimpo = false;

async function limparCarrinhoAposPagamento() {
  if (carrinhoLimpo || !uidAtual) return;
  carrinhoLimpo = true;
  try {
    localStorage.removeItem("amira:pedidoPendente");
  } catch {
    /* storage bloqueado — sem problema */
  }
  try {
    await esvaziarCarrinho(uidAtual);
  } catch (erro) {
    console.error("Não foi possível esvaziar o carrinho:", erro);
  }
}

// ── Cancelar um pedido não pago ───────────────────────────────────────
// As firestore.rules só deixam sair de 'aguardando_pagamento' para
// 'cancelado' enquanto o provedor não aprovou — o botão nem aparece fora
// disso, mas a regra é quem garante.
async function cancelarEstePedido() {
  const ok = await confirmar({
    titulo: "Cancelar este pedido?",
    descricao: "Os itens continuam no seu carrinho — você pode fechar de novo quando quiser.",
    confirmar: "Sim, cancelar",
    cancelar: "Voltar",
    destrutivo: true
  });
  if (!ok) return;

  const fim = carregando("Cancelando…");
  try {
    await cancelarPedido(pedidoId);
    clearInterval(pollTimer);
    try { localStorage.removeItem("amira:pedidoPendente"); } catch { /* storage bloqueado */ }
    fim();
    toast("Pedido cancelado.", "info", { titulo: "Tudo certo" });
    setTimeout(() => { window.location.href = "carrinho.html"; }, 900);
  } catch (erro) {
    console.error(erro);
    fim();
    toast("Não foi possível cancelar agora. Se o pagamento já entrou, fale com a loja.", "erro");
  }
}

// ── Polling do status ─────────────────────────────────────────────────
let pollTimer = null;
function iniciarPolling() {
  const inicio = Date.now();
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (Date.now() - inicio > POLL_MAX) {
      clearInterval(pollTimer);
      const el = document.getElementById("pix-status");
      if (el) el.innerHTML = "Ainda não identificamos o pagamento. Se já pagou, atualize a página em instantes.";
      return;
    }
    try {
      const snap = await getDoc(doc(db, "pedidos", pedidoId));
      const st = snap.exists() ? snap.data().pagamento?.status : null;
      if (st === "aprovado") {
        clearInterval(pollTimer);
        toast("Pagamento confirmado!", "sucesso");
        await limparCarrinhoAposPagamento();
        const bloco = conteudo.querySelector(".pc-card");
        if (bloco) {
          const novo = document.createElement("div");
          novo.innerHTML = blocoPago(pedidoAtual);
          bloco.replaceWith(...novo.childNodes);
        }
      } else if (st === "recusado") {
        clearInterval(pollTimer);
        const el = document.getElementById("pix-status");
        if (el) { el.textContent = "O pagamento não foi aprovado. Recarregue a página para tentar de novo."; el.classList.add("pc-erro"); }
      }
    } catch {
      /* rede instável — tenta no próximo ciclo */
    }
  }, POLL_MS);
}

// ── Boot ──────────────────────────────────────────────────────────────
exigirLogin(async ({ usuario }) => {
  uidAtual = usuario.uid;

  if (!pedidoId) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  try {
    pedidoAtual = await buscarPedidoPorId(pedidoId);
  } catch (erro) {
    console.error(erro);
  }

  if (!pedidoAtual || pedidoAtual.uidComprador !== usuario.uid) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  const [config, totais] = await Promise.all([
    buscarConfigPagamento(),
    derivarTotaisDoPedido(pedidoAtual)
  ]);
  configAtual = config;
  totalAtual = totais.total;

  const entrega = pedidoAtual.modoEntrega === "retirada"
    ? "Retire no Monumental Shopping, 2º piso, quando o pagamento for confirmado."
    : "Assim que o pagamento for confirmado, combinamos a entrega com você.";

  conteudo.innerHTML = `
    <div class="pc">
      <div class="pc-hero">
        <span class="pc-hero__selo">${IC_CHECK}</span>
        <h1>Pedido recebido</h1>
        <p class="pc-muted">Pedido <strong>#${escapeHtml(pedidoAtual.id)}</strong></p>
      </div>

      <div class="pc-resumo">
        ${totais.frete ? `
          <div class="pc-resumo__linha">
            <span>Frete${totais.frete.zona?.nome ? ` · ${escapeHtml(totais.frete.zona.nome)}` : ""}</span>
            <span>${formatarPreco(totais.frete.valor)}</span>
          </div>` : ""}
        <div class="pc-resumo__linha pc-resumo__total">
          <span>Total a pagar</span>
          <span>${formatarPreco(totais.total)}</span>
        </div>
      </div>

      ${blocoPagamento(pedidoAtual, totais.total)}

      <p class="pc-entrega pc-muted">${entrega}</p>

      <a href="produtos.html" class="pc-voltar">
        <span class="pc-voltar__ic">${IC_LOJA}</span> Continuar comprando
      </a>

      ${podeCancelar(pedidoAtual) ? `
        <button type="button" class="pc-cancelar" id="btn-cancelar-pedido">Cancelar este pedido</button>
      ` : ""}
    </div>
  `;

  document.getElementById("btn-pix")?.addEventListener("click", pagarComPix);
  document.getElementById("btn-cartao")?.addEventListener("click", pagarComCartao);
  document.getElementById("btn-cancelar-pedido")?.addEventListener("click", cancelarEstePedido);

  // Voltou de um pagamento já aprovado (ex.: redirect do cartão): o
  // carrinho pode ser esvaziado agora.
  if (pedidoAtual.pagamento?.status === "aprovado") {
    limparCarrinhoAposPagamento();
  } else if (pedidoAtual.pagamento?.metodo === "pix" && pedidoAtual.pagamento?.status === "pendente") {
    iniciarPolling();
  }
});
