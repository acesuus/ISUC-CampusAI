import { packStore } from '../../ai/knowledge/KnowledgeBase.js';
import { isCurrent } from '../../ai/knowledge/KnowledgeBase.js';

/**
 * Shared loading and filtering for the campus pages (README 6.4 to 6.9).
 *
 * Every record comes from the installed knowledge pack, which was signature-checked before it was
 * stored, so the pages never fetch campus information themselves. Record text is still publisher
 * data rather than app code: pages put it on the screen with textContent, never as HTML.
 */
export const NO_PACK = 'No knowledge pack is installed, so there is no verified campus information to show yet. Open Settings to install one when the campus publishes it.';

const EMPTY = { installed: false, records: [], manifest: null, assets: {} };

export async function loadRecords(kind) {
  let row = null;
  try {
    row = await packStore.get('current');
  } catch {
    return EMPTY;
  }
  if (!row) return EMPTY;
  const records = Array.isArray(row.records?.[kind]) ? row.records[kind] : [];
  return { installed: true, records, manifest: row.manifest ?? null, assets: row.assets ?? {} };
}

/** Drop anything not verified, and anything whose expiry date has passed (README 8.5). */
export function currentOnly(records, today = new Date().toISOString().slice(0, 10)) {
  return records.filter((record) => isCurrent(record, today));
}

/**
 * Announcements are the exception README 6.8 asks for: an expired one is still listed, but marked,
 * so a student can tell current notices from old ones. Drafts are still dropped.
 */
export function withExpiry(records, today = new Date().toISOString().slice(0, 10)) {
  return records
    .filter((record) => record?.status === 'verified')
    .map((record) => ({ ...record, expired: Boolean(record.expirationDate && record.expirationDate < today) }))
    .sort((a, b) => Number(a.expired) - Number(b.expired) || String(b.publicationDate).localeCompare(String(a.publicationDate)));
}

/** Plain substring search over the named fields. Arrays are searched too (services, requirements). */
export function matches(record, query, fields) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => {
    const value = record[field];
    const text = Array.isArray(value) ? value.join(' ') : value;
    return typeof text === 'string' && text.toLowerCase().includes(needle);
  });
}

export function categoriesOf(records, field = 'category') {
  return [...new Set(records.map((r) => r[field]).filter((c) => typeof c === 'string' && c))].sort();
}

/** Category buttons shared by the campus pages. `selected` is null for "All". */
export function renderCategories(host, categories, selected, onPick) {
  host.textContent = '';
  if (categories.length < 2) return;
  for (const category of [null, ...categories]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = category ?? 'All';
    if (category === selected) chip.dataset.selected = 'true';
    chip.setAttribute('aria-pressed', String(category === selected));
    chip.addEventListener('click', () => onPick(category));
    host.append(chip);
  }
}
