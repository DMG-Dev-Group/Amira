// ── Confirmação de pedido + pagamento ────────────────────────────────────
// O pedido nasce "aguardando_pagamento". Formas de pagar, na ordem:
//   1. PIX na própria página — /api/pix devolve o QR Code + copia-e-cola;
//      a página faz polling e vira "pago" sozinha quando o webhook confirma.
//   2. Cartão — /api/pagamento cria a preferência do Mercado Pago e
//      redireciona para o checkout (parcelamento etc.).
//   3. Fallback PIX manual + WhatsApp — se as funções falharem. Dados de
//      configuracoes/pagamento (Admin → Configurações).

import { exigirLogin } from "../services/auth.js";
import { buscarPedidoPorId, derivarTotaisDoPedido } from "../services/pedidos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import { textoParcelamento } from "../services/parcelamento.js";
import { toast } from "../services/ui-feedback.js";
import { db } from "../services/firebase-config.js";
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

function blocoPago() {
  return `
    <div class="pc-sucesso">
      <span class="pc-sucesso__icone">${IC_CHECK}</span>
      <div>
        <h3>Pagamento confirmado</h3>
        <p class="pc-muted">Recebemos seu pagamento — já estamos preparando tudo.</p>
      </div>
    </div>
  `;
}

// ── Escolha de pagamento ──────────────────────────────────────────────
function blocoPagamento(pedido, total) {
  if (pedido.pagamento?.status === "aprovado") return blocoPago();

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
    const resp = await fetch("/api/pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId })
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[/api/pix]", resp.status, dados._diag || dados);
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
    const resp = await fetch("/api/pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId })
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[/api/pagamento]", resp.status, dados._diag || dados);
      throw new Error(dados.erro || `HTTP ${resp.status}`);
    }
    const url = dados.init_point || dados.sandbox_init_point;
    if (!url) throw new Error("Resposta sem URL de checkout");
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
        const bloco = conteudo.querySelector(".pc-card");
        if (bloco) {
          const novo = document.createElement("div");
          novo.innerHTML = blocoPago();
          bloco.replaceWith(novo.firstElementChild);
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
    </div>
  `;

  document.getElementById("btn-pix")?.addEventListener("click", pagarComPix);
  document.getElementById("btn-cartao")?.addEventListener("click", pagarComCartao);

  if (pedidoAtual.pagamento?.metodo === "pix" && pedidoAtual.pagamento?.status === "pendente") {
    iniciarPolling();
  }
});
