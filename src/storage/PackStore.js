/**
 * The installed knowledge pack (README 9.3).
 *
 * Two slots: `current` is what the assistant answers from, `previous` is the pack it replaced. A
 * failed install must leave both untouched, so the swap happens in one transaction after the new
 * pack has already been verified.
 */
const STORES = ['packs'];

export class PackStore {
  constructor({ connect }) {
    this.connect = connect;
  }

  async #tx(mode, work) {
    const adapter = await this.connect();
    return adapter.tx(STORES, mode, work);
  }

  /** The stored pack, or null. */
  async get(slot = 'current') {
    const row = await this.#tx('readonly', (s) => s.packs.get(slot));
    return row ?? null;
  }

  /** `extra` carries the structured records the campus pages render, and the pack's assets. */
  async install(manifest, documents, { records = {}, assets = {} } = {}) {
    await this.#tx('readwrite', async (s) => {
      const current = await s.packs.get('current');
      if (current) await s.packs.put({ ...current, slot: 'previous' });
      await s.packs.put({ slot: 'current', manifest, documents, records, assets, installedAt: Date.now() });
    });
  }

  async clear() {
    await this.#tx('readwrite', (s) => s.packs.clear());
  }
}
