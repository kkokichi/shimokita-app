// ── FIREBASE INIT ──
const firebaseConfig = {
  apiKey: "AIzaSyBTEREkPIrIgoLHskk55emqqAEmOiVPsng",
  authDomain: "shomokita-app.firebaseapp.com",
  projectId: "shomokita-app",
  storageBucket: "shomokita-app.firebasestorage.app",
  messagingSenderId: "1063213907483",
  appId: "1:1063213907483:web:77e9145fc59436d58302be",
  measurementId: "G-Z2ESPX4302"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
