import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast } from "../../services/ui-feedback.js";
import { escapeHtml } from "../../services/seguranca.js";
import { derivarTotaisDePedidos, codigoRetirada, tomDoStatus } from "../../services/pedidos.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let pedidosCache = [];
// Pedidos não guardam valores (arquitetura Spark/custo zero): os totais
// são derivados dos preços ATUAIS da coleção "produtos". Este mapa guarda
// { itensDetalhados, subtotal, frete, total, avisos } por pedido.id.
let totaisCache = new Map();

const tabela = document.getElementById("tabela-pedidos");
const contagem = document.getElementById("contagem-pedidos");
const filtroStatus = document.getElementById("filtro-status");
const modal = document.getElementById("modal-pedido");
const modalConteudo = document.getElementById("modal-pedido-conteudo");

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Com o Mercado Pago ligado, o webhook confirma o pagamento sozinho e já
// promove o pedido para "pago" — este selo mostra o que o provedor disse,
// sem depender de conferência manual do comprovante.
const ROTULO_PAGAMENTO = {
  aprovado: "Pago",
  pendente: "Aguardando",
  recusado: "Recusado"
};

function badgePagamento(pedido) {
  const st = pedido.pagamento?.status || "pendente";
  const tom = tomDoStatus(pedido);
  const classe = { pago: "badge-aprovado", pendente: "badge-pendente", recusado: "badge-rejeitado", cancelado: "badge-rejeitado" }[tom] || "badge-pendente";
  const metodo = { pix: "PIX", mercadopago: "Cartão", pix_whatsapp: "manual" }[pedido.pagamento?.metodo] || "—";
  return `<span class="badge ${classe}" title="${escapeHtml(metodo)}">${escapeHtml(ROTULO_PAGAMENTO[st] || st)}</span>`;
}

// Um pedido só pode ser cancelado enquanto o pagamento não foi aprovado —
// depois disso vira caso de estorno, não de cancelamento.
function podeCancelar(pedido) {
  return pedido.status !== "cancelado" && pedido.pagamento?.status !== "aprovado";
}

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

async function buscarTodosPedidos() {
  const colecaoRef = collection(db, "pedidos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderizarTabela() {
  const filtro = filtroStatus.value;
  const lista = filtro ? pedidosCache.filter((p) => p.status === filtro) : pedidosCache;

  contagem.textContent = `${lista.length} pedido${lista.length === 1 ? "" : "s"}`;

  if (lista.length === 0) {
    tabela.innerHTML = `<p class="admin-vazio">Nenhum pedido encontrado.</p>`;
    return;
  }

  tabela.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr>
          <th>Código</th>
          <th>Data</th>
          <th>Itens</th>
          <th>Entrega</th>
          <th>Total</th>
          <th>Pagamento</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr>
            <td>
              <strong>${escapeHtml(codigoRetirada(p.id))}</strong>
              ${(totaisCache.get(p.id)?.avisos || []).length > 0 ? '<span class="badge badge-pendente" title="Há avisos — abra os detalhes">⚠</span>' : ""}
            </td>
            <td>${formatarData(p.criadoEm)}</td>
            <td>${(p.itens || []).length} item(ns)</td>
            <td>${p.modoEntrega === "retirada" ? "Retirada" : "Entrega"}</td>
            <td>${formatarPreco(totaisCache.get(p.id)?.total ?? 0)}</td>
            <td>${badgePagamento(p)}</td>
            <td style="white-space:nowrap;">
              <button class="admin-btn admin-btn-outline admin-btn-sm btn-ver-detalhe" data-id="${escapeHtml(p.id)}">Detalhes</button>
              <a class="admin-btn admin-btn-outline admin-btn-sm" href="../comprovante.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" style="text-decoration:none;">Comprovante</a>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".btn-ver-detalhe").forEach((btn) => {
    btn.addEventListener("click", () => abrirDetalhe(btn.dataset.id));
  });
}

// Só usado para CANCELAR: a loja não acompanha etapas de fulfillment, e o
// "pago" quem escreve é o webhook do Mercado Pago.
async function atualizarStatus(pedidoId, novoStatus) {
  try {
    const ref = doc(db, "pedidos", pedidoId);
    await updateDoc(ref, { status: novoStatus });
    const pedido = pedidosCache.find((p) => p.id === pedidoId);
    if (pedido) pedido.status = novoStatus;
    // o filtro do topo usa p.status — mantem a lista coerente
    renderizarTabela();
    toast(`Etapa atualizada para "${novoStatus.replace(/_/g, " ")}".`, "sucesso");
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível atualizar o status agora. Tente novamente.", "erro");
  }
}

