// ── Comprovante do pedido — Amira ─────────────────────────────────────
// A "prova de compra" que faltava: o cliente abre, confere item a item e
// imprime / salva em PDF. Para retirada na loja, mostra o CÓDIGO DE
// RETIRADA em destaque — é o que o balcão pede.
//
// ⚠️ Isto é um COMPROVANTE DE PEDIDO, não uma Nota Fiscal eletrônica.
// NF-e exige emissão junto à SEFAZ com certificado digital (ver
// docs/PLANO_PRODUCAO_2026-09.md).

import { exigirLogin } from "../services/auth.js";
import {
  buscarPedidoPorId,
  derivarTotaisDoPedido,
  codigoRetirada,
  rotuloStatus,
  tomDoStatus
} from "../services/pedidos.js";
import { escapeHtml } from "../services/seguranca.js";
import { svgQrCode } from "../services/qrcode.js";
import { toast } from "../services/ui-feedback.js";

const LOJA = {
  nome: "Amira",
  endereco: "Monumental Shopping, 2º piso — São Luís/MA",
  whatsapp: "5598984853656"
};

const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id");
const conteudo = document.getElementById("comprovante-conteudo");

const IC_IMPRIMIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
const IC_ZAP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.26.86 5.82 2.41a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23M8.53 7.33c-.16 0-.43.06-.65.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.72 2.63 4.18 3.69.58.25 1.04.4 1.4.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.47-.28-.24-.12-1.44-.71-1.66-.79-.23-.08-.39-.12-.56.12-.16.25-.63.79-.77.95-.14.17-.29.19-.53.07-.25-.13-1.06-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.12.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.77-1.83-.2-.48-.4-.42-.55-.42-.14 0-.3-.02-.46-.02"/></svg>';

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function rotuloPagamento(pagamento) {
  const metodo = { pix: "PIX", mercadopago: "Cartão de crédito", pix_whatsapp: "A combinar" }[pagamento?.metodo] || "—";
  const st = { aprovado: "pago", pendente: "aguardando", recusado: "não aprovado" }[pagamento?.status] || "—";
  return `${metodo} · ${st}`;
}

function render(pedido, totais) {
  const retirada = pedido.modoEntrega === "retirada";
  const tom = tomDoStatus(pedido);
  const pago = tom === "pago";

  const linkZap = `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(
    `Olá! Sobre o pedido ${codigoRetirada(pedido.id)} (${pedido.id}).`
  )}`;

  conteudo.innerHTML = `
    <div class="cp">
      <header class="cp-topo">
        <div>
          <p class="cp-eyebrow">Comprovante de pedido</p>
          <h1 class="cp-titulo">${escapeHtml(LOJA.nome)}</h1>
          <p class="cp-muted">${escapeHtml(LOJA.endereco)}</p>
        </div>
        <span class="cp-selo cp-selo--${tom}">${escapeHtml(rotuloStatus(pedido.status))}</span>
      </header>

      ${retirada && pago ? `
        <section class="cp-codigo-bloco">
          <p class="cp-codigo-rotulo">Código de retirada</p>
          <p class="cp-codigo">${escapeHtml(codigoRetirada(pedido.id))}</p>
          <div class="cp-qr">${svgQrCode(codigoRetirada(pedido.id), `QR Code do pedido ${codigoRetirada(pedido.id)}`)}</div>
          <p class="cp-muted">Mostre este código no balcão — dá para ler pelo leitor ou digitar. Leve um documento com foto.</p>
        </section>
      ` : ""}

      <section class="cp-meta">
        <div><span>Pedido</span><strong>${escapeHtml(codigoRetirada(pedido.id))}</strong></div>
        <div><span>Data</span><strong>${formatarData(pedido.criadoEm)}</strong></div>
        <div><span>Pagamento</span><strong>${escapeHtml(rotuloPagamento(pedido.pagamento))}</strong></div>
        <div><span>Entrega</span><strong>${retirada ? "Retirada na loja" : "Entrega"}</strong></div>
      </section>

      <section class="cp-itens">
        <table class="cp-tabela">
          <thead>
            <tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${totais.itensDetalhados.map((item) => `
              <tr>
                <td>
                  ${escapeHtml(item.nome)}
                  ${item.modo === "atacado" ? '<span class="cp-tag">ATACADO</span>' : ""}
                </td>
                <td>${item.quantidade}</td>
                <td>${formatarPreco(item.precoUnitario)}</td>
                <td>${formatarPreco(item.subtotal)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="cp-totais">
        <div class="cp-total-linha"><span>Subtotal</span><span>${formatarPreco(totais.subtotal)}</span></div>
        ${totais.frete ? `
          <div class="cp-total-linha">
            <span>Frete${totais.frete.zona?.nome ? ` · ${escapeHtml(totais.frete.zona.nome)}` : ""}</span>
            <span>${formatarPreco(totais.frete.valor)}</span>
          </div>` : ""}
        <div class="cp-total-linha cp-total-linha--final"><span>Total</span><span>${formatarPreco(totais.total)}</span></div>
      </section>

      ${pedido.endereco ? `
        <section class="cp-endereco">
          <p class="cp-secao-titulo">Endereço de entrega</p>
          <p>${escapeHtml(pedido.endereco.endereco)} — ${escapeHtml(pedido.endereco.bairro)}</p>
          <p class="cp-muted">CEP ${escapeHtml(pedido.endereco.cep)}</p>
        </section>
      ` : ""}

      <p class="cp-rodape cp-muted">
        Este é um comprovante de pedido emitido pela loja para conferência do
        cliente. Não é documento fiscal. Dúvidas? Fale com a gente no WhatsApp.
      </p>

      <div class="cp-acoes">
        <button type="button" class="btn-primary cp-btn" id="btn-imprimir">
          <span class="cp-btn__ic">${IC_IMPRIMIR}</span> Imprimir / salvar PDF
        </button>
        <a href="${linkZap}" target="_blank" rel="noopener" class="btn-outline cp-btn">
          <span class="cp-btn__ic">${IC_ZAP}</span> Falar com a loja
        </a>
        <a href="meus-pedidos.html" class="cp-link">Ver todos os meus pedidos</a>
      </div>
    </div>
  `;

  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
}

exigirLogin(async ({ usuario, perfil }) => {
  if (!pedidoId) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não informado.</p>`;
    return;
  }

  let pedido = null;
  try {
    pedido = await buscarPedidoPorId(pedidoId);
  } catch (erro) {
    console.error(erro);
  }

  // O dono do pedido, ou o admin (que precisa imprimir o comprovante no
  // balcão). As firestore.rules já permitem essa leitura para os dois.
  const podeVer = pedido && (pedido.uidComprador === usuario.uid || perfil?.role === "admin");
  if (!podeVer) {
    conteudo.innerHTML = `<p class="carrinho-vazio">Pedido não encontrado.</p>`;
    return;
  }

  try {
    const totais = await derivarTotaisDoPedido(pedido);
    render(pedido, totais);
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível montar o comprovante agora.", "erro");
    conteudo.innerHTML = `<p class="carrinho-vazio">Não foi possível carregar este pedido agora.</p>`;
  }
});
