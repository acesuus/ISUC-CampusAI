import { loadRecords, currentOnly, matches, categoriesOf, renderCategories, NO_PACK } from '../shared/records.js';
import { fieldList } from '../../utils/dom.js';

/** Campus Directory (README 6.4): offices, departments, buildings and the services they provide. */
const SEARCH_FIELDS = ['name', 'unit', 'description', 'location', 'services', 'procedures'];

export default {
  title: 'Campus Directory',

  render() {
    return `
      <div class="container">
        <h1>Campus Directory</h1>
        <p>Offices, departments and services, with the location and contact details the responsible office has verified.</p>
        <div class="notice" id="state" role="status" hidden></div>
        <div class="filters">
          <label class="sr-only" for="directory-search">Search the directory</label>
          <input id="directory-search" type="search" placeholder="Search an office or a service…" autocomplete="off" />
          <div class="chip-list" id="directory-categories"></div>
        </div>
        <p class="hint" id="directory-count"></p>
        <div class="record-list" id="directory-list"></div>
      </div>`;
  },

  async mount(root) {
    const state = root.querySelector('#state');
    const list = root.querySelector('#directory-list');
    const count = root.querySelector('#directory-count');
    const search = root.querySelector('#directory-search');
    const categoryHost = root.querySelector('#directory-categories');

    const { installed, records } = await loadRecords('offices');
    const offices = currentOnly(records);
    const categories = categoriesOf(offices, 'unit');
    let category = null;

    if (!installed || !offices.length) {
      state.hidden = false;
      state.textContent = installed
        ? 'The installed knowledge pack has no verified directory entries yet.'
        : NO_PACK;
      search.disabled = true;
    }

    function card(office) {
      const item = document.createElement('article');
      item.className = 'card record-card';

      const heading = document.createElement('h2');
      heading.textContent = office.name;
      item.append(heading);

      if (office.description) {
        const description = document.createElement('p');
        description.textContent = office.description;
        item.append(description);
      }

      item.append(
        fieldList([
          ['Responsible unit', office.unit],
          ['Location', office.location],
          ['Open', office.schedule],
          ['Contact', office.contact],
          ['Services', office.services],
          ['Procedures', office.procedures],
          ['Official source', office.source],
          ['Last verified', office.lastVerified],
        ])
      );
      return item;
    }

    function renderList() {
      const shown = offices.filter(
        (office) => (!category || office.unit === category) && matches(office, search.value, SEARCH_FIELDS)
      );
      list.textContent = '';
      for (const office of shown) list.append(card(office));

      if (!offices.length) count.textContent = '';
      else if (!shown.length) count.textContent = 'Nothing matched that search. Try a shorter word, or clear the filters.';
      else count.textContent = `${shown.length} of ${offices.length} entries.`;
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
