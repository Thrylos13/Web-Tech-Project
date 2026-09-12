// ═══════════════════════════════════════════════════════════════════
// DOM REFERENCES — declared first so everything below can use them
// ═══════════════════════════════════════════════════════════════════
const errorBox        = document.getElementById('error-box');
const errorMessage    = document.getElementById('error-message');
const searchBar       = document.querySelector(".search-bar");
const suggestionsList = document.getElementById("suggestions-list");
const weatherBg       = document.getElementById("weather-bg");
const loadingOverlay  = document.getElementById("loading-overlay");
const savedChips      = document.getElementById("saved-chips");
const pinButton       = document.getElementById("pin-button");
const chartPanel      = document.getElementById("chart-panel");
const rightBox        = document.getElementById("right-box");

// ── Chart panel open/close ────────────────────────────────────────
document.getElementById("chart-toggle-btn").addEventListener("click", () => {
  const isOpen = chartPanel.classList.toggle("open");
  rightBox.classList.toggle("panel-open", isOpen);
  // Chart is pre-rendered on forecast load — nothing to build here
});
document.getElementById("chart-close-btn").addEventListener("click", () => {
  chartPanel.classList.remove("open");
  rightBox.classList.remove("panel-open");
});

// ═══════════════════════════════════════════════════════════════════
// API KEYS
// ═══════════════════════════════════════════════════════════════════
const UNSPLASH_KEY = "giLKzUHkpzkpLgazEDIqG4Y2GyZYSU_LXyy4VeIHOyE";
const OWM_KEY      = "244738892f67a6ec9b1fe73e4627dd72";

// ═══════════════════════════════════════════════════════════════════
// WEB WORKER — offloads ML computations (k-means clustering, linear
// regression) off the main thread so the UI never freezes during
// calculation, even though these particular datasets are small.
// Demonstrates the pattern: the same ml-utils.js functions are used
// by the worker (via importScripts) and are unit-tested independently.
// ═══════════════════════════════════════════════════════════════════
const mlWorker = new Worker("./ml-worker.js");

function runInWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).slice(2);
    function handler(e) {
      if (e.data.requestId !== requestId) return;
      mlWorker.removeEventListener("message", handler);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    }
    mlWorker.addEventListener("message", handler);
    mlWorker.postMessage({ type, payload, requestId });
  });
}

// ═══════════════════════════════════════════════════════════════════
// API RETRY LOGIC — exponential backoff with jitter
// Wraps fetch() so transient network failures or 5xx server errors
// are retried automatically before giving up, instead of failing on
// the first blip. Used for every external weather/photo API call.
// ═══════════════════════════════════════════════════════════════════
function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 500) {
  return new Promise((resolve, reject) => {
    function attempt(retryCount) {
      fetch(url, options)
        .then(response => {
          if (!response.ok && response.status >= 500 && retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount) + Math.random() * 200;
            setTimeout(() => attempt(retryCount + 1), delay);
          } else {
            resolve(response);
          }
        })
        .catch(err => {
          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount) + Math.random() * 200;
            setTimeout(() => attempt(retryCount + 1), delay);
          } else {
            reject(err);
          }
        });
    }
    attempt(0);
  });
}

