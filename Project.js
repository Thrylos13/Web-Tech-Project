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
  // UTC hours/minutes from the adjusted time
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
  fetch(url, { headers: { "Authorization": "Client-ID " + UNSPLASH_KEY, "Accept-Version": "v1" } })
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
  Clear:        "icon-spin",       // sun spinning slowly
  Clouds:       "icon-drift",      // gentle horizontal drift
  Rain:         "icon-bounce",     // rhythmic drop bounce
  Drizzle:      "icon-bounce",
  Thunderstorm: "icon-flash",      // lightning flash/pulse
  Snow:         "icon-sway",       // gentle sway
  Mist:         "icon-drift",
  Fog:          "icon-drift",
  Haze:         "icon-pulse",      // slow in-out glow
  Smoke:        "icon-drift",
  Dust:         "icon-sway",
  Sand:         "icon-sway",
  Ash:          "icon-drift",
  Squall:       "icon-shake",      // rapid shake (wind)
  Tornado:      "icon-spin-fast",  // fast spin
};

function setWeatherIcon(iconCode, condition) {
  const img = document.getElementById("weather-icon");
  img.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  // Remove all previous animation classes
  img.className = "icon";
  const animClass = conditionAnimMap[condition] || "icon-pulse";
  // Small delay so the class is applied after the src swap
  setTimeout(() => img.classList.add(animClass), 50);
}

