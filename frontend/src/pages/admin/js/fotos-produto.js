// ── Galeria de fotos de um produto (painel admin) ─────────────────────
// Extraído de admin-produtos.js para a aba de iPhones usar a mesma coisa:
// era isso ou duplicar ~55 linhas de slot de upload em dois arquivos.
//
// Cada slot lê o arquivo, comprime num <canvas> e guarda a data URI em
// slot.dataset.valor (ver services/imagem-upload.js). O primeiro slot é a
// FOTO PRINCIPAL (produto.imagemURL); os demais viram imagensExtras[].
//
// O arquivo entra de dois jeitos, e os dois caem no mesmo usarArquivo():
// pelo botão (input file) ou ARRASTANDO a imagem para cima do slot.

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
      <span class="img-slot-dica">arraste a foto aqui ou</span>
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

  async function usarArquivo(arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      msg.textContent = "Isso não é uma imagem. Aceita JPG, PNG ou WEBP.";
      msg.style.display = "block";
      return;
    }
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
  }

  input.addEventListener("change", () => usarArquivo(input.files && input.files[0]));

  // ── Arrastar a foto para dentro do slot ────────────────────────────
  // dragenter/dragleave disparam também ao passar por cima dos FILHOS do
  // slot, o que fazia a moldura piscar. O contador resolve: só apaga o
  // destaque quando a última entrada correspondente sai.
  let dentro = 0;
  const destacar = (ligado) => slot.classList.toggle("img-slot--recebendo", ligado);

  slot.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dentro++;
    destacar(true);
  });

  slot.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault(); // sem isto o navegador recusa o drop
    e.dataTransfer.dropEffect = "copy";
  });

  slot.addEventListener("dragleave", () => {
    dentro = Math.max(0, dentro - 1);
    if (dentro === 0) destacar(false);
  });

  slot.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dentro = 0;
    destacar(false);
    usarArquivo(e.dataTransfer.files[0]);
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
