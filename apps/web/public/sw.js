/* eslint-disable no-undef */
const CACHE_NAME = "nim-shell-v2";
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE_NAME).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key.startsWith("nim-shell-")).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then((response) => { if (response.ok && request.cache !== "no-store") { const copy = response.clone(); void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); } return response; }).catch(() => caches.match(request).then((cached) => cached ?? new Response("Offline — reconnectez-vous pour continuer.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
});
