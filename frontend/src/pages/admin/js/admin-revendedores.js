import { protegerPaginaAdmin } from "./admin-auth.js";
import { escapeHtml } from "../../services/seguranca.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let revendedoresCache = [];

const contagem = document.getElementById("contagem-revendedores");
const tabelaPendentes = document.getElementById("tabela-pendentes");
const tabelaAprovados = document.getElementById("tabela-aprovados");
const tabelaRejeitados = document.getElementById("tabela-rejeitados");

function formatarData(timestamp) {
  if (!timestamp?.toDate) return "—";
  return timestamp.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function buscarRevendedores() {
  const colecaoRef = collection(db, "usuarios");
  const q = query(colecaoRef, where("tipoConta", "==", "revendedor"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function linhaRevendedor(r, comAcoes) {
  const badgeTipo = r.provavelMEI
    ? `<span class="badge badge-aprovado" title="Identificado via consulta pública à BrasilAPI">MEI</span>`
    : r.porteEmpresa
      ? `<span class="badge badge-pendente">${escapeHtml(r.porteEmpresa)}</span>`
      : `<span style="color:var(--text-muted); font-size:0.75rem;">não verificado</span>`;

  const statusSeguro = ["pendente", "aprovado", "rejeitado"].includes(r.statusRevendedor)
    ? r.statusRevendedor
    : "pendente";

  return `
    <tr>
      <td>${escapeHtml(r.nome || "—")}</td>
      <td>${escapeHtml(r.email || "—")}</td>
      <td>${escapeHtml(r.cnpj || "—")}</td>
      <td>${escapeHtml(r.razaoSocial || "—")}</td>
      <td>${badgeTipo}</td>
      <td>${formatarData(r.criadoEm)}</td>
      ${comAcoes ? `
        <td>
          <div class="admin-acoes-linha">
            <button class="admin-btn admin-btn-primary admin-btn-sm btn-aprovar" data-id="${escapeHtml(r.id)}">Aprovar</button>
            <button class="admin-btn admin-btn-danger admin-btn-sm btn-rejeitar" data-id="${escapeHtml(r.id)}">Rejeitar</button>
          </div>
        </td>
      ` : `<td><span class="badge badge-${statusSeguro}">${statusSeguro}</span></td>`}
    </tr>
  `;
}

function renderizarTabelas() {
  const pendentes = revendedoresCache.filter((r) => r.statusRevendedor === "pendente");
  const aprovados = revendedoresCache.filter((r) => r.statusRevendedor === "aprovado");
  const rejeitados = revendedoresCache.filter((r) => r.statusRevendedor === "rejeitado");

  contagem.textContent = `${revendedoresCache.length} conta(s) de revendedor — ${pendentes.length} pendente(s)`;

  tabelaPendentes.innerHTML = pendentes.length === 0
    ? `<p class="admin-vazio">Nenhuma solicitação pendente.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>Nome</th><th>E-mail</th><th>CNPJ</th><th>Razão social</th><th>Tipo</th><th>Data</th><th>Ações</th></tr></thead>
        <tbody>${pendentes.map((r) => linhaRevendedor(r, true)).join("")}</tbody>
      </table>
    `;

  tabelaAprovados.innerHTML = aprovados.length === 0
    ? `<p class="admin-vazio">Nenhum revendedor aprovado ainda.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>Nome</th><th>E-mail</th><th>CNPJ</th><th>Razão social</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead>
        <tbody>${aprovados.map((r) => linhaRevendedor(r, false)).join("")}</tbody>
      </table>
    `;

  tabelaRejeitados.innerHTML = rejeitados.length === 0
    ? `<p class="admin-vazio">Nenhum revendedor rejeitado.</p>`
    : `
      <table class="admin-tabela">
        <thead><tr><th>Nome</th><th>E-mail</th><th>CNPJ</th><th>Razão social</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead>
        <tbody>${rejeitados.map((r) => linhaRevendedor(r, false)).join("")}</tbody>
      </table>
    `;

  document.querySelectorAll(".btn-aprovar").forEach((btn) => {
    btn.addEventListener("click", () => mudarStatusRevendedor(btn.dataset.id, "aprovado"));
  });
  document.querySelectorAll(".btn-rejeitar").forEach((btn) => {
    btn.addEventListener("click", () => mudarStatusRevendedor(btn.dataset.id, "rejeitado"));
  });
}

async function mudarStatusRevendedor(uid, novoStatus) {
  const revendedor = revendedoresCache.find((r) => r.id === uid);
  const confirmar = confirm(
    novoStatus === "aprovado"
      ? `Aprovar "${revendedor?.razaoSocial || revendedor?.nome}" como revendedor? Ele passará a ter acesso aos preços de atacado.`
      : `Rejeitar a solicitação de "${revendedor?.razaoSocial || revendedor?.nome}"?`
  );
  if (!confirmar) return;

  try {
    const ref = doc(db, "usuarios", uid);
    await updateDoc(ref, { statusRevendedor: novoStatus });
    if (revendedor) revendedor.statusRevendedor = novoStatus;
    renderizarTabelas();
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível atualizar o status agora. Tente novamente.");
  }
}

protegerPaginaAdmin(async () => {
  try {
    revendedoresCache = await buscarRevendedores();
    renderizarTabelas();
  } catch (erro) {
    console.error("Erro ao carregar revendedores:", erro);
    tabelaPendentes.innerHTML = `<p class="admin-vazio">Não foi possível carregar os dados agora.</p>`;
  }
});
