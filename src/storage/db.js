/**
 * Thin IndexedDB access for the app's own data (README 9.3).
 *
 * Everything goes through `tx`, one transaction per call, so a change that touches two stores
 * (deleting a conversation and its messages) either happens completely or not at all. Callers get a
 * tiny per-store API, which also means tests can pass a plain in-memory stand-in.
 */
const DB_NAME = 'campusai';
const DB_VERSION = 1;

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so nothing can be saved.'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' }).createIndex('conversationId', 'conversationId');
      }
      if (!db.objectStoreNames.contains('packs')) {
        db.createObjectStore('packs', { keyPath: 'slot' });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Another tab is upgrading the database. Close it and try again.'));
  });
}

export function createAdapter(db) {
  return {
    tx(stores, mode, work) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(stores, mode);
        const api = {};
        for (const name of stores) {
          const store = transaction.objectStore(name);
          api[name] = {
            get: (key) => request(store.get(key)),
            getAll: () => request(store.getAll()),
            getAllByIndex: (index, value) => request(store.index(index).getAll(value)),
            put: (value) => request(store.put(value)),
            delete: (key) => request(store.delete(key)),
            clear: () => request(store.clear()),
          };
        }
        let result;
        Promise.resolve(work(api)).then((value) => {
          result = value;
        }, reject);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('The database transaction was cancelled.'));
      });
    },
  };
}

let pending = null;

/** Opens the database once per page. A failed open is not remembered, so a retry can still work. */
export function storage() {
  pending ??= openDb()
    .then(createAdapter)
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
