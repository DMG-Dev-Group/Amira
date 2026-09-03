// Registra automaticamente a visita à página atual. Incluído nas páginas
// públicas (home, catálogo). A página de produto registra manualmente
// com o ID do produto (ver js/produto-detalhe.js).
//
// LGPD: a métrica de visita é ANALÍTICA — só roda se a pessoa tiver
// aceitado os cookies analíticos no banner (services/consentimento-cookies.js).
import { registrarVisita } from "./metricas.js";
import { consentiuAnalytics } from "./consentimento-cookies.js";

if (consentiuAnalytics()) {
  const nomePagina = document.body.dataset.pagina || window.location.pathname.split("/").pop().replace(".html", "") || "index";
  registrarVisita(nomePagina, "pagina");
}
