// ── Painel Admin · seção de iPhones ───────────────────────────────────
// A seção de iPhones não tem coleção própria: são produtos normais
// marcados na CAMADA PRINCIPAL com uma opção cujo slug começa com
// "iphone" (ver services/iphones.js). Esta tela existe porque a divisão
// entre APARELHOS e ACESSÓRIOS não aparecia em lugar nenhum do painel —
// ficava tudo misturado na lista geral de produtos.
//
// O cadastro tem formulário PRÓPRIO aqui: iPhones e acessórios são outra
// prateleira e não dividem a aba de Produtos com a perfumaria.

import { protegerPaginaAdmin } from "./admin-auth.js";
import { confirmar, toast } from "../../services/ui-feedback.js";
import { escapeHtml, urlImagemSegura } from "../../services/seguranca.js";
import {
  listarProdutos,
  infoPreco,
  estoquePorModo,
  criarProduto,
  atualizarProduto,
  excluirProduto
} from "../../services/produtos.js";
import { montarGaleriaProduto } from "./fotos-produto.js";
import { listarCamadas, camadaPrincipal } from "../../services/camadas.js";
import {
  agruparIphones,
  listarOpcoesIphone,
  grupoDaOpcao,
  grupoDoProduto,
  GRUPO_APARELHOS,
  GRUPO_ACESSORIOS
} from "../../services/iphones.js";

const contagem = document.getElementById("contagem-iphones");
const blocoSetup = document.getElementById("iphones-setup");
const tabelaAparelhos = document.getElementById("tabela-aparelhos");
const tabelaAcessorios = document.getElementById("tabela-acessorios");
const btnNovoAparelho = document.getElementById("btn-novo-aparelho");
const btnNovoAcessorio = document.getElementById("btn-novo-acessorio");

