import { loadRecords, withExpiry, matches, categoriesOf, renderCategories, NO_PACK } from '../shared/records.js';
import { fieldList } from '../../utils/dom.js';

/**
 * Announcements and events (README 6.8). Every notice shows its dates, and an expired one is kept
 * in the list but marked, so an old notice is never mistaken for a current one.
 */
const SEARCH_FIELDS = ['title', 'body', 'category', 'office'];

export default {
  title: 'Announcements',

  render() {
    return `
      <div class="container">
        <h1>Announcements</h1>
        <p>Verified campus notices, newest first. Each one shows when it was published and how long it applies.</p>
        <div class="notice" id="state" role="status" hidden></div>
        <div class="filters">
          <label class="sr-only" for="ann-search">Search announcements</label>
          <input id="ann-search" type="search" placeholder="Search announcements…" autocomplete="off" />
          <div class="chip-list" id="ann-categories"></div>
        </div>
        <p class="hint" id="ann-count"></p>
        <div class="record-list" id="ann-list"></div>
      </div>`;
  },

  async mount(root) {
    const state = root.querySelector('#state');
    const list = root.querySelector('#ann-list');
    const count = root.querySelector('#ann-count');
    const search = root.querySelector('#ann-search');
    const categoryHost = root.querySelector('#ann-categories');

    const { installed, records } = await loadRecords('announcements');
    const announcements = withExpiry(records);
    const categories = categoriesOf(announcements);
    let category = null;

    if (!installed || !announcements.length) {
      state.hidden = false;
      state.textContent = installed
        ? 'The installed knowledge pack has no verified announcements yet.'
        : NO_PACK;
      search.disabled = true;
    }

    function card(item) {
      const article = document.createElement('article');
      article.className = 'card record-card';
      if (item.expired) article.dataset.expired = 'true';

      const heading = document.createElement('h2');
      heading.textContent = item.title;
      article.append(heading);

      const badges = document.createElement('p');
      badges.className = 'badge-row';
      if (item.category) {
        const category = document.createElement('span');
        category.className = 'badge';
        category.textContent = item.category;
        badges.append(category);
      }
      if (item.expired) {
        const expired = document.createElement('span');
        expired.className = 'badge';
        expired.dataset.kind = 'warn';
        expired.textContent = 'Expired';
        badges.append(expired);
      }
      if (badges.childElementCount) article.append(badges);

      if (item.body) {
        const body = document.createElement('p');
        body.textContent = item.body;
        article.append(body);
      }

      article.append(
        fieldList([
          ['Published', item.publicationDate],
          ['Applies from', item.effectiveDate],
          [item.expired ? 'Expired on' : 'Applies until', item.expirationDate],
          ['Responsible office', item.office],
          ['Official source', item.source],
          ['Last verified', item.lastVerified],
        ])
      );
      return article;
    }

    function renderList() {
      const shown = announcements.filter(
        (item) => (!category || item.category === category) && matches(item, search.value, SEARCH_FIELDS)
      );
      list.textContent = '';
      for (const item of shown) list.append(card(item));

      if (!announcements.length) count.textContent = '';
      else if (!shown.length) count.textContent = 'Nothing matched that search. Try a shorter word, or clear the filters.';
      else {
        const expired = shown.filter((item) => item.expired).length;
        count.textContent = `${shown.length} of ${announcements.length} notices${expired ? `, ${expired} expired` : ''}.`;
      }
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