// ═══════════════════════════════════════════════════════════════════
// THEME TOGGLE — light/dark, persisted in localStorage
// The <head> already applies data-theme before first paint to avoid
// a flash; this just wires the button and keeps it in sync.
// ═══════════════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "light" ? "🌙" : "☀️";
  localStorage.setItem("theme", theme);

  // Re-render any currently open Chart.js charts so their colors
  // update immediately instead of only on next open.
  if (chartPanel.classList.contains("open")) renderHourly();
  const historyOverlay = document.getElementById("history-overlay");
  if (historyOverlay.classList.contains("visible") && lastHistoryYearData) {
    renderHistoryChart(lastHistoryYearData, lastHistoryTodayTemp);
  }
}
(function initThemeIcon() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = current === "light" ? "🌙" : "☀️";
})();
document.getElementById("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

// ═══════════════════════════════════════════════════════════════════
// UNIT TOGGLE — persisted in localStorage
// ═══════════════════════════════════════════════════════════════════
let isCelsius = localStorage.getItem("unit") !== "F";
let lastData  = null; // stores last raw OWM /weather response

function toF(c)   { return Math.round((c * 9/5 + 32) * 10) / 10; }
function toKmh(s) { return Math.round(s * 3.6  * 10) / 10; }
function toMph(s) { return Math.round(s * 2.237 * 10) / 10; }
function fmtTemp(c) {
  return isCelsius ? c + "°C" : toF(c) + "°F";
}
function fmtWind(ms) {
  return isCelsius
    ? "Wind Speed: " + toKmh(ms) + " km/h"
    : "Wind Speed: " + toMph(ms) + " mph";
}

function renderTemps() {
  if (!lastData) return;
  const { temp, feels_like, temp_min, temp_max } = lastData.main;
  const { speed } = lastData.wind;
  const tempEl = document.querySelector(".temp");
  countUp(tempEl, fmtTemp(temp));
  document.querySelector(".feels_like").innerText = "Feels like: " + fmtTemp(feels_like);
  document.querySelector(".high-low").innerText   = "H: " + fmtTemp(temp_max) + "  |  L: " + fmtTemp(temp_min);
  document.querySelector(".wind").innerText       = fmtWind(speed);
  const btn = document.getElementById("unit-toggle");
  btn.innerText = isCelsius ? "°F" : "°C";
  btn.title     = isCelsius ? "Switch to Fahrenheit" : "Switch to Celsius";
  renderForecastTemps();
}

document.getElementById("unit-toggle").addEventListener("click", function () {
  isCelsius = !isCelsius;
  localStorage.setItem("unit", isCelsius ? "C" : "F");
  renderTemps();
});

// ═══════════════════════════════════════════════════════════════════
// ERROR TOAST — auto-dismisses after 5 s
// ═══════════════════════════════════════════════════════════════════
let errorTimer;
function showError(message) {
  errorMessage.innerText = message;
  errorBox.classList.add('show');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(hideError, 5000);
}
function hideError() {
  errorBox.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════════
// LOADING SPINNER
// ═══════════════════════════════════════════════════════════════════
function showLoading(msg) {
  document.querySelector(".loading-text").innerText = msg || "Fetching weather…";
  loadingOverlay.classList.add("show");
  document.querySelector(".container").classList.add("city-fade-out");
}
function hideLoading() {
  loadingOverlay.classList.remove("show");
}

// ═══════════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════════
let intervalId;
function displayTime(timezone) {
  clearInterval(intervalId);
  function tick() {
    const utcHours   = timezone / 3600;
    const d          = new Date();
    const utc        = d.getTime() + d.getTimezoneOffset() * 60000;
    const now        = new Date(utc + 3600000 * utcHours);
    const hrs = now.getHours(), min = now.getMinutes();
    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
    const dayNames   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    document.getElementById("day").innerHTML        = dayNames[now.getDay()];
    document.getElementById("month").innerHTML      = " " + monthNames[now.getMonth()];
    document.getElementById("date-today").innerHTML = now.getDate();
    document.getElementById("minutes").innerHTML    = min < 10 ? "0" + min : min;
    document.getElementById("hours").innerHTML      = hrs < 10 ? "0" + hrs : hrs;
  }
  tick();
  intervalId = setInterval(tick, 60000);
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC CARD THEMING by local time of day
// Dawn 5–7 | Day 7–17 | Dusk 17–19 | Night 19–5
// ═══════════════════════════════════════════════════════════════════
function applyTimeTheme(timezone) {
  const utcHours = timezone / 3600;
  const d = new Date();
  const now = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 3600000 * utcHours);
  const h = now.getHours();
  const box = document.getElementById("right-box");
  box.classList.remove("theme-dawn", "theme-day", "theme-dusk", "theme-night");
  if      (h >= 5  && h < 7)  box.classList.add("theme-dawn");
  else if (h >= 7  && h < 17) box.classList.add("theme-day");
  else if (h >= 17 && h < 20) box.classList.add("theme-dusk");
  else                         box.classList.add("theme-night");
}

// ═══════════════════════════════════════════════════════════════════
// SUNRISE / SUNSET helper
// ═══════════════════════════════════════════════════════════════════
function fmtUnixTime(unix, timezone) {
  const utcHours = timezone / 3600;
  const d = new Date((unix + utcHours * 3600) * 1000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return h12 + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND IMAGE — Unsplash
// ═══════════════════════════════════════════════════════════════════
function setBackground(cityName, country) {
  weatherBg.classList.remove("loaded");
  const query = encodeURIComponent(cityName + " " + country);
  const url   = "https://api.unsplash.com/photos/random" +
                "?query=" + query +
                "&orientation=landscape&content_filter=high&count=1";
  fetchWithRetry(url, { headers: { "Authorization": "Client-ID " + UNSPLASH_KEY, "Accept-Version": "v1" } })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      const photo = Array.isArray(data) ? data[0] : data;
      if (!photo?.urls) return;
      const img   = new Image();
      img.onload  = () => {
        weatherBg.style.backgroundImage = "url('" + photo.urls.regular + "')";
        setTimeout(() => weatherBg.classList.add("loaded"), 80);
      };
      img.src = photo.urls.regular;
    })
    .catch(err => console.warn("Unsplash:", err));
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATED WEATHER ICON — OWM PNG + CSS keyframe animation per condition
// ═══════════════════════════════════════════════════════════════════
const conditionAnimMap = {
  Clear:        "icon-spin",
  Clouds:       "icon-drift",
  Rain:         "icon-bounce",
  Drizzle:      "icon-bounce",
  Thunderstorm: "icon-flash",
  Snow:         "icon-sway",
  Mist:         "icon-drift",
  Fog:          "icon-drift",
  Haze:         "icon-pulse",
  Smoke:        "icon-drift",
  Dust:         "icon-sway",
  Sand:         "icon-sway",
  Ash:          "icon-drift",
  Squall:       "icon-shake",
  Tornado:      "icon-spin-fast",
};

function setWeatherIcon(iconCode, condition) {
  const img = document.getElementById("weather-icon");
  img.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  img.className = "icon";
  const animClass = conditionAnimMap[condition] || "icon-pulse";
  setTimeout(() => img.classList.add(animClass), 50);
}

// ═══════════════════════════════════════════════════════════════════
// TEMPERATURE COUNT-UP ANIMATION
// ═══════════════════════════════════════════════════════════════════
function countUp(element, targetText, duration = 800) {
  const match  = targetText.match(/^(-?\d+\.?\d*)(.*)/);
  if (!match) { element.innerText = targetText; return; }
  const target = parseFloat(match[1]);
  const suffix = match[2];
  const start  = 0;
  const startTime = performance.now();

  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = (start + (target - start) * eased).toFixed(
      suffix.includes(".") ? 2 : 0
    );
    element.innerText = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else element.innerText = targetText;
  }
  requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════════════════
// WEATHER PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════
const particleCanvas  = document.getElementById("particle-canvas");
const pCtx            = particleCanvas.getContext("2d");
let   particleAnim    = null;
let   particles       = [];
let   particleType    = "none";

function resizeParticleCanvas() {
  particleCanvas.width  = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}
resizeParticleCanvas();
window.addEventListener("resize", resizeParticleCanvas);

function createParticle() {
  const w = particleCanvas.width;
  const h = particleCanvas.height;
  if (particleType === "rain") {
    return { x: Math.random() * w, y: Math.random() * -h,
      len: 18 + Math.random() * 22, speed: 18 + Math.random() * 14,
      opacity: 0.35 + Math.random() * 0.45 };
  }
  if (particleType === "thunder") {
    return { x: Math.random() * w, y: Math.random() * -h,
      len: 22 + Math.random() * 28, speed: 22 + Math.random() * 16,
      opacity: 0.4 + Math.random() * 0.5, flash: Math.random() < 0.003 };
  }
  if (particleType === "tornado") {
    const angle = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 180;
    return { cx: w / 2, cy: h / 2, r, angle,
      speed: 0.04 + Math.random() * 0.06,
      opacity: 0.25 + Math.random() * 0.4,
      size: 2 + Math.random() * 4 };
  }
  if (particleType === "snow") {
    return { x: Math.random() * w, y: Math.random() * -h,
      r: 3 + Math.random() * 5, speed: 1.5 + Math.random() * 3,
      drift: (Math.random() - 0.5) * 1.2, opacity: 0.55 + Math.random() * 0.4 };
  }
  if (particleType === "cloud") {
    return { x: -150, y: 20 + Math.random() * (h * 0.5),
      r: 60 + Math.random() * 80, speed: 0.25 + Math.random() * 0.4,
      opacity: 0.08 + Math.random() * 0.1 };
  }
  if (particleType === "scorch") {
    return { x: Math.random() * w, y: h + Math.random() * 40,
      r: 1 + Math.random() * 2.5, speed: 0.6 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 0.8,
      opacity: 0.0, fade: 0.015 + Math.random() * 0.02, peak: 0.25 + Math.random() * 0.3,
      life: 0 };
  }
  return null;
}

function animateParticles() {
  particleAnim = requestAnimationFrame(animateParticles);
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  const w = particleCanvas.width;
  const h = particleCanvas.height;
  const maxCount = { rain:140, thunder:200, tornado:70, snow:120, cloud:10, scorch:70 }[particleType] || 0;

  while (particles.length < maxCount) {
    const p = createParticle();
    if (p) particles.push(p);
  }

  if (particleType === "thunder" && Math.random() < 0.004) {
    pCtx.save();
    pCtx.fillStyle = "rgba(200,220,255,0.1)";
    pCtx.fillRect(0, 0, w, h);
    pCtx.restore();
  }

  particles.forEach((p, i) => {

    if (particleType === "rain" || particleType === "thunder") {
      pCtx.save();
      pCtx.globalAlpha = p.opacity;
      pCtx.strokeStyle = particleType === "thunder" ? "#b0d4ff" : "#90baff";
      pCtx.lineWidth = 1.4;
      pCtx.beginPath();
      pCtx.moveTo(p.x, p.y);
      pCtx.lineTo(p.x - 3, p.y + p.len);
      pCtx.stroke();
      pCtx.restore();
      p.y += p.speed; p.x -= 2.5;
      if (p.y > h + p.len) particles[i] = createParticle();

    } else if (particleType === "tornado") {
      p.angle += p.speed;
      p.r     *= 0.998;
      const x = p.cx + Math.cos(p.angle) * p.r;
      const y = p.cy + Math.sin(p.angle) * p.r * 0.4;
      pCtx.save();
      pCtx.globalAlpha = p.opacity;
      pCtx.fillStyle   = "#c0b090";
      pCtx.beginPath();
      pCtx.arc(x, y, p.size, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
      if (p.r < 10) particles[i] = createParticle();

    } else if (particleType === "snow") {
      pCtx.save();
      pCtx.globalAlpha = p.opacity;
      pCtx.fillStyle   = "#dff0ff";
      pCtx.shadowBlur  = 5;
      pCtx.shadowColor = "#ffffff";
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
      p.y += p.speed; p.x += p.drift;
      if (p.y > h + p.r) particles[i] = createParticle();

    } else if (particleType === "cloud") {
      const grad = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(190,210,235,${p.opacity})`);
      grad.addColorStop(1, "rgba(190,210,235,0)");
      pCtx.save();
      pCtx.fillStyle = grad;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
      p.x += p.speed;
      if (p.x > w + p.r) particles[i] = { ...createParticle(), x: -150 };

    } else if (particleType === "scorch") {
      p.life += p.fade;
      p.opacity = p.life < p.peak
        ? (p.life / p.peak) * p.peak
        : Math.max(0, p.peak - (p.life - p.peak) * 1.5);
      pCtx.save();
      pCtx.globalAlpha = p.opacity;
      pCtx.fillStyle   = "#ffcc44";
      pCtx.shadowBlur  = 8;
      pCtx.shadowColor = "#ff6600";
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
      p.y -= p.speed; p.x += p.drift;
      if (p.opacity <= 0 || p.y < -10) particles[i] = createParticle();
    }
  });
}

function setParticleEffect(condition) {
  if (particleAnim) { cancelAnimationFrame(particleAnim); particleAnim = null; }
  particles = [];
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  if      (["Rain","Drizzle","Squall"].includes(condition))  particleType = "rain";
  else if (condition === "Thunderstorm")                     particleType = "thunder";
  else if (condition === "Tornado")                          particleType = "tornado";
  else if (["Snow"].includes(condition))                     particleType = "snow";
  else if (["Clouds","Mist","Fog","Haze","Smoke","Dust","Ash"].includes(condition)) particleType = "cloud";
  else if (condition === "Clear")                            particleType = "scorch";
  else                                                        particleType = "none";

  if (particleType !== "none") animateParticles();
}

// ═══════════════════════════════════════════════════════════════════
// CARD ENTRANCE ANIMATION — slides cards in on weather load
// ═══════════════════════════════════════════════════════════════════
function animateCardsIn() {
  const container = document.querySelector(".container");
  container.classList.remove("city-fade-out");
  container.classList.remove("animate-in");
  void container.offsetWidth;
  container.classList.add("animate-in");
}

const aqiMeta = [
  { label: "Good",      color: "#4caf50" },
  { label: "Fair",      color: "#cddc39" },
  { label: "Moderate",  color: "#ff9800" },
  { label: "Poor",      color: "#f44336" },
  { label: "Very Poor", color: "#9c27b0" },
];
function uvMeta(i) {
  if (i <= 2)  return { label: "Low",       color: "#4caf50" };
  if (i <= 5)  return { label: "Moderate",  color: "#cddc39" };
  if (i <= 7)  return { label: "High",      color: "#ff9800" };
  if (i <= 10) return { label: "Very High", color: "#f44336" };
  return              { label: "Extreme",   color: "#9c27b0" };
}
function fetchAQIandUV(lat, lon) {
  ["aqi-value","uv-value"].forEach(id => document.getElementById(id).textContent = "…");
  ["aqi-cat","uv-cat"].forEach(id => document.getElementById(id).textContent = "");
  const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`;
  const uvUrl  = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=uv_index&timezone=auto`;
  Promise.allSettled([
    fetchWithRetry(aqiUrl, { mode:"cors" }).then(r => r.json()),
    fetchWithRetry(uvUrl,  { mode:"cors" }).then(r => r.json()),
  ]).then(([aqiRes, uvRes]) => {
    if (aqiRes.status === "fulfilled") {
      const aqi = aqiRes.value.list[0].main.aqi;
      const m   = aqiMeta[aqi - 1];
      document.getElementById("aqi-value").textContent = aqi;
      document.getElementById("aqi-cat").textContent   = m.label;
      document.getElementById("aqi-box").style.setProperty("--indicator-color", m.color);
      addAQIAlert(aqi);
    } else { document.getElementById("aqi-value").textContent = "N/A"; }
    if (uvRes.status === "fulfilled") {
      const uv = Math.round(uvRes.value.current.uv_index);
      const m  = uvMeta(uv);
      document.getElementById("uv-value").textContent = uv;
      document.getElementById("uv-cat").textContent   = m.label;
      document.getElementById("uv-box").style.setProperty("--indicator-color", m.color);
      addUVAlert(uv);
    } else { document.getElementById("uv-value").textContent = "N/A"; }
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5-DAY FORECAST + HOURLY
// ═══════════════════════════════════════════════════════════════════
let lastForecast = null;

function fetchForecast(lat, lon) {
  fetchWithRetry(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`,
    { mode: "cors" }
  )
  .then(r => r.json())
  .then(data => {
    lastForecast = data.list;
    renderForecastStrip();
    renderHourly();
  })
  .catch(err => console.warn("Forecast fetch failed:", err));
}

// ── 5-day strip: aggregate ALL entries per day for true H/L ───────
function renderForecastStrip() {
  if (!lastForecast) return;
  const strip = document.getElementById("forecast-strip");
  strip.innerHTML = "";

  const byDay = {};
  lastForecast.forEach(entry => {
    const date = entry.dt_txt.slice(0, 10);
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(entry);
  });

  const dates = Object.keys(byDay);

  const todayEntries = byDay[dates[0]];
  if (todayEntries) {
    const todayHi = Math.max(...todayEntries.map(e => e.main.temp_max));
    const todayLo = Math.min(...todayEntries.map(e => e.main.temp_min));
    if (lastData) {
      lastData.main.temp_max = todayHi;
      lastData.main.temp_min = todayLo;
      renderTemps();
    }
  }

  const futureDates = dates.slice(1, 6);
  const regressionPoints = [];

  futureDates.forEach((date, idx) => {
    const entries = byDay[date];

    const hi = Math.max(...entries.map(e => e.main.temp_max));
    const lo = Math.min(...entries.map(e => e.main.temp_min));
    regressionPoints.push({ x: idx, y: (hi + lo) / 2 });

    const noon = entries.reduce((best, e) => {
      const h = new Date(e.dt * 1000).getUTCHours();
      return Math.abs(h - 12) < Math.abs(new Date(best.dt * 1000).getUTCHours() - 12) ? e : best;
    });
    const dayName  = new Date(noon.dt * 1000).toLocaleDateString("en", { weekday: "short" });
    const iconCode = noon.weather[0].icon;

    const card = document.createElement("div");
    card.className   = "forecast-card";
    card.dataset.hi  = hi;
    card.dataset.lo  = lo;
    card.innerHTML   = `
      <div class="fc-day">${dayName}</div>
      <img class="fc-icon" src="https://openweathermap.org/img/wn/${iconCode}.png" alt="${noon.weather[0].description}"/>
      <div class="fc-hi">${fmtTemp(hi)}</div>
      <div class="fc-lo">${fmtTemp(lo)}</div>
      <div class="fc-pop" title="Probability of precipitation">💧${Math.round(Math.max(...entries.map(e => e.pop || 0)) * 100)}%</div>
    `;
    strip.appendChild(card);
  });

  renderForecastTrend(regressionPoints);
}

// ─────────────────────────────────────────────────────────────────────
// ML #1: Linear Regression trend badge — computed in the Web Worker
// via ml-utils.js's linearRegression(). Detects whether the next 5
// days are warming, cooling, or stable.
// ─────────────────────────────────────────────────────────────────────
async function renderForecastTrend(points) {
  const el = document.getElementById("forecast-trend");
  if (!el || points.length < 2) return;

  let slope = 0;
  try {
    const result = await runInWorker("regression", { points });
    slope = result.slope;
  } catch (e) {
    console.warn("Regression worker failed:", e);
  }

  const slopeDisplay = isCelsius ? slope : slope * 9 / 5;
  const absSlope = Math.abs(slopeDisplay);

  let icon, label, cls;
  if (absSlope < 0.4) {
    icon = "➡️"; label = "Stable temperatures expected"; cls = "trend-stable-badge";
  } else if (slopeDisplay > 0) {
    icon = "📈"; label = `Warming trend: +${absSlope.toFixed(1)}°${isCelsius ? "C" : "F"}/day`; cls = "trend-warm-badge";
  } else {
    icon = "📉"; label = `Cooling trend: -${absSlope.toFixed(1)}°${isCelsius ? "C" : "F"}/day`; cls = "trend-cool-badge";
  }

  el.textContent = `${icon} ${label}`;
  el.className = "forecast-trend " + cls;
  el.title = "Linear regression fit across the next 5 days' average temperatures (computed in a Web Worker)";
}

function renderForecastTemps() {
  document.querySelectorAll(".forecast-card").forEach(card => {
    card.querySelector(".fc-hi").textContent = fmtTemp(parseFloat(card.dataset.hi));
    card.querySelector(".fc-lo").textContent = fmtTemp(parseFloat(card.dataset.lo));
  });
  const points = Array.from(document.querySelectorAll(".forecast-card")).map((card, idx) => ({
    x: idx,
    y: (parseFloat(card.dataset.hi) + parseFloat(card.dataset.lo)) / 2,
  }));
  renderForecastTrend(points);
  if (chartPanel.classList.contains("open")) renderHourly();
}

// ── Hourly chart: Chart.js combo — temp line + precip line ────────
let hourlyChart = null;

function renderHourly() {
  if (!lastForecast) return;

  const entries = lastForecast.slice(0, 8);

  const labels = entries.map(e => {
    const d  = new Date(e.dt * 1000);
    const h  = d.getUTCHours();
    const ap = h >= 12 ? "PM" : "AM";
    return (h % 12 || 12) + ap;
  });

  const temps  = entries.map(e => isCelsius ? e.main.temp : toF(e.main.temp));
  const precip = entries.map(e => Math.round((e.pop || 0) * 100));

  const canvas = document.getElementById("hourly-chart");
  if (!canvas) return;

  if (hourlyChart) { hourlyChart.destroy(); hourlyChart = null; }

  // Chart.js colors are set at creation time and don't read CSS variables,
  // so pick an explicit palette based on the current theme. Light mode
  // needs deeper, more saturated colors — the pale dark-mode yellow/blue
  // has too little contrast against a white/light chart background.
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const palette = isLight
    ? {
        tempLine: "rgba(196,130,0,0.95)",   tempFill: "rgba(196,130,0,0.08)",   tempPoint: "rgba(196,130,0,1)",
        rainLine: "rgba(21,101,192,0.9)",   rainFill: "rgba(21,101,192,0.06)",  rainPoint: "rgba(21,101,192,1)",
        tick: "rgba(20,30,60,0.7)", grid: "rgba(20,30,60,0.08)", border: "rgba(20,30,60,0.15)",
        legend: "rgba(20,30,60,0.75)",
        tooltipBg: "rgba(255,255,255,0.97)", tooltipTitle: "rgba(20,30,60,0.9)", tooltipBody: "rgba(20,30,60,0.8)", tooltipBorder: "rgba(20,30,60,0.15)",
      }
    : {
        tempLine: "rgba(255,220,100,0.9)",  tempFill: "rgba(255,220,100,0.08)", tempPoint: "rgba(255,220,100,1)",
        rainLine: "rgba(100,180,255,0.85)", rainFill: "rgba(100,180,255,0.06)", rainPoint: "rgba(100,180,255,1)",
        tick: "rgba(255,255,255,0.7)", grid: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)",
        legend: "rgba(255,255,255,0.65)",
        tooltipBg: "rgba(20,22,35,0.92)", tooltipTitle: "rgba(255,255,255,0.85)", tooltipBody: "rgba(255,255,255,0.75)", tooltipBorder: "rgba(255,255,255,0.12)",
      };

  hourlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temp",
          data: temps,
          borderColor: palette.tempLine,
          backgroundColor: palette.tempFill,
          pointBackgroundColor: palette.tempPoint,
          pointBorderColor: palette.tempPoint,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: palette.tempPoint,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          yAxisID: "yTemp",
        },
        {
          label: "Rain %",
          data: precip,
          borderColor: palette.rainLine,
          backgroundColor: palette.rainFill,
          pointBackgroundColor: palette.rainPoint,
          pointBorderColor: palette.rainPoint,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: palette.rainPoint,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          yAxisID: "yPrecip",
          borderDash: [5, 3],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 10, right: 10, top: 20, bottom: 10 } },
      interaction: { mode: "nearest", intersect: false, axis: "x" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: palette.legend,
            font: { size: 14 },
            boxWidth: 24,
            boxHeight: 3,
            padding: 24,
          },
        },
        tooltip: {
          position: "nearest",
          backgroundColor: palette.tooltipBg,
          titleColor: palette.tooltipTitle,
          bodyColor: palette.tooltipBody,
          borderColor: palette.tooltipBorder,
          borderWidth: 1,
          padding: 14,
          bodySpacing: 8,
          bodyFont: { size: 14 },
          titleFont: { size: 14, weight: "bold" },
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          callbacks: {
            label: ctx => ctx.dataset.label === "Temp"
              ? "  Temp: " + ctx.parsed.y + (isCelsius ? "°C" : "°F")
              : "  Rain: " + ctx.parsed.y + "%",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: palette.tick,
            font: { size: 13 },
            maxRotation: 0,
            padding: 10,
          },
          grid: { color: palette.grid },
          border: { color: palette.border },
        },
        yTemp: {
          position: "left",
          ticks: {
            color: isLight ? "rgba(196,130,0,0.9)" : "rgba(255,220,100,0.85)",
            font: { size: 13 },
            padding: 12,
            callback: v => v + (isCelsius ? "°" : "°F"),
          },
          grid: { color: palette.grid },
          border: { color: palette.border, dash: [3, 3] },
        },
        yPrecip: {
          position: "right",
          min: 0, max: 100,
          ticks: {
            color: isLight ? "rgba(21,101,192,0.9)" : "rgba(100,180,255,0.85)",
            font: { size: 13 },
            padding: 12,
            stepSize: 25,
            callback: v => v + "%",
          },
          grid: { drawOnChartArea: false },
          border: { color: palette.border },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// ACCESSIBILITY — focus trap for modal overlays + live region
// ═══════════════════════════════════════════════════════════════════
let modalPreviousFocus = null;

function trapFocus(modalEl) {
  modalPreviousFocus = document.activeElement;
  const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
  function handleKey(e) {
    if (e.key !== "Tab") return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  modalEl._focusTrapHandler = handleKey;
  modalEl.addEventListener("keydown", handleKey);
}

function releaseFocus(modalEl) {
  if (modalEl._focusTrapHandler) {
    modalEl.removeEventListener("keydown", modalEl._focusTrapHandler);
    modalEl._focusTrapHandler = null;
  }
  if (modalPreviousFocus && typeof modalPreviousFocus.focus === "function") {
    modalPreviousFocus.focus();
  }
}

function updateAriaLive(data) {
  const region = document.getElementById("aria-live-status");
  if (!region) return;
  const t = isCelsius ? data.main.temp.toFixed(0) + "°C" : toF(data.main.temp) + "°F";
  region.textContent = `Weather updated for ${data.name}: ${t}, ${data.weather[0].description}`;
}

// ─────────────────────────────────────────────────────────────────────
// ML #2: K-Means Clustering — computed in the Web Worker via
// ml-utils.js's kMeans(). Groups pinned cities by current
// {temp, humidity, wind} to find ones with genuinely similar weather.
// ─────────────────────────────────────────────────────────────────────
function fetchQuickWeather(lat, lon) {
  return fetchWithRetry(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`)
    .then(r => r.json())
    .then(d => ({ temp: d.main.temp, humidity: d.main.humidity, wind: d.wind.speed * 3.6 }))
    .catch(() => null);
}

function updateSimilarCities() {
  if (!currentLocation || !lastData || savedLocations.length === 0) return;

  const currentProfile = {
    temp: lastData.main.temp,
    humidity: lastData.main.humidity,
    wind: lastData.wind.speed * 3.6,
  };

  Promise.all(savedLocations.map(loc => fetchQuickWeather(loc.lat, loc.lon)))
    .then(async profiles => {
      const points = [currentProfile, ...profiles.filter(p => p)];
      const validIndices = profiles.map((p, i) => p ? i : null).filter(i => i !== null);
      if (points.length < 2) return;

      const k = Math.min(3, points.length);
      let clusters;
      try {
        clusters = await runInWorker("kmeans", { points, k });
      } catch (e) {
        console.warn("K-means worker failed:", e);
        return;
      }
      const currentCluster = clusters[0];

      const chips = savedChips.querySelectorAll(".saved-chip");
      validIndices.forEach((origIdx, pointsIdx) => {
        const chip = chips[origIdx];
        if (!chip) return;
        const chipCluster = clusters[pointsIdx + 1];
        if (chipCluster === currentCluster) {
          chip.classList.add("chip-similar");
          chip.title = `Similar weather to ${currentLocation.name} right now`;
        } else {
          chip.classList.remove("chip-similar");
          chip.removeAttribute("title");
        }
      });
    });
}

// ═══════════════════════════════════════════════════════════════════
// SAVED LOCATIONS — IndexedDB, falls back to localStorage if
// IndexedDB is unavailable (private browsing, very old browsers).
// ═══════════════════════════════════════════════════════════════════
let savedLocations  = [];
let currentLocation = null; // { name, country, lat, lon }

async function loadSavedLocations() {
  try {
    savedLocations = await IDB.idbGetAll("pinnedCities");
    // One-time migration from an older localStorage-only version
    if (!savedLocations.length) {
      const legacy = JSON.parse(localStorage.getItem("savedLocations") || "[]");
      for (const loc of legacy) await IDB.idbAdd("pinnedCities", loc);
      if (legacy.length) savedLocations = await IDB.idbGetAll("pinnedCities");
    }
  } catch (e) {
    console.warn("IndexedDB unavailable, falling back to localStorage:", e);
    savedLocations = JSON.parse(localStorage.getItem("savedLocations") || "[]");
  }
  renderSavedChips();
}

function renderSavedChips() {
  savedChips.innerHTML = "";
  if (savedLocations.length === 0) {
    document.getElementById("saved-bar").style.display = "none";
    return;
  }
  document.getElementById("saved-bar").style.display = "flex";
  savedLocations.forEach((loc, i) => {
    const chip = document.createElement("div");
    chip.className = "saved-chip";
    chip.innerHTML = `<span>${loc.name}</span><button class="chip-remove" data-i="${i}" title="Remove" aria-label="Remove ${loc.name}">×</button>`;
    chip.querySelector("span").addEventListener("click", () => {
      weather.fetchWeatherByCoords(loc.lat, loc.lon);
    });
    chip.querySelector(".chip-remove").addEventListener("click", async e => {
      e.stopPropagation();
      try {
        if (loc.id !== undefined) await IDB.idbDelete("pinnedCities", loc.id);
        savedLocations = await IDB.idbGetAll("pinnedCities");
      } catch (err) {
        savedLocations.splice(i, 1);
        localStorage.setItem("savedLocations", JSON.stringify(savedLocations));
      }
      renderSavedChips();
    });
    savedChips.appendChild(chip);
  });
}

pinButton.addEventListener("click", async function () {
  if (!currentLocation) return;
  const already = savedLocations.find(l => l.lat === currentLocation.lat && l.lon === currentLocation.lon);
  if (already) { showError("Already pinned!"); return; }
  if (savedLocations.length >= 6) { showError("Max 6 pinned locations."); return; }
  try {
    await IDB.idbAdd("pinnedCities", { ...currentLocation });
    savedLocations = await IDB.idbGetAll("pinnedCities");
  } catch (e) {
    savedLocations.push(currentLocation);
    localStorage.setItem("savedLocations", JSON.stringify(savedLocations));
  }
  renderSavedChips();
  updateSimilarCities();
});

loadSavedLocations(); // async init on page load

// ═══════════════════════════════════════════════════════════════════
// WEATHER OBJECT
// ═══════════════════════════════════════════════════════════════════
let weather = {

  fetchWeatherByCoords: function (lat, lon, geocoderName) {
    showLoading("Fetching weather…");
    fetchWithRetry(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`,
      { mode: "cors" }
    )
    .then(r => { if (!r.ok) throw new Error("Location not found"); return r.json(); })
    .then(data => {
      hideError();
      if (geocoderName) data.name = geocoderName;
      this.displayWeather(data);
    })
    .catch(err => { hideLoading(); showError("Error: " + err.message); clearInterval(intervalId); });
  },

  displayWeather: function (data) {
    const { country, sunrise, sunset } = data.sys;
    const { name, timezone }           = data;
    const { icon, description }        = data.weather[0];
    const { humidity, pressure }       = data.main;
    const { lat, lon }                 = data.coord;
    const { main: condition }          = data.weather[0];
    const { deg: windDeg }             = data.wind;
    const visKm = data.visibility != null ? (data.visibility / 1000).toFixed(1) : null;

    lastData        = data;
    currentLocation = { name, country, lat, lon };

    document.querySelector(".city").innerText        = "Weather in " + name;
    document.querySelector(".country").innerText     = country;
    document.querySelector(".description").innerText = description;
    document.querySelector(".humidity").innerText    = "Humidity: " + humidity + "%";
    document.querySelector(".pressure").innerText    = "Pressure: " + pressure + " mb";
    document.querySelector(".visibility").innerText  = visKm !== null ? "Visibility: " + visKm + " km" : "Visibility: N/A";
    document.querySelector(".location").innerText    = `Latitude: ${lat}°N, Longitude: ${lon}°E`;

    updateCompass(windDeg || 0);
    setWeatherIcon(icon, condition);
    setParticleEffect(condition);
    animateCardsIn();

    document.getElementById("sunrise-val").textContent = fmtUnixTime(sunrise, timezone);
    document.getElementById("sunset-val").textContent  = fmtUnixTime(sunset,  timezone);

    renderTemps();
    applyTimeTheme(timezone);

    saveToHistory({ name, lat, lon });
    generateAlerts(data);
    generateAISummary(data);
    updateSimilarCities();
    updateAriaLive(data);

    setBackground(name, country);
    fetchAQIandUV(lat, lon);
    fetchForecast(lat, lon);

    chartPanel.classList.remove("open");
    rightBox.classList.remove("panel-open");

    searchBar.value    = name;
    searchBar.readOnly = true;
    searchBar.classList.add("display-mode");
    hideSuggestions();

    displayTime(timezone);
    hideLoading();
  },

  search: function () {
    const query = searchBar.value.trim();
    if (!query) return;
    showLoading("Looking up location…");
    fetchWithRetry(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${OWM_KEY}`,
      { mode: "cors" }
    )
    .then(r => r.json())
    .then(results => {
      if (!results?.length) {
        hideLoading();
        showError(`Location not found — try e.g. "Earth, Texas, US"`);
        return;
      }
      this.fetchWeatherByCoords(results[0].lat, results[0].lon, results[0].name);
    })
    .catch(err => { hideLoading(); showError("Error: Could not resolve location."); });
  },
};

// ═══════════════════════════════════════════════════════════════════
// GEOLOCATION BUTTON
// ═══════════════════════════════════════════════════════════════════
document.getElementById("geolocation-button").addEventListener("click", function () {
  if (!navigator.geolocation) { showError("Geolocation not supported by your browser."); return; }
  showLoading("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    pos => weather.fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    err => {
      hideLoading();
      if      (err.code === 1) showError("Location permission denied.");
      else if (err.code === 2) showError("Location unavailable. Try searching manually.");
      else                     showError("Location timed out. Try searching manually.");
    },
    { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
  );
});

// ═══════════════════════════════════════════════════════════════════
// SEARCH BUTTON
// ═══════════════════════════════════════════════════════════════════
document.querySelector(".search button").addEventListener("click", () => weather.search());

// ═══════════════════════════════════════════════════════════════════
// SEARCH BAR FOCUS — exits display mode, shows history if empty
// ═══════════════════════════════════════════════════════════════════
searchBar.addEventListener("focus", function () {
  if (this.classList.contains("display-mode")) {
    this.readOnly = false;
    this.classList.remove("display-mode");
    this.select();
  }
  if (!this.value.trim()) showHistory();
});

// ═══════════════════════════════════════════════════════════════════
// AUTOCOMPLETE + KEYBOARD NAVIGATION (accessibility)
// ═══════════════════════════════════════════════════════════════════
let debounceTimer;
let suggestionIndex = -1;

function getSuggestionItems() {
  return Array.from(suggestionsList.querySelectorAll("li")).filter(li => !li.classList.contains("history-header"));
}
function updateSuggestionHighlight(items) {
  items.forEach((li, i) => li.classList.toggle("suggestion-active", i === suggestionIndex));
  if (items[suggestionIndex]) items[suggestionIndex].scrollIntoView({ block: "nearest" });
}

searchBar.addEventListener("input", function () {
  clearTimeout(debounceTimer);
  suggestionIndex = -1;
  const query = this.value.trim();
  if (query.length < 2) {
    hideSuggestions();
    if (query.length === 0) showHistory();
    return;
  }
  debounceTimer = setTimeout(() => {
    fetchWithRetry(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=6&appid=${OWM_KEY}`,
      { mode: "cors" }
    )
    .then(r => r.json())
    .then(cities => {
      suggestionsList.innerHTML = "";
      if (!cities.length) { hideSuggestions(); return; }
      cities.forEach(city => {
        const li    = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = [city.name, city.state, city.country].filter(Boolean).join(", ");
        li.addEventListener("click", () => {
          searchBar.value = city.name;
          hideSuggestions();
          weather.fetchWeatherByCoords(city.lat, city.lon, city.name);
        });
        suggestionsList.appendChild(li);
      });
      suggestionsList.classList.remove("hidden");
      searchBar.setAttribute("aria-expanded", "true");
    })
    .catch(() => hideSuggestions());
  }, 300);
});

// Single keydown handler covers plain Enter (search), suggestion
// navigation (Arrow keys), suggestion selection (Enter while
// highlighted), and closing the list (Escape) — avoids double-firing
// that a separate keyup listener would cause.
searchBar.addEventListener("keydown", function (e) {
  const items = getSuggestionItems();
  const isOpen = !suggestionsList.classList.contains("hidden") && items.length > 0;

  if (isOpen && e.key === "ArrowDown") {
    e.preventDefault();
    suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1);
    updateSuggestionHighlight(items);
    return;
  }
  if (isOpen && e.key === "ArrowUp") {
    e.preventDefault();
    suggestionIndex = Math.max(suggestionIndex - 1, 0);
    updateSuggestionHighlight(items);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (isOpen && suggestionIndex >= 0) {
      items[suggestionIndex].click();
    } else {
      weather.search();
    }
    suggestionIndex = -1;
    return;
  }
  if (e.key === "Escape") {
    hideSuggestions();
    suggestionIndex = -1;
  }
});

document.addEventListener("click", e => {
  if (!searchBar.contains(e.target) && !suggestionsList.contains(e.target)) hideSuggestions();
});

function hideSuggestions() {
  suggestionsList.classList.add("hidden");
  suggestionsList.innerHTML = "";
  searchBar.setAttribute("aria-expanded", "false");
}

// ═══════════════════════════════════════════════════════════════════
// WIND COMPASS
// ═══════════════════════════════════════════════════════════════════
function updateCompass(deg) {
  const needle = document.getElementById("compass-needle");
  if (needle) needle.setAttribute("transform", `rotate(${deg},22,22)`);
}

// ═══════════════════════════════════════════════════════════════════
// SEARCH HISTORY — IndexedDB, falls back to localStorage
// ═══════════════════════════════════════════════════════════════════
let searchHistory = [];

async function loadSearchHistory() {
  try {
    searchHistory = await IDB.idbGetAll("searchHistory");
    searchHistory.sort((a, b) => (b.id || 0) - (a.id || 0));
  } catch (e) {
    searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");
  }
}
loadSearchHistory();

async function saveToHistory(loc) {
  try {
    const existing = await IDB.idbGetAll("searchHistory");
    const dup = existing.find(h => h.lat === loc.lat && h.lon === loc.lon);
    if (dup) await IDB.idbDelete("searchHistory", dup.id);
    await IDB.idbAdd("searchHistory", loc);
    let updated = await IDB.idbGetAll("searchHistory");
    updated.sort((a, b) => b.id - a.id);
    if (updated.length > 8) {
      const toRemove = updated.slice(8);
      for (const r of toRemove) await IDB.idbDelete("searchHistory", r.id);
      updated = updated.slice(0, 8);
    }
    searchHistory = updated;
  } catch (e) {
    searchHistory = searchHistory.filter(h => !(h.lat === loc.lat && h.lon === loc.lon));
    searchHistory.unshift(loc);
    if (searchHistory.length > 8) searchHistory = searchHistory.slice(0, 8);
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
  }
}

function showHistory() {
  if (!searchHistory.length) return;
  suggestionIndex = -1;
  suggestionsList.innerHTML = "";
  const header = document.createElement("li");
  header.className = "history-header";
  header.textContent = "Recent Searches";
  suggestionsList.appendChild(header);
  searchHistory.forEach(loc => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.setAttribute("role", "option");
    li.innerHTML = `<span class="history-icon">🕐</span>${loc.name}`;
    li.addEventListener("click", () => {
      searchBar.value = loc.name;
      hideSuggestions();
      weather.fetchWeatherByCoords(loc.lat, loc.lon, loc.name);
    });
    suggestionsList.appendChild(li);
  });
  suggestionsList.classList.remove("hidden");
  searchBar.setAttribute("aria-expanded", "true");
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS — "/" focuses search, Escape closes overlays
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== searchBar &&
      !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchBar.readOnly = false;
    searchBar.classList.remove("display-mode");
    searchBar.focus();
    searchBar.select();
  }
  if (e.key === "Escape") {
    closeMap();
    closeEmbed();
    closeHistory();
  }
});

