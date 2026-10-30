// IndexedDB store.
// entries: keyed by id, indexed by status ("inbox" | "log").
// notes: free-form brain documents keyed by path.
// activity: raw tab events, auto-increment key, indexed by ts.
// meta: small key/value records (the brain folder handle).

const VERSION = 2;

export function openDb(name = "memory") {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (ev.oldVersion < 1) {
        db.createObjectStore("entries", { keyPath: "id" }).createIndex("status", "status");
        db.createObjectStore("notes", { keyPath: "path" });
      }
      if (ev.oldVersion < 2) {
        db.createObjectStore("activity", { autoIncrement: true }).createIndex("ts", "ts");
        db.createObjectStore("meta", { keyPath: "key" });
      }
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

export const append = (db, store, item) => tx(db, store, "readwrite", (s) => s.add(item));

export const since = (db, store, ts) =>
  tx(db, store, "readonly", (s) => s.index("ts").getAll(IDBKeyRange.lowerBound(ts)));

export const deleteBefore = (db, store, ts) =>
  tx(db, store, "readwrite", (s) => {
    const req = s.index("ts").openCursor(IDBKeyRange.upperBound(ts, true));
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
  });

export const getMeta = async (db, key) => (await tx(db, "meta", "readonly", (s) => s.get(key)))?.value;

export const setMeta = (db, key, value) => tx(db, "meta", "readwrite", (s) => s.put({ key, value }));
