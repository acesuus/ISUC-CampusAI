import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPack } from '../../src/ai/knowledge/verify.js';
import { makeKey, signedPack, tamper } from '../helpers/pack-fixture.mjs';

const key = await makeKey();
const other = await makeKey();
const keys = [{ keyId: key.keyId, publicKeyJwk: key.publicKeyJwk }];

test('a correctly signed pack is accepted', async () => {
  const { downloaded, manifest } = await signedPack({ key });
  const result = await verifyPack(downloaded, keys);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.manifest.packVersion, manifest.packVersion);
});

test('an edited document is rejected', async () => {
  const { downloaded } = await signedPack({ key });
  downloaded.files['documents.json'] = tamper(downloaded.files['documents.json'], 10);
  const result = await verifyPack(downloaded, keys);
  assert.equal(result.ok, false);
  assert.match(result.reason, /documents\.json does not match/);
});

test('an edited manifest is rejected', async () => {
  const { downloaded } = await signedPack({ key });
  // Change a byte inside the JSON text, keeping it parsable: the signature must still fail.
  downloaded.manifestBytes = tamper(downloaded.manifestBytes, downloaded.manifestBytes.length - 2);
  const result = await verifyPack(downloaded, keys);
  assert.equal(result.ok, false);
  assert.match(result.reason, /signature|could not be read/);
});

test('a signature from another key is rejected', async () => {
  const { downloaded } = await signedPack({ key, signWith: other });
  const result = await verifyPack(downloaded, keys);
  assert.equal(result.ok, false);
  assert.match(result.reason, /signature on this pack does not match/);
});

test('a key CampusAI does not know is rejected', async () => {
  const { downloaded } = await signedPack({ key: other });
  const result = await verifyPack(downloaded, keys);
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not trust/);
});

test('an empty trusted list installs nothing, which is the shipped default', async () => {
  const { downloaded } = await signedPack({ key });
  assert.match((await verifyPack(downloaded, [])).reason, /does not trust/);
});

test('a missing signature, algorithm, hash list or file is rejected', async () => {
  const { downloaded } = await signedPack({ key });
  assert.match((await verifyPack({ ...downloaded, signature: '' }, keys)).reason, /no signature/);

  const wrongAlgorithm = await signedPack({ key, manifestExtra: { algorithm: 'RSA-PSS' } });
  assert.match((await verifyPack(wrongAlgorithm.downloaded, keys)).reason, /signature type/);

  const noHashes = await signedPack({ key, manifestExtra: { files: {} } });
  assert.match((await verifyPack(noHashes.downloaded, keys)).reason, /no files to check/);

  assert.match((await verifyPack({ ...downloaded, files: {} }, keys)).reason, /missing documents\.json/);
});

test('an unreadable manifest is rejected', async () => {
  const result = await verifyPack({ manifestBytes: new TextEncoder().encode('not json'), signature: 'x' }, keys);
  assert.equal(result.ok, false);
  assert.match(result.reason, /could not be read/);
});
