import { MODEL_CATALOG } from '../ai/engine/catalog.js';
import { escapeHtml } from '../utils/dom.js';

function placeholder(title, phase, text) {
  return {
    title,
    render() {
      return `
        <div class="container">
          <h1>${title}</h1>
          <p>${text}</p>
          <div class="notice">Planned for ${phase}. Content will only be published once verified by the responsible office.</div>
        </div>`;
    },
  };
}

export const campusMap = placeholder(
  'Campus Map',
  'Phase 5',
  'An interactive campus map using locally stored map data.'
);
export const guide = placeholder(
  'Student Guide',
  'Phase 5',
  'Academic, admission, enrollment, scholarship and document-request guides.'
);

export const about = {
  title: 'About',
  render() {
    const licenses = MODEL_CATALOG.map(
      (m) =>
        `<li><strong>${escapeHtml(m.name)}</strong>: ${escapeHtml(m.license)}.${m.licenseNote ? ` ${escapeHtml(m.licenseNote)}` : ''}</li>`
    ).join('');
    return `
      <div class="container">
        <h1>About CampusAI</h1>
        <p>CampusAI is an offline-first, on-device AI assistant for the Isabela State University – Cabagan Campus community.</p>
        <p>It is an information and assistance tool. It does not process enrollment, access student records, or make official decisions about admission, scholarships, or graduation.</p>
        <div class="notice" data-kind="ok">Project status: planning and prototyping (v0.1 foundation).</div>
        <section class="section">
          <h2>AI model licenses</h2>
          <p>The assistant runs an open AI model on your device. Each model has its own license:</p>
          <ul id="model-licenses">${licenses}</ul>
          <p class="hint">Models are downloaded once from public model hosting and then run locally. This list is informational and is not legal advice.</p>
        </section>
      </div>`;
  },
};
