// ── Service Worker（下北沢アプリ PWA） ──
// キャッシュ戦略:
//   - 自サイトの静的アセット（index.html/css/js/icons）: Cache First
//   - それ以外（Firebase SDK本体・Firestore/Auth通信・Google Maps等）: Network First
//     （常にネットワークを優先し、オフライン時のみキャッシュにフォールバック。
//     　リアルタイム性が必要なため、オンライン時は絶対にキャッシュを返さない）

const CACHE_VERSION = 'shimokita-static-v1';

// 初回インストール時にあらかじめキャッシュしておく既知の静的ファイル一覧。
// js/配下に新しいファイルを追加した場合はここにも追記すること
// （追記し忘れても、初回アクセス時にruntime cacheで自動的に追加される）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/firebase-init.js',
  '/js/data.js',
  '/js/moderation.js',
  '/js/core.js',
  '/js/home.js',
  '/js/events.js',
  '/js/news.js',
  '/js/map.js',
  '/js/auth.js',
  '/js/timeline.js',
  '/js/organizer.js',
  '/js/presence.js',
  '/js/circles.js',
  '/js/mypage.js',
  '/js/eventCreate.js',
  '/js/reminders.js',
  '/js/recommend.js',
  '/js/pwaInstall.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isOwnStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/')
  );
}

// Firebase SDK本体（CDN）・Firestore/Auth通信・Google Mapsのドメイン。
// リアルタイム性が必要なため、Service Workerは一切介入せずネットワークへ素通しする
// （respondWithを呼ばない＝Service Workerが存在しないのと同じ扱いになる）
const PASSTHROUGH_HOSTS = [
  'www.gstatic.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
  'maps.googleapis.com',
  'maps.gstatic.com',
];

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST等はそのままネットワークへ

  const url = new URL(req.url);

  if (PASSTHROUGH_HOSTS.includes(url.hostname)) {
    return; // 素通し（キャッシュ対象外）
  }

  if (isOwnStaticAsset(url)) {
    // Cache First: 静的アセットはキャッシュ優先、無ければ取得してキャッシュに保存
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
          return res;
        });
      })
    );
    return;
  }

  // Network First（その他一般の同一オリジン/外部リクエスト用のデフォルト）:
  // 常にネットワークを優先し、失敗時のみキャッシュにフォールバックする
  event.respondWith(
    fetch(req)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
