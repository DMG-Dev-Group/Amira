// ── Página de Atacado — Amira ───────────────────────────────────────
// O catálogo de atacado é VISÍVEL para todo mundo (visitante, cliente,
// revendedor pendente) — o que muda por status é poder COMPRAR (A5):
//   • revendedor aprovado / admin  → adiciona ao carrinho normalmente;
//   • revendedor pendente/rejeitado → vê preços, mas compra bloqueada com aviso;
//   • cliente sem CNPJ             → aviso para cadastrar CNPJ no perfil;
//   • visitante sem conta          → aviso para criar conta.
// A permissão que vale é a das firestore.rules (o create de "pedidos"
// exige ehRevendedorAprovado quando há item de atacado) — este arquivo
// só cuida da experiência.

import { observarAuth } from "../services/auth.js";
import { listarProdutosAtacado, estoquePorModo, infoPreco } from "../services/produtos.js";
import { adicionarAoCarrinho } from "../services/carrinho.js";
import { escapeHtml, urlImagemSegura } from "../services/seguranca.js";
import { obterMinimoAtacadoCarrinho } from "../services/atacado-config.js";

const conteudo = document.getElementById("atacado-conteudo");

let usuarioAtual = null;
let acessoLiberado = false;
let motivoBloqueio = ""; // mensagem exibida ao tentar comprar sem liberação

// A busca da navbar/menu mobile é ligada por services/nav-busca.js.

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Aviso no topo, conforme o status de quem está vendo ──────────────────
function bannerStatus(perfil, usuario) {
  if (acessoLiberado) return "";

  let titulo;
  let texto;
  let acoes = "";

  if (!usuario) {
    titulo = "Crie sua conta para comprar no atacado";
    texto = "Você pode navegar pelos preços de atacado à vontade. Para comprar, crie uma conta e cadastre o CNPJ da sua loja — a aprovação é feita pela nossa equipe.";
    acoes = `
      <a href="cadastro.html" class="btn-primary" style="text-decoration:none;">Criar conta</a>
      <a href="login.html" class="btn-outline" style="text-decoration:none; margin-left:0.6rem;">Já tenho conta</a>
    `;
  } else if (perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "pendente") {
    titulo = "Cadastro em análise";
    texto = "Sua conta de revendedor está aguardando aprovação da loja. Você já pode navegar pelos preços de atacado — a compra será liberada assim que a análise for concluída (avisaremos por e-mail).";
  } else if (perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "rejeitado") {
    titulo = "Cadastro não aprovado";
    texto = "Sua solicitação de conta revendedora não foi aprovada. Entre em contato com a loja pelo WhatsApp para entender o motivo ou reenviar seus dados.";
    acoes = `<a href="perfil.html#revendedor" class="btn-outline" style="text-decoration:none;">Revisar meus dados</a>`;
  } else {
    titulo = "Quer comprar no atacado?";
    texto = "Os preços de atacado são liberados para lojistas com CNPJ aprovado. Cadastre o CNPJ da sua loja no seu perfil — sem criar uma conta nova.";
    acoes = `<a href="perfil.html#revendedor" class="btn-primary" style="text-decoration:none;">Cadastrar meu CNPJ</a>`;
  }

  motivoBloqueio = texto;

  return `
    <div class="atacado-aviso" role="status">
      <h2>${titulo}</h2>
      <p>${texto}</p>
      ${acoes ? `<div class="atacado-aviso-acoes">${acoes}</div>` : ""}
    </div>
  `;
}

