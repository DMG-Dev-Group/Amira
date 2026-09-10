import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast } from "../../services/ui-feedback.js";
import {
  criarProduto,
  atualizarProduto,
  excluirProduto,
  estoquePorModo,
  filtrosDoProduto
} from "../../services/produtos.js";
import { listarCamadas, camadaPrincipal } from "../../services/camadas.js";
import { comprimirImagem, montarUploadFoto } from "../../services/imagem-upload.js";
import { escapeHtml, urlImagemSegura } from "../../services/seguranca.js";
import { db } from "../../services/firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let produtosCache = [];
let camadasCache = [];
let camadaPrincipalSlug = null;
let produtoEditandoId = null;

const tabela = document.getElementById("tabela-produtos");
const contagem = document.getElementById("contagem-produtos");
const modal = document.getElementById("modal-produto");
const form = document.getElementById("form-produto");
const modalTitulo = document.getElementById("modal-titulo");
const btnSalvar = document.getElementById("btn-salvar-produto");
const selectOrdenar = document.getElementById("select-ordenar-admin");
const inputBusca = document.getElementById("busca-produtos-admin");
const camadasContainer = document.getElementById("p-camadas");
const selectBannerHero = document.getElementById("p-banner-hero");
const camposBannerHero = document.getElementById("campos-banner-hero");
const selectDescontoAtivo = document.getElementById("p-desconto-ativo");
const camposDesconto = document.getElementById("campos-desconto");
const listaImagens = document.getElementById("lista-imagens-produto");
const btnAddImagem = document.getElementById("btn-add-imagem");

// Imagem do banner "Produto da Estação" — upload de arquivo (imagem larga,
// então um teto de lado maior). O valor fica em bannerUpload.valor().
const bannerUpload = montarUploadFoto(document.getElementById("p-banner-imagem-upload"), {
  placeholder: "../images/amira-placeholder.svg",
  textoVazio: "Escolher imagem do banner",
  maxLado: 1400,
  alvoBytes: 320 * 1024
});

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Busca TODOS os produtos (ativos e inativos) — diferente do catálogo
// público, o admin precisa ver e gerenciar tudo.
async function buscarTodosProdutosAdmin() {
  const colecaoRef = collection(db, "produtos");
  const q = query(colecaoRef, orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function carregarCamadasNoForm() {
  camadasCache = await listarCamadas();
  camadaPrincipalSlug = camadaPrincipal(camadasCache)?.slug || null;

  if (camadasCache.length === 0) {
    camadasContainer.innerHTML = `<p style="color:var(--danger); font-size:0.8rem;">Nenhuma camada cadastrada — crie uma em "Camadas de filtro".</p>`;
    return;
  }

  camadasContainer.innerHTML = camadasCache.map((camada, i) => `
    <fieldset class="p-camada-grupo">
      <legend>${escapeHtml(camada.nome)}${i === 0 ? " <span class=\"badge badge-aprovado\">principal</span>" : ""}</legend>
      ${camada.opcoes.length === 0
        ? `<span style="color:var(--text-muted,#999); font-size:0.76rem;">Sem opções nesta camada.</span>`
        : camada.opcoes.map((op) => `
          <label class="p-camada-opcao">
            <input type="checkbox" data-camada="${escapeHtml(camada.slug)}" value="${escapeHtml(op.slug)}">
            <span>${escapeHtml(op.nome)}</span>
          </label>
        `).join("")}
    </fieldset>
  `).join("");
}

/** Lê os checkboxes marcados no form como { [camadaSlug]: string[] }. */
function lerFiltrosDoForm() {
  const filtros = {};
  camadasContainer.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
    (filtros[cb.dataset.camada] ||= []).push(cb.value);
  });
  return filtros;
}

/** Marca os checkboxes do form a partir de um produto (com ponte legada). */
function marcarFiltrosNoForm(produto) {
  const doProduto = filtrosDoProduto(produto, camadaPrincipalSlug);
  camadasContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = (doProduto[cb.dataset.camada] || []).includes(cb.value);
  });
}

/** Rótulo de camada principal de um produto (para a tabela). */
function rotuloPrincipal(produto) {
  const doProduto = filtrosDoProduto(produto, camadaPrincipalSlug);
  const slugs = camadaPrincipalSlug ? (doProduto[camadaPrincipalSlug] || []) : [];
  const principal = camadaPrincipal(camadasCache);
  if (!principal || slugs.length === 0) return "—";
  const nomes = slugs.map((s) => principal.opcoes.find((o) => o.slug === s)?.nome || s);
  return nomes.join(", ");
}

