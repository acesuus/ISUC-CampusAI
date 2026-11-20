import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRecords, RECORD_KINDS, buildPack, parseDocument } from '../../scripts/build-knowledge.mjs';
import { safeFileNames, readPackFiles } from '../../src/ai/knowledge/PackInstaller.js';
import { currentOnly, withExpiry, matches, categoriesOf } from '../../src/pages/shared/records.js';

const office = (over = {}) => ({
  id: 'o1',
  name: 'Example Office',
  status: 'verified',
  source: 'test',
  lastVerified: '2026-01-01',
  ...over,
});

test('a record must carry its required fields and verification metadata', () => {
  assert.doesNotThrow(() => validateRecords('offices', [office()]));
  assert.throws(() => validateRecords('offices', [office({ name: '' })]), /missing "name"/);
  assert.throws(() => validateRecords('offices', [office({ lastVerified: undefined })]), /missing "lastVerified"/);
  assert.throws(() => validateRecords('offices', [office({ status: 'approved' })]), /not one of/);
  assert.throws(() => validateRecords('offices', [office({ expirationDate: '01-01-2026' })]), /YYYY-MM-DD/);
  assert.throws(() => validateRecords('offices', [office(), office()]), /duplicate record id/);
  assert.throws(() => validateRecords('offices', { not: 'a list' }), /expected a list/);
  assert.throws(() => validateRecords('buildings', []), /not a record kind/);
});

test('a map marker must sit inside the campus image', () => {
  const place = (over) => [{ ...office({ id: 'p1', category: 'Academic', x: 10, y: 20 }), ...over }];
  assert.doesNotThrow(() => validateRecords('places', place({})));
  assert.throws(() => validateRecords('places', place({ x: 120 })), /x must be a number from 0 to 100/);
  assert.throws(() => validateRecords('places', place({ y: '20' })), /y must be a number from 0 to 100/);
  assert.throws(() => validateRecords('places', place({ x: Number.NaN })), /x must be a number/);
  assert.ok(Object.keys(RECORD_KINDS).includes('guides'));
});

test('records and assets are hashed into the manifest', async () => {
  const doc = parseDocument(await readFile('tests/fixtures/knowledge-src/academic/handbook.md', 'utf8'), 'h.md');
  const pack = buildPack([doc], {
    packVersion: '1.0.0',
    campus: 'test',
    appVersion: '0.1.0',
    createdAt: '2026-01-01',
    records: { offices: [office()] },
    assets: { 'campus-map.svg': Buffer.from('<svg/>') },
  });
  assert.deepEqual(Object.keys(pack.manifest.files).sort(), ['assets/campus-map.svg', 'documents.json', 'offices.json']);
  assert.deepEqual(pack.manifest.recordCounts, { offices: 1 });
  assert.match(pack.text['offices.json'], /Example Office/);
});

test('the file list in an unverified manifest is treated as hostile', () => {
  assert.deepEqual(safeFileNames({ 'documents.json': 'h', 'offices.json': 'h' }), ['documents.json', 'offices.json']);
  assert.deepEqual(safeFileNames({ 'documents.json': 'h', 'manifest.sig': 'h' }), ['documents.json']);
  assert.throws(() => safeFileNames({}), /lists no files/);
  assert.throws(() => safeFileNames({ '../../etc/passwd': 'h' }), /unexpected file name/);
  assert.throws(() => safeFileNames({ '/etc/passwd': 'h' }), /unexpected file name/);
  assert.throws(() => safeFileNames({ 'a/b/c.json': 'h' }), /unexpected file name/);
  assert.throws(() => safeFileNames({ 'https://evil.example/x.json': 'h' }), /unexpected file name/);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}.json`, 'h']));
  assert.throws(() => safeFileNames(many), /more than CampusAI installs/);
});

test('verified pack files are split into documents, records and assets', () => {
  const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
  const content = readPackFiles({
    'documents.json': encode([{ id: 'd1' }]),
    'offices.json': encode([office()]),
    'assets/campus-map.svg': new TextEncoder().encode('<svg/>'),
  });
  assert.equal(content.documents.length, 1);
  assert.equal(content.records.offices.length, 1);
  assert.ok(content.assets['campus-map.svg'] instanceof Uint8Array);
  assert.throws(() => readPackFiles({ 'documents.json': encode({}) }), /not a list/);
  assert.throws(() => readPackFiles({ 'documents.json': encode([]), 'offices.json': encode({}) }), /offices\.json is not a list/);
});

test('pages show only verified, in-date records', () => {
  const records = [
    office({ id: 'ok' }),
    office({ id: 'draft', status: 'draft' }),
    office({ id: 'superseded', status: 'superseded' }),
    office({ id: 'expired', expirationDate: '2020-01-01' }),
    office({ id: 'future', expirationDate: '2030-01-01' }),
  ];
  assert.deepEqual(currentOnly(records, '2026-01-01').map((r) => r.id), ['ok', 'future']);
});

test('an expired announcement is listed but marked, and drafts are dropped', () => {
  const notice = (id, over) => ({ ...office({ id, title: id, publicationDate: '2026-01-01' }), ...over });
  const list = withExpiry(
    [
      notice('old', { publicationDate: '2019-01-01', expirationDate: '2020-01-01' }),
      notice('new', { publicationDate: '2026-05-01' }),
      notice('older-current', { publicationDate: '2026-01-01' }),
      notice('hidden', { status: 'draft' }),
    ],
    '2026-06-01'
  );
  assert.deepEqual(list.map((r) => r.id), ['new', 'older-current', 'old'], 'current first, then newest');
  assert.deepEqual(list.map((r) => r.expired), [false, false, true]);
});

test('search looks through text and list fields; categories are collected', () => {
  const record = office({ services: ['Transcript request', 'Clearance'], description: 'Handles records' });
  assert.equal(matches(record, '', ['name']), true);
  assert.equal(matches(record, 'transcript', ['services']), true, 'list fields are searched');
  assert.equal(matches(record, 'RECORDS', ['description']), true, 'case is ignored');
  assert.equal(matches(record, 'parking', ['name', 'description', 'services']), false);
  assert.deepEqual(categoriesOf([{ category: 'B' }, { category: 'A' }, { category: 'A' }, {}]), ['A', 'B']);
  assert.deepEqual(categoriesOf([office({ unit: 'Finance' })], 'unit'), ['Finance']);
});