// ═══════════════════════════════════════════════════════════════════
// SHARE BUTTON
// ═══════════════════════════════════════════════════════════════════
function showToast(msg, isSuccess) {
  errorMessage.innerText = msg;
  errorBox.classList.add("show");
  if (isSuccess) errorBox.classList.add("toast-success");
  else           errorBox.classList.remove("toast-success");
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorBox.classList.remove("show");
    errorBox.classList.remove("toast-success");
  }, 3000);
}

document.getElementById("share-btn").addEventListener("click", () => {
  if (!currentLocation || !lastData) { showError("Search a city first!"); return; }
  const temp = isCelsius
    ? lastData.main.temp.toFixed(1) + "°C"
    : toF(lastData.main.temp) + "°F";
  const text = `${currentLocation.name}, ${currentLocation.country}: ${temp}, ${lastData.weather[0].description} | ${window.location.href}`;
  if (navigator.share) {
    navigator.share({ title: "Weather Forecast", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text)
      .then(() => showToast("✓ Copied to clipboard!", true))
      .catch(() => showError("Could not copy — please copy manually"));
  }
});

// ═══════════════════════════════════════════════════════════════════
// OFFLINE DETECTION
// ═══════════════════════════════════════════════════════════════════
function updateOnlineStatus() {
  const banner = document.getElementById("offline-banner");
  navigator.onLine ? banner.classList.add("hidden") : banner.classList.remove("hidden");
}
window.addEventListener("online",  updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ═══════════════════════════════════════════════════════════════════
// WEATHER ALERTS — rule-based from existing data
// ═══════════════════════════════════════════════════════════════════
let activeAlerts = [];

function generateAlerts(data) {
  activeAlerts = [];
  const temp    = data.main.temp;
  const windKmh = data.wind.speed * 3.6;
  const vis     = data.visibility != null ? data.visibility : 10000;

  if (temp >= 42)    activeAlerts.push({ icon:"🔥", text:`Extreme heat — ${temp.toFixed(1)}°C` });
  if (temp <= -15)   activeAlerts.push({ icon:"🥶", text:`Extreme cold — ${temp.toFixed(1)}°C` });
  if (windKmh >= 50) activeAlerts.push({ icon:"💨", text:`High winds — ${windKmh.toFixed(0)} km/h` });
  if (vis < 500)     activeAlerts.push({ icon:"🌫", text:`Very low visibility — ${(vis/1000).toFixed(2)} km` });
  renderAlerts();
}

function addAQIAlert(aqi) {
  if (aqi >= 4) {
    activeAlerts.push({ icon:"😷", text:`Air quality ${aqi === 4 ? "Poor" : "Very Poor"} — limit outdoor exposure` });
    renderAlerts();
  }
}

function addUVAlert(uv) {
  if (uv >= 8) {
    activeAlerts.push({ icon:"☀️", text:`${uv >= 11 ? "Extreme" : "Very High"} UV (${uv}) — sun protection essential` });
    renderAlerts();
  }
}

function renderAlerts() {
  const banner = document.getElementById("alert-banner");
  const items  = document.getElementById("alert-items");
  if (!activeAlerts.length) { banner.classList.add("hidden"); return; }
  items.innerHTML = activeAlerts.map(a =>
    `<span class="alert-item">${a.icon} ${a.text}</span>`
  ).join("");
  banner.classList.remove("hidden");
}

document.getElementById("alert-close").addEventListener("click", () => {
  document.getElementById("alert-banner").classList.add("hidden");
});

// ═══════════════════════════════════════════════════════════════════
// WEATHER MAP — Leaflet + OWM tile layers
// ═══════════════════════════════════════════════════════════════════
let leafletMap       = null;
let weatherTileLayer = null;
let mapMarker        = null;

function openMap() {
  if (!currentLocation) { showError("Search a city first to open the map."); return; }
  const overlay = document.getElementById("map-overlay");
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });
  trapFocus(overlay);
  document.getElementById("map-city-name").textContent = currentLocation.name;
  document.getElementById("map-layer-select").value = "temp_new";

  if (!leafletMap) {
    leafletMap = L.map("map-container", { zoomControl: true })
      .setView([currentLocation.lat, currentLocation.lon], 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(leafletMap);

    weatherTileLayer = L.tileLayer(
      `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
      { opacity: 0.65, attribution: "© OpenWeatherMap" }
    ).addTo(leafletMap);
  } else {
    leafletMap.setView([currentLocation.lat, currentLocation.lon], 9);
    if (mapMarker) leafletMap.removeLayer(mapMarker);
  }

  mapMarker = L.marker([currentLocation.lat, currentLocation.lon])
    .addTo(leafletMap)
    .bindPopup(
      `<b>${currentLocation.name}</b><br>` +
      (lastData ? `${lastData.main.temp.toFixed(1)}°C — ${lastData.weather[0].description}` : "")
    ).openPopup();

  setTimeout(() => leafletMap.invalidateSize(), 120);
}

function closeMap() {
  const overlay = document.getElementById("map-overlay");
  if (!overlay.classList.contains("visible")) return;
  overlay.classList.remove("visible");
  releaseFocus(overlay);
  setTimeout(() => overlay.classList.add("hidden"), 360);
}

function switchMapLayer(layer) {
  if (!leafletMap || !weatherTileLayer) return;
  leafletMap.removeLayer(weatherTileLayer);
  weatherTileLayer = L.tileLayer(
    `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
    { opacity: 0.65, attribution: "© OpenWeatherMap" }
  ).addTo(leafletMap);
}

document.getElementById("fab-map").addEventListener("click", openMap);
document.getElementById("map-close-btn").addEventListener("click", closeMap);
document.getElementById("map-layer-select").addEventListener("change", e => switchMapLayer(e.target.value));

// ═══════════════════════════════════════════════════════════════════
// EMBED CODE GENERATOR
// ═══════════════════════════════════════════════════════════════════
function openEmbed() {
  if (!currentLocation) { showError("Search a city first!"); return; }
  document.getElementById("embed-city-name").textContent = currentLocation.name;
  const overlay = document.getElementById("embed-overlay");
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });
  trapFocus(overlay);
  const base = window.location.href.split("?")[0];
  const src  = `${base}?city=${encodeURIComponent(currentLocation.name)}&lat=${currentLocation.lat}&lon=${currentLocation.lon}`;
  document.getElementById("embed-code").value =
    `<iframe\n  src="${src}"\n  width="980"\n  height="600"\n  frameborder="0"\n  style="border-radius:20px;border:none;overflow:hidden;"\n  title="${currentLocation.name} Weather"\n></iframe>`;
}

