// ── Migração: fotos em base64 (Firestore) → ImageKit ───────────────────
// Roda UMA vez, no computador de quem administra, depois de configurar o
// ImageKit. Procura todo campo de imagem que ainda é data URI, envia a
// foto ao ImageKit e troca o valor pela URL devolvida. Nada é recadastrado.
//
// Campos migrados:
//   produtos/{id}                .imagemURL, .imagensExtras[], .bannerImagemURL
//   camadas/{id}                 .opcoes[].imagemURL
//   configuracoes/homeCarrossel  .imagens[]
//   configuracoes/homeIphones    .imagens[]
// Fica de fora: usuarios/{uid}.fotoURL (foto de perfil do cliente continua
// inline de propósito — ver services/imagem-upload.js).
//
// USO (na raiz do projeto, com um .env contendo FIREBASE_SERVICE_ACCOUNT,
// IMAGEKIT_PRIVATE_KEY e IMAGEKIT_URL_ENDPOINT — ver .env.example):
//
//   node --env-file=.env scripts/migrar-imagens-imagekit.js             # simulação
//   node --env-file=.env scripts/migrar-imagens-imagekit.js --executar  # de verdade
//
// Sem --executar, só mostra o que mudaria (nada é enviado nem gravado).
//
// SEGURANÇA DOS DADOS:
//   • antes de gravar cada documento, o valor ORIGINAL dos campos vai para
//     backup-imagens/<data>.jsonl (fora do git) — dá para desfazer;
//   • um documento só é gravado se TODAS as fotos dele subiram; se alguma
//     falhar, ele fica como estava e aparece no resumo;
//   • pode rodar de novo sem medo: o que já é URL é ignorado, e fotos
//     repetidas (mesmo conteúdo) sobem uma vez só.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDb } = require("../api/_lib/firebase-admin");

const EXECUTAR = process.argv.includes("--executar");
const URL_UPLOAD = "https://upload.imagekit.io/api/v1/files/upload";
const ENVIOS_SIMULTANEOS = 4;

const CHAVE_PRIVADA = (process.env.IMAGEKIT_PRIVATE_KEY || "").trim();
const ENDPOINT = (process.env.IMAGEKIT_URL_ENDPOINT || "").trim().replace(/\/+$/, "");

const RE_DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is;

function ehDataUri(valor) {
  return typeof valor === "string" && RE_DATA_URI.test(valor.trim());
}

const EXTENSAO = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

// mesmo conteúdo → mesma URL (evita subir a mesma foto duas vezes)
const urlPorHash = new Map();

