/* ══════════════════════════════════════════════════
   VyneMarket — Notification Bell
   Include after app.js on authenticated pages
   ══════════════════════════════════════════════════ */

(function(){
  'use strict';

  const TOKEN_KEY = 'vm_token';
  let socket      = null;
  let unread      = 0;

  // ── Mount bell into a target element ──────────────
  function mount(containerSelector){
    const container = document.querySelector(containerSelector);
    if(!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'notif-bell-wrapper';
    wrapper.innerHTML = `
      <button class="notif-bell-btn" id="notif-bell" onclick="window.vmNotif.toggle()" aria-label="Notifications">
        🔔
        <span class="notif-bell-badge hidden" id="notif-badge">0</span>
      </button>
      <div class="notif-dropdown hidden" id="notif-dropdown">
        <div class="notif-dropdown-header">
          <span>Notifications</span>
          <button onclick="window.vmNotif.markAllRead()">Mark all read</button>
        </div>
        <div class="notif-list" id="notif-list">
          <div class="notif-empty">Loading…</div>
        </div>
      </div>
    `;
    container.insertBefore(wrapper, container.firstChild);

    // Close on outside click
    document.addEventListener('click', e=>{
      const dropdown = document.getElementById('notif-dropdown');
      if(dropdown && !wrapper.contains(e.target)) dropdown.classList.add('hidden');
    });

    // Load initial notifications
    _fetchNotifications();
    setInterval(_fetchUnreadCount, 30000);

    // Subscribe to real-time via socket if available
    const sock = window._vmSocket;
    if(sock){
      sock.on('notification', n=>{ _prependNotification(n); _setBadge(unread+1); });
    }
  }

  // ── Toggle dropdown ────────────────────────────────
  function toggle(){
    const d = document.getElementById('notif-dropdown');
    if(!d) return;
    const isHidden = d.classList.contains('hidden');
    d.classList.toggle('hidden');
    if(isHidden) _fetchNotifications();
  }

  // ── Fetch ──────────────────────────────────────────
  function _fetchNotifications(){
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token) return;
    fetch('/api/notifications', { headers:{ 'Authorization':'Bearer '+token } })
      .then(r=>r.json())
      .then(data=>{ _renderList(Array.isArray(data)?data:[]); })
      .catch(()=>{ _renderList([]); });
  }

  function _fetchUnreadCount(){
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token) return;
    fetch('/api/notifications/unread-count', { headers:{ 'Authorization':'Bearer '+token } })
      .then(r=>r.json())
      .then(d=>{ _setBadge(d.count||0); })
      .catch(()=>{});
  }

  // ── Mark all read ──────────────────────────────────
  function markAllRead(){
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token) return;
    fetch('/api/notifications/read-all', {
      method:'PUT',
      headers:{ 'Authorization':'Bearer '+token }
    }).then(()=>{
      _setBadge(0);
      document.querySelectorAll('.notif-item.unread').forEach(el=>el.classList.remove('unread'));
    }).catch(()=>{});
  }

  // ── Render ─────────────────────────────────────────
  function _renderList(notifs){
    const list = document.getElementById('notif-list');
    if(!list) return;
    if(!notifs || notifs.length===0){
      list.innerHTML = '<div class="notif-empty">No notifications yet 🔔</div>';
      _setBadge(0);
      return;
    }
    const u = notifs.filter(n=>!n.read).length;
    _setBadge(u);
    list.innerHTML = notifs.map(n=>`
      <div class="notif-item ${n.read?'':'unread'}" onclick="window.vmNotif.openNotif('${_esc(n.id)}','${_esc(n.threadId||'')}')">
        <div class="notif-icon">${_icon(n.type)}</div>
        <div class="notif-body">
          <div class="notif-text">${_label(n)}</div>
          <div class="notif-time">${_timeAgo(n.createdAt)}</div>
        </div>
      </div>
    `).join('');
  }

  function _prependNotification(n){
    const list = document.getElementById('notif-list');
    if(!list) return;
    const empty = list.querySelector('.notif-empty');
    if(empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'notif-item unread';
    div.onclick = ()=>openNotif(n.id, n.threadId||'');
    div.innerHTML = `
      <div class="notif-icon">${_icon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-text">${_label(n)}</div>
        <div class="notif-time">just now</div>
      </div>
    `;
    list.insertBefore(div, list.firstChild);
  }

  // ── Navigate from notification ─────────────────────
  function openNotif(notifId, threadId){
    const token = localStorage.getItem(TOKEN_KEY);
    if(token && notifId){
      fetch('/api/notifications/'+notifId+'/read', {
        method:'PUT', headers:{'Authorization':'Bearer '+token}
      }).catch(()=>{});
    }
    if(threadId) {
      window.location.href = '/dashboard.html?chat=' + threadId;
    }
    document.getElementById('notif-dropdown')?.classList.add('hidden');
  }

  // ── Badge ──────────────────────────────────────────
  function _setBadge(n){
    unread = n;
    const badge = document.getElementById('notif-badge');
    if(!badge) return;
    if(n>0){ badge.textContent = n>99?'99+':n; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  }

  // ── Helpers ────────────────────────────────────────
  function _icon(type){
    const icons = { chat_message:'💬', new_review:'⭐', new_follow:'❤️', new_lead:'📩' };
    return icons[type] || '🔔';
  }

  function _label(n){
    if(n.type==='chat_message')
      return `<strong>${_esc(n.senderName||'Someone')}</strong> sent you a message in <em>${_esc(n.listingName||'your listing')}</em>`;
    if(n.type==='new_review')
      return `New review on <em>${_esc(n.listingName||'your listing')}</em>`;
    if(n.type==='new_lead')
      return `New enquiry on <em>${_esc(n.listingName||'your listing')}</em>`;
    if(n.type==='new_follow')
      return `Someone saved <em>${_esc(n.listingName||'your listing')}</em>`;
    return n.type || 'Notification';
  }

  function _esc(str){
    if(!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _timeAgo(iso){
    if(!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if(diff < 60)   return 'just now';
    if(diff < 3600) return Math.floor(diff/60) + 'm ago';
    if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return new Date(iso).toLocaleDateString();
  }

  window.vmNotif = { mount, toggle, markAllRead, openNotif };

})();
