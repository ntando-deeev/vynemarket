/* Business detail page JS — public catalog, no login required */

const listingId = new URLSearchParams(window.location.search).get('id');
let listingData = null;
let selectedRating = 0;
let activeMediaTab = 'photos'; // 'photos' | 'videos'

// Nav update — works for both guests and logged-in users
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

async function loadBusiness() {
  if (!listingId) { showError(); return; }
  try {
    const r = await fetch('/api/listings/' + listingId);
    if (!r.ok) { showError(); return; }
    listingData = await r.json();
    renderBusiness(listingData);
    loadReviews();
    loadSimilar();
  } catch { showError(); }
}

function showError() {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('error-state').style.display = 'block';
}

function renderBusiness(l) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('business-main').style.display = 'block';
  document.getElementById('page-title').textContent = l.businessName + ' — VyneMarket';
  document.getElementById('bc-name').textContent = l.businessName;

  // Dynamic SEO meta
  document.title = l.businessName + ' — VyneMarket';
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name='description'; document.head.appendChild(metaDesc); }
  metaDesc.content = (l.tagline||l.description||'').slice(0,160);
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) { ogTitle = document.createElement('meta'); ogTitle.setAttribute('property','og:title'); document.head.appendChild(ogTitle); }
  ogTitle.content = l.businessName + ' — VyneMarket';
  if (l.images?.[0]) {
    let ogImg = document.querySelector('meta[property="og:image"]');
    if (!ogImg) { ogImg = document.createElement('meta'); ogImg.setAttribute('property','og:image'); document.head.appendChild(ogImg); }
    ogImg.content = l.images[0];
  }

  const cat = window.CATEGORIES_MAP?.[l.category] || { emoji:'🏪', name: l.category };

  // ── Full Media Catalog (Photos + Videos) ─────────────────────────
  // Available to ALL visitors — no login needed
  _renderMediaCatalog(l, cat);

  // Category badge
  const catEl = document.getElementById('business-cat');
  catEl.textContent = cat.emoji + ' ' + cat.name;

  // Name + tagline
  document.getElementById('business-name').textContent = l.businessName;
  if (l.tagline) {
    const tl = document.getElementById('business-tagline');
    tl.textContent = l.tagline; tl.style.display = 'block';
  }

  // Location
  if (l.country || l.city) {
    const locRow = document.getElementById('business-location');
    const parts = [l.city, l.location, l.country].filter(Boolean);
    document.getElementById('location-text').textContent = parts.join(', ');
    locRow.style.display = 'flex';
  }

  // Meta chips
  const chips = document.getElementById('business-meta-chips');
  const chipsData = [];
  if (l.established) chipsData.push({ icon:'📅', text: 'Est. ' + l.established });
  if (l.employees)   chipsData.push({ icon:'👥', text: l.employees });
  if (l.openHours)   chipsData.push({ icon:'🕐', text: l.openHours });
  if (l.reviewCount > 0) chipsData.push({ icon:'⭐', text: l.rating + ' (' + l.reviewCount + ' reviews)' });
  chips.innerHTML = chipsData.map(c => `<div class="meta-chip"><span>${c.icon}</span><span>${c.text}</span></div>`).join('');

  // Description
  document.getElementById('business-description').textContent = l.description;

  // Tags
  if (l.tags?.length) {
    const tagsRow = document.getElementById('business-tags-row');
    tagsRow.style.display = 'block';
    document.getElementById('business-tags').innerHTML = l.tags.map(t=>`<span class="tag-chip">${t}</span>`).join('');
  }

  // Stats
  document.getElementById('view-count').textContent = l.views || 0;
  document.getElementById('save-count').textContent = l.saves || 0;

  // Save state
  const saved = JSON.parse(localStorage.getItem('gm_saved') || '[]');
  if (saved.includes(listingId)) {
    const btn = document.getElementById('save-btn');
    btn.textContent = '❤️ Saved'; btn.classList.add('saved');
  }

  // Price
  if (l.price) {
    const pd = document.getElementById('price-display');
    pd.style.display = 'block';
    document.getElementById('price-text').textContent = (l.currency||'USD') + ' ' + l.price;
  }

  // Contact actions
  const actions = document.getElementById('contact-actions');
  const btns = [];
  if (l.contact?.whatsapp) {
    const n = l.contact.whatsapp.replace(/\D/g,'');
    btns.push(`<a href="https://wa.me/${n}" target="_blank" class="contact-btn contact-btn-whatsapp">💬 WhatsApp</a>`);
  }
  if (l.contact?.phone) {
    btns.push(`<a href="tel:${l.contact.phone}" class="contact-btn contact-btn-phone">📞 Call Now</a>`);
  }
  if (l.contact?.email) {
    btns.push(`<a href="mailto:${l.contact.email}" class="contact-btn contact-btn-email">✉️ Email</a>`);
  }
  if (l.contact?.website) {
    const url = l.contact.website.startsWith('http') ? l.contact.website : 'https://' + l.contact.website;
    btns.push(`<a href="${url}" target="_blank" class="contact-btn contact-btn-website">🌐 Visit Website</a>`);
  }
  actions.innerHTML = btns.join('');

  // Social links
  const social = l.social || {};
  const socialLinks = [
    { key:'instagram', icon:'📸', label:'Instagram', base:'https://instagram.com/' },
    { key:'tiktok',    icon:'🎵', label:'TikTok',    base:'https://tiktok.com/@' },
    { key:'facebook',  icon:'📘', label:'Facebook',  base:'https://facebook.com/' },
    { key:'twitter',   icon:'🐦', label:'Twitter',   base:'https://twitter.com/' },
    { key:'youtube',   icon:'▶️', label:'YouTube',  base:'' },
  ].filter(s => social[s.key]);

  if (socialLinks.length) {
    const box = document.getElementById('social-links');
    box.style.display = 'block';
    document.getElementById('social-links-inner').innerHTML = socialLinks.map(s => {
      const val = social[s.key];
      const url = val.startsWith('http') ? val : s.base + val.replace('@','');
      return `<a href="${url}" target="_blank" class="social-link-btn">${s.icon} ${s.label}</a>`;
    }).join('');
  }

  // Details list
  const details = [];
  if (l.contact?.name) details.push({ icon:'👤', value: l.contact.name + (l.contact.role ? ' · ' + l.contact.role : '') });
  if (l.openHours)     details.push({ icon:'🕐', value: l.openHours });
  if (l.established)   details.push({ icon:'📅', value: 'Established ' + l.established });
  if (l.employees)     details.push({ icon:'👥', value: l.employees });
  document.getElementById('business-details-list').innerHTML = details.map(d =>
    `<div class="detail-row"><span class="detail-icon">${d.icon}</span><span class="detail-value">${d.value}</span></div>`
  ).join('');
}

