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
import { join, resolve } from 'node:path';

const REQUIRED = ['id', 'title', 'category', 'office', 'version', 'status', 'effectiveDate', 'source', 'lastVerified'];
const STATUSES = ['draft', 'pending', 'verified', 'superseded', 'expired', 'archived'];
const DATE_FIELDS = ['effectiveDate', 'expirationDate', 'lastVerified', 'publicationDate'];

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

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

/** Turn parsed documents into the two pack files. Throws on a repeated document id. */
export function buildPack(documents, { packVersion, campus, appVersion, createdAt }) {
  const seen = new Map();
  for (const doc of documents) {
    if (seen.has(doc.id)) throw new Error(`duplicate document id "${doc.id}" (also in ${seen.get(doc.id)})`);
    seen.set(doc.id, doc.title);
  }
  return {
    manifest: { packVersion, campus, createdAt, documentCount: documents.length, appVersion },
    documents,
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

  const pack = buildPack(documents, {
    packVersion: arg('version', '0.1.0'),
    campus: arg('campus', 'isu-cabagan'),
    appVersion: JSON.parse(await readFile('package.json', 'utf8')).version,
    createdAt: new Date().toISOString().slice(0, 10),
  });

  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(pack.manifest, null, 2)}\n`);
  await writeFile(join(out, 'documents.json'), `${JSON.stringify(pack.documents)}\n`);
  const sections = documents.reduce((n, d) => n + d.sections.length, 0);
  console.log(`${documents.length} documents, ${sections} sections -> ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  main().catch((err) => {
    console.error(`build-knowledge: ${err.message}`);
    process.exit(1);
  });
}
