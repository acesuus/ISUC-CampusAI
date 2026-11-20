import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PackInstaller } from '../../src/ai/knowledge/PackInstaller.js';
import { KnowledgeBase } from '../../src/ai/knowledge/KnowledgeBase.js';
import { PackStore } from '../../src/storage/PackStore.js';
import { fakeAdapter } from '../helpers/fake-adapter.mjs';
import { makeKey, signedPack, tamper } from '../helpers/pack-fixture.mjs';

const key = await makeKey();
const trusted = [{ keyId: key.keyId, publicKeyJwk: key.publicKeyJwk }];

async function setup({ version = '1.0.0' } = {}) {
  const adapter = fakeAdapter();
  const store = new PackStore({ connect: async () => adapter });
  const { downloaded } = await signedPack({ key, version });
  const installer = new PackInstaller({
    store,
    base: '/',
    keys: async () => trusted,
    fetchFiles: async () => downloaded,
  });
  return { store, installer, downloaded };
}

test('a verified pack is installed and can answer a question', async () => {
  const { installer, store } = await setup();
  const result = await installer.install();
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.version, '1.0.0');

  const kb = new KnowledgeBase({
    source: async () => {
      const row = await store.get('current');
      return { manifest: row.manifest, documents: row.documents };
    },
  });
  const hit = await kb.retrieve('shifting form');
  assert.equal(hit.reliable, true);
  assert.equal(hit.hits[0].docId, 'fixture-doc');
});

test('a tampered pack is refused and the installed one is left alone', async () => {
  const { installer, store, downloaded } = await setup({ version: '1.0.0' });
  await installer.install();

  downloaded.files['documents.json'] = tamper(downloaded.files['documents.json'], 12);
  const result = await installer.install();
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not match/);

  assert.equal((await store.get()).manifest.packVersion, '1.0.0', 'the good pack must still be installed');
  assert.equal(await store.get('previous'), null, 'a refused install must not touch the slots');
});

test('a pack signed by an untrusted key is refused', async () => {
  const { installer, store } = await setup();
  installer.keys = async () => [];
  const result = await installer.install();
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not trust/);
  assert.equal(await store.get(), null);
});

test('a failed download and unreadable contents are reported, not thrown', async () => {
  const { installer } = await setup();
  installer.fetchFiles = async () => {
    throw new Error('offline');
  };
  assert.match((await installer.install()).reason, /could not be downloaded: offline/);

  const { installer: second } = await setup();
  const bad = await signedPack({ key, documents: { not: 'a list' } });
  second.fetchFiles = async () => bad.downloaded;
  assert.match((await second.install()).reason, /could not be read/);
});

test('check reports what is installed and what the site offers', async () => {
  const { installer, store } = await setup({ version: '2.0.0' });
  const available = { packVersion: '2.0.0' };
  globalThis.fetch = async () => ({ ok: true, json: async () => available });

  let state = await installer.check();
  assert.deepEqual([state.installed, state.available, state.upToDate], [null, '2.0.0', false]);

  await installer.install();
  state = await installer.check();
  assert.deepEqual([state.installed, state.available, state.upToDate], ['2.0.0', '2.0.0', true]);
  assert.equal(state.documentCount, 1);

  available.packVersion = '3.0.0';
  state = await installer.check();
  assert.equal(state.upToDate, false, 'a newer published version should be offered');

  // Offline: the site cannot be reached, so nothing is reported as available.
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  state = await installer.check();
  assert.deepEqual([state.installed, state.available], ['2.0.0', null]);

  await store.clear();
  state = await installer.check();
  assert.equal(state.installed, null);
  delete globalThis.fetch;
});
