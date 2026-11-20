import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatStore, MAX_CONVERSATIONS } from '../../src/storage/ChatStore.js';
import { fakeAdapter } from '../helpers/fake-adapter.mjs';

function make() {
  const adapter = fakeAdapter();
  return { adapter, store: new ChatStore({ connect: async () => adapter }) };
}

const conversation = (id, updatedAt) => ({ id, title: `Chat ${id}`, createdAt: 1, updatedAt });
const message = (id, content, timestamp = 1) => ({ id, role: 'user', content, timestamp, citations: [] });

test('a conversation is saved, listed newest first and loaded back', async () => {
  const { store } = make();
  await store.save(conversation('a', 100), [message('m1', 'first')]);
  await store.save(conversation('b', 200), [message('m2', 'second')]);

  assert.deepEqual((await store.list()).map((c) => c.id), ['b', 'a']);

  const loaded = await store.load('a');
  assert.equal(loaded.conversation.title, 'Chat a');
  assert.deepEqual(loaded.messages.map((m) => m.content), ['first']);
  assert.equal(loaded.messages[0].conversationId, 'a');
  assert.equal(await store.load('missing'), null);
});

test('messages are ordered by time and a dropped reply is removed on the next save', async () => {
  const { store, adapter } = make();
  await store.save(conversation('a', 1), [message('m2', 'second', 20), message('m1', 'first', 10)]);
  assert.deepEqual((await store.load('a')).messages.map((m) => m.content), ['first', 'second']);

  // Regenerating drops the old reply; it must not stay behind.
  await store.save(conversation('a', 2), [message('m1', 'first', 10)]);
  assert.deepEqual((await store.load('a')).messages.map((m) => m.id), ['m1']);
  assert.equal(adapter.data.messages.size, 1);
});

test('deleting one conversation removes its messages and leaves the others', async () => {
  const { store, adapter } = make();
  await store.save(conversation('a', 1), [message('m1', 'x')]);
  await store.save(conversation('b', 2), [message('m2', 'y')]);

  await store.remove('a');
  assert.deepEqual((await store.list()).map((c) => c.id), ['b']);
  assert.deepEqual([...adapter.data.messages.keys()], ['m2']);
});

test('clear removes every conversation and message', async () => {
  const { store, adapter } = make();
  await store.save(conversation('a', 1), [message('m1', 'x')]);
  await store.clear();
  assert.deepEqual(await store.list(), []);
  assert.equal(adapter.data.messages.size, 0);
});

test('only the newest 50 conversations are kept', async () => {
  const { store, adapter } = make();
  for (let i = 1; i <= MAX_CONVERSATIONS + 5; i++) {
    await store.save(conversation(`c${i}`, i), [message(`m${i}`, 'x')]);
  }
  const kept = await store.list();
  assert.equal(kept.length, MAX_CONVERSATIONS);
  assert.equal(kept[0].id, `c${MAX_CONVERSATIONS + 5}`);
  assert.equal(kept.at(-1).id, 'c6', 'the five oldest should be gone');
  assert.equal(adapter.data.messages.size, MAX_CONVERSATIONS, 'their messages go too');
});

test('a storage failure is reported, not swallowed', async () => {
  const store = new ChatStore({ connect: async () => fakeAdapter({ failOn: 'conversations' }) });
  await assert.rejects(() => store.save(conversation('a', 1), [message('m1', 'x')]), /storage is full/);
});
