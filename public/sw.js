/* Ai Source service worker — caches the last briefing for offline installable use. */
const CACHE = "ai-source-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon.svg",
  "./data/news.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isShellRequest(url) {
  const path = url.pathname;
  return (
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith("/styles.css") ||
    path.endsWith("/manifest.webmanifest") ||
    path.includes("/icons/") ||
    path.endsWith("/data/news.json")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (!sameOrigin(url) || !isShellRequest(url)) return;

  // Prefer network for HTML/JSON so the latest briefing wins; fall back to cache offline.
  const networkFirst =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/data/news.json");

  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
            return caches.match("./index.html");
          }
          throw new Error("offline");
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
