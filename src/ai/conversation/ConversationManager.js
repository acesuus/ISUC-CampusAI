import { buildMessages } from './PromptManager.js';

let nextId = 1;
const newId = () => `m${Date.now().toString(36)}${nextId++}`;

/**
 * In-memory conversation for the current session. Persistence (IndexedDB) arrives in Phase 6.
 * `engine` needs generate(messages, {onToken}) and interrupt().
 * `retrieve(question)` is optional and returns { hasKnowledge, reliable, hits } from the knowledge base.
 */
export class ConversationManager {
  constructor(engine, { retrieve = null } = {}) {
    this.engine = engine;
    this.retrieve = retrieve;
    this.messages = [];
    this.busy = false;
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

  async send(text) {
    const content = text.trim();
    if (!content || this.busy) return;
    this.messages.push({ id: newId(), role: 'user', content, timestamp: Date.now(), citations: [] });
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

  clear() {
    if (this.busy) return;
    this.messages = [];
    // Drop the engine's cached conversation state too (best effort).
    Promise.resolve(this.engine.resetChat?.()).catch(() => {});
    this.#emit();
  }

  async #respond() {
    // Snapshot the history before the empty reply joins it.
    const history = this.messages.slice();
    const question = history.findLast((m) => m.role === 'user')?.content ?? '';
    const reply = { id: newId(), role: 'assistant', content: '', timestamp: Date.now(), citations: [], stopped: false, error: null };
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
      this.#emit();
    }
  }
}
