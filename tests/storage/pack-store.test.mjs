import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PackStore } from '../../src/storage/PackStore.js';
import { fakeAdapter } from '../helpers/fake-adapter.mjs';

const make = () => {
  const adapter = fakeAdapter();
  return { adapter, store: new PackStore({ connect: async () => adapter }) };
};

const manifest = (version) => ({ packVersion: version, documentCount: 1 });
const documents = [{ id: 'd1', title: 'D', status: 'verified', sections: [] }];

test('nothing is stored until a pack is installed', async () => {
  const { store } = make();
  assert.equal(await store.get(), null);
  assert.equal(await store.get('previous'), null);
});

test('installing stores the pack as the current one', async () => {
  const { store } = make();
  await store.install(manifest('1.0.0'), documents);
  const current = await store.get();
  assert.equal(current.manifest.packVersion, '1.0.0');
  assert.deepEqual(current.documents, documents);
  assert.ok(current.installedAt > 0);
});

test('a new pack pushes the old one aside, so an answer survives a bad update', async () => {
  const { store } = make();
  await store.install(manifest('1.0.0'), documents);
  await store.install(manifest('2.0.0'), documents);
  assert.equal((await store.get()).manifest.packVersion, '2.0.0');
  assert.equal((await store.get('previous')).manifest.packVersion, '1.0.0');
});

test('clearing removes every stored pack', async () => {
  const { store } = make();
  await store.install(manifest('1.0.0'), documents);
  await store.clear();
  assert.equal(await store.get(), null);
});