// ── Busca + ordenação combinadas ─────────────────────────────────────────
function ordenarLista(lista, criterio) {
  const copia = [...lista];
  switch (criterio) {
    case "categoria-az":
      return copia.sort((a, b) => rotuloPrincipal(a).localeCompare(rotuloPrincipal(b), "pt-BR"));
    case "preco-maior":
      return copia.sort((a, b) => (b.precoVarejo || 0) - (a.precoVarejo || 0));
    case "preco-menor":
      return copia.sort((a, b) => (a.precoVarejo || 0) - (b.precoVarejo || 0));
    case "estoque-maior":
      return copia.sort((a, b) => estoquePorModo(b) - estoquePorModo(a));
    case "estoque-menor":
      return copia.sort((a, b) => estoquePorModo(a) - estoquePorModo(b));
    default:
      return copia; // "recentes" = ordem original (mais recentes primeiro)
  }
}

function filtrarPorBusca(lista, termo) {
  const termoNormalizado = termo.trim().toLowerCase();
  if (!termoNormalizado) return lista;
  return lista.filter((p) => {
    // "sku" não é mais editável, mas produtos antigos ainda podem tê-lo —
    // manter na busca não atrapalha e ajuda a achar cadastro legado.
    const alvo = `${p.nome || ""} ${p.sku || ""} ${p.codigoBarras || ""}`.toLowerCase();
    return alvo.includes(termoNormalizado);
  });
}

function renderizarTabela() {
  let lista = filtrarPorBusca(produtosCache, inputBusca.value);
  lista = ordenarLista(lista, selectOrdenar.value);

  contagem.textContent = `${lista.length} de ${produtosCache.length} produto${produtosCache.length === 1 ? "" : "s"}`;

  if (lista.length === 0) {
    tabela.innerHTML = produtosCache.length === 0
      ? `<p class="admin-vazio">Nenhum produto cadastrado ainda. Clique em "+ Novo produto" para começar.</p>`
      : `<p class="admin-vazio">Nenhum produto encontrado para essa busca.</p>`;
    return;
  }

  tabela.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr>
          <th></th>
          <th>Nome</th>
          <th>${escapeHtml(camadaPrincipal(camadasCache)?.nome || "Filtro")}</th>
          <th>Preço</th>
          <th>Estoque</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr>
            <td><img class="thumb" src="${urlImagemSegura(primeiraImagem(p), '../images/amira-placeholder.svg')}" alt=""></td>
            <td>${escapeHtml(p.nome)}
              ${p.bannerHero ? '<span class="badge badge-aprovado" title="No banner Produto da Estação">BANNER</span>' : ""}
              ${p.descontoAtivo ? `<span class="badge badge-pendente" title="Produto em desconto">-${Number(p.descontoPercentual) || 0}%</span>` : ""}
              ${p.freteDisponivel === false ? '<span class="badge badge-preparando" title="Sem entrega — cliente só pode retirar na loja">SÓ RETIRADA</span>' : ""}
              ${!(Number(p.precoVarejo) > 0) ? '<span class="badge badge-enviado" title="Sem preço de varejo — vendido apenas no atacado">SÓ ATACADO</span>' : ""}
            </td>
            <td>${escapeHtml(rotuloPrincipal(p))}</td>
            <td>${formatarPreco(p.precoVarejo)}</td>
            <td>${estoquePorModo(p)}</td>
            <td><span class="badge ${p.ativo ? 'badge-aprovado' : 'badge-rejeitado'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
              <div class="admin-acoes-linha">
                <button class="admin-btn admin-btn-outline admin-btn-sm btn-editar" data-id="${escapeHtml(p.id)}">Editar</button>
                <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir" data-id="${escapeHtml(p.id)}">Excluir</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".btn-editar").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEdicao(btn.dataset.id));
  });
  document.querySelectorAll(".btn-excluir").forEach((btn) => {
    btn.addEventListener("click", () => confirmarExclusao(btn.dataset.id));
  });
}

// imagemURL continua sendo o campo principal (compatibilidade com o
// restante do site); imagensExtras guarda as imagens adicionais.
function primeiraImagem(produto) {
  return produto.imagemURL || (produto.imagensExtras && produto.imagensExtras[0]) || "";
}

