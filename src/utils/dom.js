/** Escape text for safe insertion into HTML. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Format a size given in megabytes, e.g. 700 -> "700 MB", 1800 -> "1.8 GB". */
export function formatMB(mb) {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Format a byte count for display. */
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * A label/value list for a record's fields. Values are publisher text, so they go in as
 * textContent. Empty values are skipped, because a campus will not have every field for every
 * entry. An array value becomes a bulleted list.
 */
export function fieldList(pairs) {
  const list = document.createElement('dl');
  list.className = 'field-list';
  for (const [label, value] of pairs) {
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    if (empty) continue;

    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    if (Array.isArray(value)) {
      const items = document.createElement('ul');
      for (const entry of value) {
        const item = document.createElement('li');
        item.textContent = String(entry);
        items.append(item);
      }
      detail.append(items);
    } else {
      detail.textContent = String(value);
    }
    list.append(term, detail);
  }
  return list;
}