function closeEmbed() {
  const overlay = document.getElementById("embed-overlay");
  if (!overlay.classList.contains("visible")) return;
  overlay.classList.remove("visible");
  releaseFocus(overlay);
  setTimeout(() => overlay.classList.add("hidden"), 360);
}

document.getElementById("fab-embed").addEventListener("click", openEmbed);
document.getElementById("embed-close-btn").addEventListener("click", closeEmbed);
document.getElementById("embed-copy-btn").addEventListener("click", () => {
  const code    = document.getElementById("embed-code").value;
  const confirm = document.getElementById("embed-copy-confirm");
  navigator.clipboard.writeText(code).then(() => {
    confirm.classList.remove("hidden");
    setTimeout(() => confirm.classList.add("hidden"), 2500);
  }).catch(() => showError("Could not copy — please select and copy manually"));
});

// ═══════════════════════════════════════════════════════════════════
// URL PARAMETER AUTO-SEARCH (for embed usage)
// ═══════════════════════════════════════════════════════════════════
(function checkUrlParams() {
  const p    = new URLSearchParams(window.location.search);
  const city = p.get("city");
  const lat  = parseFloat(p.get("lat"));
  const lon  = parseFloat(p.get("lon"));
  if (city && !isNaN(lat) && !isNaN(lon)) {
    weather.fetchWeatherByCoords(lat, lon, city);
  }
})();