async function carregarTabela() {
  produtosCache = await buscarTodosProdutosAdmin();
  renderizarTabela();
}

// ── Fotos do produto: upload de arquivo → data URI comprimida ────────────
// A compressão (lê arquivo → redimensiona no <canvas> → data URI JPEG) vive
// em services/imagem-upload.js e é compartilhada com o banner, as capas de
// camada e a home. Aqui fica só a UI de múltiplas fotos por produto.
const MAX_FOTOS = 5;

// Cada "slot" guarda a foto atual (data URI ou URL antiga) em dataset.valor.
function criarSlotImagem(valor = "", ehPrincipal = false) {
  const slot = document.createElement("div");
  slot.className = "img-slot";
  slot.dataset.valor = valor || "";

  slot.innerHTML = `
    <div class="img-slot-preview">
      <img alt="" src="${valor ? urlImagemSegura(valor, '../images/amira-placeholder.svg') : '../images/amira-placeholder.svg'}">
    </div>
    <div class="img-slot-acoes">
      <span class="img-slot-tag">${ehPrincipal ? "Foto principal" : "Foto adicional"}</span>
      <label class="admin-btn admin-btn-outline admin-btn-sm img-slot-escolher">
        ${valor ? "Trocar foto" : "Escolher foto"}
        <input type="file" accept="image/*" hidden>
      </label>
      ${!ehPrincipal ? `<button type="button" class="admin-btn admin-btn-danger admin-btn-sm btn-remover-imagem">Remover</button>` : ""}
    </div>
    <p class="img-slot-msg" style="display:none;"></p>
  `;

  const input = slot.querySelector('input[type="file"]');
  const preview = slot.querySelector("img");
  const escolher = slot.querySelector(".img-slot-escolher");
  const msg = slot.querySelector(".img-slot-msg");

  function setRotuloEscolher(texto) {
    escolher.childNodes[0].nodeValue = `${texto} `;
  }

  input.addEventListener("change", async () => {
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    msg.style.display = "none";
    escolher.classList.add("processando");
    setRotuloEscolher("Processando...");
    try {
      const dataURI = await comprimirImagem(arquivo);
      slot.dataset.valor = dataURI;
      preview.src = dataURI;
      setRotuloEscolher("Trocar foto");
    } catch (erro) {
      console.error(erro);
      msg.textContent = erro.message || "Não foi possível processar essa imagem.";
      msg.style.display = "block";
      setRotuloEscolher(slot.dataset.valor ? "Trocar foto" : "Escolher foto");
    } finally {
      input.value = "";
      escolher.classList.remove("processando");
    }
  });

  slot.querySelector(".btn-remover-imagem")?.addEventListener("click", () => slot.remove());
  return slot;
}

function slotsAtuais() {
  return Array.from(listaImagens.querySelectorAll(".img-slot"));
}

function resetarListaImagens() {
  listaImagens.innerHTML = "";
  listaImagens.appendChild(criarSlotImagem("", true));
}

function preencherListaImagens(produto) {
  listaImagens.innerHTML = "";
  listaImagens.appendChild(criarSlotImagem(produto.imagemURL || "", true));
  (produto.imagensExtras || []).forEach((url) => {
    listaImagens.appendChild(criarSlotImagem(url, false));
  });
}

function coletarImagens() {
  const valores = slotsAtuais().map((s) => s.dataset.valor || "").filter(Boolean);
  return {
    imagemURL: valores[0] || "",
    imagensExtras: valores.slice(1)
  };
}

btnAddImagem.addEventListener("click", () => {
  if (slotsAtuais().length >= MAX_FOTOS) {
    toast(`Máximo de ${MAX_FOTOS} fotos por produto.`, "erro");
    return;
  }
  listaImagens.appendChild(criarSlotImagem("", false));
});

// ── Modal de criar/editar produto ────────────────────────────────────────
function limparForm() {
  form.reset();
  document.getElementById("p-ativo").value = "true";
  document.getElementById("p-destaque").value = "false";
  selectBannerHero.value = "false";
  camposBannerHero.style.display = "none";
  document.getElementById("p-banner-nome-secao").value = "Produto da estação";
  selectDescontoAtivo.value = "false";
  camposDesconto.style.display = "none";
  document.getElementById("p-estoque").value = 0;
  document.getElementById("p-frete-disponivel").value = "true";
  bannerUpload.definir("");
  resetarListaImagens();
}

