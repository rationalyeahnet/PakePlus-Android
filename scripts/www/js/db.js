/* ============================================================
   课时记账 · IndexedDB 封装（零依赖，Promise 化）
   表：students / courses / enrollments / attendances / payments
      / exceptions（停课·加课）/ vacations（自定义假期）
      / absences（请假备注：未到原因）
   ============================================================ */
window.DB = (function () {
  const DB_NAME = 'jizhang-db';
  const DB_VERSION = 3;
  const STORES = ['students', 'courses', 'enrollments', 'attendances', 'payments', 'exceptions', 'vacations', 'absences'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function requestToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let result;
        try { result = fn(store); } catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function getAll(storeName) {
    return tx(storeName, 'readonly', function (s) { return requestToPromise(s.getAll()); });
  }

  function put(storeName, obj) {
    return tx(storeName, 'readwrite', function (s) { return requestToPromise(s.put(obj)); });
  }

  function bulkPut(storeName, arr) {
    return tx(storeName, 'readwrite', function (s) {
      arr.forEach(function (obj) { s.put(obj); });
      return arr.length;
    });
  }

  function remove(storeName, id) {
    return tx(storeName, 'readwrite', function (s) { return requestToPromise(s.delete(id)); });
  }

  function clear(storeName) {
    return tx(storeName, 'readwrite', function (s) { return requestToPromise(s.clear()); });
  }

  return { open, getAll, put, bulkPut, remove, clear, STORES: STORES.slice() };
})();
