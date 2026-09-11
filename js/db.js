/* Minimal promise-based IndexedDB wrapper. No external deps. */

const DB_NAME = "shop-log";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("entries")) {
        const entries = db.createObjectStore("entries", { keyPath: "id" });
        entries.createIndex("byProjectCategory", ["projectId", "category"]);
      }
      if (!db.objectStoreNames.contains("misc")) {
        db.createObjectStore("misc", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = openDatabase();

function requestPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode) {
  const db = await dbPromise;
  return db.transaction(name, mode).objectStore(name);
}

async function dbGetAll(storeName) {
  const s = await store(storeName, "readonly");
  return requestPromise(s.getAll());
}

async function dbGet(storeName, key) {
  const s = await store(storeName, "readonly");
  return requestPromise(s.get(key));
}

async function dbPut(storeName, value) {
  const s = await store(storeName, "readwrite");
  await requestPromise(s.put(value));
  return value;
}

async function dbDelete(storeName, key) {
  const s = await store(storeName, "readwrite");
  return requestPromise(s.delete(key));
}
