// ── Upload de imagem por arquivo (sem Firebase Storage) — Amira ──────────
// A imagem escolhida do computador é redimensionada num <canvas> e devolvida
// como data URI (JPEG). Ela é gravada como string dentro do próprio
// documento do Firestore — o `urlImagemSegura()` aceita `data:image/...`.
//
// O Firestore limita 1 MB por documento, então a compressão é agressiva.
// Use um orçamento menor quando várias imagens vão para o MESMO documento
// (ex.: as opções de uma camada, a lista do carrossel da home).

import { urlImagemSegura } from "./seguranca.js";

const ALVO_BYTES_PADRAO = 300 * 1024;
// base64 infla ~37% sobre os bytes reais
const FATOR_BASE64 = 1.37;

function lerArquivoComoDataURL(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !arquivo.type.startsWith("image/")) {
      reject(new Error("Escolha um arquivo de imagem (JPG, PNG, WEBP...)."));
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

function redimensionar(dataURL, maxLado, qualidade) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const maior = Math.max(width, height);
      if (maior > maxLado) {
        const escala = maxLado / maior;
        width = Math.round(width * escala);
        height = Math.round(height * escala);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; // fundo branco: PNG transparente vira JPEG limpo
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", qualidade));
    };
    img.onerror = () => reject(new Error("Imagem inválida ou corrompida."));
    img.src = dataURL;
  });
}

/**
 * Lê + comprime um arquivo de imagem até caber no orçamento de bytes.
 * @param {File} arquivo
 * @param {{ maxLado?: number, alvoBytes?: number }} [opcoes]
 * @returns {Promise<string>} data URI JPEG
 */
export async function comprimirImagem(arquivo, { maxLado = 1100, alvoBytes = ALVO_BYTES_PADRAO } = {}) {
  const bruto = await lerArquivoComoDataURL(arquivo);
  const tentativas = [
    [Math.min(maxLado, 1100), 0.72],
    [Math.min(maxLado, 950), 0.62],
    [Math.min(maxLado, 800), 0.55],
    [Math.min(maxLado, 640), 0.5]
  ];
  let saida = await redimensionar(bruto, tentativas[0][0], tentativas[0][1]);
  for (const [lado, q] of tentativas.slice(1)) {
    if (saida.length <= alvoBytes * FATOR_BASE64) break;
    saida = await redimensionar(bruto, lado, q);
  }
  return saida;
}

/**
 * Monta um campo de upload de UMA imagem (preview + botão "Escolher/Trocar
 * foto") dentro de `container`. Chama `onChange(dataURI)` quando uma imagem
 * nova é processada. Para campos de imagem única — banner, capa de camada,
 * etc. O valor atual fica em `container.dataset.valor`.
 *
 * @param {HTMLElement} container
 * @param {{
 *   valor?: string,
 *   onChange?: (dataURI: string) => void,
 *   textoVazio?: string,
 *   textoCheio?: string,
 *   placeholder?: string,
 *   maxLado?: number,
 *   alvoBytes?: number,
 *   permiteRemover?: boolean,
 *   classeEscolher?: string,
 *   classeRemover?: string
 * }} [opcoes]
 */
export function montarUploadFoto(container, {
  valor = "",
  onChange = () => {},
  textoVazio = "Escolher foto",
  textoCheio = "Trocar foto",
  placeholder = "images/amira-placeholder.svg",
  maxLado = 1100,
  alvoBytes = ALVO_BYTES_PADRAO,
  permiteRemover = true,
  classeEscolher = "admin-btn admin-btn-outline admin-btn-sm",
  classeRemover = "admin-btn admin-btn-danger admin-btn-sm"
} = {}) {
  container.classList.add("foto-upload");
  container.dataset.valor = valor || "";

  container.innerHTML = `
    <div class="foto-upload-preview">
      <img alt="" src="${valor ? urlImagemSegura(valor, placeholder) : placeholder}">
    </div>
    <div class="foto-upload-acoes">
      <label class="${classeEscolher} foto-upload-escolher">
        <span class="foto-upload-rotulo">${valor ? textoCheio : textoVazio}</span>
        <input type="file" accept="image/*" hidden>
      </label>
      ${permiteRemover ? `<button type="button" class="${classeRemover} foto-upload-remover" ${valor ? "" : "hidden"}>Remover</button>` : ""}
    </div>
    <p class="foto-upload-msg" style="display:none;"></p>
  `;

  const input = container.querySelector('input[type="file"]');
  const preview = container.querySelector("img");
  const rotulo = container.querySelector(".foto-upload-rotulo");
  const escolher = container.querySelector(".foto-upload-escolher");
  const remover = container.querySelector(".foto-upload-remover");
  const msg = container.querySelector(".foto-upload-msg");

  function aplicar(dataURI) {
    container.dataset.valor = dataURI || "";
    preview.src = dataURI || placeholder;
    rotulo.textContent = dataURI ? textoCheio : textoVazio;
    if (remover) remover.hidden = !dataURI;
    onChange(container.dataset.valor);
  }

  input.addEventListener("change", async () => {
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    msg.style.display = "none";
    escolher.classList.add("processando");
    rotulo.textContent = "Processando...";
    try {
      const dataURI = await comprimirImagem(arquivo, { maxLado, alvoBytes });
      aplicar(dataURI);
    } catch (erro) {
      console.error(erro);
      msg.textContent = erro.message || "Não foi possível processar essa imagem.";
      msg.style.display = "block";
      rotulo.textContent = container.dataset.valor ? textoCheio : textoVazio;
    } finally {
      input.value = "";
      escolher.classList.remove("processando");
    }
  });

  remover?.addEventListener("click", () => aplicar(""));

  return {
    valor: () => container.dataset.valor || "",
    definir: (v) => aplicar(v || "")
  };
}
