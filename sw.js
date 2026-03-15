const CACHE = "weather-forecast-v1";
const SHELL = ["./index.html", "./Project.css", "./Project.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Network-first for all API calls — always want fresh data
  if (url.includes("openweathermap") ||
      url.includes("unsplash") ||
      url.includes("open-meteo") ||
      url.includes("openstreetmap")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for app shell (HTML, CSS, JS)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});