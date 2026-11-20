/**
 * Saved conversations (README 9.1, 16.3). The student can list, open, delete one, or clear all.
 *
 * Only the 50 most recent conversations are kept: browser storage is shared with the AI model
 * files, which are hundreds of megabytes, and an unbounded history would compete with them.
 */
export const MAX_CONVERSATIONS = 50;

const STORES = ['conversations', 'messages'];

export class ChatStore {
  constructor({ connect }) {
    this.connect = connect;
  }

  async #tx(mode, work) {
    const adapter = await this.connect();
    return adapter.tx(STORES, mode, work);
  }

  /** Newest first. */
  async list() {
    const rows = await this.#tx('readonly', (s) => s.conversations.getAll());
    return rows.sort(byNewest);
  }

  async load(id) {
    return this.#tx('readonly', async (s) => {
      const conversation = await s.conversations.get(id);
      if (!conversation) return null;
      const messages = await s.messages.getAllByIndex('conversationId', id);
      messages.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      return { conversation, messages };
    });
  }

  async save(conversation, messages) {
    await this.#tx('readwrite', async (s) => {
      await s.conversations.put(conversation);

      // Replace the conversation's messages, so a regenerated reply leaves nothing behind.
      const keep = new Set(messages.map((m) => m.id));
      for (const old of await s.messages.getAllByIndex('conversationId', conversation.id)) {
        if (!keep.has(old.id)) await s.messages.delete(old.id);
      }
      for (const m of messages) await s.messages.put({ ...m, conversationId: conversation.id });

      const all = (await s.conversations.getAll()).sort(byNewest);
      for (const extra of all.slice(MAX_CONVERSATIONS)) await remove(s, extra.id);
    });
  }

  async remove(id) {
    await this.#tx('readwrite', (s) => remove(s, id));
  }

  async clear() {
    await this.#tx('readwrite', async (s) => {
      await s.conversations.clear();
      await s.messages.clear();
    });
  }
}

/** Newest first. Ids sort by creation order, which settles conversations saved in the same millisecond. */
const byNewest = (a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id);

/** Delete a conversation and its messages inside a transaction the caller already owns. */
async function remove(s, id) {
  await s.conversations.delete(id);
  for (const m of await s.messages.getAllByIndex('conversationId', id)) await s.messages.delete(m.id);
}
