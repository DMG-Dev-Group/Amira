// ── Avaliar a loja — Amira ───────────────────────────────────────────────
// Página pensada pro QR code do balcão físico: qualquer pessoa avalia, sem
// precisar estar logada (ver services/avaliacoes-loja.js e firestore.rules).
//
// Depois de enviar: quem já tem conta é levado de volta pra loja; quem não
// tem vê um convite pra criar conta — não é obrigatório, só uma sugestão.

import { observarAuth } from "../services/auth.js";
import { enviarAvaliacao } from "../services/avaliacoes-loja.js";
import { toast } from "../services/ui-feedback.js";

const IC_ESTRELA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.4 2.6 5.3 5.8.85-4.2 4.1 1 5.78L12 16.7l-5.2 2.73 1-5.78-4.2-4.1 5.8-.85Z"/></svg>';
const IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

let usuarioAtual = null;
observarAuth(({ usuario }) => { usuarioAtual = usuario; });

const conteudo = document.getElementById("avl-conteudo");
const areaNotas = document.getElementById("avl-notas");
const form = document.getElementById("form-avaliacao-loja");

let nota = 0;

areaNotas.innerHTML = [1, 2, 3, 4, 5].map((i) => `
  <button type="button" class="avaliacao-nota" data-nota="${i}"
          role="radio" aria-checked="false" aria-label="${i} de 5">${IC_ESTRELA}</button>
`).join("");

const botoesNota = [...areaNotas.querySelectorAll(".avaliacao-nota")];
botoesNota.forEach((btn) => {
  btn.addEventListener("click", () => {
    nota = Number(btn.dataset.nota);
    botoesNota.forEach((b) => {
      b.classList.toggle("marcada", Number(b.dataset.nota) <= nota);
      b.setAttribute("aria-checked", String(Number(b.dataset.nota) === nota));
    });
  });
});

function mostrarConfirmacao() {
  if (usuarioAtual) {
    conteudo.innerHTML = `
      <span class="avl-pos__icone">${IC_CHECK}</span>
      <h1 class="avl-titulo">Obrigado pela sua avaliação!</h1>
      <p>Recebemos o seu comentário — te levamos de volta para a loja.</p>
      <a href="index.html" class="btn-primary">Ir para a loja</a>
    `;
    setTimeout(() => { window.location.href = "index.html"; }, 2500);
  } else {
    conteudo.innerHTML = `
      <span class="avl-pos__icone">${IC_CHECK}</span>
      <h1 class="avl-titulo">Obrigado pela sua avaliação!</h1>
      <p>Crie sua conta para ficar por dentro das novidades, promoções e lançamentos da Amira.</p>
      <a href="cadastro.html" class="btn-primary">Criar minha conta</a>
      <a href="index.html" class="btn-outline">Só quero ir para o site</a>
    `;
  }
  conteudo.classList.add("avl-pos");
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const nome = document.getElementById("avl-nome").value.trim();
  const texto = document.getElementById("avl-texto").value.trim();

  if (!nome) {
    toast("Digite seu nome.", "erro");
    return;
  }
  if (nota < 1) {
    toast("Escolha de 1 a 5 estrelas.", "erro");
    return;
  }

  const botao = document.getElementById("avl-enviar");
  botao.disabled = true;
  botao.textContent = "Enviando...";

  try {
    await enviarAvaliacao({ nome, nota, texto, uid: usuarioAtual?.uid || null });
    mostrarConfirmacao();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível enviar sua avaliação agora. Tente de novo.", "erro");
    botao.disabled = false;
    botao.textContent = "Enviar avaliação";
  }
});
