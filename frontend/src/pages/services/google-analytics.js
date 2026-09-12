// ── Google Analytics (GA4) — Amira ──────────────────────────────────────
// LGPD: analytics é dado ANALÍTICO, mesma régua de registrar-visita-auto.js
// — só carrega com consentimento (services/consentimento-cookies.js). Se a
// pessoa aceitar DEPOIS de entrar (o banner ainda estava na tela), o
// listener do evento "amira:consentimento" carrega o gtag na hora, sem
// precisar recarregar a página.
//
// Para ativar: crie a propriedade em analytics.google.com e cole o
// Measurement ID (formato G-XXXXXXXXXX) abaixo. Vazio = este arquivo não
// faz nada (import seguro em toda página mesmo antes de existir o ID).
import { consentiuAnalytics } from "./consentimento-cookies.js";

const GA_MEASUREMENT_ID = "G-8F6QBS4H1L";

let carregado = false;

function carregarGtag() {
  if (carregado || !GA_MEASUREMENT_ID) return;
  carregado = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  // anonymize_ip: recomendação padrão do Google para conformidade com
  // LGPD/GDPR — o IP completo nunca chega a ser armazenado.
  window.gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
}

if (consentiuAnalytics()) carregarGtag();
window.addEventListener("amira:consentimento", (evento) => {
  if (evento.detail?.analiticos) carregarGtag();
});
