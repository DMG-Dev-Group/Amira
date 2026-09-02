import { protegerPaginaAdmin } from "./admin-auth.js";
import { listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria } from "../../services/categorias.js";
import { escapeHtml, urlImagemSegura } from "../../services/seguranca.js";

let categoriasCache = [];
let categoriaEditandoId = null;

const tabela = document.getElementById("tabela-categorias");
const contagem = document.getElementById("contagem-categorias");
const modal = document.getElementById("modal-categoria");
const form = document.getElementById("form-categoria");
const modalTitulo = document.getElementById("modal-categoria-titulo");
const modalMsg = document.getElementById("modal-categoria-msg");
const inputNome = document.getElementById("cat-nome");
const inputImagem = document.getElementById("cat-imagem");
const btnSalvar = document.getElementById("btn-salvar-categoria");

async function carregarTabela() {
  categoriasCache = await listarCategorias();
  contagem.textContent = `${categoriasCache.length} categoria${categoriasCache.length === 1 ? "" : "s"} cadastrada${categoriasCache.length === 1 ? "" : "s"}`;

  if (categoriasCache.length === 0) {
    tabela.innerHTML = `<p class="admin-vazio">Nenhuma categoria cadastrada ainda. Produtos sem categoria não aparecem nos filtros do catálogo.</p>`;
    return;
  }

  tabela.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr><th>Imagem</th><th>Nome</th><th>Identificador (slug)</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${categoriasCache.map((c) => `
          <tr>
            <td>${c.imagemURL ? `<img class="thumb" src="${urlImagemSegura(c.imagemURL, '../images/amira-placeholder.svg')}" alt="">` : "—"}</td>
            <td>${escapeHtml(c.nome)}</td>
            <td><code>${escapeHtml(c.slug)}</code></td>
            <td>
              <div class="admin-acoes-linha">
                <button class="admin-btn admin-btn-outline admin-btn-sm btn-editar-cat" data-id="${escapeHtml(c.id)}">Editar</button>
                <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir-cat" data-id="${escapeHtml(c.id)}">Excluir</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".btn-editar-cat").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEdicao(btn.dataset.id));
  });
  document.querySelectorAll(".btn-excluir-cat").forEach((btn) => {
    btn.addEventListener("click", () => confirmarExclusao(btn.dataset.id));
  });
}

function limparForm() {
  form.reset();
  modalMsg.style.display = "none";
}

function abrirModalNova() {
  categoriaEditandoId = null;
  limparForm();
  modalTitulo.textContent = "Nova categoria";
  modal.style.display = "flex";
}

function abrirModalEdicao(id) {
  const c = categoriasCache.find((cat) => cat.id === id);
  if (!c) return;

  categoriaEditandoId = id;
  limparForm();
  modalTitulo.textContent = "Editar categoria";
  inputNome.value = c.nome;
  inputImagem.value = c.imagemURL || "";
  modal.style.display = "flex";
}

function fecharModal() {
  modal.style.display = "none";
}

async function confirmarExclusao(id) {
  const categoria = categoriasCache.find((c) => c.id === id);
  const confirmar = confirm(
    `Excluir a categoria "${categoria?.nome}"? Produtos que já estão marcados com essa categoria não serão excluídos, mas deixarão de aparecer em filtros de categoria.`
  );
  if (!confirmar) return;

  try {
    await excluirCategoria(id);
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível excluir agora. Tente novamente.");
  }
}

document.getElementById("btn-nova-categoria").addEventListener("click", abrirModalNova);
document.getElementById("btn-cancelar-modal-categoria").addEventListener("click", fecharModal);
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) fecharModal();
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  modalMsg.style.display = "none";

  const nome = inputNome.value.trim();
  const imagemURL = inputImagem.value.trim();

  if (!nome) {
    modalMsg.textContent = "Informe o nome da categoria.";
    modalMsg.style.display = "block";
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    if (categoriaEditandoId) {
      await atualizarCategoria(categoriaEditandoId, { nome, imagemURL });
    } else {
      await criarCategoria({ nome, imagemURL });
    }
    fecharModal();
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    modalMsg.textContent = erro.message || "Não foi possível salvar agora. Tente novamente.";
    modalMsg.style.display = "block";
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar";
  }
});

protegerPaginaAdmin(() => {
  carregarTabela().catch((erro) => {
    console.error("Erro ao carregar categorias:", erro);
    tabela.innerHTML = `<p class="admin-vazio">Não foi possível carregar as categorias agora.</p>`;
  });
});
