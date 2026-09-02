// Registra automaticamente a visita à página atual. Incluído nas páginas
// públicas (home, catálogo). A página de produto registra manualmente
// com o ID do produto (ver js/produto-detalhe.js).
import { registrarVisita } from "./metricas.js";

const nomePagina = document.body.dataset.pagina || window.location.pathname.split("/").pop().replace(".html", "") || "index";
registrarVisita(nomePagina, "pagina");
