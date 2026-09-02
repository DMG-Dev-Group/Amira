// ── Confirmação de pedido + pagamento provisório (A7) ─────────────────────
// Enquanto o gateway de pagamento real não é configurado (ver
// docs/MANUAL_PAGAMENTO.md), o pedido nasce "aguardando_pagamento" e esta
// página instrui o cliente a pagar por PIX ou combinar pelo WhatsApp.
// Os dados de PIX são lidos de configuracoes/pagamento (editável pelo
// admin no Firestore, sem mexer em código):
//   { pixChave: "...", pixNome: "...", instrucoes: "..." }

import { exigirLogin } from "../services/auth.js";
import { buscarPedidoPorId, derivarTotaisDoPedido } from "../services/pedidos.js";
import { escapeHtml } from "../services/seguranca.js";
import { db } from "../services/firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const WHATSAPP_LOJA = "5598984853656";

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

function blocoPagamento(pedido, config, total) {
  const linkWhatsApp = `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(
    `Olá! Acabei de fazer o pedido ${pedido.id} no valor de ${formatarPreco(total)} e quero combinar o pagamento.`
  )}`;

  const temPix = Boolean(config?.pixChave);

  return `
    <div class="pagamento-bloco">
      <h2>Como pagar</h2>
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

exigirLogin(async ({ usuario }) => {
  if (!pedidoId) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  let pedido = null;
  try {
    pedido = await buscarPedidoPorId(pedidoId);
  } catch (erro) {
    console.error(erro);
  }

  if (!pedido || pedido.uidComprador !== usuario.uid) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  // O pedido não guarda valores (arquitetura Spark) — o total é derivado
  // dos preços atuais da coleção "produtos" + frete do bairro salvo.
  const [config, totais] = await Promise.all([
    buscarConfigPagamento(),
    derivarTotaisDoPedido(pedido)
  ]);

  conteudo.innerHTML = `
    <div style="max-width: 520px; margin: 0 auto; padding: 2rem 0;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">🌸</div>
      <h1 style="font-family:'Playfair Display', serif; font-size: 1.6rem; margin-bottom: 0.8rem;">
        Pedido recebido!
      </h1>
      <p style="font-family:'Jost', sans-serif; color: var(--text-muted); margin-bottom: 1.5rem;">
        Número do pedido: <strong>${escapeHtml(pedido.id)}</strong><br>
        ${totais.frete ? `Frete (${escapeHtml(totais.frete.zona?.nome || "a confirmar")}): <strong>${formatarPreco(totais.frete.valor)}</strong><br>` : ""}
        Total: <strong style="color: var(--gold);">${formatarPreco(totais.total)}</strong>
      </p>
      ${blocoPagamento(pedido, config, totais.total)}
      <p style="font-family:'Jost', sans-serif; font-size: 0.85rem; color: var(--text-muted); margin: 1.5rem 0 2rem;">
        ${pedido.modoEntrega === "retirada"
          ? "Retire seu pedido no Monumental Shopping, 2º piso, assim que recebermos a confirmação do pagamento."
          : "Assim que o pagamento for confirmado, entraremos em contato para combinar a entrega."}
      </p>
      <a href="produtos.html" class="btn-primary" style="text-decoration:none;">Continuar comprando</a>
    </div>
  `;

  const btnCopiar = document.getElementById("btn-copiar-pix");
  btnCopiar?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(config.pixChave);
      btnCopiar.textContent = "Copiado!";
    } catch {
      btnCopiar.textContent = "Copie manualmente";
    }
    setTimeout(() => { btnCopiar.textContent = "Copiar chave"; }, 1800);
  });
});
