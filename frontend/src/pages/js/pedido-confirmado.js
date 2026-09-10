// ── Confirmação de pedido + pagamento ────────────────────────────────────
// O pedido nasce "aguardando_pagamento". Formas de pagar, na ordem:
//   1. PIX na própria página — /api/pix devolve o QR Code + copia-e-cola;
//      a página fica fazendo polling e vira "✅ pago" sozinha quando o
//      webhook (/api/webhook-mp) confirma.
//   2. Cartão — /api/pagamento cria a preferência do Mercado Pago e
//      redireciona para o checkout (parcelamento etc.).
//   3. Fallback PIX manual + WhatsApp — se as funções não estão
//      configuradas ou falham. Dados de configuracoes/pagamento
//      (Admin → Configurações): { pixChave, pixNome, instrucoes }.

import { exigirLogin } from "../services/auth.js";
import { buscarPedidoPorId, derivarTotaisDoPedido } from "../services/pedidos.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import { textoParcelamento } from "../services/parcelamento.js";
import { db } from "../services/firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const WHATSAPP_LOJA = "5598984853656";
const POLL_MS = 6000;
const POLL_MAX = 10 * 60 * 1000; // para de checar depois de 10 min

const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id");
const conteudo = document.getElementById("confirmacao-conteudo");

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
    `Olá! Acabei de fazer o pedido ${pedido.id} no valor de ${formatarPreco(total)} e quero combinar o pagamento.`
  )}`;
  const temPix = Boolean(config?.pixChave);

  return `
    <div class="pagamento-bloco">
      <h2>Pagar por PIX manual</h2>
      ${temPix ? `
        <p class="pagamento-linha">
          <strong>PIX</strong> — chave: <code id="pix-chave">${escapeHtml(config.pixChave)}</code>
          <button type="button" class="btn-outline btn-copiar-pix" id="btn-copiar-pix">Copiar chave</button>
        </p>
        ${config.pixNome ? `<p class="pagamento-linha">Favorecido: ${escapeHtml(config.pixNome)}</p>` : ""}
        <p class="pagamento-linha">Valor: <strong>${formatarPreco(total)}</strong></p>
        <p class="pagamento-linha">Depois de pagar, envie o comprovante pelo WhatsApp para agilizar a confirmação.</p>
      ` : `
        <p class="pagamento-linha">
          O pagamento é combinado diretamente com a loja — clique no botão
          abaixo e enviaremos as instruções pelo WhatsApp.
        </p>
      `}
      ${config?.instrucoes ? `<p class="pagamento-linha">${escapeHtml(config.instrucoes)}</p>` : ""}
      <a href="${linkWhatsApp}" target="_blank" rel="noopener" class="btn-primary" style="text-decoration:none; display:inline-block; margin-top:0.8rem;">
        Combinar pagamento no WhatsApp
      </a>
    </div>
  `;
}

function blocoPago() {
  return `
    <div class="pagamento-bloco">
      <h2 style="color: var(--success);">✅ Pagamento confirmado</h2>
      <p class="pagamento-linha">Recebemos seu pagamento. Já estamos preparando tudo.</p>
    </div>
  `;
}

// ── Estado inicial da área de pagamento ────────────────────────────────
function blocoPagamento(pedido, total) {
  const status = pedido.pagamento?.status;
  if (status === "aprovado") return blocoPago();

  const aviso = status === "recusado"
    ? `<p class="pagamento-linha" style="color:var(--danger);">O pagamento anterior não foi aprovado. Tente de novo:</p>`
    : "";

  return `
    <div class="pagamento-bloco">
      <h2>Como pagar</h2>
      ${aviso}
      <p class="pagamento-linha">
        Valor: <strong>${formatarPreco(total)}</strong> — no cartão, ${escapeHtml(textoParcelamento(total))}.
      </p>
      <div class="pagamento-acoes">
        <button class="btn-primary" id="btn-pix">Pagar com PIX</button>
        <button class="btn-outline" id="btn-cartao">Pagar com cartão</button>
      </div>
      <div id="pix-area"></div>
      <p class="pagamento-linha" id="msg-pagamento" style="display:none;"></p>
    </div>
    <div id="area-pix-manual" hidden></div>
  `;
}

// ── PIX na página ──────────────────────────────────────────────────────
async function pagarComPix() {
  const area = document.getElementById("pix-area");
  const msg = document.getElementById("msg-pagamento");
  const btnPix = document.getElementById("btn-pix");
  const btnCartao = document.getElementById("btn-cartao");
  msg.style.display = "none";
  btnPix.disabled = true;
  btnPix.textContent = "Gerando PIX...";
  area.innerHTML = "";

  try {
    const resp = await fetch("/api/pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const dados = await resp.json();
    if (!dados.copiaECola) throw new Error("Resposta sem código PIX");

    btnPix.hidden = true;
    if (btnCartao) btnCartao.hidden = true;

    area.innerHTML = `
      <div class="pix-qr">
        ${dados.qrCodeBase64
          ? `<img alt="QR Code PIX" src="${urlImagemSegura("data:image/png;base64," + dados.qrCodeBase64)}" width="220" height="220">`
          : ""}
        <p class="pagamento-linha">Escaneie o QR Code no app do seu banco, ou copie o código:</p>
        <div class="pix-copiacola">
          <input type="text" id="pix-codigo" readonly value="${escapeHtml(dados.copiaECola)}">
          <button type="button" class="btn-outline" id="btn-copiar-codigo">Copiar</button>
        </div>
        <p class="pagamento-linha pix-aguardando" id="pix-status">
          <span class="pix-spinner"></span> Aguardando o pagamento… a página atualiza sozinha.
        </p>
      </div>
    `;

    document.getElementById("btn-copiar-codigo").addEventListener("click", async () => {
      const btn = document.getElementById("btn-copiar-codigo");
      try {
        await navigator.clipboard.writeText(dados.copiaECola);
        btn.textContent = "Copiado!";
      } catch {
        document.getElementById("pix-codigo").select();
        btn.textContent = "Selecionado — Ctrl+C";
      }
      setTimeout(() => { btn.textContent = "Copiar"; }, 2000);
    });

    iniciarPolling();
  } catch (erro) {
    console.error("PIX indisponível:", erro);
    msg.textContent = "Não foi possível gerar o PIX agora — tente o cartão, ou o PIX manual abaixo.";
    msg.style.display = "block";
    revelarPixManual();
    btnPix.disabled = false;
    btnPix.hidden = false;
    btnPix.textContent = "Pagar com PIX";
  }
}

// ── Cartão (redirect Checkout Pro) ────────────────────────────────────
async function pagarComCartao() {
  const msg = document.getElementById("msg-pagamento");
  const btn = document.getElementById("btn-cartao");
  msg.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Abrindo o pagamento...";

  try {
    const resp = await fetch("/api/pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const dados = await resp.json();
    const url = dados.init_point || dados.sandbox_init_point;
    if (!url) throw new Error("Resposta sem URL de checkout");
    window.location.href = url;
  } catch (erro) {
    console.error("Cartão indisponível:", erro);
    msg.textContent = "Pagamento com cartão indisponível agora — use o PIX, ou o PIX manual abaixo.";
    msg.style.display = "block";
    revelarPixManual();
    btn.disabled = false;
    btn.textContent = "Pagar com cartão";
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
    ligarCopiarChaveManual();
  }
}

function ligarCopiarChaveManual() {
  const btnCopiar = document.getElementById("btn-copiar-pix");
  btnCopiar?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(configAtual.pixChave);
      btnCopiar.textContent = "Copiado!";
    } catch {
      btnCopiar.textContent = "Copie manualmente";
    }
    setTimeout(() => { btnCopiar.textContent = "Copiar chave"; }, 1800);
  });
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
      if (el) el.textContent = "Ainda não identificamos o pagamento. Se já pagou, atualize a página em instantes.";
      return;
    }
    try {
      const snap = await getDoc(doc(db, "pedidos", pedidoId));
      const st = snap.exists() ? snap.data().pagamento?.status : null;
      if (st === "aprovado") {
        clearInterval(pollTimer);
        conteudo.querySelector(".pagamento-bloco")?.replaceWith(
          Object.assign(document.createElement("div"), { innerHTML: blocoPago() }).firstElementChild
        );
      } else if (st === "recusado") {
        clearInterval(pollTimer);
        const el = document.getElementById("pix-status");
        if (el) { el.textContent = "O pagamento não foi aprovado. Recarregue a página para tentar de novo."; el.style.color = "var(--danger)"; }
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

  conteudo.innerHTML = `
    <div style="max-width: 520px; margin: 0 auto; padding: 2rem 0;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">🌸</div>
      <h1 style="font-family:'Playfair Display', serif; font-size: 1.6rem; margin-bottom: 0.8rem;">
        Pedido recebido!
      </h1>
      <p style="font-family:'Jost', sans-serif; color: var(--text-muted); margin-bottom: 1.5rem;">
        Número do pedido: <strong>${escapeHtml(pedidoAtual.id)}</strong><br>
        ${totais.frete ? `Frete (${escapeHtml(totais.frete.zona?.nome || "a confirmar")}): <strong>${formatarPreco(totais.frete.valor)}</strong><br>` : ""}
        Total: <strong style="color: var(--gold);">${formatarPreco(totais.total)}</strong>
      </p>
      ${blocoPagamento(pedidoAtual, totais.total)}
      <p style="font-family:'Jost', sans-serif; font-size: 0.85rem; color: var(--text-muted); margin: 1.5rem 0 2rem;">
        ${pedidoAtual.modoEntrega === "retirada"
          ? "Retire seu pedido no Monumental Shopping, 2º piso, assim que o pagamento for confirmado."
          : "Assim que o pagamento for confirmado, entraremos em contato para combinar a entrega."}
      </p>
      <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Continuar comprando</a>
    </div>
  `;

  document.getElementById("btn-pix")?.addEventListener("click", pagarComPix);
  document.getElementById("btn-cartao")?.addEventListener("click", pagarComCartao);

  // Se o pedido já tinha um PIX pendente, retoma o acompanhamento.
  if (pedidoAtual.pagamento?.metodo === "pix" && pedidoAtual.pagamento?.status === "pendente") {
    iniciarPolling();
  }
});
