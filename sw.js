/* Service Worker — funcionamento offline */
const VERSION = "v11";
const SHELL_CACHE = "shell-" + VERSION;
const TILE_CACHE = "tiles-" + VERSION;
const MAX_TILES = 400;

const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/data.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Tiles do mapa: cache-first com limite (permite rever áreas já visitadas offline)
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) { cache.put(e.request, res.clone()); trimTiles(); }
          return res;
        } catch { return new Response("", { status: 503 }); }
      })
    );
    return;
  }

  // App shell e libs: cache-first, atualiza em segundo plano
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
            caches.open(SHELL_CACHE).then((c) => c.put(e.request, res.clone()));
          }
          return res.clone();
        })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
