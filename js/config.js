// =====================================================================
//  CONFIGURACIÓN DE FIREBASE (gratis, plan Spark, sin tarjeta)
// ---------------------------------------------------------------------
//  1. Entra en https://console.firebase.google.com y crea un proyecto.
//  2. Añade una app Web (icono </>) y copia aquí su objeto `firebaseConfig`.
//  3. Activa Authentication → Método de acceso → "Anónimo".
//  4. Crea Firestore Database y pega las reglas de `firestore.rules`.
//  (Guía completa paso a paso en el README.md)
//
//  Mientras esto esté vacío, la app funciona en MODO DEMO: todo se guarda
//  solo en este navegador (útil para probar; abre varias pestañas para
//  simular a varios amigos).
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDmPeVTzXwnQ0xjcvsTKp1gMy5r4hnufYE",
  authDomain: "pincho-de-oro.firebaseapp.com",
  projectId: "pincho-de-oro",
  storageBucket: "pincho-de-oro.firebasestorage.app",
  messagingSenderId: "429350753022",
  appId: "1:429350753022:web:0f6739076cfcb31ae28baf"
};

// Solo para desarrollo con el emulador local de Firebase. Déjalo en false.
export const useEmulator = false;