// ── Media Catalog — Photos & Videos, fully public ─────
function _renderMediaCatalog(l, cat) {
  const galleryEl   = document.getElementById('business-gallery');
  const hasPhotos   = l.images && l.images.length > 0;
  const hasVideos   = l.videos && l.videos.length > 0;
  const totalMedia  = (l.images||[]).length + (l.videos||[]).length;

  if (!hasPhotos && !hasVideos) {
    // Just show the emoji placeholder
    document.getElementById('gallery-emoji').textContent = cat.emoji;
    return;
  }

  // Build tabbed catalog
  galleryEl.innerHTML = `
    <!-- Media tabs — visible to everyone, no account needed -->
    <div class="catalog-tabs" id="catalog-tabs" style="display:${totalMedia > 0 ? 'flex' : 'none'}">
      <button class="catalog-tab ${hasPhotos ? 'active' : ''}" id="tab-photos" onclick="switchMediaTab('photos')">
        📷 Photos <span class="catalog-tab-count">${(l.images||[]).length}</span>
      </button>
      <button class="catalog-tab ${!hasPhotos && hasVideos ? 'active' : ''}" id="tab-videos" onclick="switchMediaTab('videos')"
        style="${!hasVideos ? 'opacity:0.45;pointer-events:none' : ''}">
        🎬 Videos <span class="catalog-tab-count">${(l.videos||[]).length}</span>
      </button>
    </div>

    <!-- Photos panel -->
    <div id="catalog-photos" class="catalog-panel" style="display:${hasPhotos || !hasVideos ? 'block' : 'none'}">
      <div class="gallery-main" id="gallery-main">
        <img id="gallery-hero-img" src="${hasPhotos ? l.images[0] : ''}" alt="${l.businessName}" 
          onclick="openLightbox('${hasPhotos ? l.images[0] : ''}')" style="${hasPhotos?'':'display:none'}"/>
        <div class="gallery-placeholder" id="gallery-placeholder" style="${hasPhotos?'display:none':''}">
          <span style="font-size:5rem">${cat.emoji}</span>
        </div>
      </div>
      ${hasPhotos && l.images.length > 1 ? `
      <div class="gallery-thumbs" id="gallery-thumbs">
        ${l.images.map((src, i) => `
          <div class="gallery-thumb ${i===0?'active':''}" onclick="selectPhoto('${src}', this)">
            <img src="${src}" alt="photo ${i+1}" loading="lazy"/>
          </div>`).join('')}
      </div>` : ''}
      ${!hasPhotos ? `<div style="text-align:center;padding:40px 0;color:var(--text-muted)">No photos uploaded yet.</div>` : ''}
    </div>

    <!-- Videos panel -->
    <div id="catalog-videos" class="catalog-panel" style="display:${!hasPhotos && hasVideos ? 'block' : 'none'}">
      ${hasVideos ? `
      <div class="video-catalog-grid">
        ${l.videos.map((src, i) => `
          <div class="video-catalog-item">
            <video src="${src}" controls preload="metadata" poster="" 
              style="width:100%;border-radius:12px;background:#000;max-height:360px">
              Your browser does not support video.
            </video>
            <div class="video-catalog-label">Video ${i+1}</div>
          </div>`).join('')}
      </div>` : `<div style="text-align:center;padding:40px 0;color:var(--text-muted)">No videos uploaded yet.</div>`}
    </div>
  `;

  activeMediaTab = hasPhotos ? 'photos' : 'videos';
}