function formatarPreco(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function linha(p) {
  const preco = infoPreco(p, "varejo");
  const estoque = estoquePorModo(p, "varejo");
  return `
    <tr>
      <td>
        <img class="thumb" src="${urlImagemSegura(p.imagemURL, "../images/amira-placeholder.svg")}" alt="">
      </td>
      <td>
        ${escapeHtml(p.nome)}
        ${p.ativo === false ? '<span class="badge badge-rejeitado">inativo</span>' : ""}
      </td>
      <td>${formatarPreco(preco.precoFinal)}</td>
      <td>${estoque <= 0 ? '<span class="badge badge-rejeitado">esgotado</span>' : estoque}</td>
      <td style="white-space:nowrap;">
        <button class="admin-btn admin-btn-outline admin-btn-sm btn-editar-iphone" data-id="${escapeHtml(p.id)}">Editar</button>
        <button class="admin-btn admin-btn-danger admin-btn-sm btn-excluir-iphone" data-id="${escapeHtml(p.id)}">Excluir</button>
      </td>
    </tr>`;
}

function renderizarGrupo(container, produtos, vazio) {
  if (produtos.length === 0) {
    container.innerHTML = `<p class="admin-vazio">${vazio}</p>`;
    return;
  }
  container.innerHTML = `
    <table class="admin-tabela">
      <thead>
        <tr><th style="width:64px;">Foto</th><th>Produto</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr>
      </thead>
      <tbody>${produtos.map(linha).join("")}</tbody>
    </table>`;
}

// Sem as opções cadastradas na camada principal não há como marcar o
// produto — em vez de um botão que não faz nada, explicamos o que falta.
function mostrarSetup(principal, opcoes) {
  const temAparelho = opcoes.some((o) => grupoDaOpcao(o) !== GRUPO_ACESSORIOS);
  const temAcessorio = opcoes.some((o) => grupoDaOpcao(o) === GRUPO_ACESSORIOS);
  if (temAparelho && temAcessorio) return false;

  const faltando = [];
  if (!temAparelho) faltando.push('<strong>iPhones</strong> (os aparelhos)');
  if (!temAcessorio) faltando.push('<strong>iPhones — Acessórios</strong>');

  blocoSetup.hidden = false;
  blocoSetup.innerHTML = `
    <h2>Falta configurar a seção</h2>
    <p style="font-size:0.85rem; color:var(--text-muted,#999); line-height:1.6;">
      A seção de iPhones é montada a partir da camada principal de filtros
      ${principal ? `(<strong>${escapeHtml(principal.nome)}</strong>)` : ""}.
      Crie ${faltando.length === 2 ? "as opções" : "a opção"} ${faltando.join(" e ")}
      em <em>Camadas de filtro</em> — o nome precisa começar com “iPhone”, e
      quem tiver “acessório” no nome vira a prateleira de acessórios.
    </p>
    <a class="admin-btn admin-btn-primary admin-btn-sm" href="camadas.html"
       style="margin-top:0.9rem; display:inline-block; text-decoration:none;">
      Ir para Camadas de filtro
    </a>`;
  return true;
}

// ── Modal de criar/editar ────────────────────────────────────────────
// Formulário próprio, sem os campos que só fazem sentido para perfumaria
// (camadas livres, banner "Produto da estação"). A PRATELEIRA escolhida
// define sozinha a opção marcada na camada principal.
const modal = document.getElementById("modal-iphone");
const modalTitulo = document.getElementById("modal-iphone-titulo");
const selGrupo = document.getElementById("i-grupo");
const selDescontoAtivo = document.getElementById("i-desconto-ativo");
const campoDesconto = document.getElementById("campo-desconto-iphone");
const btnSalvar = document.getElementById("btn-salvar-iphone");

const galeria = montarGaleriaProduto(document.getElementById("lista-imagens-iphone"), {
  max: 5,
  aoExcederMax: (max) => toast(`Máximo de ${max} fotos por item.`, "erro")
});

const campo = (id) => document.getElementById(id);
let editandoId = null;
let contexto = { camadas: [], produtos: [], principalSlug: null, opAparelho: null, opAcessorio: null };

function opcaoDoGrupo(grupo) {
  return grupo === GRUPO_ACESSORIOS ? contexto.opAcessorio : contexto.opAparelho;
}

function abrirModal(grupo, produto = null) {
  editandoId = produto ? produto.id : null;
  modalTitulo.textContent = produto
    ? "Editar item"
    : grupo === GRUPO_ACESSORIOS ? "Novo acessório" : "Novo aparelho";

  selGrupo.value = grupo;
  campo("i-nome").value = produto ? produto.nome || "" : "";
  campo("i-descricao").value = produto ? produto.descricao || "" : "";
  campo("i-preco-varejo").value = produto && produto.precoVarejo != null ? produto.precoVarejo : "";
  campo("i-preco-atacado").value = produto && produto.precoAtacado != null ? produto.precoAtacado : "";
  campo("i-estoque").value = produto && produto.estoque != null ? produto.estoque : 0;
  campo("i-peso").value = produto && produto.peso != null ? produto.peso : 0;
  campo("i-frete-disponivel").value = String(!produto || produto.freteDisponivel !== false);
  campo("i-ativo").value = String(!produto || produto.ativo !== false);
  campo("i-destaque").value = String(Boolean(produto && produto.destaque === true));

  const temDesconto = Boolean(produto && produto.descontoAtivo === true);
  selDescontoAtivo.value = String(temDesconto);
  campoDesconto.style.display = temDesconto ? "block" : "none";
  campo("i-desconto-percentual").value = temDesconto ? produto.descontoPercentual : "";

  if (produto) galeria.carregar(produto);
  else galeria.limpar();

  modal.style.display = "flex";
}

function fecharModal() {
  modal.style.display = "none";
  editandoId = null;
}

selDescontoAtivo.addEventListener("change", () => {
  campoDesconto.style.display = selDescontoAtivo.value === "true" ? "block" : "none";
});
document.getElementById("btn-add-imagem-iphone").addEventListener("click", () => galeria.adicionar());
document.getElementById("btn-cancelar-iphone").addEventListener("click", fecharModal);
modal.addEventListener("click", (evento) => { if (evento.target === modal) fecharModal(); });

async function salvar() {
  const nome = campo("i-nome").value.trim();
  if (!nome) return toast("O nome é obrigatório.", "erro");

  const opcao = opcaoDoGrupo(selGrupo.value);
  if (!opcao || !contexto.principalSlug) {
    return toast("Falta cadastrar as opções de iPhone na camada principal.", "erro");
  }

  const precoVarejo = Number(campo("i-preco-varejo").value) || 0;
  const precoAtacado = Number(campo("i-preco-atacado").value) || null;
  if (!precoVarejo && !precoAtacado) {
    return toast("Informe pelo menos um preço — varejo ou atacado.", "erro");
  }

  const descontoAtivo = selDescontoAtivo.value === "true";
  const descontoPercentual = Number(campo("i-desconto-percentual").value) || 0;
  if (descontoAtivo && (descontoPercentual < 1 || descontoPercentual > 90)) {
    return toast("O desconto deve ser um percentual entre 1 e 90.", "erro");
  }

  const { imagemURL, imagensExtras } = galeria.coletar();

  // As fotos são data URI dentro do próprio documento e o Firestore corta
  // em 1 MB — barramos antes de tentar gravar.
  const pesoDoc = [imagemURL].concat(imagensExtras).reduce((t, u) => t + u.length, 0);
  if (pesoDoc > 950 * 1024) {
    return toast(
      `As fotos somam ${(pesoDoc / 1024 / 1024).toFixed(2)} MB e o limite é 1 MB. Remova alguma ou use imagens menores.`,
      "erro"
    );
  }

  const dados = {
    nome,
    descricao: campo("i-descricao").value.trim(),
    filtros: { [contexto.principalSlug]: [opcao.slug] },
    categoria: opcao.slug, // ponte com o campo legado
    imagemURL,
    imagensExtras,
    precoVarejo,
    precoAtacado,
    estoque: Number(campo("i-estoque").value) || 0,
    estoqueVarejo: null,
    estoqueAtacado: null,
    peso: Number(campo("i-peso").value) || 0,
    descontoAtivo,
    descontoTipo: descontoAtivo ? "percentual" : null,
    descontoPercentual: descontoAtivo ? descontoPercentual : null,
    freteDisponivel: campo("i-frete-disponivel").value === "true",
    ativo: campo("i-ativo").value === "true",
    destaque: campo("i-destaque").value === "true"
  };

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";
  try {
    if (editandoId) await atualizarProduto(editandoId, dados);
    else await criarProduto(dados);
    fecharModal();
    toast(editandoId ? "Item atualizado." : "Item cadastrado.", "sucesso");
    await carregar();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível salvar agora. Tente novamente.", "erro");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar";
  }
}

async function remover(id) {
  const produto = contexto.produtos.find((p) => p.id === id);
  const ok = await confirmar({
    titulo: `Excluir "${produto ? produto.nome : "este item"}"?`,
    descricao: "Ele sai da loja imediatamente. Não dá para desfazer.",
    confirmar: "Excluir",
    destrutivo: true
  });
  if (!ok) return;
  try {
    await excluirProduto(id);
    toast("Item excluído.", "info");
    await carregar();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível excluir agora. Tente novamente.", "erro");
  }
}

btnSalvar.addEventListener("click", salvar);
btnNovoAparelho.addEventListener("click", () => abrirModal(GRUPO_APARELHOS));
btnNovoAcessorio.addEventListener("click", () => abrirModal(GRUPO_ACESSORIOS));

// ── Carga ────────────────────────────────────────────────────────────
async function carregar() {
  const [camadas, produtos] = await Promise.all([listarCamadas(), listarProdutos()]);
  const principal = camadaPrincipal(camadas);
  const opcoes = await listarOpcoesIphone(camadas);

  contexto = {
    camadas,
    produtos,
    principalSlug: principal ? principal.slug : null,
    opAparelho: opcoes.find((o) => grupoDaOpcao(o) !== GRUPO_ACESSORIOS) || null,
    opAcessorio: opcoes.find((o) => grupoDaOpcao(o) === GRUPO_ACESSORIOS) || null
  };

  mostrarSetup(principal, opcoes);
  btnNovoAparelho.disabled = !contexto.opAparelho;
  btnNovoAcessorio.disabled = !contexto.opAcessorio;

  const { aparelhos, acessorios } = agruparIphones(produtos, camadas);
  contagem.textContent =
    `${aparelhos.length} aparelho${aparelhos.length === 1 ? "" : "s"} · ` +
    `${acessorios.length} acessório${acessorios.length === 1 ? "" : "s"}`;

  renderizarGrupo(tabelaAparelhos, aparelhos, "Nenhum aparelho cadastrado ainda.");
  renderizarGrupo(tabelaAcessorios, acessorios, "Nenhum acessório cadastrado ainda.");

  document.querySelectorAll(".btn-editar-iphone").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = produtos.find((x) => x.id === btn.dataset.id);
      if (p) abrirModal(grupoDoProduto(p, camadas), p);
    });
  });
  document.querySelectorAll(".btn-excluir-iphone").forEach((btn) => {
    btn.addEventListener("click", () => remover(btn.dataset.id));
  });
}

protegerPaginaAdmin(async () => {
  try {
    await carregar();
  } catch (erro) {
    console.error("Erro ao carregar a seção de iPhones:", erro);
    contagem.textContent = "";
    tabelaAparelhos.innerHTML = `<p class="admin-vazio">Não foi possível carregar agora.</p>`;
    tabelaAcessorios.innerHTML = "";
  }
});

