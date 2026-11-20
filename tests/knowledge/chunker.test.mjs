import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunk } from '../../src/ai/knowledge/chunker.js';

const doc = (sections) => ({ id: 'd1', title: 'Doc One', sections });

test('a short section becomes one chunk and keeps its ids', () => {
  const chunks = chunk(doc([{ id: 's1', heading: 'Fees', text: 'Pay at the cashier.' }]));
  assert.deepEqual(chunks, [
    { docId: 'd1', title: 'Doc One', sectionId: 's1', heading: 'Fees', text: 'Pay at the cashier.' },
  ]);
});

test('a long section splits on paragraph boundaries, never mid-paragraph', () => {
  const para = (word) => `${word} `.repeat(60).trim(); // ~420 characters
  const text = [para('alpha'), para('beta'), para('gamma')].join('\n\n');
  const chunks = chunk(doc([{ id: 's2', heading: 'Steps', text }]));

  assert.ok(chunks.length > 1, 'expected more than one chunk');
  assert.deepEqual(
    chunks.map((c) => c.sectionId),
    chunks.map((_, i) => `s2-${i + 1}`)
  );
  for (const c of chunks) {
    assert.equal(c.heading, 'Steps');
    assert.equal(c.docId, 'd1');
    assert.ok(c.text.length <= 900, `chunk too long: ${c.text.length}`);
  }
  // No paragraph is cut in half: every chunk starts at a paragraph start.
  assert.ok(chunks.every((c) => /^(alpha|beta|gamma)/.test(c.text)));
});

test('empty sections and a missing sections list are skipped', () => {
  assert.deepEqual(chunk({ id: 'd', title: 't' }), []);
  assert.deepEqual(chunk(doc([{ id: 's', heading: 'h', text: '   ' }])), []);
});