// ── Catálogo (visível para todos) ─────────────────────────────────────────
async function renderizarPagina(perfil, usuario) {
  conteudo.innerHTML = `
    ${bannerStatus(perfil, usuario)}
    <div class="catalogo-topo">
      <div class="catalogo-titulo">
        <h1>Catálogo Atacado</h1>
        <p id="atacado-contagem"></p>
      </div>
    </div>
    <p class="atacado-nota" id="atacado-nota">
      Os preços abaixo são por unidade.
    </p>
    <section class="catalogo-grid" id="atacado-grid">
      <p class="catalogo-loading">Carregando produtos de atacado...</p>
    </section>
  `;

  const grid = document.getElementById("atacado-grid");
  const contagem = document.getElementById("atacado-contagem");
  const nota = document.getElementById("atacado-nota");

  // Mínimo por carrinho (A3) — informativo na página
  obterMinimoAtacadoCarrinho().then((minimo) => {
    nota.textContent = `Os preços abaixo são por unidade. O pedido de atacado exige no mínimo ${minimo} unidades no carrinho, somando todos os produtos.`;
  });

  try {
    const produtos = await listarProdutosAtacado();

    if (produtos.length === 0) {
      grid.innerHTML = `<p class="catalogo-vazio">Nenhum produto disponível em atacado no momento.</p>`;
      contagem.textContent = "";
      return;
    }

    contagem.textContent = `${produtos.length} produto${produtos.length === 1 ? "" : "s"} disponível${produtos.length === 1 ? "" : "is"} em atacado`;

    grid.innerHTML = produtos.map((p) => {
      const estoque = estoquePorModo(p, "atacado");
      const semEstoque = estoque <= 0;
      const preco = infoPreco(p, "atacado").precoFinal;

      return `
      <div class="catalogo-card" style="cursor:default;" data-produto-id="${escapeHtml(p.id)}">
        <a href="produto.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none; display:block;">
          <div class="catalogo-card-img">
            <img src="${urlImagemSegura(p.imagemURL)}" alt="${escapeHtml(p.nome)}" loading="lazy">
          </div>
        </a>
        <div class="catalogo-card-info">
          <h3 class="catalogo-card-nome">${escapeHtml(p.nome)}</h3>
          <span class="catalogo-card-preco">${formatarPreco(preco)}/un.</span>
          ${semEstoque
            ? `<span class="catalogo-card-estoque">Sem estoque de atacado</span>`
            : `<span class="catalogo-card-preco-atacado">Estoque atacado: ${estoque} un.</span>`}
          ${!semEstoque ? `
            <div class="produto-qtd-wrap" style="margin-top:0.8rem;">
              <div class="produto-qtd-controle">
                <button type="button" class="btn-qtd-menos" data-id="${escapeHtml(p.id)}">−</button>
                <input type="number" class="input-qtd-atacado" data-id="${escapeHtml(p.id)}" value="1" min="1" max="${estoque}">
                <button type="button" class="btn-qtd-mais" data-id="${escapeHtml(p.id)}">+</button>
              </div>
            </div>
            <button class="btn-primary btn-add-atacado" data-id="${escapeHtml(p.id)}" style="width:100%; margin-top:0.6rem; font-size:0.78rem; padding:0.55rem;">
              Adicionar ao carrinho
            </button>
          ` : ""}
        </div>
      </div>
    `;
    }).join("");

    configurarBotoesAtacado(produtos);
  } catch (erro) {
    console.error(erro);
    grid.innerHTML = `<p class="catalogo-vazio">Não foi possível carregar o catálogo de atacado agora.</p>`;
  }
}

function mostrarBloqueio(btn) {
  const original = btn.textContent;
  btn.textContent = "Compra ainda não liberada";
  btn.disabled = true;
  alert(motivoBloqueio || "A compra em atacado ainda não está liberada para a sua conta.");
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1500);
}

function configurarBotoesAtacado(produtos) {
  document.querySelectorAll(".btn-qtd-mais").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.querySelector(`.input-qtd-atacado[data-id="${btn.dataset.id}"]`);
      input.value = Math.min(Number(input.max), Number(input.value) + 1);
    });
  });

  document.querySelectorAll(".btn-qtd-menos").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.querySelector(`.input-qtd-atacado[data-id="${btn.dataset.id}"]`);
      input.value = Math.max(Number(input.min), Number(input.value) - 1);
    });
  });

  document.querySelectorAll(".btn-add-atacado").forEach((btn) => {
    btn.addEventListener("click", async () => {
      // Sem liberação, o clique explica o porquê em vez de adicionar.
      if (!acessoLiberado || !usuarioAtual) {
        mostrarBloqueio(btn);
        return;
      }

      const produtoId = btn.dataset.id;
      const produto = produtos.find((p) => p.id === produtoId);
      const input = document.querySelector(`.input-qtd-atacado[data-id="${produtoId}"]`);
      const quantidade = Number(input.value) || 1;

      btn.disabled = true;
      btn.textContent = "Adicionando...";

      try {
        await adicionarAoCarrinho(usuarioAtual.uid, {
          produtoId: produto.id,
          nome: produto.nome,
          imagemURL: produto.imagemURL || "",
          precoUnitario: infoPreco(produto, "atacado").precoFinal,
          pesoUnitario: produto.peso || 0,
          quantidade,
          modo: "atacado"
        });
        btn.textContent = "Adicionado!";
        setTimeout(() => {
          btn.textContent = "Adicionar ao carrinho";
          btn.disabled = false;
        }, 1500);
      } catch (erro) {
        console.error(erro);
        btn.textContent = "Erro — tente novamente";
        btn.disabled = false;
      }
    });
  });
}

// ── Inicialização ──────────────────────────────────────────────────────────
observarAuth(({ usuario, perfil }) => {
  usuarioAtual = usuario;

  const ehAdmin = perfil?.role === "admin";
  const ehRevendedorAprovado =
    perfil?.tipoConta === "revendedor" && perfil?.statusRevendedor === "aprovado";
  acessoLiberado = Boolean(usuario && (ehAdmin || ehRevendedorAprovado));

  renderizarPagina(perfil, usuario);
});