// ═══════════════════════════════════════════════════════════════════
// PWA — SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════════════════════════════
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => console.log("SW registered:", reg.scope))
      .catch(err => console.warn("SW not registered:", err));
  });
}

// ═══════════════════════════════════════════════════════════════════
// RULE-BASED "AI" NATURAL LANGUAGE SUMMARY
// ═══════════════════════════════════════════════════════════════════
function generateAISummary(data) {
  const el = document.getElementById("ai-summary");
  if (!el) return;

  const temp     = data.main.temp;
  const feels    = data.main.feels_like;
  const humidity = data.main.humidity;
  const windKmh  = data.wind.speed * 3.6;
  const condMain = data.weather[0].main;
  const hour     = new Date((data.dt + data.timezone) * 1000).getUTCHours();
  const partOfDay = hour < 6 ? "early morning" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 20 ? "evening" : "night";

  let tempWord;
  if      (feels >= 38) tempWord = "scorching";
  else if (feels >= 32) tempWord = "hot";
  else if (feels >= 25) tempWord = "warm";
  else if (feels >= 18) tempWord = "mild";
  else if (feels >= 10) tempWord = "cool";
  else if (feels >= 0)  tempWord = "cold";
  else                  tempWord = "freezing";

  const condPhrases = {
    Clear: "clear skies", Clouds: "cloudy skies", Rain: "rain",
    Drizzle: "light drizzle", Thunderstorm: "thunderstorms", Snow: "snowfall",
    Mist: "misty conditions", Fog: "foggy conditions", Haze: "hazy skies",
    Smoke: "smoky air", Dust: "dusty conditions", Sand: "sandy winds",
    Ash: "ashy skies", Squall: "strong squalls", Tornado: "a tornado warning",
  };
  const condPhrase = condPhrases[condMain] || "changing conditions";

  let humidityClause = "";
  if (humidity >= 75)      humidityClause = ", feeling quite humid";
  else if (humidity <= 25) humidityClause = ", with dry air";

  let windClause = "";
  if      (windKmh >= 40) windClause = " and gusty winds";
  else if (windKmh >= 20) windClause = " with a noticeable breeze";

  let sentence = `Expect a ${tempWord} ${partOfDay} with ${condPhrase}${humidityClause}${windClause}.`;

  let tip = "";
  if      (condMain === "Rain" || condMain === "Drizzle" || condMain === "Thunderstorm")
    tip = " Keep an umbrella handy.";
  else if (feels >= 35)
    tip = " Stay hydrated and avoid prolonged sun exposure.";
  else if (feels <= 5)
    tip = " Bundle up before heading out.";
  else if (condMain === "Snow")
    tip = " Roads may be slippery.";
  else if (windKmh >= 40)
    tip = " Secure loose outdoor items.";

  el.textContent = sentence + tip;
}

