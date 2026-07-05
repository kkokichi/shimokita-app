// ── THEME（ライト/ダーク切り替え） ──
// OSのprefers-color-schemeを初期値とし、ユーザーが明示的に切り替えたら
// localStorageに永続化する。<head>直後で同期実行し、初期表示のチラつきを防ぐ。
function getStoredTheme() {
  try {
    return localStorage.getItem('theme');
  } catch (e) {
    return null;
  }
}

function getEffectiveTheme() {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
  // 未設定の場合はdata-theme属性を付けず、CSSのprefers-color-schemeに委ねる
}

function updateThemeToggleUI() {
  const el = document.getElementById('theme-toggle-switch');
  if (!el) return;
  el.classList.toggle('dark', getEffectiveTheme() === 'dark');
}

function toggleTheme() {
  const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch (e) {
    // ストレージが使えない環境では今回のセッション内のみ有効
  }
  updateThemeToggleUI();
}

initTheme();