async function enviar(dataUri, pasta, nomeBase) {
  const [, mime, base64] = dataUri.trim().match(RE_DATA_URI);
  const bytes = Buffer.from(base64.replace(/\s+/g, ""), "base64");
  const hash = crypto.createHash("sha1").update(bytes).digest("hex");
  if (urlPorHash.has(hash)) return urlPorHash.get(hash);

  const pendente = (async () => {
    const form = new FormData();
    const ext = EXTENSAO[mime.toLowerCase()] || "jpg";
    form.append("file", new Blob([bytes], { type: mime }), `${nomeBase}.${ext}`);
    form.append("fileName", `${nomeBase}.${ext}`);
    form.append("folder", `/amira/${pasta}`);
    form.append("useUniqueFileName", "true");

    const resp = await fetch(URL_UPLOAD, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${CHAVE_PRIVADA}:`).toString("base64") },
      body: form
    });
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok || typeof corpo.url !== "string") {
      throw new Error(`ImageKit respondeu ${resp.status}: ${corpo.message || JSON.stringify(corpo)}`);
    }
    return corpo.url;
  })();

  urlPorHash.set(hash, pendente);
  try {
    return await pendente;
  } catch (erro) {
    urlPorHash.delete(hash); // falhou: uma próxima ocorrência tenta de novo
    throw erro;
  }
}

/**
 * Descreve o que migrar num documento.
 * @returns {Array<{campo: string, original: any, montar: (enviar) => Promise<any>, fotos: number, bytes: number}>}
 */
function planoDoDocumento(colecao, id, dados) {
  const itens = [];
  const pesoDe = (v) => (ehDataUri(v) ? v.length : 0);

  const campoUnico = (campo, pasta) => {
    const valor = dados[campo];
    if (!ehDataUri(valor)) return;
    itens.push({
      campo, original: valor, fotos: 1, bytes: pesoDe(valor),
      montar: (subir) => subir(valor, pasta, `${id}-${campo}`)
    });
  };

  const campoLista = (campo, pasta) => {
    const lista = Array.isArray(dados[campo]) ? dados[campo] : [];
    const fotos = lista.filter(ehDataUri).length;
    if (fotos === 0) return;
    itens.push({
      campo, original: lista, fotos, bytes: lista.reduce((t, v) => t + pesoDe(v), 0),
      montar: (subir) => Promise.all(lista.map((v, i) => (ehDataUri(v) ? subir(v, pasta, `${id}-${campo}-${i}`) : v)))
    });
  };

  if (colecao === "produtos") {
    campoUnico("imagemURL", "produtos");
    campoLista("imagensExtras", "produtos");
    campoUnico("bannerImagemURL", "banners");
  } else if (colecao === "camadas") {
    const opcoes = Array.isArray(dados.opcoes) ? dados.opcoes : [];
    const fotos = opcoes.filter((o) => ehDataUri(o && o.imagemURL)).length;
    if (fotos > 0) {
      itens.push({
        campo: "opcoes", original: opcoes, fotos,
        bytes: opcoes.reduce((t, o) => t + pesoDe(o && o.imagemURL), 0),
        montar: (subir) => Promise.all(opcoes.map(async (o) => (
          ehDataUri(o && o.imagemURL)
            ? { ...o, imagemURL: await subir(o.imagemURL, "categorias", `${id}-${o.slug || "opcao"}`) }
            : o
        )))
      });
    }
  } else if (colecao === "configuracoes") {
    campoLista("imagens", "home");
  }
  return itens;
}

// Executa tarefas com no máximo N em paralelo.
async function emParalelo(tarefas, limite) {
  const resultados = [];
  let proxima = 0;
  async function trabalhador() {
    while (proxima < tarefas.length) {
      const i = proxima++;
      resultados[i] = await tarefas[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
  return resultados;
}

async function main() {
  if (EXECUTAR && (!CHAVE_PRIVADA || !ENDPOINT)) {
    console.error("Faltam IMAGEKIT_PRIVATE_KEY e/ou IMAGEKIT_URL_ENDPOINT no .env.");
    process.exit(1);
  }

  const db = getDb();
  const alvos = [];
  for (const colecao of ["produtos", "camadas"]) {
    const snap = await db.collection(colecao).get();
    snap.forEach((d) => alvos.push({ colecao, ref: d.ref, id: d.id, dados: d.data() }));
  }
  for (const id of ["homeCarrossel", "homeIphones"]) {
    const d = await db.collection("configuracoes").doc(id).get();
    if (d.exists) alvos.push({ colecao: "configuracoes", ref: d.ref, id, dados: d.data() });
  }

  const comPlano = alvos
    .map((a) => ({ ...a, plano: planoDoDocumento(a.colecao, a.id, a.dados) }))
    .filter((a) => a.plano.length > 0);

  const totalFotos = comPlano.reduce((t, a) => t + a.plano.reduce((s, i) => s + i.fotos, 0), 0);
  const totalMB = comPlano.reduce((t, a) => t + a.plano.reduce((s, i) => s + i.bytes, 0), 0) / 1048576;

  console.log(`\n${comPlano.length} documento(s) com fotos em base64 — ${totalFotos} foto(s), ${totalMB.toFixed(1)} MB de texto.`);
  const porColecao = {};
  comPlano.forEach((a) => { porColecao[a.colecao] = (porColecao[a.colecao] || 0) + 1; });
  Object.entries(porColecao).forEach(([c, n]) => console.log(`  ${c}: ${n} documento(s)`));

  if (!EXECUTAR) {
    console.log("\nSIMULAÇÃO — nada foi enviado nem gravado. Rode com --executar para migrar.\n");
    return;
  }
  if (comPlano.length === 0) {
    console.log("Nada para migrar.");
    return;
  }

  const pastaBackup = path.join(__dirname, "..", "backup-imagens");
  fs.mkdirSync(pastaBackup, { recursive: true });
  const arquivoBackup = path.join(pastaBackup, `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  console.log(`\nBackup dos valores originais: ${arquivoBackup}\n`);

  let ok = 0;
  const falhas = [];

  const tarefas = comPlano.map((alvo) => async () => {
    const rotulo = `${alvo.colecao}/${alvo.id}`;
    try {
      const atualizacao = {};
      for (const item of alvo.plano) {
        atualizacao[item.campo] = await item.montar(enviar);
      }
      // backup ANTES de sobrescrever
      const original = Object.fromEntries(alvo.plano.map((i) => [i.campo, i.original]));
      fs.appendFileSync(arquivoBackup, JSON.stringify({ caminho: alvo.ref.path, original }) + "\n");

      await alvo.ref.update(atualizacao);
      ok++;
      console.log(`  ✔ ${rotulo}`);
    } catch (erro) {
      falhas.push({ rotulo, erro: erro.message });
      console.log(`  ✘ ${rotulo} — ${erro.message}`);
    }
  });

  await emParalelo(tarefas, ENVIOS_SIMULTANEOS);

  console.log(`\nMigrados: ${ok} de ${comPlano.length} documento(s).`);
  if (falhas.length) {
    console.log(`Falharam ${falhas.length} (continuam em base64 — rode de novo para tentar outra vez):`);
    falhas.forEach((f) => console.log(`  - ${f.rotulo}: ${f.erro}`));
    process.exitCode = 1;
  }
}

main().catch((erro) => {
  console.error("Erro:", erro.message);
  process.exit(1);
});
