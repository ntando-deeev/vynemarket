/* VyneMarket v2 — Homepage JS */

// ── Auth helpers ──────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('gm_token'),
  getUser:  () => { try { return JSON.parse(localStorage.getItem('gm_user')); } catch { return null; } },
  isLoggedIn: () => !!localStorage.getItem('gm_token'),
  logout: () => { localStorage.removeItem('gm_token'); localStorage.removeItem('gm_user'); location.reload(); }
};

// ── Toast ─────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Nav ───────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 20);
});

const ham = document.getElementById('hamburger');
const mob = document.getElementById('mobile-menu');
ham?.addEventListener('click', () => mob?.classList.toggle('open'));

// Update nav for logged-in user
(function updateNav() {
  const user = Auth.getUser();
  const cta  = document.getElementById('nav-cta');
  if (!cta) return;
  if (user) {
    cta.innerHTML = `
      <a href="/dashboard.html" class="btn-ghost">My Dashboard</a>
      <a href="/post-ad.html" class="btn-primary">+ List Business</a>`;
  }
})();

// ── Stats ─────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    animateCount('stat-listings', d.activeListings || 0);
    animateCount('stat-users',    d.totalUsers    || 0);
    animateCount('stat-countries',d.countries     || 0);
  } catch {}
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  if (target === 0) { el.textContent = '0'; return; }
  const duration = 1200, steps = 40, step = duration / steps;
  let count = 0;
  const inc = Math.ceil(target / steps);
  const t = setInterval(() => {
    count = Math.min(count + inc, target);
    el.textContent = count >= 1000 ? (count/1000).toFixed(1)+'K' : count;
    if (count >= target) clearInterval(t);
  }, step);
}

// ── Categories ────────────────────────────────────────
const CATEGORIES = [
  { id:'fashion',      emoji:'👗', name:'Fashion'       },
  { id:'beauty',       emoji:'💄', name:'Beauty'        },
  { id:'food',         emoji:'🍔', name:'Food & Drinks' },
  { id:'electronics',  emoji:'📱', name:'Electronics'   },
  { id:'health',       emoji:'💪', name:'Health'        },
  { id:'home',         emoji:'🏠', name:'Home & Living' },
  { id:'services',     emoji:'🛠️', name:'Services'     },
  { id:'ecommerce',    emoji:'🛒', name:'E-Commerce'    },
  { id:'real-estate',  emoji:'🏢', name:'Real Estate'   },
  { id:'education',    emoji:'📚', name:'Education'     },
  { id:'automotive',   emoji:'🚗', name:'Automotive'    },
  { id:'finance',      emoji:'💳', name:'Finance'       },
  { id:'travel',       emoji:'✈️', name:'Travel'        },
  { id:'entertainment',emoji:'🎬', name:'Entertainment' },
  { id:'agriculture',  emoji:'🌱', name:'Agriculture'   },
  { id:'construction', emoji:'🏗️', name:'Construction'  },
  { id:'manufacturing',emoji:'🏭', name:'Manufacturing' },
  { id:'sports',       emoji:'⚽', name:'Sports'        },
  { id:'technology',   emoji:'💻', name:'Technology'    },
  { id:'other',        emoji:'📦', name:'Other'         },
];

async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  let counts = {};
  try { const r = await fetch('/api/categories'); counts = await r.json(); } catch {}
  grid.innerHTML = CATEGORIES.map(c => `
    <a href="/listings.html?category=${c.id}" class="cat-card">
      <div class="cat-emoji">${c.emoji}</div>
      <div class="cat-name">${c.name}</div>
      <div class="cat-count">${counts[c.id] || 0} listings</div>
    </a>`).join('');
}

// ── Featured Listings ─────────────────────────────────
async function loadFeatured() {
  const grid  = document.getElementById('featured-grid');
  const empty = document.getElementById('featured-empty');
  if (!grid) return;
  try {
    const r = await fetch('/api/listings?limit=6&sort=newest');
    const d = await r.json();
    if (!d.listings?.length) {
      grid.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    grid.innerHTML = d.listings.map(l => listingCard(l)).join('');
  } catch {
    if (empty) { grid.style.display='none'; empty.style.display='block'; }
  }
}

window.CATEGORIES_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

function listingCard(l) {
  const cat  = window.CATEGORIES_MAP[l.category] || { emoji:'📦', name: l.category };
  const img  = l.images?.[0]
    ? `<img src="${l.images[0]}" alt="${l.businessName}" loading="lazy"/>`
    : `<div class="listing-card-img-placeholder">${cat.emoji}</div>`;
  const stars = l.reviewCount > 0
    ? `<span class="rating-stars">${'★'.repeat(Math.round(l.rating))}${'☆'.repeat(5-Math.round(l.rating))}</span><span>(${l.reviewCount})</span>`
    : '';
  const price = l.price ? `<span class="listing-card-price">${l.currency || 'USD'} ${l.price}</span>` : '';
  const tags  = (l.tags||[]).slice(0,3).map(t=>`<span class="tag-chip">${t}</span>`).join('');
  return `
    <div class="listing-card" onclick="window.location='/business.html?id=${l.id}'">
      <div class="listing-card-img">
        ${img}
        <div class="listing-card-badge">${cat.emoji} ${cat.name}</div>
      </div>
      <div class="listing-card-body">
        <div class="listing-card-title">${l.businessName}</div>
        ${l.tagline ? `<div class="listing-card-tagline">${l.tagline}</div>` : ''}
        <div class="listing-card-desc">${l.description}</div>
        ${tags ? `<div class="listing-card-tags">${tags}</div>` : ''}
        <div class="listing-card-meta">
          ${l.country ? `<span class="listing-meta-item">📍 ${l.city ? l.city+', ':''} ${l.country}</span>` : ''}
          ${stars}
          <span class="listing-meta-item">👁 ${l.views||0}</span>
          ${price}
        </div>
      </div>
    </div>`;
}

// ── Hero search ───────────────────────────────────────
function doHeroSearch() {
  const q   = document.getElementById('hero-search')?.value.trim() || '';
  const cat = document.getElementById('hero-cat')?.value || '';
  const params = new URLSearchParams();
  if (q)   params.set('search', q);
  if (cat) params.set('category', cat);
  window.location = '/listings.html' + (params.toString() ? '?' + params.toString() : '');
}
document.getElementById('hero-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') doHeroSearch(); });

// ── Particles ─────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;
  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    particles = Array.from({length: 55}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*0.35, vy: (Math.random()-.5)*0.35,
      r: Math.random()*1.8+0.4, o: Math.random()*0.4+0.1
    }));
  }
  window.addEventListener('resize', resize); resize();
  function draw() {
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,200,150,${p.o})`; ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  loadStats();
  loadCategories();
  loadFeatured();
});
