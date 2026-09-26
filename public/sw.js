// PWA offline cache (M5): the game opens and plays without a connection once it has been played online.
//
// Privacy (docs/PRIVACY.md, checked by tests/privacy.test.ts): this worker only repeats the page's own
// GET requests for files — the game, its photos and models, and the pose model from the two hosts the
// page already allows — and keeps a copy of what came back. It sends nothing of its own, and the camera
// and the saved face never pass through it (they are never requested from anywhere).

const CACHE = 'sonmat-v1';
const SCOPE = self.registration.scope;
const HOSTS = [self.location.origin, 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SCOPE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Keep a copy of a good answer (same site, or a CDN answer the page could read). */
function keep(req, res) {
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!HOSTS.includes(url.origin)) return;
  if (req.mode === 'navigate') {
    // pages: the newest when online, the kept copy when not
    e.respondWith(
      fetch(req)
        .then((res) => keep(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE))),
    );
    return;
  }
  // built files (hashed names) and the versioned pose model never change: the kept copy first
  const fixed = url.pathname.includes('/assets/') || url.origin !== self.location.origin;
  if (fixed) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
    return;
  }
  // photos, models, textures: the kept copy at once, refreshed in the background
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => keep(req, res))
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
