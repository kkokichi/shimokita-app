// ── FIREBASE INIT ──
// Capacitor（iOS WKWebView）・PWA（ホーム画面に追加後のstandalone起動）の
// どちらでもFirebase Web SDKはそのまま動作する。現状の認証はメール/パスワードのみで、
// ページ内のfetch/XHRで完結するため、WebViewでもstandaloneモードでも問題ない
// （PWAのstandaloneモードは通常のブラウザエンジンで動くため、リダイレクトも
// 素直に動作する。要注意なのはCapacitorのネイティブWKWebViewの方）。
// 将来LINE/Google/AppleなどのOAuthログインを追加する場合、WKWebViewは多くの
// OAuthプロバイダのリダイレクトフローをブロック・警告するため、signInWithRedirect等を
// そのまま使うのではなく @capacitor/browser の Browser.open() でシステムブラウザに
// 一度出し、コールバックURLをアプリに戻す形（Universal Links等）で実装する必要がある。
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
