#!/usr/bin/env node
/**
 * Builds a knowledge pack from Markdown sources. See docs/specs/phase-4-knowledge-base.md.
 *
 *   node scripts/build-knowledge.mjs --src knowledge-src --out public/knowledge
 *
 * Each source file starts with front matter holding the metadata from README 8.4, then a Markdown
 * body whose `##` headings become the retrievable sections.
 */
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const REQUIRED = ['id', 'title', 'category', 'office', 'version', 'status', 'effectiveDate', 'source', 'lastVerified'];
const STATUSES = ['draft', 'pending', 'verified', 'superseded', 'expired', 'archived'];
const DATE_FIELDS = ['effectiveDate', 'expirationDate', 'lastVerified', 'publicationDate'];

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * The structured records the campus pages render (README 6.4 to 6.9). Each kind lists the fields a
 * record cannot be published without; everything else in README 6.x is optional, because a campus
 * will not always have a fee or a schedule to publish.
 */
export const RECORD_KINDS = {
  offices: { required: ['id', 'name'] },
  places: {
    required: ['id', 'name', 'category', 'x', 'y'],
    check(record) {
      for (const axis of ['x', 'y']) {
        const value = record[axis];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error(`${axis} must be a number from 0 to 100 (a percentage of the campus image), got ${JSON.stringify(value)}`);
        }
      }
    },
  },
  guides: { required: ['id', 'title', 'category'] },
  announcements: { required: ['id', 'title', 'publicationDate'] },
};

/** Every record carries the verification metadata of README 8.4 and 8.5, like a document. */
const RECORD_META = ['status', 'source', 'lastVerified'];

export function validateRecords(kind, records, file = `${kind}.json`) {
  const spec = RECORD_KINDS[kind];
  if (!spec) throw new Error(`${file}: "${kind}" is not a record kind (${Object.keys(RECORD_KINDS).join(', ')})`);
  if (!Array.isArray(records)) throw new Error(`${file}: expected a list of records`);

  const seen = new Set();
  for (const record of records) {
    const where = `${file}: ${record?.id ?? 'a record with no id'}`;
    if (!record || typeof record !== 'object') throw new Error(`${file}: every record must be an object`);
    for (const field of [...spec.required, ...RECORD_META]) {
      if (record[field] === undefined || record[field] === '') throw new Error(`${where}: missing "${field}"`);
    }
    if (!STATUSES.includes(record.status)) {
      throw new Error(`${where}: status "${record.status}" is not one of ${STATUSES.join(', ')}`);
    }
    for (const field of DATE_FIELDS) {
      if (record[field] && !isDate(record[field])) {
        throw new Error(`${where}: ${field} must be YYYY-MM-DD, got "${record[field]}"`);
      }
    }
    if (seen.has(record.id)) throw new Error(`${where}: duplicate record id`);
    seen.add(record.id);
    spec.check?.(record);
  }
  return records;
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'section';

/** Split `key: value` front matter from the Markdown body. */
export function parseFrontMatter(text, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) throw new Error(`${file}: no front matter (the file must start with a --- block)`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) throw new Error(`${file}: front matter line is not "key: value": ${line}`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(match[0].length) };
}

/** Split a Markdown body into sections on `##` headings. Text before the first heading is the intro. */
export function splitSections(body, title) {
  const sections = [];
  const used = new Set();
  const add = (heading, lines) => {
    const text = lines.join('\n').trim();
    if (!text) return;
    let id = slug(heading);
    while (used.has(id)) id = `${id}-2`;
    used.add(id);
    sections.push({ id, heading, text });
  };

  let heading = title;
  let lines = [];
  for (const line of body.split(/\r?\n/)) {
    const h = /^##+\s+(.*\S)\s*$/.exec(line);
    if (h) {
      add(heading, lines);
      heading = h[1];
      lines = [];
    } else {
      lines.push(line);
    }
  }
  add(heading, lines);
  return sections;
}

