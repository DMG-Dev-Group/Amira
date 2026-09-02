import { listarCategorias } from "./categorias.js";
import { escapeHtml } from "./seguranca.js";

const lista = document.getElementById("dropdown-categorias-home");
const listaFooter = document.getElementById("footer-categorias-lista");

if (lista || listaFooter) {
  listarCategorias()
    .then((categorias) => {
      const itensDropdown = categorias.map(
        (cat) => `<li><a href="produtos.html?categoria=${encodeURIComponent(cat.slug)}">${escapeHtml(cat.nome)}</a></li>`
      ).join("");

      if (lista) lista.insertAdjacentHTML("afterbegin", itensDropdown);

      if (listaFooter) {
        listaFooter.insertAdjacentHTML("afterbegin", itensDropdown);
      }
    })
    .catch((erro) => {
      console.error("Erro ao carregar categorias no menu:", erro);
    });
}
