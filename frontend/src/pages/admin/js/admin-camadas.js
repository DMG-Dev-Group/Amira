import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast } from "../../services/ui-feedback.js";
import {
  listarCamadas,
  criarCamada,
  renomearCamada,
  excluirCamada,
  salvarOpcoes,
  reordenarCamadas,
  gerarSlug
} from "../../services/camadas.js";
import { montarUploadFoto } from "../../services/imagem-upload.js";
import { escapeHtml, urlImagemSegura } from "../../services/seguranca.js";

let camadasCache = [];
let camadaEditandoId = null;          // null = criando camada nova
let opcaoCtx = { camadaId: null, indice: null }; // indice null = opção nova

const lista = document.getElementById("lista-camadas");
const contagem = document.getElementById("contagem-camadas");

const modalCamada = document.getElementById("modal-camada");
const formCamada = document.getElementById("form-camada");
const modalCamadaTitulo = document.getElementById("modal-camada-titulo");
const inputCamadaNome = document.getElementById("camada-nome");
const btnSalvarCamada = document.getElementById("btn-salvar-camada");

const modalOpcao = document.getElementById("modal-opcao");
const formOpcao = document.getElementById("form-opcao");
const modalOpcaoTitulo = document.getElementById("modal-opcao-titulo");
const inputOpcaoNome = document.getElementById("opcao-nome");
const campoOpcaoImagem = document.getElementById("campo-opcao-imagem");
const opcaoImagem = montarUploadFoto(document.getElementById("opcao-imagem-upload"), {
  placeholder: "../images/amira-placeholder.svg",
  textoVazio: "Escolher imagem de capa",
  // As capas ficam TODAS dentro do mesmo documento da camada, que o
  // Firestore corta em 1 MB — orçamento apertado por capa.
  maxLado: 900,
  alvoBytes: 110 * 1024
});
const btnSalvarOpcao = document.getElementById("btn-salvar-opcao");

