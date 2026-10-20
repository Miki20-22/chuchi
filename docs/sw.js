// Offline-Unterstützung: App-Hülle zwischenspeichern. Daten kommen live von Supabase
// und werden in der App selbst (localStorage) für offline gecacht.
const CACHE = "chuchi-v1";
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png",
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
  if (isPage) {
    // Seite: zuerst Netz (für Updates), sonst Cache
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
  } else {
    // Rest (Schriften, Bibliothek, Icons): zuerst Cache
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
  }
});