// ═══════════════════════════════════════════════════════════════════
// VOICE SEARCH — Web Speech API
// ═══════════════════════════════════════════════════════════════════
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", e => {
    const spoken = e.results[0][0].transcript.trim();
    searchBar.readOnly = false;
    searchBar.classList.remove("display-mode");
    searchBar.value = spoken;
    hideSuggestions();
    weather.search();
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    document.getElementById("voice-btn").classList.remove("listening");
  });

  recognition.addEventListener("error", e => {
    isListening = false;
    document.getElementById("voice-btn").classList.remove("listening");
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showError("Microphone access denied.");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      showError("Voice search failed — try again.");
    }
  });
} else {
  const vb = document.getElementById("voice-btn");
  if (vb) vb.style.display = "none";
}

document.getElementById("voice-btn").addEventListener("click", () => {
  if (!recognition) { showError("Voice search isn't supported in this browser."); return; }
  if (isListening) { recognition.stop(); return; }
  isListening = true;
  document.getElementById("voice-btn").classList.add("listening");
  try { recognition.start(); } catch (e) { /* already running */ }
});

// ═══════════════════════════════════════════════════════════════════
// HISTORICAL PATTERN INSIGHT — Open-Meteo free archive API
// Compares today's temp to the same calendar date's average over
// the past 10 years, flags anomalies (ML #3), and trains a small
// neural net client-side (TensorFlow.js) to predict next year's
// value from the 10-year trend.
// ═══════════════════════════════════════════════════════════════════
let historyChartInstance = null;
let lastHistoryYearData  = null; // cached so theme toggle can re-render without refetching
let lastHistoryTodayTemp = null;

