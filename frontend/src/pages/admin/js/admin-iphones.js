// ── Painel Admin · seção de iPhones ───────────────────────────────────
// A seção de iPhones não tem coleção própria: são produtos normais
// marcados na CAMADA PRINCIPAL com uma opção cujo slug começa com
// "iphone" (ver services/iphones.js). Esta tela existe porque a divisão
// entre APARELHOS e ACESSÓRIOS não aparecia em lugar nenhum do painel —
// ficava tudo misturado na lista geral de produtos.
//
// Cadastrar e editar continua sendo em Produtos: os botões daqui abrem o
// formulário de lá já com a opção certa marcada (?novo=1&opcao=<slug>).

import { protegerPaginaAdmin } from "./admin-auth.js";
import { escapeHtml, urlImagemSegura } from "../../services/seguranca.js";
import { listarProdutos, infoPreco, estoquePorModo } from "../../services/produtos.js";
import { listarCamadas, camadaPrincipal } from "../../services/camadas.js";
import {
  agruparIphones,
  listarOpcoesIphone,
  grupoDaOpcao,
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
        <a class="admin-btn admin-btn-outline admin-btn-sm"
           href="produtos.html?editar=${encodeURIComponent(p.id)}" style="text-decoration:none;">Editar</a>
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

protegerPaginaAdmin(async () => {
  try {
    const [camadas, produtos] = await Promise.all([listarCamadas(), listarProdutos()]);
    const principal = camadaPrincipal(camadas);
    const opcoes = await listarOpcoesIphone(camadas);

    mostrarSetup(principal, opcoes);

    // Cada botão leva à opção correspondente já marcada no formulário.
    const opAparelho = opcoes.find((o) => grupoDaOpcao(o) !== GRUPO_ACESSORIOS);
    const opAcessorio = opcoes.find((o) => grupoDaOpcao(o) === GRUPO_ACESSORIOS);

    if (opAparelho) {
      btnNovoAparelho.disabled = false;
      btnNovoAparelho.addEventListener("click", () => {
        window.location.href = `produtos.html?novo=1&opcao=${encodeURIComponent(opAparelho.slug)}`;
      });
    }
    if (opAcessorio) {
      btnNovoAcessorio.disabled = false;
      btnNovoAcessorio.addEventListener("click", () => {
        window.location.href = `produtos.html?novo=1&opcao=${encodeURIComponent(opAcessorio.slug)}`;
      });
    }

    const { aparelhos, acessorios } = agruparIphones(produtos, camadas);
    contagem.textContent =
      `${aparelhos.length} aparelho${aparelhos.length === 1 ? "" : "s"} · ` +
      `${acessorios.length} acessório${acessorios.length === 1 ? "" : "s"}`;

    renderizarGrupo(tabelaAparelhos, aparelhos, "Nenhum aparelho cadastrado ainda.");
    renderizarGrupo(tabelaAcessorios, acessorios, "Nenhum acessório cadastrado ainda.");
  } catch (erro) {
    console.error("Erro ao carregar a seção de iPhones:", erro);
    contagem.textContent = "";
    tabelaAparelhos.innerHTML = `<p class="admin-vazio">Não foi possível carregar agora.</p>`;
    tabelaAcessorios.innerHTML = "";
  }
});