function abrirModalNovo() {
  produtoEditandoId = null;
  limparForm();
  modalTitulo.textContent = "Novo produto";
  modal.style.display = "flex";
}

function abrirModalEdicao(id) {
  const p = produtosCache.find((prod) => prod.id === id);
  if (!p) return;

  produtoEditandoId = id;
  limparForm();
  modalTitulo.textContent = "Editar produto";

  document.getElementById("p-nome").value = p.nome || "";
  document.getElementById("p-codigo-barras").value = p.codigoBarras || "";
  marcarFiltrosNoForm(p);
  document.getElementById("p-peso").value = p.peso || "";
  document.getElementById("p-descricao").value = p.descricao || "";
  preencherListaImagens(p);
  document.getElementById("p-preco-varejo").value = p.precoVarejo || "";
  document.getElementById("p-preco-atacado").value = p.precoAtacado || "";
  // Estoque compartilhado (produtos.js normaliza os campos legados).
  document.getElementById("p-estoque").value = estoquePorModo(p);
  document.getElementById("p-ativo").value = String(p.ativo !== false);
  document.getElementById("p-destaque").value = String(p.destaque === true);
  document.getElementById("p-frete-disponivel").value = String(p.freteDisponivel !== false);

  selectDescontoAtivo.value = String(p.descontoAtivo === true);
  camposDesconto.style.display = p.descontoAtivo === true ? "block" : "none";
  document.getElementById("p-desconto-percentual").value = p.descontoPercentual || "";

  selectBannerHero.value = String(p.bannerHero === true);
  camposBannerHero.style.display = p.bannerHero ? "block" : "none";
  bannerUpload.definir(p.bannerImagemURL || "");
  document.getElementById("p-banner-nome-secao").value = p.bannerNomeSecao || "Produto da estação";
  document.getElementById("p-banner-etiqueta").value = p.bannerEtiqueta || "";
  document.getElementById("p-banner-titulo").value = p.bannerTitulo || "";
  document.getElementById("p-banner-texto").value = p.bannerTexto || "";
  document.getElementById("p-banner-tags").value = (p.bannerTags || []).join(", ");
  document.getElementById("p-banner-ordem").value = p.bannerOrdem ?? 0;

  modal.style.display = "flex";
}

function fecharModal() {
  modal.style.display = "none";
}

async function confirmarExclusao(id) {
  const produto = produtosCache.find((p) => p.id === id);
  const ok = await confirmar({
    titulo: `Excluir "${produto?.nome}"?`,
    descricao: "Essa ação não pode ser desfeita.",
    confirmar: "Excluir produto",
    destrutivo: true
  });
  if (!ok) return;

  try {
    await excluirProduto(id);
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível excluir o produto agora. Tente novamente.", "erro");
  }
}

document.getElementById("btn-novo-produto").addEventListener("click", abrirModalNovo);
document.getElementById("btn-cancelar-modal").addEventListener("click", fecharModal);
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) fecharModal();
});

selectOrdenar.addEventListener("change", renderizarTabela);
inputBusca.addEventListener("input", renderizarTabela);

selectBannerHero.addEventListener("change", () => {
  camposBannerHero.style.display = selectBannerHero.value === "true" ? "block" : "none";
});

