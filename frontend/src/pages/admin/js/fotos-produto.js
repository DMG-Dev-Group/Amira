// ── Galeria de fotos de um produto (painel admin) ─────────────────────
// Extraído de admin-produtos.js para a aba de iPhones usar a mesma coisa:
// era isso ou duplicar ~55 linhas de slot de upload em dois arquivos.
//
// Cada slot lê o arquivo, comprime num <canvas> e guarda a data URI em
// slot.dataset.valor (ver services/imagem-upload.js). O primeiro slot é a
// FOTO PRINCIPAL (produto.imagemURL); os demais viram imagensExtras[].

import { comprimirImagem } from "../../services/imagem-upload.js";
import { urlImagemSegura } from "../../services/seguranca.js";

const PLACEHOLDER = "../images/amira-placeholder.svg";

function criarSlotImagem(valor = "", ehPrincipal = false) {
  const slot = document.createElement("div");
  slot.className = "img-slot";
  slot.dataset.valor = valor || "";

  slot.innerHTML = `
    <div class="img-slot-preview">
      <img alt="" src="${valor ? urlImagemSegura(valor, PLACEHOLDER) : PLACEHOLDER}">
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

/**
 * Liga uma galeria de fotos a um container.
 * @param {HTMLElement} container
 * @param {{ max?: number, aoExcederMax?: (max:number) => void }} [opcoes]
 */
export function montarGaleriaProduto(container, { max = 5, aoExcederMax = () => {} } = {}) {
  const slots = () => Array.from(container.querySelectorAll(".img-slot"));

  return {
    /** Só a foto principal, vazia. */
    limpar() {
      container.innerHTML = "";
      container.appendChild(criarSlotImagem("", true));
    },

    /** Carrega as fotos de um produto existente. */
    carregar(produto) {
      container.innerHTML = "";
      container.appendChild(criarSlotImagem(produto.imagemURL || "", true));
      (produto.imagensExtras || []).forEach((url) => {
        container.appendChild(criarSlotImagem(url, false));
      });
    },

    /** Acrescenta um slot vazio, respeitando o teto. */
    adicionar() {
      if (slots().length >= max) {
        aoExcederMax(max);
        return;
      }
      container.appendChild(criarSlotImagem("", false));
    },

    /** @returns {{imagemURL: string, imagensExtras: string[]}} */
    coletar() {
      const valores = slots().map((s) => s.dataset.valor).filter(Boolean);
      return {
        imagemURL: valores[0] || "",
        imagensExtras: valores.slice(1)
      };
    }
  };
}
