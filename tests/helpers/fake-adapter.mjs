/**
 * In-memory stand-in for src/storage/db.js. Node has no IndexedDB, and the stores only need the
 * small per-store API that db.js exposes.
 */
export function fakeAdapter({ failOn = null } = {}) {
  const data = { conversations: new Map(), messages: new Map(), packs: new Map() };
  const keyOf = (store) => (store === 'packs' ? 'slot' : 'id');

  return {
    data,
    async tx(stores, mode, work) {
      if (failOn && stores.includes(failOn)) throw new Error('storage is full');
      const api = {};
      for (const store of stores) {
        const map = data[store];
        api[store] = {
          get: async (key) => map.get(key),
          getAll: async () => [...map.values()],
          getAllByIndex: async (index, value) => [...map.values()].filter((row) => row[index] === value),
          put: async (value) => void map.set(value[keyOf(store)], structuredClone(value)),
          delete: async (key) => void map.delete(key),
          clear: async () => void map.clear(),
        };
      }
      return work(api);
    },
  };
}
