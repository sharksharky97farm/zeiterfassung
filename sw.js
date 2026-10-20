/* Service Worker: Offline-Betrieb. e8f6cdc2bf wird beim Veröffentlichen durch einen Hash der Dateien ersetzt,
   dadurch wird bei jeder Änderung der Cache erneuert. */
const BUILD = "e8f6cdc2bf";
const CACHE = "zeiterfassung-" + BUILD;
const FILES = ["./", "index.html", "core.js", "app.js", "version.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("zeiterfassung-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Cache zuerst (offline-fähig); fehlt etwas, aus dem Netz holen
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
