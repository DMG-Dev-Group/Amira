import { protegerPaginaAdmin } from "./admin-auth.js";
import { escapeHtml } from "../../services/seguranca.js";
import { buscarMetricas } from "../../services/metricas.js";
import { listarProdutos, infoPreco, estoquePorModo } from "../../services/produtos.js";
import { listarCategoriasIphone, ehCategoriaIphone } from "../../services/iphones.js";
import { derivarTotaisDePedidos } from "../../services/pedidos.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function buscarTodosPedidos() {
  const colecaoRef = collection(db, "pedidos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderizarBarra(rotulo, valor, total, cor = "var(--gold)") {
  const porcentagem = total > 0 ? Math.round((valor / total) * 100) : 0;
  return `
    <div style="margin-bottom: 0.8rem;">
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
        <span>${escapeHtml(rotulo)}</span>
        <span style="color:var(--text-muted);">${valor} (${porcentagem}%)</span>
      </div>
      <div style="background:rgba(255,255,255,0.06); border-radius:4px; height:8px; overflow:hidden;">
        <div style="background:${cor}; height:100%; width:${porcentagem}%;"></div>
      </div>
    </div>
  `;
}

function renderizarBlocoIphones(produtosIphone, categoriasIphone) {
  const alvo = document.getElementById("bloco-iphones");
  if (!alvo) return;

  if (categoriasIphone.length === 0 && produtosIphone.length === 0) {
    alvo.innerHTML = `
      <p class="admin-vazio">
        Nenhuma categoria de iPhone cadastrada ainda. Crie uma categoria
        chamada "iPhones" em Categorias e escolha ela ao cadastrar cada
        aparelho em Produtos — eles aparecem automaticamente em iphones.html.
      </p>`;
    return;
  }

  const emEstoque = produtosIphone.filter((p) => estoquePorModo(p, "varejo") > 0);
  const unidades = produtosIphone.reduce((soma, p) => soma + estoquePorModo(p, "varejo"), 0);
  const valorEstoque = produtosIphone.reduce(
    (soma, p) => soma + infoPreco(p, "varejo").precoFinal * estoquePorModo(p, "varejo"), 0
  );

  alvo.innerHTML = `
    <div class="admin-metricas-grid" style="margin-bottom:1.2rem;">
      <div class="admin-card-metrica">
        <div class="valor">${produtosIphone.length}</div>
        <div class="rotulo">Modelos cadastrados</div>
      </div>
      <div class="admin-card-metrica">
        <div class="valor">${emEstoque.length}</div>
        <div class="rotulo">Com estoque</div>
      </div>
      <div class="admin-card-metrica">
        <div class="valor">${unidades}</div>
        <div class="rotulo">Aparelhos em estoque</div>
      </div>
      <div class="admin-card-metrica">
        <div class="valor">${formatarPreco(valorEstoque)}</div>
        <div class="rotulo">Valor em estoque</div>
      </div>
    </div>
    ${produtosIphone.length === 0 ? `
      <p class="admin-vazio">
        A categoria já existe, mas nenhum produto foi marcado como iPhone ainda.
      </p>
    ` : `
      <table class="admin-tabela">
        <thead><tr><th>Aparelho</th><th>Preço</th><th>Estoque</th></tr></thead>
        <tbody>
          ${produtosIphone
            .slice()
            .sort((a, b) => estoquePorModo(a, "varejo") - estoquePorModo(b, "varejo"))
            .map((p) => {
              const estoque = estoquePorModo(p, "varejo");
              return `
                <tr>
                  <td>${escapeHtml(p.nome || "")}</td>
                  <td>${formatarPreco(infoPreco(p, "varejo").precoFinal)}</td>
                  <td>${estoque > 0
                    ? estoque
                    : `<span class="badge badge-cancelado">sem estoque</span>`}</td>
                </tr>`;
            }).join("")}
        </tbody>
      </table>
    `}
  `;
}

