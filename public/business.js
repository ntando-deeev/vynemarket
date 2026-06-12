/* Business detail page JS */

const listingId = new URLSearchParams(window.location.search).get('id');
let listingData = null;
let selectedRating = 0;

// Nav update
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
  document.getElementById('page-title').textContent = l.businessName + ' — GrowthMarket';
  document.getElementById('bc-name').textContent = l.businessName;

  // Gallery
  const cat = window.CATEGORIES_MAP?.[l.category] || { emoji:'🏪', name: l.category };
  document.getElementById('gallery-emoji').textContent = cat.emoji;
  if (l.images?.length) {
    const mainEl = document.getElementById('gallery-main');
    const imgEl  = document.createElement('img');
    imgEl.src = l.images[0]; imgEl.alt = l.businessName;
    imgEl.onclick = () => openLightbox(l.images[0]);
    mainEl.innerHTML = '';
    mainEl.appendChild(imgEl);
    if (l.images.length > 1) {
      const thumbs = document.getElementById('gallery-thumbs');
      l.images.forEach((src, i) => {
        const d = document.createElement('div');
        d.className = 'gallery-thumb' + (i===0?' active':'');
        d.innerHTML = `<img src="${src}" alt="photo ${i+1}"/>`;
        d.onclick = () => {
          document.querySelectorAll('.gallery-thumb').forEach(t=>t.classList.remove('active'));
          d.classList.add('active');
          imgEl.src = src;
          imgEl.onclick = () => openLightbox(src);
        };
        thumbs.appendChild(d);
      });
    }
  }

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

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadBusiness);