function abrirDetalhe(pedidoId) {
  const p = pedidosCache.find((ped) => ped.id === pedidoId);
  if (!p) return;

  const totais = totaisCache.get(p.id) || { itensDetalhados: [], subtotal: 0, frete: null, total: 0, avisos: [] };

  const itensHtml = totais.itensDetalhados.map((item) => `
    <tr>
      <td>${escapeHtml(item.nome)} ${item.modo === "atacado" ? "<span class='badge badge-aprovado'>ATACADO</span>" : ""}</td>
      <td>${item.quantidade}</td>
      <td>${formatarPreco(item.precoUnitario)}</td>
      <td>${formatarPreco(item.subtotal)}</td>
    </tr>
  `).join("");

  modalConteudo.innerHTML = `
    <p style="font-size:1.05rem; margin-bottom:0.4rem;">
      <strong>Código:</strong> <span style="letter-spacing:0.12em; color:var(--gold);">${escapeHtml(codigoRetirada(p.id))}</span>
      ${p.modoEntrega === "retirada" ? '<span class="badge badge-aprovado" style="margin-left:0.4rem;">RETIRADA</span>' : ""}
    </p>
    <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem;">id ${escapeHtml(p.id)}</p>
    <p style="font-size:0.85rem; margin-bottom:0.4rem;"><strong>Data:</strong> ${formatarData(p.criadoEm)}</p>
    <p style="font-size:0.85rem; margin-bottom:1rem;"><strong>Pagamento:</strong> ${badgePagamento(p)}
      ${p.pagamento?.provedorPagamentoId ? `<span style="font-size:0.72rem; color:var(--text-muted);"> · MP ${escapeHtml(String(p.pagamento.provedorPagamentoId))}</span>` : ""}
    </p>


    ${totais.avisos.length > 0 ? `
      <div class="admin-msg" style="display:block; margin-bottom:1rem;">
        ${totais.avisos.map((a) => `<p>• ${escapeHtml(a)}</p>`).join("")}
      </div>
    ` : ""}

    <table class="admin-tabela" style="margin-bottom:1.2rem;">
      <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml}</tbody>
    </table>

    <p style="font-size:0.85rem;"><strong>Modo de entrega:</strong> ${p.modoEntrega === "retirada" ? "Retirada na loja" : "Entrega"}</p>
    ${p.endereco ? `
      <p style="font-size:0.85rem;"><strong>Endereço:</strong> ${escapeHtml(p.endereco.endereco)}, ${escapeHtml(p.endereco.bairro)} — CEP ${escapeHtml(p.endereco.cep)}</p>
    ` : ""}
    ${totais.frete ? `<p style="font-size:0.85rem;"><strong>Frete:</strong> ${formatarPreco(totais.frete.valor)} (${escapeHtml(totais.frete.zona?.nome || "zona não identificada — confirmar")})</p>` : ""}

    <p style="font-size:0.95rem; margin-top:1rem;"><strong>Subtotal:</strong> ${formatarPreco(totais.subtotal)}</p>
    <p style="font-size:1.05rem; color:var(--gold);"><strong>Total (preços atuais do catálogo):</strong> ${formatarPreco(totais.total)}</p>
    <p style="font-size:0.75rem; color:var(--text-muted);">
      Os valores acima são derivados dos preços atuais da coleção "produtos" —
      é este total que deve bater com o PIX recebido.
    </p>

    <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:1rem;">
      <a class="admin-btn admin-btn-outline admin-btn-sm" style="text-decoration:none;"
         href="../comprovante.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">
        Abrir comprovante
      </a>
      ${podeCancelar(p) ? `
        <button type="button" class="admin-btn admin-btn-danger admin-btn-sm" id="btn-cancelar-pedido" data-id="${escapeHtml(p.id)}">
          Cancelar pedido
        </button>
      ` : ""}
    </div>
  `;

  const btnCancelar = modalConteudo.querySelector("#btn-cancelar-pedido");
  btnCancelar?.addEventListener("click", async () => {
    const ok = await confirmar({
      titulo: "Cancelar este pedido?",
      descricao: `O pedido ${codigoRetirada(p.id)} passa a constar como cancelado. Só é possível porque o pagamento ainda não foi aprovado.`,
      confirmar: "Cancelar pedido",
      cancelar: "Voltar",
      destrutivo: true
    });
    if (!ok) return;
    await atualizarStatus(p.id, "cancelado");
    modal.style.display = "none";
  });

  modal.style.display = "flex";
}

document.getElementById("btn-fechar-modal-pedido").addEventListener("click", () => {
  modal.style.display = "none";
});
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) modal.style.display = "none";
});

filtroStatus.addEventListener("change", renderizarTabela);

protegerPaginaAdmin(async () => {
  try {
    pedidosCache = await buscarTodosPedidos();
    totaisCache = await derivarTotaisDePedidos(pedidosCache);
    renderizarTabela();
  } catch (erro) {
    console.error("Erro ao carregar pedidos:", erro);
    tabela.innerHTML = `<p class="admin-vazio">Não foi possível carregar os pedidos agora.</p>`;
  }
});