// Desconto opcional (A2): os campos só aparecem quando ligado, igual ao banner.
selectDescontoAtivo.addEventListener("change", () => {
  camposDesconto.style.display = selectDescontoAtivo.value === "true" ? "block" : "none";
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const bannerHero = selectBannerHero.value === "true";
  const descontoAtivo = selectDescontoAtivo.value === "true";
  const descontoPercentual = Number(document.getElementById("p-desconto-percentual").value) || 0;
  const { imagemURL, imagensExtras } = coletarImagens();

  const filtros = lerFiltrosDoForm();
  // Campo legado "categoria": 1ª opção marcada na camada principal — ponte
  // p/ produtos e links antigos (ver services/produtos.js).
  const categoriaLegado = (camadaPrincipalSlug && filtros[camadaPrincipalSlug]?.[0]) || "";

  const dados = {
    nome: document.getElementById("p-nome").value.trim(),
    codigoBarras: document.getElementById("p-codigo-barras").value.trim(),
    filtros,
    categoria: categoriaLegado,
    peso: Number(document.getElementById("p-peso").value) || 0,
    descricao: document.getElementById("p-descricao").value.trim(),
    imagemURL,
    imagensExtras,
    precoVarejo: Number(document.getElementById("p-preco-varejo").value) || 0,
    // Estoque COMPARTILHADO entre varejo e atacado — um número só. Os campos
    // legados são zerados para não confundir a leitura daqui pra frente.
    estoque: Number(document.getElementById("p-estoque").value) || 0,
    estoqueVarejo: null,
    estoqueAtacado: null,
    precoAtacado: Number(document.getElementById("p-preco-atacado").value) || null,
    // Desconto opcional (A2) — o preço final é derivado da coleção produtos.
    descontoAtivo,
    descontoTipo: descontoAtivo ? "percentual" : null,
    descontoPercentual: descontoAtivo ? descontoPercentual : null,
    // Frete por produto (R2 item 7): false = só retirada na loja.
    freteDisponivel: document.getElementById("p-frete-disponivel").value === "true",
    ativo: document.getElementById("p-ativo").value === "true",
    destaque: document.getElementById("p-destaque").value === "true",
    bannerHero,
    bannerImagemURL: bannerHero ? bannerUpload.valor() : "",
    bannerNomeSecao: bannerHero ? (document.getElementById("p-banner-nome-secao").value.trim() || "Produto da estação") : "",
    bannerEtiqueta: bannerHero ? document.getElementById("p-banner-etiqueta").value.trim() : "",
    bannerTitulo: bannerHero ? document.getElementById("p-banner-titulo").value.trim() : "",
    bannerTexto: bannerHero ? document.getElementById("p-banner-texto").value.trim() : "",
    bannerTags: bannerHero
      ? document.getElementById("p-banner-tags").value.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    bannerOrdem: bannerHero ? Number(document.getElementById("p-banner-ordem").value) || 0 : 0
  };

  if (!dados.nome) {
    toast("O nome é obrigatório.", "erro");
    return;
  }

  if (!camadaPrincipalSlug || !(filtros[camadaPrincipalSlug]?.length)) {
    toast("Marque ao menos uma opção na camada principal (a primeira). Crie camadas em \"Camadas de filtro\" se a lista estiver vazia.", "erro");
    return;
  }

  if (descontoAtivo && (descontoPercentual < 1 || descontoPercentual > 90)) {
    toast("O desconto deve ser um percentual entre 1 e 90.", "erro");
    return;
  }

  // Varejo é opcional (R2 6.1), mas o produto precisa existir em PELO
  // MENOS uma modalidade — senão não aparece em lugar nenhum da loja.
  if ((dados.precoVarejo || 0) <= 0 && (dados.precoAtacado || 0) <= 0) {
    toast("Configure pelo menos uma modalidade: preço de varejo e/ou preço de atacado.", "erro");
    return;
  }

  // As fotos ficam embutidas no documento; o Firestore limita ~1 MB por
  // documento. Confere o tamanho total antes de tentar salvar.
  const pesoDoc = new Blob([JSON.stringify(dados)]).size;
  if (pesoDoc > 950 * 1024) {
    toast(`As fotos deste produto somam ${(pesoDoc / 1024 / 1024).toFixed(2)} MB e o limite é 1 MB. Remova alguma foto ou use imagens menores.`, "erro");
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    if (produtoEditandoId) {
      await atualizarProduto(produtoEditandoId, dados);
    } else {
      await criarProduto(dados);
    }
    fecharModal();
    await carregarTabela();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível salvar o produto agora. Tente novamente.", "erro");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar produto";
  }
});

// A tela de iPhones manda para cá com a opção certa já escolhida:
//   produtos.html?novo=1&opcao=<slug>   → abre o form novo, opção marcada
//   produtos.html?editar=<id>           → abre o form de edição
function aplicarAtalhosDaURL() {
  const q = new URLSearchParams(window.location.search);

  const editar = q.get("editar");
  if (editar) {
    abrirModalEdicao(editar);
    return;
  }

  if (q.get("novo") !== "1") return;
  abrirModalNovo();

  const opcao = q.get("opcao");
  if (!opcao) return;
  const cb = camadasContainer.querySelector(`input[type="checkbox"][value="${CSS.escape(opcao)}"]`);
  if (cb) cb.checked = true;
}

protegerPaginaAdmin(async () => {
  try {
    await carregarCamadasNoForm();
    await carregarTabela();
    aplicarAtalhosDaURL();
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    tabela.innerHTML = `<p class="admin-vazio">Não foi possível carregar os produtos agora.</p>`;
  }
});
