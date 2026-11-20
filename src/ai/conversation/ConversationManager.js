import { buildMessages } from './PromptManager.js';

let nextId = 1;
// The counter is padded so that sorting ids as text matches the order they were made in, which is
// what breaks the tie when two records share a millisecond.
const newId = (prefix) => `${prefix}${Date.now().toString(36)}-${String(nextId++).padStart(6, '0')}`;

const TITLE_CHARS = 40;

/**
 * The conversation the student is in now, saved to the device after each reply.
 * `engine` needs generate(messages, {onToken}) and interrupt().
 * `retrieve(question)` is optional and returns { hasKnowledge, reliable, hits } from the knowledge base.
 * `store` is optional; without it the chat works but is not saved.
 */
export class ConversationManager {
  constructor(engine, { retrieve = null, store = null } = {}) {
    this.engine = engine;
    this.retrieve = retrieve;
    this.store = store;
    this.id = newId('c');
    this.title = '';
    this.createdAt = Date.now();
    this.messages = [];
    this.busy = false;
    this.storeError = null;
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.messages, this.busy);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    this.listeners.forEach((fn) => fn(this.messages, this.busy));
  }

  /** Saving must never break the chat: a full or blocked database only loses the history. */
  async #save() {
    if (!this.store || !this.messages.length) return;
    try {
      await this.store.save(
        { id: this.id, title: this.title, createdAt: this.createdAt, updatedAt: Date.now() },
        this.messages
      );
      this.storeError = null;
    } catch (err) {
      this.storeError = `This conversation could not be saved: ${err?.message ?? err}`;
    }
  }

  async send(text) {
    const content = text.trim();
    if (!content || this.busy) return;
    if (!this.title) this.title = content.slice(0, TITLE_CHARS);
    this.messages.push({ id: newId('m'), role: 'user', content, timestamp: Date.now(), citations: [] });
    await this.#respond();
  }

  /** Drop the last assistant reply and generate it again. */
  async regenerate() {
    if (this.busy) return;
    while (this.messages.length && this.messages[this.messages.length - 1].role === 'assistant') {
      this.messages.pop();
    }
    if (!this.messages.length) return;
    await this.#respond();
  }

  stop() {
    if (this.busy) this.engine.interrupt();
  }

  /** Start a new conversation. Saved ones are kept; use remove() to delete one. */
  clear() {
    if (this.busy) return;
    this.id = newId('c');
    this.title = '';
    this.createdAt = Date.now();
    this.messages = [];
    this.storeError = null;
    // Drop the engine's cached conversation state too (best effort).
    Promise.resolve(this.engine.resetChat?.()).catch(() => {});
    this.#emit();
  }

  async list() {
    if (!this.store) return [];
    try {
      return await this.store.list();
    } catch {
      return [];
    }
  }

  /** Open a saved conversation. */
  async open(id) {
    if (this.busy || !this.store || id === this.id) return false;
    let saved = null;
    try {
      saved = await this.store.load(id);
    } catch (err) {
      this.storeError = `That conversation could not be opened: ${err?.message ?? err}`;
      this.#emit();
      return false;
    }
    if (!saved) return false;
    this.id = saved.conversation.id;
    this.title = saved.conversation.title ?? '';
    this.createdAt = saved.conversation.createdAt ?? Date.now();
    this.messages = saved.messages;
    this.storeError = null;
    Promise.resolve(this.engine.resetChat?.()).catch(() => {});
    this.#emit();
    return true;
  }

  /** Delete a saved conversation. Deleting the open one starts a new empty conversation. */
  async remove(id) {
    if (this.busy || !this.store) return false;
    try {
      await this.store.remove(id);
    } catch (err) {
      this.storeError = `That conversation could not be deleted: ${err?.message ?? err}`;
      this.#emit();
      return false;
    }
    if (id === this.id) this.clear();
    else this.#emit();
    return true;
  }

  /** Open the most recent saved conversation, if there is one. Called once when the page opens. */
  async restore() {
    if (this.messages.length) return false;
    const [newest] = await this.list();
    return newest ? this.open(newest.id) : false;
  }

  async #respond() {
    // Snapshot the history before the empty reply joins it.
    const history = this.messages.slice();
    const question = history.findLast((m) => m.role === 'user')?.content ?? '';
    const reply = { id: newId('m'), role: 'assistant', content: '', timestamp: Date.now(), citations: [], stopped: false, error: null };
    this.messages.push(reply);
    // Claim busy before the first await so a second send cannot start while retrieval runs.
    this.busy = true;
    this.#emit();

    let knowledge = { hasKnowledge: false, reliable: false, hits: [] };
    try {
      if (this.retrieve) knowledge = await this.retrieve(question);
    } catch {
      /* a retrieval failure must not block a general answer; the prompt then allows no ISU facts */
    }
    // Citations come from the sections put in the prompt, never from the model's output.
    reply.citations = knowledge.hits.map((h) => ({
      docId: h.docId,
      title: h.title,
      sectionId: h.sectionId,
      heading: h.heading,
    }));
    const prompt = buildMessages(history, knowledge);

    try {
      const { text, finishReason } = await this.engine.generate(prompt, {
        onToken: (_delta, full) => {
          reply.content = full;
          this.#emit();
        },
      });
      reply.content = text;
      reply.stopped = finishReason === 'abort';
      reply.truncated = finishReason === 'length';
    } catch (err) {
      reply.error = String(err?.message ?? err);
    } finally {
      this.busy = false;
      // Save once per finished reply, never per streamed token.
      await this.#save();
      this.#emit();
    }
  }
}
