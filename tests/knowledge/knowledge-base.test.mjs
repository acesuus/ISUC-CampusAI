import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeBase, isCurrent } from '../../src/ai/knowledge/KnowledgeBase.js';

const doc = (id, status, extra = {}) => ({
  id,
  title: `Doc ${id}`,
  status,
  sections: [{ id: 's1', heading: id, text: `The ${id} section mentions ${id}pedal shifting rules.` }],
  ...extra,
});

const pack = {
  manifest: { packVersion: '0.1.0', documentCount: 4 },
  documents: [
    doc('good', 'verified'),
    doc('draft', 'draft'),
    doc('superseded', 'superseded'),
    doc('expired', 'verified', { expirationDate: '2020-01-01' }),
  ],
};

const base = (source) => new KnowledgeBase({ source });

test('isCurrent accepts only verified, in-date documents', () => {
  assert.equal(isCurrent({ status: 'verified' }), true);
  assert.equal(isCurrent({ status: 'draft' }), false);
  assert.equal(isCurrent({ status: 'verified', expirationDate: '2020-01-01' }, '2026-01-01'), false);
  assert.equal(isCurrent({ status: 'verified', expirationDate: '2030-01-01' }, '2026-01-01'), true);
  assert.equal(isCurrent(null), false);
});

test('only the verified in-date document is retrievable', async () => {
  const kb = base(async () => pack);
  assert.equal(await kb.load(), true);
  assert.equal(kb.packVersion, '0.1.0');

  const hit = await kb.retrieve('goodpedal shifting');
  assert.equal(hit.reliable, true);
  assert.equal(hit.hits.length, 1);
  assert.equal(hit.hits[0].docId, 'good');

  for (const dropped of ['draftpedal', 'supersededpedal', 'expiredpedal']) {
    const r = await kb.retrieve(dropped);
    assert.equal(r.reliable, false, `${dropped} should not be retrievable`);
    assert.deepEqual(r.hits, []);
  }
});

test('a question the pack cannot answer is not reliable and has no hits', async () => {
  const kb = base(async () => pack);
  const r = await kb.retrieve('how much is the dormitory deposit');
  assert.equal(r.hasKnowledge, true);
  assert.equal(r.reliable, false);
  assert.deepEqual(r.hits, []);
});

test('no pack installed reports no knowledge, and a later load can still succeed', async () => {
  let fail = true;
  const kb = base(async () => {
    if (fail) throw new Error('404');
    return pack;
  });

  const first = await kb.retrieve('shifting');
  assert.deepEqual(first, { hasKnowledge: false, reliable: false, hits: [] });
  assert.equal(kb.packVersion, null);

  fail = false;
  assert.equal(await kb.load(), true, 'a failed load must not be cached');
});

test('two callers share one load', async () => {
  let loads = 0;
  const kb = base(async () => {
    loads++;
    return pack;
  });
  await Promise.all([kb.load(), kb.load(), kb.retrieve('shifting')]);
  assert.equal(loads, 1);
});

test('the context stays within the character budget', async () => {
  const long = (id) => ({
    id,
    title: id,
    status: 'verified',
    sections: [{ id: 's', heading: 'Budget', text: `budgetword ${'filler '.repeat(100)}`.trim() }],
  });
  const kb = base(async () => ({ manifest: {}, documents: [long('a'), long('b'), long('c'), long('d')] }));
  const { hits } = await kb.retrieve('budgetword', { k: 4 });
  const total = hits.reduce((n, h) => n + h.text.length, 0);
  assert.ok(hits.length >= 1 && total <= 2400, `hits ${hits.length}, characters ${total}`);
});
