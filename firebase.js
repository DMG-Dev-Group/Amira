// ⚠️ Este arquivo não é mais usado pelas páginas (elas importam de
// frontend/src/pages/services/firebase-config.js, via CDN modular).
// Mantido aqui só para compatibilidade/referência caso algo externo
// ainda dependa do pacote npm "firebase".
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyACUAYAfglk9tMu3RpbBbEgQSjTC8eLXYU",
  authDomain: "flora-5754a.firebaseapp.com",
  projectId: "flora-5754a",
  storageBucket: "flora-5754a.firebasestorage.app",
  messagingSenderId: "819737384786",
  appId: "1:819737384786:web:0e7152e6065e13c9c58c8b",
  measurementId: "G-CYJD1Y9V2H"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);