export function parseDocument(text, file) {
  const { meta, body } = parseFrontMatter(text, file);
  for (const field of REQUIRED) {
    if (!meta[field]) throw new Error(`${file}: missing front-matter field "${field}"`);
  }
  if (!STATUSES.includes(meta.status)) {
    throw new Error(`${file}: status "${meta.status}" is not one of ${STATUSES.join(', ')}`);
  }
  for (const field of DATE_FIELDS) {
    if (meta[field] && !isDate(meta[field])) {
      throw new Error(`${file}: ${field} must be YYYY-MM-DD, got "${meta[field]}"`);
    }
  }
  const sections = splitSections(body, meta.title);
  if (!sections.length) throw new Error(`${file}: the document has no text`);
  return { ...meta, sections };
}

/**
 * Turn parsed documents into the pack files. Throws on a repeated document id.
 * The manifest carries the hash of the exact documents.json bytes, so the app can tell that the
 * file it downloaded is the one the publisher built (README 8.6). The signature and the signing key
 * id are added afterwards, by scripts/sign-pack.mjs.
 */
export function buildPack(documents, { packVersion, campus, appVersion, createdAt, records = {}, assets = {} } = {}) {
  const seen = new Map();
  for (const doc of documents) {
    if (seen.has(doc.id)) throw new Error(`duplicate document id "${doc.id}" (also in ${seen.get(doc.id)})`);
    seen.set(doc.id, doc.title);
  }

  const hash = (data) => createHash('sha256').update(data).digest('hex');
  const text = { 'documents.json': `${JSON.stringify(documents)}\n` };
  const counts = {};
  for (const [kind, list] of Object.entries(records)) {
    validateRecords(kind, list);
    text[`${kind}.json`] = `${JSON.stringify(list)}\n`;
    counts[kind] = list.length;
  }

  const files = {};
  for (const [name, data] of Object.entries(text)) files[name] = hash(data);
  for (const [name, bytes] of Object.entries(assets)) files[`assets/${name}`] = hash(bytes);

  return {
    manifest: {
      packVersion,
      campus,
      createdAt,
      documentCount: documents.length,
      recordCounts: counts,
      appVersion,
      files,
    },
    documents,
    text,
    assets,
  };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function main() {
  const src = arg('src', 'knowledge-src');
  const out = arg('out', 'public/knowledge');
  const files = (await readdir(src, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath ?? e.path, e.name))
    .sort();
  if (!files.length) throw new Error(`no .md files under ${src}`);

  const documents = [];
  for (const file of files) documents.push(parseDocument(await readFile(file, 'utf8'), file));

  // Structured records for the campus pages, and the campus map image, are both optional.
  const records = {};
  for (const kind of Object.keys(RECORD_KINDS)) {
    const file = join(src, 'records', `${kind}.json`);
    const raw = await readFile(file, 'utf8').catch(() => null);
    if (raw !== null) records[kind] = validateRecords(kind, JSON.parse(raw), file);
  }

  const assets = {};
  const assetDir = join(src, 'assets');
  for (const entry of await readdir(assetDir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile()) assets[entry.name] = await readFile(join(assetDir, entry.name));
  }

  const pack = buildPack(documents, {
    packVersion: arg('version', '0.1.0'),
    campus: arg('campus', 'isu-cabagan'),
    appVersion: JSON.parse(await readFile('package.json', 'utf8')).version,
    createdAt: new Date().toISOString().slice(0, 10),
    records,
    assets,
  });

  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(pack.manifest, null, 2)}\n`);
  // Write the same bytes that were hashed above.
  for (const [name, data] of Object.entries(pack.text)) await writeFile(join(out, name), data);
  if (Object.keys(pack.assets).length) await mkdir(join(out, 'assets'), { recursive: true });
  for (const [name, bytes] of Object.entries(pack.assets)) await writeFile(join(out, 'assets', name), bytes);
  const sections = documents.reduce((n, d) => n + d.sections.length, 0);
  const extras = Object.entries(pack.manifest.recordCounts).map(([k, n]) => `${n} ${k}`);
  if (Object.keys(pack.assets).length) extras.push(`${Object.keys(pack.assets).length} assets`);
  console.log(`${documents.length} documents, ${sections} sections${extras.length ? `, ${extras.join(', ')}` : ''} -> ${out}`);
  console.log('Next: sign it with scripts/sign-pack.mjs, or the app will refuse to install it.');
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  main().catch((err) => {
    console.error(`build-knowledge: ${err.message}`);
    process.exit(1);
  });
}
