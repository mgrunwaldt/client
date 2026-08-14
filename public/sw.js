const CACHE_PREFIX = "overgoal-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("/index.html")) || Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return;
  const isVersionedAsset = url.pathname.startsWith("/assets/");
  const isInstallAsset =
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/icons/app-icon-");
  if (!isVersionedAsset && !isInstallAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      });
      return cached || network;
    }),
  );
});
