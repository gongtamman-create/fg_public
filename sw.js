// gongtam.com — self-cleanup service worker
// 과거 배포에서 등록됐던 SW가 사용자 단말에 stale 캐시를 잡고 있는 문제를 자동 복구한다.
// 동작: install 즉시 활성화 → 모든 캐시 삭제 → self.registration.unregister() → 모든 윈도우 강제 새로고침.
// 이 SW가 한 번 돌고 나면 사용자 브라우저는 SW 없는 깨끗한 상태로 돌아간다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (_) {}
    }
  })());
});

// fetch는 항상 네트워크로 통과 — 캐시 일절 사용하지 않음.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
