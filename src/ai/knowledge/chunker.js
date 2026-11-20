/**
 * Turns a pack document into retrievable chunks: one per section, and long sections split on
 * paragraph boundaries so a chunk still fits the small models' context window.
 */
const MAX_CHARS = 800;

function splitLong(text) {
  const parts = [];
  let current = '';
  for (const para of text.split(/\n\s*\n/)) {
    const piece = para.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > MAX_CHARS) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** `document` is a pack document: { id, title, sections: [{ id, heading, text }] }. */
export function chunk(document) {
  const chunks = [];
  for (const section of document.sections ?? []) {
    const pieces = section.text.length > MAX_CHARS ? splitLong(section.text) : [section.text.trim()];
    pieces.forEach((text, i) => {
      if (!text) return;
      chunks.push({
        docId: document.id,
        title: document.title,
        sectionId: pieces.length > 1 ? `${section.id}-${i + 1}` : section.id,
        heading: section.heading,
        text,
      });
    });
  }
  return chunks;
}
