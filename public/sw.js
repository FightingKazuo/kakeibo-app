// kakeibo-app Service Worker
const CACHE_NAME = 'kakeibo-app-v3.8.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// インストール: 基本アセットをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ: Network First戦略
// → 常に最新を取得、ネットワーク失敗時のみキャッシュを返す
self.addEventListener('fetch', event => {
  // APIリクエストはキャッシュしない
  if (event.request.url.includes('supabase.co') ||
      event.request.url.includes('googleapis.com') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功したレスポンスをキャッシュに保存
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗時はキャッシュから返す
        return caches.match(event.request);
      })
  );
});
