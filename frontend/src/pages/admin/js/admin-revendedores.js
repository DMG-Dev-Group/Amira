import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast, carregando } from "../../services/ui-feedback.js";
import { escapeHtml } from "../../services/seguranca.js";
import { formatarCNPJ, validarCNPJ } from "../../services/cnpj.js";
import { db, auth } from "../../services/firebase-config.js";
import {
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let revendedoresCache = [];
let usuariosCache = [];

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
  const nome = revendedor?.razaoSocial || revendedor?.nome || "revendedor";
  const ok = await confirmar(
    novoStatus === "aprovado"
      ? { titulo: `Aprovar ${nome}?`, descricao: "Ele passará a ter acesso aos preços de atacado.", confirmar: "Aprovar" }
      : { titulo: `Rejeitar ${nome}?`, descricao: "A solicitação de revenda será marcada como rejeitada.", confirmar: "Rejeitar", destrutivo: true }
  );
  if (!ok) return;

  try {
    const ref = doc(db, "usuarios", uid);
    await updateDoc(ref, { statusRevendedor: novoStatus });
    if (revendedor) revendedor.statusRevendedor = novoStatus;
    renderizarTabelas();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível atualizar o status agora. Tente novamente.", "erro");
  }
}

// ── Cadastrar conta pelo painel ──────────────────────────────────────
// Passa por /api/admin-usuario porque criar usuário com senha exige o
// Admin SDK: o createUserWithEmailAndPassword do SDK web trocaria a
// sessão do admin pela do usuário recém-criado.
const campo = (id) => document.getElementById(id);
const chkRevendedor = campo("u-revendedor");
const camposRevendedorNovo = campo("campos-revendedor-novo");

chkRevendedor.addEventListener("change", () => {
  camposRevendedorNovo.style.display = chkRevendedor.checked ? "block" : "none";
});

campo("u-cnpj").addEventListener("input", (e) => { e.target.value = formatarCNPJ(e.target.value); });
campo("u-telefone").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  e.target.value = v;
});

campo("btn-criar-usuario").addEventListener("click", async () => {
  const nome = campo("u-nome").value.trim();
  const email = campo("u-email").value.trim();
  const senha = campo("u-senha").value;
  const comoRevendedor = chkRevendedor.checked;
  const cnpj = campo("u-cnpj").value.trim();
  const razaoSocial = campo("u-razao-social").value.trim();

  if (!nome) return toast("Informe o nome.", "erro");
  if (!email) return toast("Informe o e-mail.", "erro");
  if (senha.length < 6) return toast("A senha precisa ter pelo menos 6 caracteres.", "erro");
  if (comoRevendedor) {
    if (!cnpj || !razaoSocial) return toast("Para revendedor, informe CNPJ e razão social.", "erro");
    if (!validarCNPJ(cnpj)) return toast("CNPJ inválido. Verifique os números.", "erro");
  }

  const btn = campo("btn-criar-usuario");
  btn.disabled = true;
  btn.textContent = "Criando...";
  const fim = carregando("Criando a conta…");
  try {
    // O ID token prova ao servidor que quem chama é admin de verdade.
    const idToken = await auth.currentUser.getIdToken();
    const resp = await fetch("/api/admin-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        nome,
        email,
        senha,
        telefone: campo("u-telefone").value,
        comoRevendedor,
        cnpj,
        razaoSocial
      })
    });
    // Guardado como TEXTO primeiro: quando a função quebra antes de rodar
    // (erro de import, env var faltando), a Vercel devolve uma página de
    // erro em HTML — e aí .json() estoura e a causa some.
    const cru = await resp.text();
    let dados = {};
    try { dados = JSON.parse(cru); } catch { /* não era JSON */ }

    if (!resp.ok) {
      // O _diag diz em QUAL etapa quebrou (verificarAdmin / createUser /
      // gravarPerfil) e o código do Firebase — sem ele um 500 é cego.
      console.error("[/api/admin-usuario]", resp.status, dados._diag || cru.slice(0, 400));
      if (dados.erro) throw new Error(dados.erro);
      // Sem JSON na resposta: a função nem chegou a rodar.
      throw new Error(
        `A função /api/admin-usuario não respondeu (HTTP ${resp.status}). ` +
        "Isso é erro de deploy, não do cadastro — veja os Logs da função na Vercel."
      );
    }

    fim();
    toast(`Conta de ${dados.nome} criada.`, "sucesso");
    ["u-nome", "u-email", "u-senha", "u-telefone", "u-cnpj", "u-razao-social"].forEach((id) => {
      campo(id).value = "";
    });
    chkRevendedor.checked = false;
    camposRevendedorNovo.style.display = "none";
    await recarregar();
  } catch (erro) {
    fim();
    console.error(erro);
    // Mais tempo que o padrão: a mensagem de falha aqui carrega o
    // diagnóstico (etapa + código do Firebase) e precisa dar para ler.
    toast(erro.message || "Não foi possível criar a conta agora.", "erro", { duracao: 20000 });
  } finally {
    btn.disabled = false;
    btn.textContent = "Criar conta";
  }
});

