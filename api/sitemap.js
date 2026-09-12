// ── GET /sitemap.xml (rewrite em vercel.json -> /api/sitemap) ──────────
// Gera o sitemap na hora, direto do Firestore — sem isso, cada produto
// novo exigiria editar um arquivo estático à mão. Lista as páginas fixas
// da loja mais uma <url> por produto ATIVO (mesmo filtro que o catálogo
// usa, ver services/produtos.js).
//
// Cacheado na borda da Vercel por 1h (s-maxage) — o catálogo não muda
// rápido o bastante para justificar gerar isso a cada visita do Googlebot.

const { getDb } = require("./_lib/firebase-admin");

const BASE_URL = (process.env.PUBLIC_BASE_URL || "https://amirabeauty.com.br").replace(/\/$/, "");

const PAGINAS_FIXAS = [
  { caminho: "/", prioridade: "1.0", frequencia: "daily" },
  { caminho: "/produtos.html", prioridade: "0.9", frequencia: "daily" },
  { caminho: "/atacado.html", prioridade: "0.7", frequencia: "weekly" },
  { caminho: "/iphones.html", prioridade: "0.7", frequencia: "weekly" },
  { caminho: "/privacidade.html", prioridade: "0.3", frequencia: "yearly" }
];

function escaparXml(valor) {
  return String(valor).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlTag(loc, { prioridade, frequencia, lastmod } = {}) {
  return [
    "  <url>",
    `    <loc>${escaparXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    frequencia ? `    <changefreq>${frequencia}</changefreq>` : "",
    prioridade ? `    <priority>${prioridade}</priority>` : "",
    "  </url>"
  ].filter(Boolean).join("\n");
}

module.exports = async (req, res) => {
  const tags = PAGINAS_FIXAS.map((p) => urlTag(`${BASE_URL}${p.caminho}`, p));

  try {
    const snap = await getDb().collection("produtos").where("ativo", "==", true).get();
    snap.forEach((doc) => {
      const dados = doc.data();
      const lastmod = dados.atualizadoEm?.toDate ? dados.atualizadoEm.toDate().toISOString() : undefined;
      tags.push(urlTag(`${BASE_URL}/produto.html?id=${encodeURIComponent(doc.id)}`, {
        prioridade: "0.8",
        frequencia: "weekly",
        lastmod
      }));
    });
  } catch (erro) {
    // Sem produtos, o sitemap ainda sai válido só com as páginas fixas —
    // um sitemap vazio é pior para o Search Console do que um incompleto.
    console.error("[sitemap] Falha ao listar produtos:", erro.message);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    tags.join("\n") +
    "\n</urlset>\n";

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(xml);
};
