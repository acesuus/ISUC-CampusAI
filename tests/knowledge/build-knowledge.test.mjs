import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocument, parseFrontMatter, splitSections, buildPack } from '../../scripts/build-knowledge.mjs';
import { KnowledgeBase } from '../../src/ai/knowledge/KnowledgeBase.js';

const FIXTURES = [
  'tests/fixtures/knowledge-src/academic/handbook.md',
  'tests/fixtures/knowledge-src/academic/old-rule.md',
  'tests/fixtures/knowledge-src/admission/draft.md',
];

const GOOD = `---
id: d1
title: Doc One
category: academic
office: Example Office
version: 1.0
status: verified
effectiveDate: 2026-01-01
source: test
lastVerified: 2026-01-02
---

Intro text.

## First heading

Body text.
`;

test('front matter and sections are parsed', () => {
  const { meta, body } = parseFrontMatter(GOOD, 'x.md');
  assert.equal(meta.id, 'd1');
  assert.equal(meta.status, 'verified');
  assert.match(body, /Intro text/);

  const sections = splitSections(body, meta.title);
  assert.deepEqual(
    sections.map((s) => [s.id, s.heading]),
    [
      ['doc-one', 'Doc One'],
      ['first-heading', 'First heading'],
    ]
  );
});

test('a bad document is rejected with a message naming the file', () => {
  const without = (field) => GOOD.replace(new RegExp(`^${field}:.*\n`, 'm'), '');
  assert.throws(() => parseDocument(without('office'), 'bad.md'), /bad\.md.*office/);
  assert.throws(() => parseDocument(without('status'), 'bad.md'), /bad\.md.*status/);
  assert.throws(() => parseDocument(GOOD.replace('status: verified', 'status: approved'), 'bad.md'), /not one of/);
  assert.throws(() => parseDocument(GOOD.replace('2026-01-01', '01/01/2026'), 'bad.md'), /YYYY-MM-DD/);
  assert.throws(() => parseDocument(GOOD.replace('2026-01-01', '2026-13-45'), 'bad.md'), /YYYY-MM-DD/);
  assert.throws(() => parseDocument('no front matter here', 'bad.md'), /front matter/);
  assert.throws(() => parseDocument(`${GOOD.split('\n---\n')[0]}\n---\n`, 'bad.md'), /no text/);
});

test('a repeated document id is rejected', () => {
  const doc = parseDocument(GOOD, 'a.md');
  const opts = { packVersion: '0.1.0', campus: 'test', appVersion: '0.1.0', createdAt: '2026-01-01' };
  assert.throws(() => buildPack([doc, { ...doc }], opts), /duplicate document id "d1"/);
  assert.equal(buildPack([doc], opts).manifest.documentCount, 1);
});

test('the fixture pack builds and answers a question it covers', async () => {
  const documents = [];
  for (const file of FIXTURES) documents.push(parseDocument(await readFile(file, 'utf8'), file));
  const pack = buildPack(documents, {
    packVersion: '0.1.0-fixture',
    campus: 'test',
    appVersion: '0.1.0',
    createdAt: '2026-01-01',
  });
  assert.equal(pack.manifest.documentCount, 3);

  const kb = new KnowledgeBase({ source: async () => pack });
  const shifting = await kb.retrieve('What is the rule for shifting to another program?');
  assert.equal(shifting.reliable, true);
  assert.equal(shifting.hits[0].docId, 'fixture-handbook');
  assert.match(shifting.hits[0].text, /shifting form/);

  // The draft and the expired document are in the pack but must never be retrieved.
  for (const word of ['quarbellion', 'zirconpark']) {
    assert.deepEqual((await kb.retrieve(word)).hits, [], `${word} must not be retrievable`);
  }
});
