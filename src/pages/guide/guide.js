import { loadRecords, currentOnly, matches, categoriesOf, renderCategories, NO_PACK } from '../shared/records.js';
import { fieldList } from '../../utils/dom.js';
import { ChecklistStore } from '../../storage/ChecklistStore.js';
import { storage } from '../../storage/db.js';

/**
 * Student Guide (README 6.2, 6.3, 6.6, 6.7, 6.9): academic, admission and enrollment, scholarship,
 * student life and document-request guides, grouped by the category the pack gives them.
 *
 * A guide may carry steps. Those become a checklist the student ticks off, saved on this device
 * only. It records what a student has done, and says so: it never implies the university has
 * admitted, enrolled or approved anybody.
 */
const SEARCH_FIELDS = ['title', 'category', 'purpose', 'requirements', 'office'];

const CHECKLIST_NOTE =
  'This checklist is yours and is saved only on this device. Ticking a box records what you have done. It does not mean the university has received, approved, admitted or enrolled anything.';

const checklists = new ChecklistStore({ connect: storage });

export default {
  title: 'Student Guide',

  render() {
    return `
      <div class="container">
        <h1>Student Guide</h1>
        <p>How campus procedures work: what each one is for, what to bring, which office handles it, and what it costs when a fee is officially documented.</p>
        <div class="notice" id="state" role="status" hidden></div>
        <div class="filters">
          <label class="sr-only" for="guide-search">Search guides</label>
          <input id="guide-search" type="search" placeholder="Search a procedure or document…" autocomplete="off" />
          <div class="chip-list" id="guide-categories"></div>
        </div>
        <p class="hint" id="guide-count"></p>
        <div class="record-list" id="guide-list"></div>
      </div>`;
  },

  async mount(root) {
    const state = root.querySelector('#state');
    const list = root.querySelector('#guide-list');
    const count = root.querySelector('#guide-count');
    const search = root.querySelector('#guide-search');
    const categoryHost = root.querySelector('#guide-categories');

    const { installed, records } = await loadRecords('guides');
    const guides = currentOnly(records);
    const categories = categoriesOf(guides);
    let category = null;

    if (!installed || !guides.length) {
      state.hidden = false;
      state.textContent = installed ? 'The installed knowledge pack has no verified guides yet.' : NO_PACK;
      search.disabled = true;
    }

    /** The steps of one guide, as tick boxes saved on this device. */
    function checklist(guide) {
      const section = document.createElement('div');
      section.className = 'checklist';

      const heading = document.createElement('h3');
      heading.textContent = 'Your checklist';
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = CHECKLIST_NOTE;
      section.append(heading, note);

      const failure = document.createElement('p');
      failure.className = 'hint';
      failure.hidden = true;
      section.append(failure);

      const boxes = [];
      for (const step of guide.steps) {
        const row = document.createElement('label');
        row.className = 'checklist-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.dataset.step = step.id;
        const text = document.createElement('span');
        text.textContent = step.text;
        row.append(box, text);
        section.append(row);
        boxes.push(box);

        box.addEventListener('change', async () => {
          try {
            await checklists.set(guide.id, step.id, box.checked);
            failure.hidden = true;
          } catch (err) {
            // The tick stays on screen, but the student must know it was not kept.
            failure.hidden = false;
            failure.textContent = `This tick could not be saved: ${err?.message ?? err}`;
          }
        });
      }

      checklists
        .get(guide.id)
        .then((ticked) => {
          for (const box of boxes) box.checked = ticked.has(box.dataset.step);
        })
        .catch(() => {
          failure.hidden = false;
          failure.textContent = 'Earlier ticks could not be read from this browser.';
        });

      return section;
    }

    function card(guide) {
      const article = document.createElement('article');
      article.className = 'card record-card';

      const heading = document.createElement('h2');
      heading.textContent = guide.title;
      article.append(heading);

      if (guide.category) {
        const badges = document.createElement('p');
        badges.className = 'badge-row';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = guide.category;
        badges.append(badge);
        article.append(badges);
      }

      if (guide.purpose) {
        const purpose = document.createElement('p');
        purpose.textContent = guide.purpose;
        article.append(purpose);
      }

      article.append(
        fieldList([
          ['Requirements', guide.requirements],
          ['Procedure', guide.procedure],
          ['Responsible office', guide.office],
          ['Fees', guide.fees],
          ['Processing time', guide.processingTime],
          ['Official reference', guide.reference ?? guide.source],
          ['Last verified', guide.lastVerified],
        ])
      );

      if (Array.isArray(guide.steps) && guide.steps.length) article.append(checklist(guide));
      return article;
    }

    function renderList() {
      const shown = guides.filter(
        (guide) => (!category || guide.category === category) && matches(guide, search.value, SEARCH_FIELDS)
      );
      list.textContent = '';
      for (const guide of shown) list.append(card(guide));

      if (!guides.length) count.textContent = '';
      else if (!shown.length) count.textContent = 'Nothing matched that search. Try a shorter word, or clear the filters.';
      else count.textContent = `${shown.length} of ${guides.length} guides.`;
    }

    function renderFilters() {
      renderCategories(categoryHost, categories, category, (picked) => {
        category = picked;
        renderFilters();
        renderList();
      });
    }

    search.addEventListener('input', renderList);
    renderFilters();
    renderList();
  },
};
