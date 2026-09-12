// ═══════════════════════════════════════════════════════════════════
// IDB.JS — thin native IndexedDB wrapper (no library)
// Replaces localStorage for structured, growable data: pinned cities
// and search history. Falls back gracefully — callers should wrap
// calls in try/catch and fall back to localStorage if IndexedDB is
// unavailable (private browsing, very old browsers).
// ═══════════════════════════════════════════════════════════════════
(function (root) {
  const DB_NAME    = "WeatherAppDB";
  const DB_VERSION = 1;
  const STORES     = ["pinnedCities", "searchHistory"];

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in root)) { reject(new Error("IndexedDB not supported")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
          }
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function idbGetAll(storeName) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx  = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function idbAdd(storeName, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx  = db.transaction(storeName, "readwrite");
        const req = tx.objectStore(storeName).add(value);
        req.onsuccess = function () { resolve(req.result); }; // generated id
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(storeName, id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  function idbClear(storeName) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  root.IDB = {
    idbGetAll: idbGetAll,
    idbAdd: idbAdd,
    idbDelete: idbDelete,
    idbClear: idbClear,
  };
})(typeof self !== "undefined" ? self : this);
