/**
 * The student's own ticks on a guide checklist (README 6.3).
 *
 * This is personal application data: it stays on the device and is never sent anywhere. A tick is
 * remembered against the step's id from the knowledge pack, so a pack that reorders or rewords its
 * steps does not move anybody's ticks.
 */
const STORES = ['checklists'];

export class ChecklistStore {
  constructor({ connect }) {
    this.connect = connect;
  }

  async #tx(mode, work) {
    const adapter = await this.connect();
    return adapter.tx(STORES, mode, work);
  }

  /** The ticked step ids for one guide. */
  async get(guideId) {
    const row = await this.#tx('readonly', (s) => s.checklists.get(guideId));
    return new Set(row?.checked ?? []);
  }

  async set(guideId, stepId, checked) {
    return this.#tx('readwrite', async (s) => {
      const row = await s.checklists.get(guideId);
      const ticks = new Set(row?.checked ?? []);
      if (checked) ticks.add(stepId);
      else ticks.delete(stepId);

      if (ticks.size) await s.checklists.put({ id: guideId, checked: [...ticks], updatedAt: Date.now() });
      else await s.checklists.delete(guideId);
      return ticks;
    });
  }

  async clear() {
    await this.#tx('readwrite', (s) => s.checklists.clear());
  }
}