function openHistory() {
  if (!currentLocation || !lastData) { showError("Search a city first!"); return; }

  const overlay = document.getElementById("history-overlay");
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });
  trapFocus(overlay);

  document.getElementById("history-city-name").textContent = currentLocation.name;
  document.getElementById("history-loading").classList.remove("hidden");
  document.getElementById("history-content").classList.add("hidden");
  document.getElementById("history-nn-prediction").classList.add("hidden");

  fetchHistoricalData(currentLocation.lat, currentLocation.lon);
}

function closeHistory() {
  const overlay = document.getElementById("history-overlay");
  if (!overlay.classList.contains("visible")) return;
  overlay.classList.remove("visible");
  releaseFocus(overlay);
  setTimeout(() => overlay.classList.add("hidden"), 360);
}

function fetchHistoricalData(lat, lon) {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day   = String(today.getDate()).padStart(2, "0");
  const thisYear = today.getFullYear();
  const startYear = thisYear - 10;

  const requests = [];
  for (let y = startYear; y < thisYear; y++) {
    const dateStr = `${y}-${month}-${day}`;
    requests.push(
      fetchWithRetry(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean&timezone=auto`)
        .then(r => r.json())
        .then(d => ({ year: y, temp: d.daily?.temperature_2m_mean?.[0] ?? null }))
        .catch(() => ({ year: y, temp: null }))
    );
  }

  Promise.all(requests).then(results => {
    const valid = results.filter(r => r.temp !== null);
    if (!valid.length) {
      document.getElementById("history-loading").innerHTML = "Historical data unavailable for this location.";
      return;
    }

    const todayTemp = lastData.main.temp;

    // ML #3: Z-score anomaly detection (ml-utils.js, unit-tested)
    const stats   = zScoreAnomaly(todayTemp, valid.map(r => r.temp));
    const avgTemp = stats.mean;
    const zScore  = stats.zScore;

    const todayDisplay = isCelsius ? todayTemp.toFixed(1) + "°C" : toF(todayTemp) + "°F";
    const avgDisplay   = isCelsius ? avgTemp.toFixed(1)   + "°C" : toF(avgTemp)   + "°F";

    document.getElementById("history-today-temp").textContent = todayDisplay;
    document.getElementById("history-avg-temp").textContent   = avgDisplay;

    const diff = todayTemp - avgTemp;
    const verdictEl = document.getElementById("history-verdict");
    if (Math.abs(diff) < 1) {
      verdictEl.textContent = `Right around the 10-year average for this date.`;
      verdictEl.className = "history-verdict normal";
    } else if (diff > 0) {
      verdictEl.textContent = `${Math.abs(diff).toFixed(1)}° warmer than the 10-year average for this date.`;
      verdictEl.className = "history-verdict warmer";
    } else {
      verdictEl.textContent = `${Math.abs(diff).toFixed(1)}° cooler than the 10-year average for this date.`;
      verdictEl.className = "history-verdict cooler";
    }

    const anomalyEl = document.getElementById("history-anomaly");
    if (Math.abs(zScore) >= 2) {
      anomalyEl.textContent = `⚠️ Statistically unusual for this date (z = ${zScore.toFixed(1)})`;
      anomalyEl.classList.remove("hidden");
    } else {
      anomalyEl.classList.add("hidden");
    }

    // Deep Learning: small neural net trained client-side (TensorFlow.js)
    trainAndPredictNN(valid).then(nnPred => {
      const nnEl = document.getElementById("history-nn-prediction");
      if (!nnEl) return;
      if (nnPred === null || isNaN(nnPred)) { nnEl.classList.add("hidden"); return; }
      const displayVal = isCelsius ? nnPred.toFixed(1) + "°C" : toF(nnPred) + "°F";
      nnEl.textContent = `🧠 Neural Net Prediction (next year): ${displayVal}`;
      nnEl.classList.remove("hidden");
    }).catch(err => {
      console.warn("Neural net prediction failed:", err);
      const nnEl = document.getElementById("history-nn-prediction");
      if (nnEl) nnEl.classList.add("hidden");
    });

    lastHistoryYearData  = valid;
    lastHistoryTodayTemp = todayTemp;
    renderHistoryChart(valid, todayTemp);

    document.getElementById("history-loading").classList.add("hidden");
    document.getElementById("history-content").classList.remove("hidden");
  });
}

// ─────────────────────────────────────────────────────────────────────
// DEEP LEARNING — small neural network trained client-side with
// TensorFlow.js on this location's 10-year same-date history.
// Architecture: 1 input (normalized year) → 8 ReLU hidden units →
// 1 linear output (predicted temperature). Trained with Adam for
// 200 epochs on ~10 data points — intentionally tiny, since the goal
// is demonstrating an in-browser training loop, not production-grade
// forecasting accuracy.
// ─────────────────────────────────────────────────────────────────────
async function trainAndPredictNN(yearData) {
  if (typeof tf === "undefined" || yearData.length < 3) return null;

  const years = yearData.map(r => r.year);
  const temps = yearData.map(r => r.temp);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const range = (maxYear - minYear) || 1;

  const xs = tf.tensor2d(years.map(y => [(y - minYear) / range]));
  const ys = tf.tensor2d(temps.map(t => [t]));

  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 8, activation: "relu", inputShape: [1] }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: tf.train.adam(0.05), loss: "meanSquaredError" });

  await model.fit(xs, ys, { epochs: 200, verbose: 0 });

  const nextNorm   = (maxYear + 1 - minYear) / range;
  const predTensor = model.predict(tf.tensor2d([[nextNorm]]));
  const predArray  = await predTensor.data();
  const value      = predArray[0];

  xs.dispose();
  ys.dispose();
  predTensor.dispose();
  model.dispose();

  return value;
}

function renderHistoryChart(yearData, todayTemp) {
  const canvas = document.getElementById("history-chart");
  if (!canvas) return;
  if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null; }

  const labels = yearData.map(r => String(r.year));
  const temps  = yearData.map(r => isCelsius ? r.temp : toF(r.temp));
  labels.push("This Year");
  temps.push(isCelsius ? todayTemp : toF(todayTemp));

  const avgTemp = temps.slice(0, -1).reduce((s, t) => s + t, 0) / (temps.length - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const lineColor      = isLight ? "rgba(21,101,192,0.85)"  : "rgba(100,180,255,0.85)";
  const fillColor      = isLight ? "rgba(21,101,192,0.08)"  : "rgba(100,180,255,0.08)";
  const pointColor     = isLight ? "rgba(21,101,192,1)"     : "rgba(100,180,255,1)";
  const highlightColor = isLight ? "rgba(196,130,0,1)"      : "rgba(255,180,80,1)";
  const avgLineColor   = isLight ? "rgba(20,30,60,0.35)"    : "rgba(255,255,255,0.35)";
  const tickColor      = isLight ? "rgba(20,30,60,0.65)"    : "rgba(255,255,255,0.6)";
  const gridColor      = isLight ? "rgba(20,30,60,0.08)"    : "rgba(255,255,255,0.06)";
  const tooltipBg      = isLight ? "rgba(255,255,255,0.97)" : "rgba(20,22,35,0.92)";
  const tooltipTitle   = isLight ? "rgba(20,30,60,0.9)"     : "rgba(255,255,255,0.85)";
  const tooltipBody    = isLight ? "rgba(20,30,60,0.8)"     : "rgba(255,255,255,0.75)";
  const tooltipBorder  = isLight ? "rgba(20,30,60,0.15)"    : "rgba(255,255,255,0.12)";

  // Highlight the last point ("This Year") — bigger radius, distinct color —
  // instead of a solid bar block, so it reads as "the point that matters"
  // without needing a separate legend swatch.
  const lastIdx = temps.length - 1;
  const pointColors  = temps.map((_, i) => i === lastIdx ? highlightColor : pointColor);
  const pointRadii   = temps.map((_, i) => i === lastIdx ? 7 : 4.5);
  const pointHovers  = temps.map((_, i) => i === lastIdx ? 10 : 7);

  historyChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Yearly Temp",
          data: temps,
          borderColor: lineColor,
          backgroundColor: fillColor,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: pointHovers,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
        {
          label: "10-Year Avg",
          data: new Array(temps.length).fill(avgTemp),
          borderColor: avgLineColor,
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 6, right: 6, top: 16, bottom: 6 } },
      interaction: { mode: "nearest", intersect: false, axis: "x" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: tickColor,
            font: { size: 11 },
            boxWidth: 18,
            boxHeight: 2,
            padding: 14,
            // Hide the average reference line from the legend — it's a
            // subtle visual aid, not a second data series worth a swatch.
            filter: item => item.text !== "10-Year Avg",
          },
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 12,
          bodyFont: { size: 13 },
          titleFont: { size: 13, weight: "bold" },
          displayColors: false,
          callbacks: {
            title: items => items[0].label,
            label: ctx => ctx.dataset.label === "10-Year Avg"
              ? null
              : (ctx.dataIndex === lastIdx ? "This year: " : "") + ctx.parsed.y.toFixed(1) + (isCelsius ? "°C" : "°F"),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: tickColor, font: { size: 11 }, callback: v => v + "°" },
          grid: { color: gridColor },
        },
      },
    },
  });
}

document.getElementById("fab-history").addEventListener("click", openHistory);
document.getElementById("history-close-btn").addEventListener("click", closeHistory);