async function carregarDashboard() {
  const [metricas, produtos, pedidos, categoriasIphone] = await Promise.all([
    buscarMetricas(30),
    listarProdutos(),
    buscarTodosPedidos(),
    listarCategoriasIphone()
  ]);

  // A seção de iPhones é um recorte da coleção "produtos" por categoria —
  // mesma regra usada pela loja (services/iphones.js), para os números do
  // painel baterem com o que o cliente vê em iphones.html.
  const slugsIphone = new Set(categoriasIphone.map((c) => c.slug));
  const produtosIphone = produtos.filter(
    (p) => slugsIphone.has(p.categoria) || ehCategoriaIphone({ slug: p.categoria || "" })
  );

  // ── Cards de métricas gerais ────────────────────────────────────────────
  // Pedidos não guardam valores (arquitetura Spark): o faturamento é
  // derivado dos preços atuais da coleção "produtos".
  const totaisPedidos = await derivarTotaisDePedidos(pedidos);
  const pedidosPagos = pedidos.filter((p) => p.status !== "cancelado" && p.status !== "aguardando_pagamento");
  const faturamento = pedidosPagos.reduce(
    (soma, p) => soma + (totaisPedidos.get(p.id)?.total || 0), 0
  );
  const totalVisitas = metricas.filter((m) => m.tipo === "pagina").length;
  const totalVisualizacoesProduto = metricas.filter((m) => m.tipo === "produto").length;

  document.getElementById("cards-metricas").innerHTML = `
    <div class="admin-card-metrica">
      <div class="valor">${totalVisitas}</div>
      <div class="rotulo">Visitas (30 dias)</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${totalVisualizacoesProduto}</div>
      <div class="rotulo">Views de produto</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${produtos.length}</div>
      <div class="rotulo">Produtos ativos</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${pedidos.length}</div>
      <div class="rotulo">Pedidos totais</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${produtosIphone.length}</div>
      <div class="rotulo">iPhones ativos</div>
    </div>
    <div class="admin-card-metrica">
      <div class="valor">${formatarPreco(faturamento)}</div>
      <div class="rotulo">Faturamento (pagos+)</div>
    </div>
  `;

  // ── Seção de iPhones ─────────────────────────────────────────────────────
  renderizarBlocoIphones(produtosIphone, categoriasIphone);

  // ── Gráfico de dispositivo ───────────────────────────────────────────────
  const totalDispositivo = metricas.length;
  const porDispositivo = { mobile: 0, tablet: 0, desktop: 0 };
  metricas.forEach((m) => {
    if (porDispositivo[m.dispositivo] !== undefined) porDispositivo[m.dispositivo]++;
  });

  document.getElementById("grafico-dispositivo").innerHTML = totalDispositivo === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : `
      ${renderizarBarra("Mobile", porDispositivo.mobile, totalDispositivo)}
      ${renderizarBarra("Desktop", porDispositivo.desktop, totalDispositivo)}
      ${renderizarBarra("Tablet", porDispositivo.tablet, totalDispositivo)}
    `;

  // ── Gráfico de origem ─────────────────────────────────────────────────────
  const porOrigem = {};
  metricas.forEach((m) => {
    const origem = m.origem || "direto";
    porOrigem[origem] = (porOrigem[origem] || 0) + 1;
  });
  const origensOrdenadas = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 6);

  document.getElementById("grafico-origem").innerHTML = origensOrdenadas.length === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : origensOrdenadas.map(([origem, qtd]) => renderizarBarra(origem, qtd, totalDispositivo)).join("");

  // ── Páginas mais visitadas ────────────────────────────────────────────────
  const porPagina = {};
  metricas.filter((m) => m.tipo === "pagina").forEach((m) => {
    porPagina[m.pagina] = (porPagina[m.pagina] || 0) + 1;
  });
  const paginasOrdenadas = Object.entries(porPagina).sort((a, b) => b[1] - a[1]).slice(0, 8);

  document.getElementById("lista-paginas").innerHTML = paginasOrdenadas.length === 0
    ? `<p class="admin-vazio">Ainda não há dados suficientes.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>Página</th><th>Visitas</th></tr></thead>
        <tbody>
          ${paginasOrdenadas.map(([pagina, qtd]) => `<tr><td>${escapeHtml(pagina)}</td><td>${qtd}</td></tr>`).join("")}
        </tbody>
      </table>
    `;

  // ── Pedidos recentes ──────────────────────────────────────────────────────
  const recentes = pedidos.slice(0, 8);
  document.getElementById("lista-pedidos-recentes").innerHTML = recentes.length === 0
    ? `<p class="admin-vazio">Nenhum pedido ainda.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>ID</th><th>Data</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${recentes.map((p) => `
            <tr>
              <td>${escapeHtml(p.id.slice(0, 8))}...</td>
              <td>${formatarData(p.criadoEm)}</td>
              <td>${formatarPreco(totaisPedidos.get(p.id)?.total ?? 0)}</td>
              <td><span class="badge badge-${escapeHtml(p.status || "")}">${escapeHtml((p.status || "").replace(/_/g, " "))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
}

protegerPaginaAdmin(() => {
  carregarDashboard().catch((erro) => {
    console.error("Erro ao carregar dashboard:", erro);
  });
});