window.switchMediaTab = function(tab) {
  activeMediaTab = tab;
  document.getElementById('tab-photos').classList.toggle('active', tab === 'photos');
  document.getElementById('tab-videos').classList.toggle('active', tab === 'videos');
  document.getElementById('catalog-photos').style.display = tab === 'photos' ? 'block' : 'none';
  document.getElementById('catalog-videos').style.display = tab === 'videos' ? 'block' : 'none';
};

window.selectPhoto = function(src, thumbEl) {
  const hero = document.getElementById('gallery-hero-img');
  if (hero) { hero.src = src; hero.onclick = () => openLightbox(src); }
  document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
};

// ── Lightbox ──────────────────────────────────────────
window.openLightbox = function(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.style.display = 'flex';
};
window.closeLightbox = function() {
  document.getElementById('lightbox').style.display = 'none';
};

// ── Save toggle ───────────────────────────────────────
window.toggleSave = async function() {
  const token = Auth.getToken();
  const btn   = document.getElementById('save-btn');
  if (token) {
    const r = await fetch('/api/listings/' + listingId + '/save', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }
    });
    const d = await r.json();
    if (d.saved) { btn.textContent = '❤️ Saved'; btn.classList.add('saved'); }
    else         { btn.textContent = '🤍 Save';  btn.classList.remove('saved'); }
    const saves = parseInt(document.getElementById('save-count').textContent) || 0;
    document.getElementById('save-count').textContent = d.saved ? saves+1 : Math.max(0,saves-1);
  } else {
    // Guest save via localStorage
    const saved = JSON.parse(localStorage.getItem('gm_saved') || '[]');
    const idx   = saved.indexOf(listingId);
    if (idx === -1) { saved.push(listingId); btn.textContent = '❤️ Saved'; btn.classList.add('saved'); }
    else            { saved.splice(idx,1);   btn.textContent = '🤍 Save';  btn.classList.remove('saved'); }
    localStorage.setItem('gm_saved', JSON.stringify(saved));
  }
};

