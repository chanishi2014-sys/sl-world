'use strict';
// Bump VERSION when changing worker/precache structure. HTML updates do not
// require a bump: every online request bypasses the HTTP cache first.
const VERSION = 'v1';
const BASE = new URL('./', self.location.href);
const PREFIX = `sl-world-pwa:${BASE.pathname}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './', 'index.html', 'player-editor.html', 'sim.html', 'engine-test.html',
  'manifest.webmanifest', 'pwa-register.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
].map(path => new URL(path, BASE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Only remove this app's obsolete response caches, never other apps' data.
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  if (!ASSETS.includes(url.href)) return;
  // Do not intercept APIs, third-party resources, SW updates, or arbitrary URLs.
  const response = (async () => {
    try {
      const fresh = await fetch(new Request(event.request, { cache: 'no-store' }));
      if (fresh.status >= 500) throw new Error('Server unavailable');
      return fresh;
    } catch (error) {
      const cached = await caches.match(url.href, { cacheName: CACHE });
      if (cached) return cached;
      return new Response('SL WORLD: オフラインです。接続後に再読み込みしてください。', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })();
  // Cache-write errors must not hide a successful network response.
  event.waitUntil(response.then(async fresh => {
    if (!fresh.ok || fresh.type === 'opaque') return;
    const copy = fresh.clone();
    const cache = await caches.open(CACHE);
    await cache.put(url.href, copy);
  }).catch(() => {}));
  event.respondWith(response);
});