// ── Promover uma conta que já existe ─────────────────────────────────
// Só mexe no Firestore: as rules já permitem update de usuarios/{uid}
// para admin. Nada de Auth envolvido.
const buscaUsuario = campo("busca-usuario");
const resultadoBusca = campo("resultado-busca-usuario");
const modalPromover = campo("modal-promover");
let alvoPromocao = null;

async function buscarTodosUsuarios() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderizarBusca() {
  const termo = buscaUsuario.value.trim().toLowerCase();
  if (!termo) {
    resultadoBusca.innerHTML = `<p class="admin-vazio">Digite para buscar.</p>`;
    return;
  }

  const achados = usuariosCache
    .filter((u) => `${u.nome || ""} ${u.email || ""}`.toLowerCase().includes(termo))
    .slice(0, 20);

  if (achados.length === 0) {
    resultadoBusca.innerHTML = `<p class="admin-vazio">Nenhuma conta encontrada.</p>`;
    return;
  }

  resultadoBusca.innerHTML = `
    <table class="admin-tabela">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Conta</th><th>Ações</th></tr></thead>
      <tbody>
        ${achados.map((u) => {
          const jaAprovado = u.tipoConta === "revendedor" && u.statusRevendedor === "aprovado";
          return `
            <tr>
              <td>${escapeHtml(u.nome || "—")}</td>
              <td>${escapeHtml(u.email || "—")}</td>
              <td>${jaAprovado
                ? '<span class="badge badge-aprovado">revendedor</span>'
                : u.role === "admin"
                  ? '<span class="badge badge-pendente">admin</span>'
                  : '<span class="badge badge-pendente">cliente</span>'}</td>
              <td>
                ${jaAprovado
                  ? '<span style="font-size:0.75rem; color:var(--text-muted,#999);">já tem acesso</span>'
                  : `<button class="admin-btn admin-btn-primary admin-btn-sm btn-promover" data-id="${escapeHtml(u.id)}">Tornar revendedor</button>`}
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  resultadoBusca.querySelectorAll(".btn-promover").forEach((btn) => {
    btn.addEventListener("click", () => abrirPromocao(btn.dataset.id));
  });
}

function abrirPromocao(uid) {
  alvoPromocao = usuariosCache.find((u) => u.id === uid) || null;
  if (!alvoPromocao) return;
  campo("promover-quem").textContent =
    `${alvoPromocao.nome || "Sem nome"} · ${alvoPromocao.email || ""}`;
  campo("p-cnpj").value = formatarCNPJ(alvoPromocao.cnpj || "");
  campo("p-razao-social").value = alvoPromocao.razaoSocial || "";
  modalPromover.style.display = "flex";
}

function fecharPromocao() {
  modalPromover.style.display = "none";
  alvoPromocao = null;
}

campo("p-cnpj").addEventListener("input", (e) => { e.target.value = formatarCNPJ(e.target.value); });
campo("btn-cancelar-promover").addEventListener("click", fecharPromocao);
modalPromover.addEventListener("click", (e) => { if (e.target === modalPromover) fecharPromocao(); });

campo("btn-confirmar-promover").addEventListener("click", async () => {
  if (!alvoPromocao) return;
  const cnpj = campo("p-cnpj").value.trim();
  const razaoSocial = campo("p-razao-social").value.trim();
  if (!cnpj || !razaoSocial) return toast("Informe CNPJ e razão social.", "erro");
  if (!validarCNPJ(cnpj)) return toast("CNPJ inválido. Verifique os números.", "erro");

  const btn = campo("btn-confirmar-promover");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    await updateDoc(doc(db, "usuarios", alvoPromocao.id), {
      tipoConta: "revendedor",
      statusRevendedor: "aprovado",
      cnpj,
      razaoSocial
    });
    toast(`${alvoPromocao.nome || "Conta"} agora é revendedor.`, "sucesso");
    fecharPromocao();
    await recarregar();
    renderizarBusca();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível promover agora. Tente novamente.", "erro");
  } finally {
    btn.disabled = false;
    btn.textContent = "Tornar revendedor";
  }
});

let debounceBusca;
buscaUsuario.addEventListener("input", () => {
  clearTimeout(debounceBusca);
  debounceBusca = setTimeout(renderizarBusca, 180);
});

// ── Carga ────────────────────────────────────────────────────────────
async function recarregar() {
  [revendedoresCache, usuariosCache] = await Promise.all([
    buscarRevendedores(),
    buscarTodosUsuarios()
  ]);
  renderizarTabelas();
}

protegerPaginaAdmin(async () => {
  try {
    await recarregar();
  } catch (erro) {
    console.error("Erro ao carregar revendedores:", erro);
    tabelaPendentes.innerHTML = `<p class="admin-vazio">Não foi possível carregar os dados agora.</p>`;
  }
});
