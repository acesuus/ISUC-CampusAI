import { getTheme, setTheme } from '../../services/ThemeService.js';
import { checkCompatibility } from '../../services/CompatibilityService.js';
import { modelManager } from '../../ai/engine/ModelManager.js';
import { knowledgeBase, packInstaller } from '../../ai/knowledge/KnowledgeBase.js';
import { conversation } from '../../ai/session.js';
import { ChatStore } from '../../storage/ChatStore.js';
import { ChecklistStore } from '../../storage/ChecklistStore.js';
import { storage } from '../../storage/db.js';
import { MODEL_CATALOG, getModel, resolveVramMB } from '../../ai/engine/catalog.js';
import { formatBytes, formatMB, escapeHtml } from '../../utils/dom.js';

let unsubscribe = null;

export default {
  title: 'Settings',

  render() {
    const theme = getTheme();
    const opt = (v, label) => `<option value="${v}"${theme === v ? ' selected' : ''}>${label}</option>`;
    return `
      <div class="container">
        <h1>Settings</h1>
        <div class="settings-list">
          <div class="setting-row">
            <div><div class="label">Theme</div><div class="hint">Light, dark, or follow your device.</div></div>
            <select id="theme-select" aria-label="Theme">
              ${opt('system', 'System')}${opt('light', 'Light')}${opt('dark', 'Dark')}
            </select>
          </div>
          <div class="setting-row">
            <div><div class="label">Knowledge pack</div><div class="hint" id="pack">Checking…</div></div>
            <div class="row-actions">
              <button class="btn btn-sm" type="button" id="pack-install" hidden>Install</button>
              <button class="btn btn-sm" type="button" id="pack-clear" hidden>Remove pack</button>
            </div>
          </div>
          <div class="setting-row">
            <div><div class="label">Chat history</div><div class="hint" id="history-hint">Checking…</div></div>
            <div class="row-actions">
              <button class="btn btn-sm" type="button" id="clear-history">Clear chat history</button>
            </div>
          </div>
          <div class="setting-row">
            <div><div class="label">Device compatibility</div><div class="hint" id="compat">Checking…</div></div>
          </div>
          <div class="setting-row">
            <div><div class="label">Local storage</div><div class="hint" id="storage">Checking…</div></div>
          </div>
        </div>

        <section class="section">
          <h2>AI model</h2>
          <p class="hint" id="model-state"></p>
          <div class="settings-list" id="model-list">Loading models…</div>
        </section>

        <section class="section">
          <h2>Stored data</h2>
          <p class="hint">This removes your conversations, the knowledge pack and your preferences from this browser. Downloaded AI models are removed one at a time above.</p>
          <button class="btn btn-sm" type="button" id="clear-all">Clear app data</button>
        </section>

        <section class="section">
          <h2>Privacy</h2>
          <p>CampusAI is designed to keep questions and conversation history on your device. It does not require an account or personal records. Local processing does not make a shared or compromised device safe, so avoid entering sensitive information on shared computers.</p>
        </section>
      </div>`;
  },

  mount(root) {
    root.querySelector('#theme-select').addEventListener('change', (e) => setTheme(e.target.value));

    const chatStore = new ChatStore({ connect: storage });
    const historyHint = root.querySelector('#history-hint');

    async function renderHistoryCount() {
      try {
        const items = await chatStore.list();
        historyHint.textContent = items.length
          ? `${items.length} saved conversation${items.length === 1 ? '' : 's'} on this device. Nothing is sent to a server.`
          : 'No saved conversations on this device.';
      } catch {
        historyHint.textContent = 'This browser cannot save conversations, so none are stored.';
      }
    }

    root.querySelector('#clear-history').addEventListener('click', async () => {
      if (!window.confirm('Delete all saved conversations? This cannot be undone.')) return;
      try {
        await chatStore.clear();
      } catch {
        /* nothing was stored, or storage is unavailable: the chat below is still reset */
      }
      conversation.clear();
      renderHistoryCount();

    root.querySelector('#clear-all').addEventListener('click', async () => {
      if (!window.confirm('Remove your conversations, the knowledge pack and your preferences from this browser? Downloaded AI models are kept; remove those one at a time above.')) return;
      await Promise.allSettled([chatStore.clear(), packInstaller.remove(), new ChecklistStore({ connect: storage }).clear()]);
      knowledgeBase.reset();
      try {
        for (const key of ['campusai.theme', 'campusai.model', 'campusai.pack']) localStorage.removeItem(key);
      } catch {
        /* nothing stored there */
      }
      // Drop the cached app shell too, so the next visit fetches the current version.
      try {
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      } catch {
        /* no service worker cache in this browser or in development */
      }
      window.location.reload();
    });
    });

    renderHistoryCount();

    root.querySelector('#clear-all').addEventListener('click', async () => {
      if (!window.confirm('Remove your conversations, the knowledge pack and your preferences from this browser? Downloaded AI models are kept; remove those one at a time above.')) return;
      await Promise.allSettled([chatStore.clear(), packInstaller.remove(), new ChecklistStore({ connect: storage }).clear()]);
      knowledgeBase.reset();
      try {
        for (const key of ['campusai.theme', 'campusai.model', 'campusai.pack']) localStorage.removeItem(key);
      } catch {
        /* nothing stored there */
      }
      // Drop the cached app shell too, so the next visit fetches the current version.
      try {
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      } catch {
        /* no service worker cache in this browser or in development */
      }
      window.location.reload();
    });

    const packHint = root.querySelector('#pack');
    const packInstall = root.querySelector('#pack-install');
    const packClear = root.querySelector('#pack-clear');

    /** What else the installed pack carries: the records the campus pages render. */
    function contents() {
      const counts = Object.entries(knowledgeBase.manifest?.recordCounts ?? {}).filter(([, n]) => n > 0);
      return counts.length ? `, ${counts.map(([kind, n]) => `${n} ${kind}`).join(', ')}` : '';
    }

    async function renderPack(message = '') {
      const state = await packInstaller.check();
      const { installed, available, upToDate, documentCount } = state;
      if (installed) await knowledgeBase.load();

      let text;
      if (installed && upToDate !== false) {
        text = `Version ${installed} installed: ${documentCount} documents${contents()}. Only verified entries are used.`;
      } else if (installed) {
        text = `Version ${installed} installed. Version ${available} is available.`;
      } else if (state.lost) {
        text = 'Your browser removed the saved knowledge pack. Install it again to use ISU documents offline.';
      } else if (available) {
        text = `Not installed. Version ${available} can be installed now.`;
      } else {
        text = 'Not installed. ISU documents are added once the campus has verified them, so ISU-specific answers cannot be confirmed yet.';
      }
      packHint.textContent = message ? `${text} ${message}` : text;

      packInstall.hidden = !available || upToDate === true;
      packInstall.textContent = installed ? 'Update' : 'Install';
      packClear.hidden = !installed;
    }

    packInstall.addEventListener('click', async () => {
      packInstall.disabled = true;
      packInstall.textContent = 'Checking…';
      const result = await packInstaller.install();
      knowledgeBase.reset();
      packInstall.disabled = false;
      await renderPack(result.ok ? '' : result.reason);
    });

    packClear.addEventListener('click', async () => {
      if (!window.confirm('Remove the installed knowledge pack? ISU-specific answers will stop being available until you install it again.')) return;
      await packInstaller.remove();
      knowledgeBase.reset();
      await renderPack();
    });

    renderPack();

    checkCompatibility().then((c) => {
      root.querySelector('#compat').textContent = c.webgpu
        ? 'WebGPU available. This device can likely run on-device AI.'
        : `WebGPU unavailable. ${c.webgpuReason}`;
      const s = c.storage;
      root.querySelector('#storage').textContent =
        s.quota == null
          ? 'Storage estimate not available in this browser.'
          : `${formatBytes(s.usage)} used of about ${formatBytes(s.quota)}. Persistent: ${s.persisted ? 'yes' : 'no'}.`;
    });

    const list = root.querySelector('#model-list');
    const stateEl = root.querySelector('#model-state');
    let token = 0;
    let prev = { status: null, modelKey: null };

    async function renderList() {
      const mine = ++token;
      const compat = await modelManager.getCompat();
      const downloaded = await Promise.all(MODEL_CATALOG.map((m) => modelManager.isCached(m.key)));
      if (mine !== token) return; // a newer render superseded this one

      const s = modelManager.state;
      const busy = s.status === 'downloading' || s.status === 'loading';
      list.innerHTML = MODEL_CATALOG.map((m, i) => {
        const selected = m.key === s.modelKey;
        const key = escapeHtml(m.key);
        return `
          <div class="setting-row">
            <div>
              <div class="label">${escapeHtml(m.name)}
                ${selected ? '<span class="badge" data-kind="ok">In use</span>' : ''}
                ${downloaded[i] ? '<span class="badge">Downloaded</span>' : ''}
              </div>
              <div class="hint">${escapeHtml(m.note)} Download about ${formatMB(m.approxDownloadMB)} (estimate) · GPU memory about ${formatMB(resolveVramMB(m, compat.shaderF16))} · License: ${escapeHtml(m.license)}.${m.licenseNote ? ` ${escapeHtml(m.licenseNote)}` : ''}</div>
            </div>
            <div class="row-actions">
              ${selected ? '' : `<button class="btn btn-sm" type="button" data-action="select" data-key="${key}"${busy ? ' disabled' : ''}>Use this model</button>`}
              ${downloaded[i] ? `<button class="btn btn-sm" type="button" data-action="remove" data-key="${key}"${selected && busy ? ' disabled' : ''}>Remove download</button>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    function renderState(s) {
      const m = getModel(s.modelKey);
      const text = {
        idle: 'not loaded',
        downloading: `downloading ${Math.round(s.progress * 100)}%`,
        loading: 'loading…',
        ready: 'ready',
        error: s.error ?? 'error',
      }[s.status];
      stateEl.innerHTML =
        `Selected: ${escapeHtml(m.name)} · ${escapeHtml(text)}.` +
        (s.status === 'ready' ? '' : ' <a href="#/assistant">Open the AI Assistant</a> to download or load it.');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const key = btn.dataset.key;
      if (btn.dataset.action === 'select') {
        modelManager.select(key);
      } else if (btn.dataset.action === 'remove') {
        const m = getModel(key);
        if (!window.confirm(`Remove the downloaded files for ${m.name}? You will need to download it again to use it offline.`)) return;
        await modelManager.remove(key);
        renderList();
      }
    });

    unsubscribe = modelManager.subscribe((s) => {
      renderState(s);
      // Re-render the rows only when something structural changed, not on every progress tick.
      if (s.status !== prev.status || s.modelKey !== prev.modelKey) {
        prev = { status: s.status, modelKey: s.modelKey };
        renderList();
      }
    });
  },

  unmount() {
    unsubscribe?.();
    unsubscribe = null;
  },
};
