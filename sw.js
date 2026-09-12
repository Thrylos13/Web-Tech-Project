const CACHE = "weather-forecast-v2"; // bumped so browsers detect this as a new SW
const SHELL = ["./index.html", "./Project.css", "./Project.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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

  // Network-first for all API calls — always want fresh weather data
  if (url.includes("openweathermap") ||
      url.includes("unsplash") ||
      url.includes("open-meteo") ||
      url.includes("openstreetmap") ||
      url.includes("archive-api")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for the app shell too — always try to get the LATEST
  // HTML/CSS/JS first. Falls back to cache only when offline. This means
  // every update you push to GitHub shows immediately on next reload,
  // instead of the old cache-first behavior that could get stuck.
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
