import { modelManager } from './engine/ModelManager.js';
import { ConversationManager } from './conversation/ConversationManager.js';
import { knowledgeBase } from './knowledge/KnowledgeBase.js';

/**
 * App-wide conversation. It delegates to whatever engine the model manager currently
 * holds, so the chat survives page navigation and the engine can be swapped in tests.
 */
export const conversation = new ConversationManager(
  {
    generate: (messages, options) => modelManager.engine.generate(messages, options),
    interrupt: () => modelManager.engine.interrupt(),
    resetChat: () => modelManager.engine.resetChat(),
  },
  { retrieve: (question) => knowledgeBase.retrieve(question) }
);
