/* Dashboard JS */

const token = localStorage.getItem('gm_token');

// Auth check
(function() {
  if (!token) { window.location = '/login.html'; return; }
  document.getElementById('auth-check').style.display = 'none';
  document.getElementById('dashboard-main').style.display = 'block';
  const user = JSON.parse(localStorage.getItem('gm_user') || '{}');
  document.getElementById('welcome-msg').textContent = 'Hello, ' + (user.name || 'there') + ' 👋';
  loadDashboard(user);
})();

window.logout = function() {
  localStorage.removeItem('gm_token');
  localStorage.removeItem('gm_user');
  window.location = '/';
};

window.showTab = function(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.dash-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).style.display = 'block';
  document.querySelector(`[onclick="showTab('${tab}')"]`).classList.add('active');
};

async function loadDashboard(user) {
  await Promise.all([loadMyListings(user), loadMessages()]);
}

async function loadMyListings(user) {
  const r = await fetch('/api/listings?ownerId=' + user.id + '&limit=50', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const d = await r.json();
  const listings = d.listings || [];

  // Stats
  const totalViews = listings.reduce((a,l)=>a+(l.views||0),0);
  const totalLeads = listings.reduce((a,l)=>a+(l.leads||0),0);
  const totalSaves = listings.reduce((a,l)=>a+(l.saves||0),0);
  document.getElementById('ds-listings').textContent = listings.length;
  document.getElementById('ds-views').textContent    = totalViews;
  document.getElementById('ds-leads').textContent    = totalLeads;
  document.getElementById('ds-saves').textContent    = totalSaves;

  // Grid
  const grid  = document.getElementById('my-listings-grid');
  const empty = document.getElementById('my-listings-empty');
  if (!listings.length) { empty.style.display='block'; return; }

  const cats = window.CATEGORIES_MAP || {};
  grid.innerHTML = listings.map(l => {
    const cat = cats[l.category] || { emoji:'📦', name: l.category };
    const img = l.images?.[0]
      ? `<img src="${l.images[0]}" alt="${l.businessName}"/>`
      : cat.emoji;
    return `
    <div class="my-listing-row">
      <div class="my-listing-img">${img}</div>
      <div class="my-listing-info">
        <div class="my-listing-cat">${cat.emoji} ${cat.name}</div>
        <div class="my-listing-name">${l.businessName}</div>
        ${l.tagline ? `<div style="font-size:0.82rem;color:var(--text-muted)">${l.tagline}</div>` : ''}
        <div class="my-listing-stats">
          <span>👁 ${l.views||0} views</span>
          <span>📩 ${l.leads||0} leads</span>
          <span>❤️ ${l.saves||0} saves</span>
          <span>⭐ ${l.rating||0} (${l.reviewCount||0})</span>
        </div>
      </div>
      <div class="my-listing-actions">
        <a href="/business.html?id=${l.id}">👁 View</a>
        <button class="del-btn" onclick="deleteListing('${l.id}', this)">🗑 Delete</button>
      </div>
    </div>`;
  }).join('');
}

window.deleteListing = async function(id, btn) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;
  btn.disabled = true; btn.textContent = 'Deleting…';
  const r = await fetch('/api/listings/' + id, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });
  if (r.ok) {
    btn.closest('.my-listing-row').remove();
    const user = JSON.parse(localStorage.getItem('gm_user') || '{}');
    loadMyListings(user);
  } else {
    btn.disabled = false; btn.textContent = '🗑 Delete';
    alert('Failed to delete. Please try again.');
  }
};

async function loadMessages() {
  const r = await fetch('/api/messages', { headers: { Authorization: 'Bearer ' + token } });
  const messages = await r.json();
  const list  = document.getElementById('messages-list');
  const empty = document.getElementById('messages-empty');
  const badge = document.getElementById('msg-badge');

  if (!messages.length) { empty.style.display='block'; return; }
  badge.textContent = messages.length; badge.style.display='inline-block';

  list.innerHTML = messages.map(m => `
    <div class="message-card">
      <div class="message-card-header">
        <div>
          <div class="message-from">${m.senderName}</div>
          <div class="message-for">Re: ${m.businessName}</div>
        </div>
        <div class="message-date">${new Date(m.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="message-body">${m.message}</div>
      <div class="message-contact-row">
        <span class="message-contact-item">✉️ <a href="mailto:${m.senderEmail}">${m.senderEmail}</a></span>
        ${m.senderPhone ? `<span class="message-contact-item">📞 <a href="tel:${m.senderPhone}">${m.senderPhone}</a></span>` : ''}
      </div>
    </div>`).join('');
}
