// ── Busca da navbar, com sugestões ao vivo ─────────────────────────────
// A barra da navbar existe em toda a loja (inclusive no mobile). Ao
// digitar, as correspondências aparecem num painel logo abaixo e cada
// uma leva direto para a página do produto — quem já sabe o que quer não
// precisa passar pelo catálogo. Dar Enter continua levando ao catálogo
// filtrado, como antes.
//
// A página produtos.html NÃO inclui este arquivo: lá a busca filtra a
// própria grade (ver js/produtos-catalogo.js).
//
// O catálogo inteiro é baixado UMA vez, na primeira tecla, e reusado —
// para o tamanho desta loja isso é mais rápido (e mais barato) que uma
// consulta por tecla, e o Firestore não tem busca por texto de verdade.
// Reavaliar a partir de ~1.000 produtos ativos.

import { listarProdutos, infoPreco, disponivelNoModo } from "./produtos.js";
import { escapeHtml, urlImagemSegura } from "./seguranca.js";

const form = document.getElementById("nav-busca-form");
const input = document.getElementById("nav-busca-input");

const MIN_LETRAS = 2;
const MAX_SUGESTOES = 6;
const ESPERA_MS = 180;

let catalogo = null;      // promessa, resolvida uma vez só
let sugestoes = [];
let ativo = -1;
let timer = null;

if (form && input) {
  // O painel NÃO pode ser filho do form: no desktop o form tem
  // overflow:hidden (é a pílula que abre no hover) e cortaria o painel.
  // Por isso ele é fixo na tela e posicionado a partir do form.
  const painel = document.createElement("div");
  painel.className = "busca-ao-vivo";
  painel.id = "busca-ao-vivo";
  painel.setAttribute("role", "listbox");
  painel.hidden = true;
  document.body.appendChild(painel);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "busca-ao-vivo");
  input.setAttribute("aria-expanded", "false");

  function posicionar() {
    const r = form.getBoundingClientRect();
    // Mínimo de 280px: no desktop o form fechado tem 54px, e no mobile
    // ele encolhe bastante — o painel não deve encolher junto.
    const largura = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
    let esquerda = r.left;
    if (esquerda + largura > window.innerWidth - 8) esquerda = window.innerWidth - largura - 8;
    painel.style.left = `${Math.max(8, esquerda)}px`;
    painel.style.top = `${r.bottom + 6}px`;
    painel.style.width = `${largura}px`;
  }

  function fechar() {
    painel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    ativo = -1;
  }

  function formatarPreco(valor) {
    return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function precoDoItem(p) {
    if (!disponivelNoModo(p, "varejo")) return "Exclusivo atacado";
    return formatarPreco(infoPreco(p, "varejo").precoFinal);
  }

  function pintar(termo) {
    if (sugestoes.length === 0) {
      painel.innerHTML = `<p class="busca-ao-vivo__vazio">Nada encontrado para “${escapeHtml(termo)}”.</p>`;
    } else {
      painel.innerHTML =
        sugestoes.map((p, i) => `
          <a class="busca-ao-vivo__item ${i === ativo ? "ativo" : ""}" role="option"
             aria-selected="${i === ativo}" href="produto.html?id=${encodeURIComponent(p.id)}">
            <img src="${urlImagemSegura(p.imagemURL)}" alt="" loading="lazy">
            <span class="busca-ao-vivo__nome">${escapeHtml(p.nome)}</span>
            <span class="busca-ao-vivo__preco">${escapeHtml(precoDoItem(p))}</span>
          </a>
        `).join("") +
        `<a class="busca-ao-vivo__todos" href="produtos.html?busca=${encodeURIComponent(termo)}">
           Ver todos os resultados
         </a>`;
    }
    posicionar();
    painel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  async function buscar(termo) {
    if (!catalogo) catalogo = listarProdutos().catch(() => []);
    const todos = await catalogo;
    const alvo = termo.toLowerCase();

    const casaram = todos.filter((p) =>
      `${p.nome || ""} ${p.sku || ""} ${p.descricao || ""}`.toLowerCase().includes(alvo)
    );

    // Quem começa com o termo aparece antes: buscar "yara" deve trazer
    // "YARA LATTAFA" na frente de um perfume que só cita yara na descrição.
    casaram.sort((a, b) => {
      const pa = (a.nome || "").toLowerCase().startsWith(alvo) ? 0 : 1;
      const pb = (b.nome || "").toLowerCase().startsWith(alvo) ? 0 : 1;
      return pa - pb;
    });

    // Se o termo mudou enquanto o catálogo carregava, este resultado é velho.
    if (input.value.trim().toLowerCase() !== alvo) return;

    sugestoes = casaram.slice(0, MAX_SUGESTOES);
    ativo = -1;
    pintar(termo);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const termo = input.value.trim();
    if (termo.length < MIN_LETRAS) {
      fechar();
      return;
    }
    timer = setTimeout(() => buscar(termo), ESPERA_MS);
  });

  input.addEventListener("keydown", (e) => {
    if (painel.hidden || sugestoes.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      ativo = (ativo + passo + sugestoes.length + 1) % (sugestoes.length + 1);
      if (ativo === sugestoes.length) ativo = -1; // volta para o campo
      pintar(input.value.trim());
    } else if (e.key === "Enter" && ativo >= 0) {
      e.preventDefault();
      window.location.href = `produto.html?id=${encodeURIComponent(sugestoes[ativo].id)}`;
    } else if (e.key === "Escape") {
      fechar();
    }
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= MIN_LETRAS && sugestoes.length) pintar(input.value.trim());
  });

  // "blur" fecharia antes do clique registrar — daí o clique no documento.
  document.addEventListener("click", (e) => {
    if (!painel.contains(e.target) && !form.contains(e.target)) fechar();
  });
  window.addEventListener("resize", () => { if (!painel.hidden) posicionar(); });
  window.addEventListener("scroll", () => { if (!painel.hidden) posicionar(); }, { passive: true });

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const termo = input.value.trim();
    window.location.href = `produtos.html${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`;
  });

  // No desktop a barra fica fechada (só a lupa) e abre no hover — mas em
  // tela larga SEM mouse (tablet, notebook touch) não existe hover, e o
  // toque na lupa só dispararia uma busca vazia. Aqui o primeiro clique
  // com o campo ainda fechado abre e foca em vez de enviar.
  form.addEventListener("click", (evento) => {
    const fechada = input.getBoundingClientRect().width < 20;
    if (!fechada) return;
    if (!evento.target.closest("button")) return;
    evento.preventDefault();
    input.focus();
  });
}
