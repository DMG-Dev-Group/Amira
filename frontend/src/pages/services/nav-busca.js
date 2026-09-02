// Liga a barra de busca da NAVBAR ao catálogo de produtos. Desde a
// rodada 2, a mesma barra aparece também no mobile (ao lado do botão
// Atacado) — não existe mais busca no menu lateral nem no topo do
// catálogo. A página produtos.html NÃO inclui este arquivo: lá a busca
// filtra a própria grade (ver js/produtos-catalogo.js).

const form = document.getElementById("nav-busca-form");
const input = document.getElementById("nav-busca-input");

if (form && input) {
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const termo = input.value.trim();
    window.location.href = `produtos.html${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`;
  });
}