// ── Render ──────────────────────────────────────────────────────────────
async function carregarLista() {
  camadasCache = await listarCamadas();
  contagem.textContent = `${camadasCache.length} camada${camadasCache.length === 1 ? "" : "s"} — a do topo é a principal`;

  if (camadasCache.length === 0) {
    lista.innerHTML = `<p class="admin-vazio">Nenhuma camada cadastrada. Crie a primeira (ela será a principal).</p>`;
    return;
  }

  lista.innerHTML = camadasCache.map((camada, i) => {
    const ehPrincipal = i === 0;
    return `
    <div class="camada-card">
      <div class="camada-card-topo">
        <div class="camada-card-titulo">
          <div class="camada-reordenar">
            <button class="admin-btn admin-btn-outline admin-btn-sm btn-mover" data-id="${escapeHtml(camada.id)}" data-dir="cima" ${i === 0 ? "disabled" : ""} aria-label="Mover para cima">↑</button>
            <button class="admin-btn admin-btn-outline admin-btn-sm btn-mover" data-id="${escapeHtml(camada.id)}" data-dir="baixo" ${i === camadasCache.length - 1 ? "disabled" : ""} aria-label="Mover para baixo">↓</button>
          </div>
          <div>
            <h3>${escapeHtml(camada.nome)}
              ${ehPrincipal ? '<span class="badge badge-aprovado" title="Aparece na navbar, no menu do celular, no rodapé e na home">PRINCIPAL</span>' : ""}
            </h3>
            <code class="camada-slug">${escapeHtml(camada.slug)}</code>
          </div>
        </div>
        <div class="admin-acoes-linha">
          <button class="admin-btn admin-btn-outline admin-btn-sm btn-renomear-camada" data-id="${escapeHtml(camada.id)}">Renomear</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir-camada" data-id="${escapeHtml(camada.id)}">Excluir</button>
        </div>
      </div>

      ${camada.opcoes.length === 0
        ? `<p class="admin-vazio" style="margin:0.8rem 0;">Nenhuma opção nesta camada ainda.</p>`
        : `
      <table class="admin-tabela">
        <thead>
          <tr>
            <th>Opção</th>
            <th>Identificador (slug)</th>
            ${ehPrincipal ? "<th>Capa</th>" : ""}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${camada.opcoes.map((op, idx) => `
            <tr>
              <td>${escapeHtml(op.nome)}</td>
              <td><code>${escapeHtml(op.slug)}</code></td>
              ${ehPrincipal ? `<td>${op.imagemURL ? `<img class="thumb" src="${urlImagemSegura(op.imagemURL, '../images/amira-placeholder.svg')}" alt="">` : "—"}</td>` : ""}
              <td>
                <div class="admin-acoes-linha">
                  <button class="admin-btn admin-btn-outline admin-btn-sm btn-editar-opcao" data-id="${escapeHtml(camada.id)}" data-idx="${idx}">Editar</button>
                  <button class="admin-btn admin-btn-danger admin-btn-sm btn-remover-opcao" data-id="${escapeHtml(camada.id)}" data-idx="${idx}">Remover</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>`}

      <button class="admin-btn admin-btn-outline admin-btn-sm btn-nova-opcao" data-id="${escapeHtml(camada.id)}" style="margin-top:0.8rem;">+ Adicionar opção</button>
    </div>`;
  }).join("");

  ligarEventosLista();
}

function ligarEventosLista() {
  lista.querySelectorAll(".btn-mover").forEach((btn) => {
    btn.addEventListener("click", () => moverCamada(btn.dataset.id, btn.dataset.dir));
  });
  lista.querySelectorAll(".btn-renomear-camada").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCamada(btn.dataset.id));
  });
  lista.querySelectorAll(".btn-excluir-camada").forEach((btn) => {
    btn.addEventListener("click", () => confirmarExclusaoCamada(btn.dataset.id));
  });
  lista.querySelectorAll(".btn-nova-opcao").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalOpcao(btn.dataset.id, null));
  });
  lista.querySelectorAll(".btn-editar-opcao").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalOpcao(btn.dataset.id, Number(btn.dataset.idx)));
  });
  lista.querySelectorAll(".btn-remover-opcao").forEach((btn) => {
    btn.addEventListener("click", () => removerOpcao(btn.dataset.id, Number(btn.dataset.idx)));
  });
}

// ── Reordenar ───────────────────────────────────────────────────────────
async function moverCamada(id, dir) {
  const pos = camadasCache.findIndex((c) => c.id === id);
  if (pos < 0) return;
  const alvo = dir === "cima" ? pos - 1 : pos + 1;
  if (alvo < 0 || alvo >= camadasCache.length) return;

  const ids = camadasCache.map((c) => c.id);
  [ids[pos], ids[alvo]] = [ids[alvo], ids[pos]];

  lista.style.opacity = "0.5";
  try {
    await reordenarCamadas(ids);
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível reordenar agora. Tente novamente.", "erro");
  } finally {
    lista.style.opacity = "";
  }
}

// ── Modal camada (nova / renomear) ──────────────────────────────────────
function abrirModalCamada(id) {
  camadaEditandoId = id || null;
  formCamada.reset();
  if (camadaEditandoId) {
    const c = camadasCache.find((x) => x.id === camadaEditandoId);
    modalCamadaTitulo.textContent = "Renomear camada";
    inputCamadaNome.value = c?.nome || "";
  } else {
    modalCamadaTitulo.textContent = "Nova camada";
  }
  modalCamada.style.display = "flex";
}

function fecharModalCamada() {
  modalCamada.style.display = "none";
}

async function confirmarExclusaoCamada(id) {
  const c = camadasCache.find((x) => x.id === id);
  const ehPrincipal = camadasCache[0]?.id === id;
  const aviso = ehPrincipal
    ? `A loja fica sem menu de categorias até você definir outra camada como principal.`
    : `Os produtos não são apagados, mas deixam de ser filtráveis por ela.`;
  const ok = await confirmar({
    titulo: `Excluir a camada "${c?.nome}"?`,
    descricao: aviso,
    confirmar: "Excluir camada",
    destrutivo: true
  });
  if (!ok) return;

  try {
    await excluirCamada(id);
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível excluir agora. Tente novamente.", "erro");
  }
}

formCamada.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const nome = inputCamadaNome.value.trim();
  if (!nome) {
    toast("Informe o nome da camada.", "erro");
    return;
  }

  btnSalvarCamada.disabled = true;
  btnSalvarCamada.textContent = "Salvando...";
  try {
    if (camadaEditandoId) {
      await renomearCamada(camadaEditandoId, nome);
    } else {
      await criarCamada({ nome });
    }
    fecharModalCamada();
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    toast(erro.message || "Não foi possível salvar agora.", "erro");
  } finally {
    btnSalvarCamada.disabled = false;
    btnSalvarCamada.textContent = "Salvar";
  }
});

// ── Modal opção (nova / editar) ─────────────────────────────────────────
function abrirModalOpcao(camadaId, indice) {
  opcaoCtx = { camadaId, indice };
  formOpcao.reset();

  const ehPrincipal = camadasCache[0]?.id === camadaId;
  campoOpcaoImagem.style.display = ehPrincipal ? "block" : "none";

  if (indice !== null && indice !== undefined) {
    const camada = camadasCache.find((c) => c.id === camadaId);
    const op = camada?.opcoes[indice];
    modalOpcaoTitulo.textContent = "Editar opção";
    inputOpcaoNome.value = op?.nome || "";
    opcaoImagem.definir(op?.imagemURL || "");
  } else {
    modalOpcaoTitulo.textContent = "Nova opção";
    opcaoImagem.definir("");
  }
  modalOpcao.style.display = "flex";
}

function fecharModalOpcao() {
  modalOpcao.style.display = "none";
}

async function removerOpcao(camadaId, indice) {
  const camada = camadasCache.find((c) => c.id === camadaId);
  if (!camada) return;
  const op = camada.opcoes[indice];
  const ok = await confirmar({
    titulo: `Remover "${op?.nome}"?`,
    descricao: "Produtos marcados com essa opção deixam de aparecer nesse filtro.",
    confirmar: "Remover",
    destrutivo: true
  });
  if (!ok) return;

  const novas = camada.opcoes.filter((_, i) => i !== indice);
  try {
    await salvarOpcoes(camadaId, novas);
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível remover agora. Tente novamente.", "erro");
  }
}

formOpcao.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const camada = camadasCache.find((c) => c.id === opcaoCtx.camadaId);
  if (!camada) return;

  const nome = inputOpcaoNome.value.trim();
  const imagemURL = opcaoImagem.valor();
  if (!nome) {
    toast("Informe o nome da opção.", "erro");
    return;
  }

  const novas = camada.opcoes.map((o) => ({ ...o }));
  const editando = opcaoCtx.indice !== null && opcaoCtx.indice !== undefined;

  if (editando) {
    // Renomear NUNCA muda o slug — ele já está nos produtos e nos links.
    novas[opcaoCtx.indice] = { ...novas[opcaoCtx.indice], nome, imagemURL };
  } else {
    const slug = gerarSlug(nome);
    if (!slug) {
      toast("Nome inválido para gerar o identificador.", "erro");
      return;
    }
    if (novas.some((o) => o.slug === slug)) {
      toast("Já existe uma opção com esse nome nesta camada.", "erro");
      return;
    }
    novas.push({ nome, slug, imagemURL });
  }

  // As capas ficam embutidas no documento da camada; o Firestore corta em
  // ~1 MB. Confere o total antes de tentar salvar.
  if (new Blob([JSON.stringify(novas)]).size > 900 * 1024) {
    toast("As imagens de capa desta camada somam perto de 1 MB. Use imagens menores ou dê capa a menos opções.", "erro");
    return;
  }

  btnSalvarOpcao.disabled = true;
  btnSalvarOpcao.textContent = "Salvando...";
  try {
    await salvarOpcoes(opcaoCtx.camadaId, novas);
    fecharModalOpcao();
    await carregarLista();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível salvar agora. Tente novamente.", "erro");
  } finally {
    btnSalvarOpcao.disabled = false;
    btnSalvarOpcao.textContent = "Salvar";
  }
});

// ── Ligações fixas ──────────────────────────────────────────────────────
document.getElementById("btn-nova-camada").addEventListener("click", () => abrirModalCamada(null));
document.getElementById("btn-cancelar-modal-camada").addEventListener("click", fecharModalCamada);
document.getElementById("btn-cancelar-modal-opcao").addEventListener("click", fecharModalOpcao);
modalCamada.addEventListener("click", (e) => { if (e.target === modalCamada) fecharModalCamada(); });
modalOpcao.addEventListener("click", (e) => { if (e.target === modalOpcao) fecharModalOpcao(); });

protegerPaginaAdmin(() => {
  carregarLista().catch((erro) => {
    console.error("Erro ao carregar camadas:", erro);
    lista.innerHTML = `<p class="admin-vazio">Não foi possível carregar as camadas agora.</p>`;
  });
});
