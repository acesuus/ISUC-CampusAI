import { modelManager } from '../../ai/engine/ModelManager.js';
import { MODEL_CATALOG, getModel, resolveVramMB } from '../../ai/engine/catalog.js';
import { conversation } from '../../ai/session.js';
import { getQueryParam } from '../../app/router.js';
import { escapeHtml, formatMB } from '../../utils/dom.js';

const EXAMPLES = [
  'What is a prerequisite subject?',
  'What is object-oriented programming?',
  'Explain what a thesis is.',
  "Where is the Registrar's Office?",
];

let cleanup = [];

export default {
  title: 'AI Assistant',

  render() {
    const options = MODEL_CATALOG.map(
      (m) => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.name)} (about ${formatMB(m.approxDownloadMB)})</option>`
    ).join('');
    const chips = EXAMPLES.map(
      (q) => `<button type="button" class="chip" data-example="${escapeHtml(q)}">${escapeHtml(q)}</button>`
    ).join('');

    return `
      <div class="chat-layout">
        <aside class="chat-sidebar" id="chat-sidebar" aria-label="Conversation history">
          <button class="btn btn-sm sidebar-close" type="button" id="sidebar-close">Close</button>
          <button class="btn btn-primary" type="button" id="new-chat">New conversation</button>
          <h2>History</h2>
          <div class="notice" id="history-notice" role="status" hidden></div>
          <div class="history-list" id="history-list"></div>
        </aside>
        <div class="sidebar-scrim" id="sidebar-scrim"></div>

        <section class="chat-main" aria-label="Assistant">
          <div class="chat-status">
            <button class="btn btn-sm history-toggle" type="button" id="history-toggle" aria-controls="chat-sidebar" aria-expanded="false">History</button>
            <span id="model-status"></span>
            <span id="gpu-status">Checking device…</span>
          </div>

          <div class="model-setup" id="model-setup">
            <h2>Set up the on-device assistant</h2>
            <p>CampusAI runs an AI model inside your browser. Download it once, then it works offline. Models are hundreds of megabytes, so use Wi-Fi if you can.</p>
            <div class="setup-row">
              <label for="model-select">Model</label>
              <select id="model-select">${options}</select>
            </div>
            <p class="hint" id="model-detail"></p>
            <div class="notice" id="setup-notice" role="status" hidden></div>
            <div id="progress-wrap" hidden>
              <progress id="model-progress" max="1" aria-label="Model progress"></progress>
              <p class="hint" id="progress-text"></p>
            </div>
            <button class="btn btn-primary" type="button" id="model-action" disabled>Checking device…</button>
          </div>

          <div class="chat-messages" id="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
            <div class="chat-empty" id="chat-empty">
              <h2>Ask CampusAI</h2>
              <p id="empty-text"></p>
              <div class="chip-list chip-list-center">${chips}</div>
              <div class="notice">
                CampusAI cannot confirm ISU-specific facts yet. The verified knowledge base arrives in a later phase,
                so treat any ISU-specific answer as unverified and confirm it with the responsible office.
              </div>
            </div>
          </div>

          <form class="composer" id="composer">
            <label class="sr-only" for="prompt">Message</label>
            <textarea id="prompt" rows="1" disabled></textarea>
            <button class="btn btn-primary" type="submit" id="send" disabled>Send</button>
            <button class="btn" type="button" id="stop" hidden>Stop</button>
          </form>
          <p class="composer-note">CampusAI can make mistakes. Confirm ISU-specific details with the responsible office.</p>
        </section>
      </div>`;
  },

  mount(root) {
    const $ = (selector) => root.querySelector(selector);
    const el = {
      sidebar: $('#chat-sidebar'),
      historyToggle: $('#history-toggle'),
      newChat: $('#new-chat'),
      sidebarClose: $('#sidebar-close'),
      historyList: $('#history-list'),
      historyNotice: $('#history-notice'),
      scrim: $('#sidebar-scrim'),
      modelStatus: $('#model-status'),
      gpuStatus: $('#gpu-status'),
      setup: $('#model-setup'),
      select: $('#model-select'),
      detail: $('#model-detail'),
      notice: $('#setup-notice'),
      progressWrap: $('#progress-wrap'),
      progress: $('#model-progress'),
      progressText: $('#progress-text'),
      action: $('#model-action'),
      list: $('#chat-messages'),
      empty: $('#chat-empty'),
      emptyText: $('#empty-text'),
      composer: $('#composer'),
      prompt: $('#prompt'),
      send: $('#send'),
      stop: $('#stop'),
    };

    let compat = null; // set once the device check finishes
    let cached = false; // is the selected model already downloaded?
    let model = modelManager.state;
    let chat = { messages: conversation.messages, busy: conversation.busy };
    const rendered = new Map(); // message id -> view

    const on = (target, type, handler) => {
      target.addEventListener(type, handler);
      cleanup.push(() => target.removeEventListener(type, handler));
    };

    /* ---------- model setup panel ---------- */

    function renderStatus() {
      const m = getModel(model.modelKey);
      const text = {
        idle: 'not loaded',
        downloading: `downloading ${Math.round(model.progress * 100)}%`,
        loading: 'loading…',
        ready: 'ready, running on this device',
        error: 'error',
      }[model.status];
      el.modelStatus.textContent = `Model: ${m.name} · ${text}`;
    }

    function renderGpu() {
      el.gpuStatus.textContent = !compat
        ? 'Checking device…'
        : compat.webgpu
          ? 'WebGPU: available'
          : 'WebGPU: unavailable';
    }

    function renderSetup() {
      const m = getModel(model.modelKey);
      const busy = model.status === 'downloading' || model.status === 'loading';
      el.setup.hidden = model.status === 'ready';
      el.select.value = model.modelKey;
      el.select.disabled = busy;

      const license = `License: ${m.license}.${m.licenseNote ? ` ${m.licenseNote}` : ''}`;
      el.detail.textContent = compat
        ? `${m.note} Download: about ${formatMB(m.approxDownloadMB)} (estimate). GPU memory needed: about ${formatMB(resolveVramMB(m, compat.shaderF16))}. ${license}`
        : `${m.note} ${license}`;

      const offlineBlocked = !cached && navigator.onLine === false;
      let notice = '';
      let kind = 'warn';
      if (compat && !compat.webgpu) {
        kind = 'error';
        notice = `This device cannot run on-device AI. ${compat.webgpuReason} The other pages still work, and CampusAI never switches to a cloud AI service.`;
      } else if (model.status === 'error' && model.error) {
        kind = 'error';
        notice = model.error;
      } else if (offlineBlocked) {
        notice = 'You are offline and this model has not been downloaded yet. Connect to the internet once to download it.';
      }
      el.notice.hidden = !notice;
      el.notice.textContent = notice;
      el.notice.dataset.kind = kind;

      el.progressWrap.hidden = !busy;
      if (busy) {
        if (model.progress > 0) el.progress.value = model.progress;
        else el.progress.removeAttribute('value'); // indeterminate until real progress arrives
        el.progressText.textContent = model.text;
      }

      let label;
      if (!compat) label = 'Checking device…';
      else if (model.status === 'downloading') label = 'Downloading…';
      else if (model.status === 'loading') label = 'Loading…';
      else if (model.status === 'error') label = 'Try again';
      else if (cached) label = 'Load model';
      else label = `Download model (about ${formatMB(m.approxDownloadMB)})`;
      el.action.textContent = label;
      el.action.disabled = !compat || !compat.webgpu || busy || offlineBlocked;
    }

    function renderComposer() {
      const ready = model.status === 'ready';
      el.prompt.disabled = !ready;
      el.prompt.placeholder = ready ? 'Ask a campus question…' : 'Set up the model first';
      el.send.disabled = !ready;
      el.send.hidden = chat.busy;
      el.stop.hidden = !chat.busy;
      el.newChat.disabled = chat.busy || chat.messages.length === 0;
      el.emptyText.textContent = ready
        ? 'Ask about enrollment, offices, scholarships or campus facilities, or try an example.'
        : 'Set up the model above, then ask your question.';
    }

    async function refreshCached() {
      cached = await modelManager.isCached(modelManager.state.modelKey);
      renderSetup();
    }

    /* ---------- messages ---------- */

    function makeButton(label, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }

    function createMessage(m) {
      const wrap = document.createElement('div');
      wrap.className = `msg-wrap msg-wrap-${m.role}`;
      const body = document.createElement('div');
      body.className = `msg msg-${m.role}`;
      wrap.append(body);
      const view = { root: wrap, body, m };

      if (m.role === 'assistant') {
        view.sources = document.createElement('div');
        view.sources.className = 'msg-sources';
        view.note = document.createElement('div');
        view.note.className = 'msg-note';
        view.actions = document.createElement('div');
        view.actions.className = 'msg-actions';
        view.copy = makeButton('Copy', async () => {
          try {
            await navigator.clipboard.writeText(view.m.content);
            view.copy.textContent = 'Copied';
          } catch {
            view.copy.textContent = 'Copy failed';
          }
          setTimeout(() => {
            view.copy.textContent = 'Copy';
          }, 1500);
        });
        view.regen = makeButton('Regenerate', () => conversation.regenerate());
        view.actions.append(view.copy, view.regen);
        wrap.append(view.sources, view.note, view.actions);
      }
      return view;
    }

    function updateMessage(view, m, isLast) {
      view.m = m;
      const generating = chat.busy && isLast;
      const waiting = m.role === 'assistant' && !m.content && !m.error && generating;
      // textContent, never innerHTML: model output is untrusted text.
      view.body.textContent = waiting ? 'Thinking…' : m.content;
      view.body.classList.toggle('is-thinking', waiting);
      if (m.role !== 'assistant') return;

      view.body.hidden = !m.content && !waiting;

      // The sections that were put in the prompt, so the student can check the answer.
      const cites = m.citations ?? [];
      view.sources.textContent = cites.length
        ? `Sources: ${cites.map((c, i) => `[${i + 1}] ${c.title} — ${c.heading}`).join('; ')}`
        : '';
      view.sources.hidden = cites.length === 0 || !m.content;

      const notes = [];
      if (m.error) notes.push(`Something went wrong: ${m.error}`);
      if (m.stopped) notes.push('Stopped.');
      if (m.truncated) notes.push('Reached the length limit. Ask me to continue.');
      view.note.textContent = notes.join(' ');
      view.note.hidden = notes.length === 0;
      view.actions.hidden = generating;
      view.copy.hidden = !m.content;
      view.regen.hidden = !isLast;
    }

    /** The saved conversations on this device. Titles are student text, so they go in as textContent. */
    async function renderHistory() {
      const items = await conversation.list();
      el.historyList.textContent = '';

      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'No saved conversations yet. They stay on this device only.';
        el.historyList.append(empty);
      }

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'history-row';
        if (item.id === conversation.id) row.dataset.current = 'true';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'history-open';
        open.textContent = item.title || 'Untitled conversation';
        if (item.id === conversation.id) open.setAttribute('aria-current', 'true');
        open.addEventListener('click', async () => {
          if (await conversation.open(item.id)) setDrawer(false);
          renderHistory();
        });

        const name = item.title || 'this conversation';
        const del = makeButton('Delete', async () => {
          if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
          await conversation.remove(item.id);
          renderHistory();
        });
        del.setAttribute('aria-label', `Delete ${name}`);

        row.append(open, del);
        el.historyList.append(row);
      }

      el.historyNotice.textContent = conversation.storeError ?? '';
      el.historyNotice.dataset.kind = 'warn';
      el.historyNotice.hidden = !conversation.storeError;
    }

    function renderMessages() {
      const { messages, busy } = chat;
      el.list.setAttribute('aria-busy', String(busy));
      const nearBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 80;

      const ids = new Set(messages.map((m) => m.id));
      for (const [id, view] of rendered) {
        if (!ids.has(id)) {
          view.root.remove();
          rendered.delete(id);
        }
      }
      messages.forEach((m, i) => {
        let view = rendered.get(m.id);
        if (!view) {
          view = createMessage(m);
          rendered.set(m.id, view);
          el.list.append(view.root);
        }
        updateMessage(view, m, i === messages.length - 1);
      });
      el.empty.hidden = messages.length > 0;
      if (nearBottom) el.list.scrollTop = el.list.scrollHeight;
    }

    /* ---------- composer ---------- */

    function autosize() {
      el.prompt.style.height = 'auto';
      el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 160)}px`;
    }

    function submit() {
      if (model.status !== 'ready' || chat.busy) return;
      const text = el.prompt.value.trim();
      if (!text) return;
      el.prompt.value = '';
      autosize();
      conversation.send(text);
      el.list.scrollTop = el.list.scrollHeight;
    }

    /* ---------- events ---------- */

    function setDrawer(open) {
      el.sidebar.dataset.open = String(open);
      el.scrim.dataset.open = String(open);
      el.historyToggle.setAttribute('aria-expanded', String(open));
    }
    // Do not pop the on-screen keyboard on touch devices.
    const canAutoFocus = () => !matchMedia('(pointer: coarse)').matches;

    on(el.historyToggle, 'click', () => {
      const open = el.sidebar.dataset.open !== 'true';
      setDrawer(open);
      if (open) el.sidebarClose.focus();
    });
    on(el.sidebarClose, 'click', () => {
      setDrawer(false);
      el.historyToggle.focus();
    });
    on(el.scrim, 'click', () => setDrawer(false));
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && el.sidebar.dataset.open === 'true') {
        setDrawer(false);
        el.historyToggle.focus();
      }
    });
    on(el.newChat, 'click', () => {
      conversation.clear();
      setDrawer(false);
      renderHistory();
      if (canAutoFocus()) el.prompt.focus();
    });
    on(el.select, 'change', () => {
      modelManager.select(el.select.value);
      refreshCached();
    });
    on(el.action, 'click', () => modelManager.load());
    on(el.stop, 'click', () => conversation.stop());
    on(el.composer, 'submit', (e) => {
      e.preventDefault();
      submit();
    });
    on(el.prompt, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    on(el.prompt, 'input', autosize);
    on(root, 'click', (e) => {
      const chip = e.target.closest('[data-example]');
      if (!chip) return;
      el.prompt.value = chip.dataset.example;
      autosize();
      if (!el.prompt.disabled) el.prompt.focus();
    });
    on(window, 'online', renderSetup);
    on(window, 'offline', renderSetup);

    /* ---------- state ---------- */

    const prefill = getQueryParam('q');
    if (prefill) {
      el.prompt.value = prefill;
      autosize();
    }

    cleanup.push(
      modelManager.subscribe((s) => {
        const wasReady = model.status === 'ready';
        model = s;
        renderStatus();
        renderSetup();
        renderComposer();
        if (!wasReady && s.status === 'ready') {
          cached = true;
          if (canAutoFocus()) el.prompt.focus();
        }
      })
    );
    cleanup.push(
      conversation.subscribe((messages, busy) => {
        const finished = chat.busy && !busy; // a reply just ended, so the save has happened
        chat = { messages, busy };
        renderMessages();
        renderComposer();
        if (finished) renderHistory();
      })
    );

    modelManager.getCompat().then((c) => {
      compat = c;
      renderGpu();
      renderSetup();
    });
    renderGpu();
    refreshCached();
    // Reopen the most recent conversation, then list what is saved.
    conversation.restore().then(renderHistory);
  },

  unmount() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  },
};
