// ── Upload de imagem por arquivo — Amira ─────────────────────────────────
// Dois destinos para a foto escolhida no computador:
//
// 1) IMAGEKIT (padrão do painel) — enviarImagem(): a foto é reduzida num
//    <canvas> e enviada DIRETO do navegador para o ImageKit, que devolve
//    uma URL curta (https://ik.imagekit.io/...). O documento do Firestore
//    guarda só essa URL, e a loja pede cada foto no tamanho que vai
//    desenhar (services/imagens.js). A assinatura do envio vem de
//    /api/imagekit-auth, que só responde para admin.
//
// 2) INLINE — comprimirImagem(): a foto vira data URI (base64) gravado
//    dentro do próprio documento. Era o único modo antes do ImageKit: pesa
//    ~90 KB por foto em TODA leitura do documento. Continua existindo para
//    a foto de perfil do cliente (só ele lê, e cliente não tem acesso ao
//    ImageKit) e como RESERVA automática enquanto o ImageKit não estiver
//    configurado na Vercel.
//
// No modo inline o Firestore limita 1 MB por documento, então a
// compressão é agressiva — use um orçamento menor quando várias imagens
// vão para o MESMO documento (ex.: as opções de uma camada).

import { urlImagemSegura } from "./seguranca.js";
import { auth } from "./firebase-config.js";

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

function desenharReduzida(dataURL, maxLado) {
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
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Imagem inválida ou corrompida."));
    img.src = dataURL;
  });
}

async function redimensionar(dataURL, maxLado, qualidade) {
  const canvas = await desenharReduzida(dataURL, maxLado);
  return canvas.toDataURL("image/jpeg", qualidade);
}

async function redimensionarComoArquivo(dataURL, maxLado, qualidade) {
  const canvas = await desenharReduzida(dataURL, maxLado);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar essa imagem."))),
      "image/jpeg",
      qualidade
    );
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

// ── Envio para o ImageKit ────────────────────────────────────────────────
const URL_UPLOAD_IMAGEKIT = "https://upload.imagekit.io/api/v1/files/upload";

// Lado maior da foto ENVIADA. O ImageKit reduz na entrega, então dá para
// guardar com folga de qualidade — só não faz sentido mandar 4000 px.
const LADO_ENVIO_PADRAO = 1600;
const QUALIDADE_ENVIO = 0.86;

// Quando o servidor responde "não configurado", não adianta perguntar de
// novo a cada foto nesta página.
let imagekitIndisponivel = false;

async function assinaturaImageKit() {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre no painel de novo para enviar fotos.");

  const resp = await fetch("/api/imagekit-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await usuario.getIdToken()}` },
    body: "{}"
  });
  let corpo = {};
  try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }

  if (resp.status === 503 && corpo.naoConfigurado) return null;
  // Em `python -m http.server` (desenvolvimento local) /api não existe —
  // mesmo caminho do "não configurado".
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(corpo.erro || "Não foi possível autorizar o envio da foto.");
  return corpo;
}

/**
 * Envia uma foto para o ImageKit e devolve a URL pública.
 * Se o ImageKit não estiver configurado, cai no modo inline (data URI)
 * usando `reserva` — o cadastro nunca trava por causa disso.
 *
 * @param {File} arquivo
 * @param {{ pasta?: string, ladoEnvio?: number, reserva?: { maxLado?: number, alvoBytes?: number } }} [opcoes]
 * @returns {Promise<string>} URL https do ImageKit (ou data URI na reserva)
 */
export async function enviarImagem(arquivo, { pasta = "geral", ladoEnvio = LADO_ENVIO_PADRAO, reserva = {} } = {}) {
  const bruto = await lerArquivoComoDataURL(arquivo);

  const assinatura = imagekitIndisponivel ? null : await assinaturaImageKit();
  if (!assinatura) {
    if (!imagekitIndisponivel) {
      console.warn("[Amira] ImageKit não configurado — foto salva em base64 no documento (modo antigo).");
    }
    imagekitIndisponivel = true;
    return comprimirImagem(arquivo, reserva);
  }

  const blob = await redimensionarComoArquivo(bruto, ladoEnvio, QUALIDADE_ENVIO);

  const form = new FormData();
  form.append("file", blob, "foto.jpg");
  form.append("fileName", `${pasta}.jpg`);
  form.append("folder", `/amira/${pasta}`);
  // nome único a cada envio: trocar a foto gera URL nova, então nenhum
  // cache (navegador ou CDN) mostra a foto velha — dispensa "purge"
  form.append("useUniqueFileName", "true");
  form.append("publicKey", assinatura.publicKey);
  form.append("signature", assinatura.signature);
  form.append("expire", String(assinatura.expire));
  form.append("token", assinatura.token);

  const resp = await fetch(URL_UPLOAD_IMAGEKIT, { method: "POST", body: form });
  let corpo = {};
  try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok || typeof corpo.url !== "string") {
    console.error("[Amira] Falha no envio ao ImageKit:", resp.status, corpo);
    throw new Error("Não foi possível enviar a foto agora. Tente de novo.");
  }
  return corpo.url;
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
 *   classeRemover?: string,
 *   destino?: "imagekit" | "inline",
 *   pasta?: string,
 *   ladoEnvio?: number
 * }} [opcoes]
 *
 * `destino`: "imagekit" (padrão — só funciona para admin) ou "inline"
 * (data URI no documento). `maxLado`/`alvoBytes` valem para o inline e
 * para a reserva do ImageKit; `ladoEnvio` é o tamanho enviado ao ImageKit.
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
  classeRemover = "admin-btn admin-btn-danger admin-btn-sm",
  destino = "imagekit",
  pasta = "geral",
  ladoEnvio = LADO_ENVIO_PADRAO
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
      const valorNovo = destino === "inline"
        ? await comprimirImagem(arquivo, { maxLado, alvoBytes })
        : await enviarImagem(arquivo, { pasta, ladoEnvio, reserva: { maxLado, alvoBytes } });
      aplicar(valorNovo);
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
