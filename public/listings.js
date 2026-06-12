/* Listings page JS */

let currentOffset = 0;
const LIMIT = 18;
let totalCount = 0;

// ── Nav update ────────────────────────────────────────
(function() {
  const user = Auth?.getUser?.();
  const cta  = document.getElementById('nav-cta');
  if (user && cta) {
    cta.innerHTML = `<a href="/dashboard.html" class="btn-ghost">My Dashboard</a><a href="/post-ad.html" class="btn-primary">+ List Business</a>`;
  }
  const ham = document.getElementById('hamburger');
  const mob = document.getElementById('mobile-menu');
  ham?.addEventListener('click', () => mob?.classList.toggle('open'));
})();

// ── Read URL params ───────────────────────────────────
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    search:   p.get('search')   || '',
    category: p.get('category') || 'all',
    country:  p.get('country')  || '',
    sort:     p.get('sort')     || 'newest',
  };
}

function setInputsFromParams() {
  const { search, category, country, sort } = getParams();
  const si = document.getElementById('search-input');
  const cf = document.getElementById('category-filter');
  const co = document.getElementById('country-filter');
  const sf = document.getElementById('sort-filter');
  if (si) si.value = search;
  if (cf) cf.value = category;
  if (co) co.value = country;
  if (sf) sf.value = sort;
  renderActiveTags();
}

function renderActiveTags() {
  const { search, category, country } = getParams();
  const box = document.getElementById('active-filters');
  if (!box) return;
  const tags = [];
  if (search)   tags.push({ label: `"${search}"`, clear: () => removeParam('search') });
  if (category && category !== 'all') tags.push({ label: window.CATEGORIES_MAP?.[category]?.name || category, clear: () => removeParam('category') });
  if (country)  tags.push({ label: country, clear: () => removeParam('country') });
  box.style.display = tags.length ? 'flex' : 'none';
  box.innerHTML = tags.map((t,i) => `<span class="filter-tag" onclick="clearFilter(${i})">✕ ${t.label}</span>`).join('');
  window._filterClearFns = tags.map(t => t.clear);
}
window.clearFilter = i => { window._filterClearFns?.[i]?.(); };

function removeParam(key) {
  const p = new URLSearchParams(window.location.search);
  p.delete(key);
  window.location.search = p.toString();
}

// ── Apply filters ─────────────────────────────────────
function applyFilters() {
  const search   = document.getElementById('search-input')?.value.trim() || '';
  const category = document.getElementById('category-filter')?.value || 'all';
  const country  = document.getElementById('country-filter')?.value  || '';
  const sort     = document.getElementById('sort-filter')?.value     || 'newest';
  const p = new URLSearchParams();
  if (search)                p.set('search', search);
  if (category !== 'all')    p.set('category', category);
  if (country)               p.set('country', country);
  if (sort !== 'newest')     p.set('sort', sort);
  window.location.search = p.toString();
}
window.applyFilters = applyFilters;
window.filterCat   = cat => { const p = new URLSearchParams(window.location.search); p.set('category', cat); window.location.search = p.toString(); };

document.getElementById('search-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });

// ── Load listings ─────────────────────────────────────
async function loadListings(append = false) {
  const { search, category, country, sort } = getParams();
  const grid  = document.getElementById('listings-grid');
  const empty = document.getElementById('empty-state');
  const meta  = document.getElementById('listings-meta');
  const lmw   = document.getElementById('load-more-wrap');

  if (!append) {
    grid.innerHTML = [1,2,3,4,5,6].map(() => `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>`).join('');
    currentOffset = 0;
  }

  const params = new URLSearchParams({ limit: LIMIT, offset: currentOffset, sort });
  if (search)              params.set('search', search);
  if (category !== 'all')  params.set('category', category);
  if (country)             params.set('country', country);

  try {
    const r = await fetch('/api/listings?' + params);
    const d = await r.json();
    totalCount = d.total;

    if (!append) grid.innerHTML = '';

    if (!d.listings?.length && !append) {
      empty.style.display = 'block';
      meta.textContent    = '0 businesses found';
      if (lmw) lmw.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    meta.textContent = `${totalCount} business${totalCount !== 1 ? 'es' : ''} found`;

    d.listings.forEach(l => {
      const div = document.createElement('div');
      div.innerHTML = listingCard(l);
      grid.appendChild(div.firstElementChild);
    });

    currentOffset += d.listings.length;
    if (lmw) lmw.style.display = currentOffset < totalCount ? 'block' : 'none';
  } catch(err) {
    console.error(err);
    grid.innerHTML = '';
    empty.style.display = 'block';
    meta.textContent = 'Failed to load listings.';
  }
}

window.loadMore = () => loadListings(true);

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setInputsFromParams();
  loadListings();
});