// ── Reviews ───────────────────────────────────────────
async function loadReviews() {
  const r = await fetch('/api/listings/' + listingId + '/reviews');
  const reviews = await r.json();
  const list  = document.getElementById('reviews-list');
  const avgEl = document.getElementById('reviews-avg');
  if (!reviews.length) return;
  const avg = reviews.reduce((a,r)=>a+r.rating,0)/reviews.length;
  avgEl.innerHTML = `<span class="review-stars">${'★'.repeat(Math.round(avg))}</span> <strong>${avg.toFixed(1)}</strong> <span style="color:var(--text-dim)">(${reviews.length})</span>`;
  list.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-meta">
        <strong>${r.userName}</strong>
        <span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
        <span>${new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="review-text">${r.comment}</div>
    </div>`).join('');
}

window.toggleReviewForm = function() {
  const f = document.getElementById('review-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window.setRating = function(n) {
  selectedRating = n;
  document.getElementById('rating-val').value = n;
  document.querySelectorAll('#star-picker span').forEach((s,i) => {
    s.textContent = i < n ? '★' : '☆';
    s.classList.toggle('active', i < n);
  });
};

window.submitReview = async function(e) {
  e.preventDefault();
  const token = Auth.getToken();
  const errEl = document.getElementById('review-error');
  if (!token) { errEl.textContent = 'Please sign in to leave a review.'; errEl.style.display='block'; return; }
  if (!selectedRating) { errEl.textContent = 'Please select a star rating.'; errEl.style.display='block'; return; }
  const fd   = new FormData(e.target);
  const body = { rating: selectedRating, comment: fd.get('comment') };
  const r    = await fetch('/api/listings/' + listingId + '/reviews', {
    method: 'POST', headers: { 'Content-Type':'application/json', Authorization:'Bearer '+token },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) { errEl.textContent = d.error; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  document.getElementById('review-form').style.display = 'none';
  loadReviews();
};

// ── Contact form ──────────────────────────────────────
window.submitContact = async function(e) {
  e.preventDefault();
  const btn  = document.getElementById('contact-submit-btn');
  const errEl = document.getElementById('contact-error');
  const sucEl = document.getElementById('contact-success');
  btn.disabled = true; btn.textContent = 'Sending…';
  const fd   = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const r    = await fetch('/api/listings/' + listingId + '/contact', {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (r.ok) {
    e.target.reset();
    sucEl.style.display = 'block';
    btn.style.display   = 'none';
  } else {
    errEl.textContent = d.error; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send Message';
  }
};

// ── Similar listings ──────────────────────────────────
async function loadSimilar() {
  if (!listingData) return;
  const r = await fetch(`/api/listings?category=${listingData.category}&limit=3`);
  const d = await r.json();
  const filtered = d.listings.filter(l => l.id !== listingId).slice(0,3);
  const grid = document.getElementById('similar-grid');
  if (!filtered.length) { document.querySelector('.similar-section').style.display='none'; return; }
  grid.innerHTML = filtered.map(l => listingCard(l)).join('');
}

// ── Share ─────────────────────────────────────────────
window.shareBusiness = async function() {
  const url = window.location.href;
  const title = listingData?.businessName || 'Check out this business on VyneMarket';
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {}
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    const btn = document.querySelector('[onclick="shareBusiness()"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  } catch {
    prompt('Copy this link:', url);
  }
};

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadBusiness);
