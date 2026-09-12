(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof self !== "undefined" ? self : this, function () {

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

  function zScoreAnomaly(value, population) {
    const n = population.length;
    if (n === 0) return { mean: value, stdDev: 0, zScore: 0 };
    const mean = population.reduce(function (s, v) { return s + v; }, 0) / n;
    const variance = population.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / n;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev;
    return { mean: mean, stdDev: stdDev, zScore: zScore };
  }

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
