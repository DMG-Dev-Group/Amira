// ── Captura do link de indicação (?ref=) — Amira ───────────────────────
// O painel "Indicadores" do sistema interno gera links assim:
//   https://amira-phi.vercel.app/?ref=CODIGO
// sempre para a RAIZ do site — nunca para uma página específica (ver
// linkDe() em indicadores.js do sistema interno). Isso é o que faltava
// deste lado: nada aqui capturava o "?ref=", então todo pedido nascia
// sem indicador, mesmo quem entrou pelo link.
//
// COMO FUNCIONA:
//   1. A pessoa entra pela home com ?ref=CODIGO na URL.
//   2. Este módulo lê o parâmetro e guarda em localStorage — não em
//      sessionStorage nem em variável: precisa sobreviver ao fechar a
//      aba, porque a compra pode acontecer dias depois de o visitante
//      ter clicado no link (é o que o painel quer dizer com "o link do
//      indicador não expira").
//   3. Na hora de criar o pedido (services/pedidos.js), o valor salvo
//      é lido e gravado como pedidos/{id}.ref — sem passar por aqui de
//      novo. O ?ref= já pode ter sumido da URL há muito tempo.
//
// PRIMEIRO CLIQUE GANHA: se já existe um código salvo, um ?ref= novo NÃO
// sobrescreve. Escolha deliberada — o link "não expira", então o
// primeiro indicador que trouxe a pessoa é quem fica com o crédito,
// mesmo que ela depois entre pelo link de outro. Para inverter (último
// clique ganha), troque o "if (jaTem) return" abaixo por uma escrita
// incondicional.
//
// O código é normalizado do MESMO jeito que o painel normaliza ao
// cadastrar o indicador (normalizaCodigo() em indicadores.js) — sem
// isso, "joao" da URL nunca bateria com "JOAO" cadastrado.

const CHAVE = "amiraRef";

function normalizarCodigo(valor) {
  return String(valor || "")
    // \p{M}: qualquer marca diacrítica (categoria Unicode "Mark") — o
    // acento que o NFD separou da letra-base. Evita escrever um
    // intervalo de código literal aqui, que é frágil de transportar.
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

function capturar() {
  const codigo = normalizarCodigo(new URLSearchParams(window.location.search).get("ref"));
  if (!codigo) return;

  try {
    if (localStorage.getItem(CHAVE)) return; // primeiro clique ganha
    localStorage.setItem(CHAVE, codigo);
  } catch {
    // localStorage indisponível (modo privado, cookies bloqueados…) — o
    // pedido só não leva indicador desta vez; não impede a compra.
  }
}

/** Código do indicador salvo neste navegador, ou "" se não houver. */
export function refSalvo() {
  try {
    return localStorage.getItem(CHAVE) || "";
  } catch {
    return "";
  }
}

capturar();
