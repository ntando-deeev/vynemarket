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
        <a href="/post-ad.html?edit=${l.id}" style="background:rgba(124,58,237,0.15);color:var(--brand);border:1px solid rgba(124,58,237,0.3);border-radius:8px;padding:6px 14px;font-size:0.82rem;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='rgba(124,58,237,0.28)'" onmouseout="this.style.background='rgba(124,58,237,0.15)'">✏️ Edit</a>
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

// ── Plan banner ───────────────────────────────────────
(function showPlanBanner() {
  const user = JSON.parse(localStorage.getItem('gm_user') || '{}');
  const plan = user.plan || 'free';
  const banner = document.getElementById('plan-banner');
  if (banner) {
    banner.style.display = 'flex';
    const labels = { free: '🆓 Free Plan', pro: '🚀 Business Pro', growth: '⚡ Growth Suite' };
    document.getElementById('plan-label').textContent = labels[plan] || 'Free Plan';
    if (['pro','growth'].includes(plan)) {
      document.getElementById('upgrade-plan-btn').textContent = plan === 'growth' ? '✓ Growth Suite' : '⬆ Upgrade to Growth';
    }
  }
})();

// ── Analytics Tab ─────────────────────────────────────
(function populateAnalyticsSelect() {
  // populate on init from the listings loaded
  const origLoad = loadMyListings;
  // We hook in after loadMyListings runs via a small timeout
  setTimeout(async () => {
    const user = JSON.parse(localStorage.getItem('gm_user') || '{}');
    if (!user.id) return;
    const r = await fetch('/api/listings?ownerId=' + user.id + '&limit=50');
    const d = await r.json();
    const sel = document.getElementById('analytics-listing-sel');
    if (!sel) return;
    (d.listings || []).forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.textContent = l.businessName;
      sel.appendChild(opt);
    });
  }, 800);
})();

let analyticsChart = null;

window.loadAnalytics = async function(listingId) {
  if (!listingId) return;
  const panel = document.getElementById('analytics-panel');
  panel.style.display = 'block';
  const r    = await fetch('/api/listings/' + listingId + '/analytics', { headers: { Authorization: 'Bearer ' + token } });
  const data = await r.json();
  document.getElementById('an-views').textContent  = data.views || 0;
  document.getElementById('an-leads').textContent  = data.leads || 0;
  document.getElementById('an-saves').textContent  = data.saves || 0;
  document.getElementById('an-rating').textContent = data.rating || 0;

  // Chart
  const history = (data.history || []).slice(-30);
  const labels  = history.map(h => h.date);
  const views   = history.map(h => h.views || 0);
  const leads   = history.map(h => h.leads || 0);

  const ctx = document.getElementById('analytics-chart').getContext('2d');
  if (analyticsChart) analyticsChart.destroy();
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Views', data: views, borderColor: '#00C896', backgroundColor: 'rgba(0,200,150,0.1)', tension: 0.4, fill: true },
        { label: 'Leads', data: leads, borderColor: '#7C5CFC', backgroundColor: 'rgba(124,92,252,0.1)', tension: 0.4, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: '#B0B8C4' } } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });

  // Show Growth actions if applicable
  const user = JSON.parse(localStorage.getItem('gm_user') || '{}');
  if (['growth'].includes(user.plan)) {
    document.getElementById('growth-actions').style.display = 'flex';
    window._analyticsListingId = listingId;
  }
};