// ═══════════════════════════════════════════════════════════════════
// TEMPERATURE COUNT-UP ANIMATION
// ═══════════════════════════════════════════════════════════════════
function countUp(element, targetText, duration = 800) {
  // Extract numeric part and suffix separately
  const match  = targetText.match(/^(-?\d+\.?\d*)(.*)/);
  if (!match) { element.innerText = targetText; return; }
  const target = parseFloat(match[1]);
  const suffix = match[2];
  const start  = 0;
  const startTime = performance.now();

  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
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
// Rain, snow, or drifting cloud particles based on condition
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
    // Heavy rain with occasional bright flash timing stored on particle
    return { x: Math.random() * w, y: Math.random() * -h,
      len: 22 + Math.random() * 28, speed: 22 + Math.random() * 16,
      opacity: 0.4 + Math.random() * 0.5, flash: Math.random() < 0.003 };
  }
  if (particleType === "tornado") {
    // Spiral debris particles from a center vortex
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
    // Heat shimmer — tiny golden sparks rising
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

  // Thunderstorm: random full-screen lightning flash
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
    fetch(aqiUrl, { mode:"cors" }).then(r => r.json()),
    fetch(uvUrl,  { mode:"cors" }).then(r => r.json()),
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
// Both from OWM /forecast (free, same key, 40 entries × 3h)
// ═══════════════════════════════════════════════════════════════════
let lastForecast = null; // raw forecast list

function fetchForecast(lat, lon) {
  fetch(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`,
    { mode: "cors" }
  )
  .then(r => r.json())
  .then(data => {
    lastForecast = data.list;
    renderForecastStrip();
    renderHourly(); // pre-build chart so it's ready the instant panel opens
  })
  .catch(err => console.warn("Forecast fetch failed:", err));
}

// ── 5-day strip: aggregate ALL entries per day for true H/L ───────
function renderForecastStrip() {
  if (!lastForecast) return;
  const strip = document.getElementById("forecast-strip");
  strip.innerHTML = "";

  // Group all entries by local date string (YYYY-MM-DD)
  const byDay = {};
  lastForecast.forEach(entry => {
    const date = entry.dt_txt.slice(0, 10);
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(entry);
  });

  const dates = Object.keys(byDay);

  // ── Fix bug 2: today's true H/L from all of today's forecast entries
  const todayEntries = byDay[dates[0]];
  if (todayEntries) {
    const todayHi = Math.max(...todayEntries.map(e => e.main.temp_max));
    const todayLo = Math.min(...todayEntries.map(e => e.main.temp_min));
    // Store on lastData so renderTemps() can access them
    if (lastData) {
      lastData.main.temp_max = todayHi;
      lastData.main.temp_min = todayLo;
      renderTemps(); // re-render now that we have real H/L
    }
  }

  // ── 5-day strip: skip today, show next 5 days
  const futureDates = dates.slice(1, 6);
  futureDates.forEach(date => {
    const entries = byDay[date];

    // True H/L: max of temp_max and min of temp_min across ALL entries that day
    const hi = Math.max(...entries.map(e => e.main.temp_max));
    const lo = Math.min(...entries.map(e => e.main.temp_min));

    // Icon + day name: use the noon-closest entry for representative conditions
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
}

// Re-render just the temperature text when unit is toggled
function renderForecastTemps() {
  document.querySelectorAll(".forecast-card").forEach(card => {
    card.querySelector(".fc-hi").textContent = fmtTemp(parseFloat(card.dataset.hi));
    card.querySelector(".fc-lo").textContent = fmtTemp(parseFloat(card.dataset.lo));
  });
  // Only rebuild chart if panel is currently visible
  if (chartPanel.classList.contains("open")) renderHourly();
}

// ── Hourly chart: Chart.js combo — temp line + precip bars ────────
let hourlyChart = null;

function renderHourly() {
  if (!lastForecast) return;

  const entries = lastForecast.slice(0, 8); // next 24h in 3h steps

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

  // Destroy existing instance before rebuilding
  if (hourlyChart) { hourlyChart.destroy(); hourlyChart = null; }

  hourlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temp",
          data: temps,
          borderColor: "rgba(255,220,100,0.9)",
          backgroundColor: "rgba(255,220,100,0.08)",
          pointBackgroundColor: "rgba(255,220,100,1)",
          pointBorderColor: "rgba(255,220,100,1)",
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: "rgba(255,220,100,1)",
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          yAxisID: "yTemp",
        },
        {
          label: "Rain %",
          data: precip,
          borderColor: "rgba(100,180,255,0.85)",
          backgroundColor: "rgba(100,180,255,0.06)",
          pointBackgroundColor: "rgba(100,180,255,1)",
          pointBorderColor: "rgba(100,180,255,1)",
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: "rgba(100,180,255,1)",
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
      layout: { padding: { left: 8, right: 8, top: 16, bottom: 8 } },
      interaction: { mode: "nearest", intersect: false, axis: "x" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: "rgba(255,255,255,0.65)",
            font: { size: 12 },
            boxWidth: 20,
            boxHeight: 2,
            padding: 20,
          },
        },
        tooltip: {
          position: "nearest",
          backgroundColor: "rgba(20,22,35,0.92)",
          titleColor: "rgba(255,255,255,0.85)",
          bodyColor: "rgba(255,255,255,0.75)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
          padding: 12,
          bodySpacing: 8,
          bodyFont: { size: 13 },
          titleFont: { size: 13, weight: "bold" },
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
            color: "rgba(255,255,255,0.7)",
            font: { size: 12 },
            maxRotation: 0,
            padding: 8,
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          border: { color: "rgba(255,255,255,0.1)" },
        },
        yTemp: {
          position: "left",
          ticks: {
            color: "rgba(255,220,100,0.85)",
            font: { size: 12 },
            padding: 10,
            callback: v => v + (isCelsius ? "°" : "°F"),
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          border: { color: "rgba(255,255,255,0.1)", dash: [3, 3] },
        },
        yPrecip: {
          position: "right",
          min: 0, max: 100,
          ticks: {
            color: "rgba(100,180,255,0.85)",
            font: { size: 12 },
            padding: 10,
            stepSize: 25,
            callback: v => v + "%",
          },
          grid: { drawOnChartArea: false },
          border: { color: "rgba(255,255,255,0.1)" },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// SAVED LOCATIONS — persisted in localStorage
// ═══════════════════════════════════════════════════════════════════
let savedLocations = JSON.parse(localStorage.getItem("savedLocations") || "[]");
let currentLocation = null; // { name, country, lat, lon }

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
    chip.innerHTML = `<span>${loc.name}</span><button class="chip-remove" data-i="${i}" title="Remove">×</button>`;
    chip.querySelector("span").addEventListener("click", () => {
      weather.fetchWeatherByCoords(loc.lat, loc.lon);
    });
    chip.querySelector(".chip-remove").addEventListener("click", e => {
      e.stopPropagation();
      savedLocations.splice(i, 1);
      localStorage.setItem("savedLocations", JSON.stringify(savedLocations));
      renderSavedChips();
    });
    savedChips.appendChild(chip);
  });
}

pinButton.addEventListener("click", function () {
  if (!currentLocation) return;
  const already = savedLocations.find(l => l.lat === currentLocation.lat && l.lon === currentLocation.lon);
  if (already) { showError("Already pinned!"); return; }
  if (savedLocations.length >= 6) { showError("Max 6 pinned locations."); return; }
  savedLocations.push(currentLocation);
  localStorage.setItem("savedLocations", JSON.stringify(savedLocations));
  renderSavedChips();
});

renderSavedChips(); // render on page load from localStorage

// ═══════════════════════════════════════════════════════════════════
// WEATHER OBJECT
// ═══════════════════════════════════════════════════════════════════
let weather = {

  // geocoderName: the clean city name from the geocoder (e.g. "Mumbai").
  // OWM's reverse lookup often returns admin region names ("Konkan Division")
  // instead of the city name — so we always prefer the geocoder's version.
  fetchWeatherByCoords: function (lat, lon, geocoderName) {
    showLoading("Fetching weather…");
    fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`,
      { mode: "cors" }
    )
    .then(r => { if (!r.ok) throw new Error("Location not found"); return r.json(); })
    .then(data => {
      hideError();
      // Override OWM's often-wrong region name with the geocoder's city name
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

    // Wind compass
    updateCompass(windDeg || 0);

    // Animated weather icon (CSS keyframes on OWM PNG)
    setWeatherIcon(icon, condition);

    // Particle effect based on condition
    setParticleEffect(condition);

    // Card entrance animation
    animateCardsIn();

    // Sunrise / Sunset
    document.getElementById("sunrise-val").textContent = fmtUnixTime(sunrise, timezone);
    document.getElementById("sunset-val").textContent  = fmtUnixTime(sunset,  timezone);

    // Temps (respects current unit)
    renderTemps();

    // Dynamic card theme
    applyTimeTheme(timezone);

    // Save to history
    saveToHistory({ name, lat, lon });

    // Condition-based alerts
    generateAlerts(data);

    // Background, AQI+UV, Forecast
    setBackground(name, country);
    fetchAQIandUV(lat, lon);
    fetchForecast(lat, lon);

    // Close chart panel so it rebuilds fresh for the new city
    chartPanel.classList.remove("open");
    rightBox.classList.remove("panel-open");

    // Search bar display mode
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
    fetch(
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
      // Pass the geocoder's city name so OWM's region name is never displayed
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
// SEARCH BUTTON + ENTER KEY
// ═══════════════════════════════════════════════════════════════════
document.querySelector(".search button").addEventListener("click", () => weather.search());
searchBar.addEventListener("keyup", e => { if (e.key === "Enter") weather.search(); });

// ═══════════════════════════════════════════════════════════════════
// SEARCH BAR FOCUS — exits display mode
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
// AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════════
let debounceTimer;
searchBar.addEventListener("input", function () {
  clearTimeout(debounceTimer);
  const query = this.value.trim();
  if (query.length < 2) {
    hideSuggestions();
    if (query.length === 0) showHistory();
    return;
  }
  debounceTimer = setTimeout(() => {
    fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=6&appid=${OWM_KEY}`,
      { mode: "cors" }
    )
    .then(r => r.json())
    .then(cities => {
      suggestionsList.innerHTML = "";
      if (!cities.length) { hideSuggestions(); return; }
      cities.forEach(city => {
        const li    = document.createElement("li");
        li.textContent = [city.name, city.state, city.country].filter(Boolean).join(", ");
        li.addEventListener("click", () => {
          searchBar.value = city.name;
          hideSuggestions();
          weather.fetchWeatherByCoords(city.lat, city.lon, city.name);
        });
        suggestionsList.appendChild(li);
      });
      suggestionsList.classList.remove("hidden");
    })
    .catch(() => hideSuggestions());
  }, 300);
});

document.addEventListener("click", e => {
  if (!searchBar.contains(e.target) && !suggestionsList.contains(e.target)) hideSuggestions();
});

function hideSuggestions() {
  suggestionsList.classList.add("hidden");
  suggestionsList.innerHTML = "";
}

// ═══════════════════════════════════════════════════════════════════
// WIND COMPASS
// ═══════════════════════════════════════════════════════════════════
function updateCompass(deg) {
  const needle = document.getElementById("compass-needle");
  if (needle) needle.setAttribute("transform", `rotate(${deg},22,22)`);
}

// ═══════════════════════════════════════════════════════════════════
// SEARCH HISTORY
// ═══════════════════════════════════════════════════════════════════
let searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");

function saveToHistory(loc) {
  searchHistory = searchHistory.filter(h => !(h.lat === loc.lat && h.lon === loc.lon));
  searchHistory.unshift(loc);
  if (searchHistory.length > 8) searchHistory = searchHistory.slice(0, 8);
  localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
}

function showHistory() {
  if (!searchHistory.length) return;
  suggestionsList.innerHTML = "";
  const header = document.createElement("li");
  header.className = "history-header";
  header.textContent = "Recent Searches";
  suggestionsList.appendChild(header);
  searchHistory.forEach(loc => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `<span class="history-icon">🕐</span>${loc.name}`;
    li.addEventListener("click", () => {
      searchBar.value = loc.name;
      hideSuggestions();
      weather.fetchWeatherByCoords(loc.lat, loc.lon, loc.name);
    });
    suggestionsList.appendChild(li);
  });
  suggestionsList.classList.remove("hidden");
}

// ═══════════════════════════════════════════════════════════════════
// / KEYBOARD SHORTCUT — focus search bar
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
  overlay.classList.remove("visible");
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
  const base = window.location.href.split("?")[0];
  const src  = `${base}?city=${encodeURIComponent(currentLocation.name)}&lat=${currentLocation.lat}&lon=${currentLocation.lon}`;
  document.getElementById("embed-code").value =
    `<iframe\n  src="${src}"\n  width="980"\n  height="600"\n  frameborder="0"\n  style="border-radius:20px;border:none;overflow:hidden;"\n  title="${currentLocation.name} Weather"\n></iframe>`;
}

function closeEmbed() {
  const overlay = document.getElementById("embed-overlay");
  overlay.classList.remove("visible");
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