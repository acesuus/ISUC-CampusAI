import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChecklistStore } from '../../src/storage/ChecklistStore.js';
import { fakeAdapter } from '../helpers/fake-adapter.mjs';

const make = () => {
  const adapter = fakeAdapter();
  return { adapter, store: new ChecklistStore({ connect: async () => adapter }) };
};

test('a guide with no ticks reads as empty', async () => {
  const { store } = make();
  assert.deepEqual([...(await store.get('guide-1'))], []);
});

test('ticks are kept per guide and per step', async () => {
  const { store } = make();
  await store.set('guide-1', 's1', true);
  await store.set('guide-1', 's3', true);
  await store.set('guide-2', 's1', true);

  assert.deepEqual([...(await store.get('guide-1'))].sort(), ['s1', 's3']);
  assert.deepEqual([...(await store.get('guide-2'))], ['s1']);
});

test('unticking removes just that step, and the last one removes the row', async () => {
  const { store, adapter } = make();
  await store.set('guide-1', 's1', true);
  await store.set('guide-1', 's2', true);

  await store.set('guide-1', 's1', false);
  assert.deepEqual([...(await store.get('guide-1'))], ['s2']);

  await store.set('guide-1', 's2', false);
  assert.deepEqual([...(await store.get('guide-1'))], []);
  assert.equal(adapter.data.checklists.size, 0, 'an empty checklist should not be stored');
});

test('ticking the same step twice changes nothing', async () => {
  const { store } = make();
  await store.set('guide-1', 's1', true);
  await store.set('guide-1', 's1', true);
  assert.deepEqual([...(await store.get('guide-1'))], ['s1']);
});

test('clear removes every checklist', async () => {
  const { store } = make();
  await store.set('guide-1', 's1', true);
  await store.set('guide-2', 's1', true);
  await store.clear();
  assert.deepEqual([...(await store.get('guide-1'))], []);
  assert.deepEqual([...(await store.get('guide-2'))], []);
});
