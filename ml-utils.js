// ═══════════════════════════════════════════════════════════════════
// ML-UTILS.JS — pure, dependency-free ML/stat functions
// Works three ways with zero changes:
//   1. Classic <script> in the browser main thread  → attaches to window
//   2. importScripts() inside a Web Worker           → attaches to self
//   3. require() from Node.js (Vitest test suite)    → module.exports
// Being pure functions (no DOM, no fetch, no global state) is what
// makes them independently unit-testable.
// ═══════════════════════════════════════════════════════════════════
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof self !== "undefined" ? self : this, function () {

  // ── Traditional ML #1: Simple Linear Regression (least squares) ──
  // Fits y = mx + b to a set of {x, y} points. Used to detect whether
  // a short-term forecast trend is warming, cooling, or stable.
  function linearRegression(points) {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: points[0] ? points[0].y : 0 };
    const sumX  = points.reduce((s, p) => s + p.x, 0);
    const sumY  = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope: slope, intercept: intercept };
  }

  // ── Traditional ML #2: K-Means Clustering ──────────────────────────
  // Clusters points (objects with named numeric fields) into k groups.
  // Normalizes each dimension to 0-1 first so fields on different
  // scales (temp in °C, wind in km/h) contribute equally.
  function kMeans(points, k) {
    if (points.length <= k) return points.map((_, i) => i);
    const dims = Object.keys(points[0]).filter(key => typeof points[0][key] === "number");
    const ranges = dims.map(function (d) {
      const vals = points.map(function (p) { return p[d]; });
      return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
    });
    const norm = points.map(function (p) {
      return dims.map(function (d, i) {
        const min = ranges[i].min, max = ranges[i].max;
        return max === min ? 0 : (p[d] - min) / (max - min);
      });
    });

    let centroids = [];
    for (let i = 0; i < k; i++) {
      centroids.push(norm[Math.floor((i * norm.length) / k)]);
    }

    let assignments = new Array(norm.length).fill(0);
    for (let iter = 0; iter < 15; iter++) {
      assignments = norm.map(function (p) {
        let best = 0, bestDist = Infinity;
        centroids.forEach(function (c, ci) {
          let dist = 0;
          for (let di = 0; di < dims.length; di++) dist += Math.pow(p[di] - c[di], 2);
          if (dist < bestDist) { bestDist = dist; best = ci; }
        });
        return best;
      });
      centroids = centroids.map(function (c, ci) {
        const members = norm.filter(function (_, i) { return assignments[i] === ci; });
        if (!members.length) return c;
        return dims.map(function (_, di) {
          return members.reduce(function (s, m) { return s + m[di]; }, 0) / members.length;
        });
      });
    }
    return assignments;
  }

  // ── Traditional ML #3: Z-Score Anomaly Detection ──────────────────
  // Given a value and a population of past values, computes how many
  // standard deviations away the value sits. |z| >= 2 is the standard
  // statistical threshold for flagging an outlier.
  function zScoreAnomaly(value, population) {
    const n = population.length;
    if (n === 0) return { mean: value, stdDev: 0, zScore: 0 };
    const mean = population.reduce(function (s, v) { return s + v; }, 0) / n;
    const variance = population.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / n;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev;
    return { mean: mean, stdDev: stdDev, zScore: zScore };
  }

  // ── Unit conversions (pure, testable versions) ────────────────────
  function celsiusToFahrenheit(c) {
    return Math.round((c * 9 / 5 + 32) * 10) / 10;
  }
  function msToKmh(ms) {
    return Math.round(ms * 3.6 * 10) / 10;
  }
  function msToMph(ms) {
    return Math.round(ms * 2.237 * 10) / 10;
  }

  return {
    linearRegression: linearRegression,
    kMeans: kMeans,
    zScoreAnomaly: zScoreAnomaly,
    celsiusToFahrenheit: celsiusToFahrenheit,
    msToKmh: msToKmh,
    msToMph: msToMph,
  };
});
