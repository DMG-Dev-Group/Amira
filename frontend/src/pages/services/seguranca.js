// ── Utilidades de segurança de renderização — Amira ────────────────
// PADRÃO DO PROJETO: todo texto vindo de dado dinâmico (Firestore, URL,
// input do usuário) que entre em um template `innerHTML` passa por
// escapeHtml(). URLs de imagem passam por urlImagemSegura(). Sem exceção —
// mesmo quando "só o admin escreve" o dado: se a conta admin for
// comprometida, isso é o que impede um XSS armazenado na loja inteira.

/**
 * Escapa os 5 caracteres que permitem injetar HTML/atributos.
 * Aceita qualquer valor (número, null, etc.) e devolve string segura.
 */
export function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Valida uma URL de imagem antes de usá-la em src="".
 * Aceita apenas https:// (imagens externas) ou caminhos relativos do
 * próprio site (ex: "images/amira-placeholder.svg"). Qualquer outra coisa — http://,
 * javascript:, data:, etc. — cai no fallback.
 */
export function urlImagemSegura(url, fallback = "images/amira-placeholder.svg") {
  const texto = String(url ?? "").trim();
  if (!texto) return fallback;

  // Imagem embutida (data URI) — usada pelo painel admin para salvar fotos
  // direto no documento do produto, sem Firebase Storage. Só formatos de
  // imagem em base64: o conjunto de caracteres base64 (A-Za-z0-9+/=) e o
  // prefixo "data:image/...;base64," não têm nada que quebre um src="".
  if (/^data:image\/(png|jpe?g|jpg|webp|gif|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(texto)) {
    return texto;
  }

  // Caminho relativo do próprio site (sem esquema e sem "//host")
  if (!texto.includes(":") && !texto.startsWith("//")) {
    return escapeHtml(texto);
  }

  try {
    const analisada = new URL(texto);
    if (analisada.protocol === "https:") {
      return escapeHtml(texto);
    }
  } catch {
    // URL malformada → fallback
  }
  return fallback;
}
