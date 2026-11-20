import { loadRecords, currentOnly, matches, categoriesOf, renderCategories, NO_PACK } from '../shared/records.js';
import { fieldList } from '../../utils/dom.js';

/**
 * Campus map (README 6.5). The campus image and its markers both come from the installed pack, so
 * the map works with no internet and no map-tile provider.
 *
 * Markers are buttons placed by percentage coordinates, and the same places are listed as text
 * beside the image, so the page is usable by keyboard and without seeing the picture.
 */
const SEARCH_FIELDS = ['name', 'category', 'description', 'accessibility'];

const MIME = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
};

/** The pack stores the image as bytes; the page needs a URL for it. */
function imageUrl(assets) {
  const name = Object.keys(assets ?? {}).find((file) => MIME[file.split('.').pop()?.toLowerCase()]);
  if (!name) return null;
  const type = MIME[name.split('.').pop().toLowerCase()];
  return URL.createObjectURL(new Blob([assets[name]], { type }));
}

let objectUrl = null;

export default {
  title: 'Campus Map',

  render() {
    return `
      <div class="container">
        <h1>Campus Map</h1>
        <p>Buildings, offices and facilities as the campus has mapped them. The map and its markers are stored on your device, so it works offline.</p>
        <div class="notice" id="state" role="status" hidden></div>
        <div class="filters">
          <label class="sr-only" for="map-search">Search places</label>
          <input id="map-search" type="search" placeholder="Search a building or facility…" autocomplete="off" />
          <div class="chip-list" id="map-categories"></div>
        </div>
        <div class="map-layout">
          <div class="map-figure" id="map-figure" hidden>
            <img id="map-image" alt="Campus map. The places on it are also listed beside this image." />
            <div class="map-markers" id="map-markers"></div>
          </div>
          <div>
            <p class="hint" id="map-count"></p>
            <div class="record-list map-places" id="map-list"></div>
          </div>
        </div>
      </div>`;
  },

  async mount(root) {
    const state = root.querySelector('#state');
    const figure = root.querySelector('#map-figure');
    const image = root.querySelector('#map-image');
    const markerHost = root.querySelector('#map-markers');
    const list = root.querySelector('#map-list');
    const count = root.querySelector('#map-count');
    const search = root.querySelector('#map-search');
    const categoryHost = root.querySelector('#map-categories');

    const { installed, records, assets } = await loadRecords('places');
    const places = currentOnly(records);
    const categories = categoriesOf(places);
    let category = null;
    let selected = null;

    objectUrl = imageUrl(assets);
    if (objectUrl) {
      image.src = objectUrl;
      figure.hidden = false;
    }

    const notices = [];
    if (!installed) notices.push(NO_PACK);
    else if (!places.length) notices.push('The installed knowledge pack has no verified places yet.');
    else if (!objectUrl) notices.push('The installed pack has no campus image, so the places are listed as text only.');
    if (notices.length) {
      state.hidden = false;
      state.textContent = notices.join(' ');
    }
    if (!places.length) search.disabled = true;

    function card(place) {
      const article = document.createElement('article');
      article.className = 'card record-card';
      article.id = `place-${place.id}`;
      if (place.id === selected) article.dataset.selected = 'true';

      const heading = document.createElement('h2');
      heading.textContent = place.name;
      article.append(heading);

      if (place.description) {
        const description = document.createElement('p');
        description.textContent = place.description;
        article.append(description);
      }

      article.append(
        fieldList([
          ['Category', place.category],
          ['Accessibility', place.accessibility],
          ['Official source', place.source],
          ['Last verified', place.lastVerified],
        ])
      );
      return article;
    }

    function marker(place) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-marker';
      button.style.left = `${place.x}%`;
      button.style.top = `${place.y}%`;
      button.title = place.name;
      button.setAttribute('aria-label', place.name);
      button.setAttribute('aria-pressed', String(place.id === selected));
      // The name shows on hover, on keyboard focus and while selected, so the map stays readable.
      const label = document.createElement('span');
      label.className = 'map-marker-label';
      label.textContent = place.name;
      button.append(label);
      if (place.id === selected) button.dataset.selected = 'true';
      button.addEventListener('click', () => {
        selected = place.id === selected ? null : place.id;
        renderPlaces();
        if (selected) root.querySelector(`#place-${CSS.escape(place.id)}`)?.scrollIntoView({ block: 'nearest' });
      });
      return button;
    }

    function renderPlaces() {
      const shown = places.filter(
        (place) => (!category || place.category === category) && matches(place, search.value, SEARCH_FIELDS)
      );
      markerHost.textContent = '';
      list.textContent = '';
      for (const place of shown) {
        if (objectUrl) markerHost.append(marker(place));
        list.append(card(place));
      }

      if (!places.length) count.textContent = '';
      else if (!shown.length) count.textContent = 'Nothing matched that search. Try a shorter word, or clear the filters.';
      else count.textContent = `${shown.length} of ${places.length} places.`;
    }

    function renderFilters() {
      renderCategories(categoryHost, categories, category, (picked) => {
        category = picked;
        renderFilters();
        renderPlaces();
      });
    }

    search.addEventListener('input', renderPlaces);
    renderFilters();
    renderPlaces();
  },

  unmount() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  },
};
