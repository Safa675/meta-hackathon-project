// IndexedDB store. entries: keyed by id, indexed by status ("inbox" | "log").
// notes: free-form brain documents keyed by path.

const VERSION = 1;

export function openDb(name = "memory") {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("entries", { keyPath: "id" }).createIndex("status", "status");
      db.createObjectStore("notes", { keyPath: "path" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const getAll = (db, store) => tx(db, store, "readonly", (s) => s.getAll());

export const byStatus = (db, status) =>
  tx(db, "entries", "readonly", (s) => s.index("status").getAll(status));

export const putAll = (db, store, items) =>
  tx(db, store, "readwrite", (s) => items.forEach((i) => s.put(i)));

export const removeAll = (db, store, keys) =>
  tx(db, store, "readwrite", (s) => keys.forEach((k) => s.delete(k)));

export const clear = (db, store) => tx(db, store, "readwrite", (s) => s.clear());
