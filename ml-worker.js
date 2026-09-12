// ═══════════════════════════════════════════════════════════════════
// ML-WORKER.JS — runs k-means and linear regression off the main
// thread so clustering/regression never block UI rendering or
// animation frames. Communicates via postMessage with a requestId
// so concurrent calls from the main thread never get cross-matched.
// ═══════════════════════════════════════════════════════════════════
importScripts("./ml-utils.js");

self.onmessage = function (e) {
  const type = e.data.type;
  const payload = e.data.payload;
  const requestId = e.data.requestId;

  try {
    let result;
    if (type === "kmeans") {
      result = kMeans(payload.points, payload.k);
    } else if (type === "regression") {
      result = linearRegression(payload.points);
    } else {
      throw new Error("Unknown ML worker task: " + type);
    }
    self.postMessage({ requestId: requestId, result: result });
  } catch (err) {
    self.postMessage({ requestId: requestId, error: err.message });
  }
};
