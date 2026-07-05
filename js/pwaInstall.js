// ── PWA インストール案内バナー ──
let deferredInstallPrompt = null;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Android/Chrome: ブラウザが「追加提案可能」と判断した時点で発火する
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderPwaInstallBanner('android');
});

function renderPwaInstallBanner(kind) {
  const el = document.getElementById('pwa-install-banner');
  if (!el || isStandaloneMode()) return;
  if (kind === 'android') {
    el.innerHTML = `
      <div class="pwa-install-body">
        <span class="pwa-install-emoji">📲</span>
        <span class="pwa-install-text">このアプリをホーム画面に追加できます</span>
      </div>
      <button type="button" class="btn-primary" style="padding:8px 14px;font-size:12px;flex-shrink:0" onclick="handlePwaInstallClick()">追加する</button>
      <button type="button" class="reminder-banner-close" onclick="dismissPwaInstallBanner()">×</button>
    `;
  } else {
    el.innerHTML = `
      <div class="pwa-install-body">
        <span class="pwa-install-emoji">📲</span>
        <span class="pwa-install-text">共有ボタンから「ホーム画面に追加」でアプリのように使えます</span>
      </div>
      <button type="button" class="reminder-banner-close" onclick="dismissPwaInstallBanner()">×</button>
    `;
  }
  el.style.display = 'flex';
}

async function handlePwaInstallClick() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dismissPwaInstallBanner();
}

function dismissPwaInstallBanner() {
  const el = document.getElementById('pwa-install-banner');
  if (el) el.style.display = 'none';
}

// iOS Safariはbeforeinstallpromptに対応していないため、静的な案内を出す
function initPwaInstallBanner() {
  if (isStandaloneMode()) return;
  if (isIOSDevice()) renderPwaInstallBanner('ios');
}
