// ── Configuração central do Firebase ──────────────────────────────────────
// Importado como módulo ES (via CDN) em todas as páginas que precisam de
// Auth e/ou Firestore. Mantém UMA única inicialização do app.
//
// ⚠️ Projeto atual: "flora-5754a" — usado como AMBIENTE DE TESTES.
// Quando migrar para o projeto de produção, além de trocar os valores
// abaixo é preciso refazer: a chave do App Check/reCAPTCHA (ligada ao
// domínio), a configuração das Cloud Functions e o .firebaserc.
// Ver docs/MANUAL_CONFIGURACAO.md.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyACUAYAfglk9tMu3RpbBbEgQSjTC8eLXYU",
  authDomain: "flora-5754a.firebaseapp.com",
  projectId: "flora-5754a",
  storageBucket: "flora-5754a.firebasestorage.app",
  messagingSenderId: "819737384786",
  appId: "1:819737384786:web:0e7152e6065e13c9c58c8b",
  measurementId: "G-CYJD1Y9V2H"
};

export const app = initializeApp(firebaseConfig);

// ── App Check (anti-bot) ───────────────────────────────────────────────────
// A config do Firebase acima é pública por design — qualquer script pode
// chamar o SDK direto, ignorando o site. O App Check fecha essa porta: o
// Firebase só aceita requisições acompanhadas de um token do reCAPTCHA v3,
// emitido apenas para o site real rodando no domínio registrado.
//
// O App Check é GRATUITO no plano Spark e não exige cartão.
// PASSOS PARA ATIVAR (detalhes em docs/MANUAL_CONFIGURACAO.md):
//   1. Console Firebase → App Check → registrar o app web com reCAPTCHA v3
//      (o console gera a chave do site, ligada ao domínio).
//   2. Colar a chave em RECAPTCHA_V3_SITE_KEY abaixo.
//   3. No console, marcar "Aplicar" (Enforce) para Firestore e Authentication.
//
// Enquanto a chave for o placeholder, o App Check fica desligado para não
// derrubar o site — mas o item SÓ está completo depois dos passos acima.
const RECAPTCHA_V3_SITE_KEY = "COLE_AQUI_A_CHAVE_RECAPTCHA_V3";

// Para testar em localhost com App Check já ativado, descomente a linha
// abaixo, recarregue a página e registre o token exibido no console do
// navegador em: Console Firebase → App Check → Apps → Gerenciar tokens de depuração.
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

if (!RECAPTCHA_V3_SITE_KEY.startsWith("COLE_AQUI")) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
} else {
  console.warn(
    "[Amira] App Check DESATIVADO — configure a chave reCAPTCHA v3 em " +
    "services/firebase-config.js (ver docs/MANUAL_CONFIGURACAO.md)."
  );
}

export const db = getFirestore(app);
export const auth = getAuth(app);

// Para testar localmente com os emuladores do Firebase, descomente:
// connectFirestoreEmulator(db, "localhost", 8080);
// connectAuthEmulator(auth, "http://localhost:9099");
