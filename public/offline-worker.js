const PREFIX = "recess-rumble-";
const CACHE = PREFIX + "__OFFLINE_VERSION__";
const FALLBACK = "/offline-shell";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(FALLBACK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).pathname !== "/") return;
  event.respondWith(fetch(event.request).catch(async () => {
    return await (await caches.open(CACHE)).match(FALLBACK) ?? Response.error();
  }));
});
