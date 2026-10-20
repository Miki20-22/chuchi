// Offline-Unterstützung: App-Hülle zwischenspeichern. Daten kommen live von Supabase
// und werden in der App selbst (localStorage) für offline gecacht.
const CACHE = "chuchi-v7";
const SHELL = ["./", "index.html", "config.js", "manifest.json", "icon-192.png", "icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("supabase.co")) return; // API nie cachen
  const isPage = e.request.mode === "navigate" || url.pathname.endsWith("index.html");
  if (isPage || url.pathname.endsWith("config.js")) {
    // Seite und Verbindung: zuerst Netz (für Updates), sonst Cache
    const key = isPage ? "index.html" : "config.js";
    e.respondWith(fetch(e.request, { cache: "no-store" }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); return r; })
      .catch(() => caches.match(key)));
  } else {
    // Rest (Schriften, Bibliothek, Icons): zuerst Cache
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
  }
});
