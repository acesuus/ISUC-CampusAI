import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, tokenize } from '../../src/ai/knowledge/bm25.js';

const chunks = [
  { docId: 'a', title: 'A', sectionId: 'a1', heading: 'Shifting', text: 'A student files a shifting form at the records window.' },
  { docId: 'b', title: 'B', sectionId: 'b1', heading: 'Parking', text: 'Vehicles need a parking sticker each term.' },
  { docId: 'c', title: 'C', sectionId: 'c1', heading: 'Scholarship', text: 'The scholarship requirement list is posted by the office.' },
];
const index = buildIndex(chunks);

test('tokenize drops stop words in English and Filipino, and the plural s', () => {
  assert.deepEqual(tokenize('Paano ang mga requirements?'), ['requirement']);
  assert.deepEqual(tokenize('the and of'), []);
});

test('a matching chunk ranks above the others', () => {
  const hits = search(index, 'how do I file a shifting form?');
  assert.equal(hits[0].sectionId, 'a1');
  assert.ok(hits[0].score > 0);
});

test('plural and singular match each other', () => {
  assert.equal(search(index, 'scholarship requirements')[0].sectionId, 'c1');
});

test('a query of only stop words finds nothing', () => {
  assert.deepEqual(search(index, 'what is the'), []);
});

test('an unknown word finds nothing, and k limits the results', () => {
  assert.deepEqual(search(index, 'zirconpark'), []);
  assert.equal(search(buildIndex(chunks), 'student parking scholarship', 2).length, 2);
});

test('an empty index is safe', () => {
  assert.deepEqual(search(buildIndex([]), 'anything'), []);
});
