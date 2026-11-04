/*
 * Keeps the whole site on the device so it opens with no signal.
 * The build fills in the version and file list below (see vite.config.ts).
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const LOCAL_PHOTOS = 'local-photos-v1'; // Photos waiting to upload: never deleted here.
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Newest page if it arrives quickly; otherwise the copy on the device. A bad signal shouldn't mean a blank screen. */
async function page(request) {
  const cache = await caches.open(SHELL);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put('/index.html', res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch { /* offline: fall through to the saved copy */ }
  network.catch(() => {});
  return (await cache.match('/index.html', { ignoreVary: true })) ?? network;
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') (await caches.open(RUNTIME)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith('/api/')) return; // Handled by the app's own sync.
  if (request.mode === 'navigate') e.respondWith(page(request));
  else if (sameOrigin || request.destination === 'image') e.respondWith(cacheFirst(request));
});

/** Saves photos ahead of time, so ones nobody has looked at yet still work offline. */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-images') return;
  e.waitUntil((async () => {
    const cache = await caches.open(RUNTIME);
    for (const src of e.data.urls) {
      const url = new URL(src, self.location.origin);
      const request = new Request(url, url.origin === self.location.origin ? {} : { mode: 'no-cors' });
      if (await caches.match(request, { ignoreVary: true })) continue;
      try {
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') await cache.put(request, res);
      } catch { /* try again next time */ }
    }
  })());
});