window.exportLeads = async function() {
  const id = window._analyticsListingId;
  if (!id) return;
  window.location.href = '/api/listings/' + id + '/leads/export?token=' + encodeURIComponent(token);
  // Note: server needs token from query — using Authorization header via redirect isn't possible
  // So we POST a form instead:
  const form = document.createElement('form');
  form.method = 'GET';
  form.action = '/api/listings/' + id + '/leads/export';
  document.body.appendChild(form);
  // Instead open in new tab with auth header via fetch blob
  const r = await fetch('/api/listings/' + id + '/leads/export', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Export failed'); return; }
  const blob = await r.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click();
  URL.revokeObjectURL(url);
};

window.viewCompetitors = async function() {
  const id    = window._analyticsListingId;
  if (!id) return;
  const panel = document.getElementById('competitor-panel');
  panel.style.display = 'block';
  const r    = await fetch('/api/listings/' + id + '/competitor-analytics', { headers: { Authorization: 'Bearer ' + token } });
  const data = await r.json();
  if (!r.ok) { document.getElementById('competitor-content').innerHTML = `<p style="color:red">${data.error}</p>`; return; }
  document.getElementById('competitor-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:var(--surface);border-radius:10px;padding:16px">
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">YOUR STATS</div>
        <div>👁 ${data.yourStats.views} views</div>
        <div>📩 ${data.yourStats.leads} leads</div>
        <div>⭐ ${data.yourStats.rating} rating</div>
      </div>
      <div style="background:var(--surface);border-radius:10px;padding:16px">
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">CATEGORY AVERAGE (${data.totalCompetitors} competitors)</div>
        <div>👁 ${data.categoryAverages.views} views</div>
        <div>📩 ${data.categoryAverages.leads} leads</div>
        <div>⭐ ${data.categoryAverages.rating} rating</div>
      </div>
    </div>
    <h4 style="margin-bottom:12px">Top Competitors</h4>
    ${data.topCompetitors.map((c,i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:0.9rem">
        <span>#${i+1} <strong>${c.businessName}</strong></span>
        <span style="color:var(--text-muted)">👁 ${c.views} · 📩 ${c.leads} · ⭐ ${c.rating}</span>
      </div>`).join('')}
  `;
};


// ── Referral Dashboard Tab ────────────────────────────
async function loadReferralDash() {
  const wrap = document.getElementById('referral-dash-wrap');
  if (!wrap) return;
  const token = Auth.getToken();
  if (!token) return;
  try {
    const r = await fetch('/api/referral/stats', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    const base = window.location.origin;
    const link = `${base}/register.html?ref=${d.referralCode}`;
    
    function planBadge(plan) {
      if (plan === 'growth') return '<span class="plan-badge-growth">🚀 Growth Suite</span>';
      if (plan === 'pro')    return '<span class="plan-badge-pro">⚡ Business Pro</span>';
      return '<span class="plan-badge-free">✦ Free</span>';
    }

    let progressHTML = '';
    if (d.effectivePlan !== 'growth') {
      const need = d.nextUnlock?.needInvites || 3;
      const prog = d.referralCount || 0;
      const pct  = Math.min(100, Math.round(prog / need * 100));
      const nextPlan = d.effectivePlan === 'pro' ? 'Growth Suite 🚀' : 'Business Pro ⚡';
      const left = Math.max(0, need - prog);
      progressHTML = `
        <div style="margin:20px 0">
          <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:10px">
            <strong>${left}</strong> more invite${left !== 1 ? 's' : ''} to unlock <strong>${nextPlan}</strong>
          </p>
          <div class="ref-progress-bar"><div class="ref-progress-fill" style="width:${pct}%"></div></div>
          <p style="font-size:0.75rem;color:var(--text-dim);margin-top:6px;text-align:center">${prog} / ${need} invites</p>
        </div>`;
    } else {
      progressHTML = `<p style="color:var(--brand);font-weight:700;margin:16px 0">🎉 Max level unlocked! You have all premium features.</p>`;
    }

    wrap.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(124,58,237,0.1),rgba(236,72,153,0.05));border:1px solid var(--brand);border-radius:var(--radius-lg);padding:32px;margin-bottom:24px;text-align:center">
        <h3 style="font-size:1.3rem;font-weight:800;margin-bottom:6px">🎁 Invite Friends, Get Premium</h3>
        <p style="color:var(--text-muted);margin-bottom:12px">Your current plan: ${planBadge(d.effectivePlan)}</p>
        <div style="display:flex;justify-content:center;gap:28px;flex-wrap:wrap;margin-bottom:20px">
          <div style="text-align:center"><div style="font-size:2rem;font-weight:800;color:var(--brand)">${d.referralCount || 0}</div><div style="font-size:0.8rem;color:var(--text-muted)">Friends Invited</div></div>
          <div style="text-align:center"><div style="font-size:2rem;font-weight:800;color:var(--brand)">${d.effectivePlan === 'growth' ? '🚀' : d.nextUnlock?.needInvites || 3}</div><div style="font-size:0.8rem;color:var(--text-muted)">${d.effectivePlan === 'growth' ? 'Max Plan' : 'Invites to Next'}</div></div>
        </div>
        ${progressHTML}
        <div style="background:rgba(0,0,0,0.2);border:1px dashed var(--brand);border-radius:10px;padding:12px 16px;font-family:monospace;font-size:0.85rem;color:var(--brand);word-break:break-all;margin:0 auto 16px;max-width:480px">${link}</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn-primary" onclick="copyReferralLink('${link}')" style="font-size:0.88rem;padding:10px 18px">🔗 Copy Link</button>
          <a href="/referral.html" class="btn-ghost" style="font-size:0.88rem;padding:10px 18px">View Full Invite Dashboard →</a>
        </div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px">
        <h4 style="font-weight:700;margin-bottom:16px">Unlock Tiers</h4>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:${d.referralCount>=0?'rgba(255,255,255,0.03)':''}">
            <span style="font-size:1.4rem">✦</span>
            <div style="flex:1"><div style="font-weight:600;font-size:0.9rem">Free Plan</div><div style="font-size:0.78rem;color:var(--text-muted)">0 invites — Listing, gallery, analytics, featured badge</div></div>
            ${d.effectivePlan==='free'?'<span class="plan-badge-free">Current</span>':'<span style="color:var(--brand)">✓</span>'}
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:rgba(124,58,237,0.05)">
            <span style="font-size:1.4rem">⚡</span>
            <div style="flex:1"><div style="font-weight:600;font-size:0.9rem">Business Pro</div><div style="font-size:0.78rem;color:var(--text-muted)">3 invites — Community, broadcasts, loyalty stamps, QR codes</div></div>
            ${d.effectivePlan==='pro'?'<span class="plan-badge-pro">Current</span>':d.referralCount>=3?'<span style="color:var(--brand)">✓ Unlocked</span>':'<span style="font-size:0.78rem;color:var(--text-dim)">${Math.max(0,3-(d.referralCount||0))} more invites</span>'}
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:rgba(245,158,11,0.05)">
            <span style="font-size:1.4rem">🚀</span>
            <div style="flex:1"><div style="font-weight:600;font-size:0.9rem">Growth Suite</div><div style="font-size:0.78rem;color:var(--text-muted)">10 invites — Competitor analytics, lead export, verified badge, sponsored</div></div>
            ${d.effectivePlan==='growth'?'<span class="plan-badge-growth">Current</span>':d.referralCount>=10?'<span style="color:var(--brand)">✓ Unlocked</span>':'<span style="font-size:0.78rem;color:var(--text-dim)">${Math.max(0,10-(d.referralCount||0))} more invites</span>'}
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    console.error(e);
    wrap.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Failed to load referral data.</p>';
  }
}

function copyReferralLink(link) {
  navigator.clipboard.writeText(link)
    .then(() => showToast('Referral link copied! 🔗'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Referral link copied! 🔗');
    });
}
