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
  const hasVideo = !!(l.sampleVideo || (l.videos && l.videos.length > 0));
  const img  = l.images?.[0]
    ? `<img src="${l.images[0]}" alt="${l.businessName}" loading="lazy"/>`
    : `<div class="listing-card-img-placeholder">${cat.emoji}</div>`;
  const stars = l.reviewCount > 0
    ? `<span class="rating-stars">${'★'.repeat(Math.round(l.rating))}${'☆'.repeat(5-Math.round(l.rating))}</span><span>(${l.reviewCount})</span>`
    : '';
  const price = l.price ? `<span class="listing-card-price">${l.currency || 'USD'} ${l.price}</span>` : '';
  const tags  = (l.tags||[]).slice(0,3).map(t=>`<span class="tag-chip">${t}</span>`).join('');
  const videoBadge = hasVideo ? `<div class="listing-card-video-badge">▶ Video</div>` : '';
  return `
    <div class="listing-card" onclick="window.location='/business.html?id=${l.id}'">
      <div class="listing-card-img">
        ${img}
        <div class="listing-card-badge">${cat.emoji} ${cat.name}</div>
        ${videoBadge}
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
  loadReels('all');
  loadTrending();
});

// ── Business Reels ────────────────────────────────────
let reelsOffset = 0;
let reelsCat    = 'all';
const REELS_LIMIT = 8;

async function loadReels(cat, append = false) {
  reelsCat = cat || 'all';
  if (!append) reelsOffset = 0;
  const grid  = document.getElementById('reels-grid');
  const empty = document.getElementById('reels-empty');
  const more  = document.getElementById('reels-load-more');
  if (!grid) return;

  if (!append) {
    grid.innerHTML = Array(4).fill(0).map(()=>`
      <div class="reel-card skeleton-reel">
        <div class="reel-video-wrap skeleton-block" style="height:360px;border-radius:16px"></div>
      </div>`).join('');
  }

  try {
    const params = new URLSearchParams({ limit: REELS_LIMIT, offset: reelsOffset });
    if (reelsCat && reelsCat !== 'all') params.set('category', reelsCat);
    const r = await fetch('/api/reels?' + params);
    const d = await r.json();

    if (!append) grid.innerHTML = '';

    if (!d.reels?.length && !append) {
      empty?.classList.remove('hidden');
      if (more) more.style.display = 'none';
      return;
    }
    empty?.classList.add('hidden');

    d.reels.forEach(reel => {
      const div = document.createElement('div');
      div.innerHTML = reelCard(reel);
      grid.appendChild(div.firstElementChild);
    });

    reelsOffset += d.reels.length;
    if (more) more.style.display = reelsOffset < d.total ? 'block' : 'none';

    // Auto-play first reel on intersection
    _initReelObserver();
  } catch(e) {
    console.error('Reels load error:', e);
    if (!append && grid) grid.innerHTML = '';
    empty?.classList.remove('hidden');
  }
}

function reelCard(r) {
  const cat = window.CATEGORIES_MAP?.[r.category] || { emoji:'📦', name: r.category };
  const locParts = [r.city, r.country].filter(Boolean);
  const loc = locParts.length ? `📍 ${locParts.join(', ')}` : '';
  const stars = r.reviewCount > 0
    ? `${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5-Math.round(r.rating))} (${r.reviewCount})`
    : '';
  return `
    <div class="reel-card" onclick="window.location='/business.html?id=${r.id}'">
      <div class="reel-video-wrap">
        <video class="reel-video" src="${r.sampleVideo}" loop muted playsinline preload="metadata"
          poster="${r.images?.[0] || ''}"></video>
        <div class="reel-play-btn" id="reel-play-${r.id}">▶</div>
        <div class="reel-overlay">
          <div class="reel-cat-badge">${cat.emoji} ${cat.name}</div>
          <div class="reel-info">
            <div class="reel-biz-name">${r.businessName}</div>
            ${r.tagline ? `<div class="reel-tagline">${r.tagline}</div>` : ''}
            ${loc ? `<div class="reel-loc">${loc}</div>` : ''}
            ${stars ? `<div class="reel-stars">${stars}</div>` : ''}
          </div>
          <div class="reel-stats">
            <span>👁 ${r.views||0}</span>
            <span>❤️ ${r.saves||0}</span>
          </div>
        </div>
        <div class="reel-cta-overlay">
          <span>View Business →</span>
        </div>
      </div>
    </div>`;
}

function _initReelObserver() {
  if (!('IntersectionObserver' in window)) return;
  document.querySelectorAll('.reel-video').forEach(video => {
    if (video._observed) return;
    video._observed = true;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const playBtn = entry.target.parentElement.querySelector('.reel-play-btn');
        if (entry.isIntersecting) {
          entry.target.play().catch(()=>{});
          if (playBtn) playBtn.style.display = 'none';
        } else {
          entry.target.pause();
          if (playBtn) playBtn.style.display = 'flex';
        }
      });
    }, { threshold: 0.6 });
    obs.observe(video);

    // Manual play/pause toggle
    video.parentElement.addEventListener('click', function(e) {
      if (e.target.closest('.reel-cta-overlay')) return; // let onclick bubble
      e.stopPropagation();
      const playBtn = this.querySelector('.reel-play-btn');
      if (video.paused) { video.play().catch(()=>{}); if(playBtn) playBtn.style.display='none'; }
      else { video.pause(); if(playBtn) playBtn.style.display='flex'; }
    });
  });
}

window.filterReels = function(cat, btn) {
  document.querySelectorAll('.reel-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadReels(cat, false);
};

window.loadMoreReels = function() {
  loadReels(reelsCat, true);
};

// ── Trending Businesses ───────────────────────────────
async function loadTrending() {
  const grid = document.getElementById('trending-grid');
  if (!grid) return;
  try {
    const r = await fetch('/api/listings?sort=popular&limit=6');
    const d = await r.json();
    if (!d.listings?.length) {
      document.getElementById('trending')?.style.setProperty('display','none');
      return;
    }
    grid.innerHTML = d.listings.map(l => listingCard(l)).join('');
  } catch(e) { console.error(e); }
}
