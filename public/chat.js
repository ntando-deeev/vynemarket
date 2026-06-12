/* ══════════════════════════════════════════════════
   VyneMarket — Live Chat Widget
   Requires: socket.io client loaded before this file
   ══════════════════════════════════════════════════ */

(function(){
  'use strict';

  // ── State ──────────────────────────────────────────
  let socket       = null;
  let threadId     = null;
  let isOpen       = false;
  let pendingFile  = null;   // { file, previewUrl, type }
  let typingTimer  = null;
  let isTyping     = false;
  let listingId    = null;
  let listingName  = 'Business';
  let ownerOnline  = false;
  let currentUser  = null;   // from localStorage

  const TOKEN_KEY = 'vm_token';

  // ── Init ───────────────────────────────────────────
  function init(opts){
    listingId   = opts.listingId;
    listingName = opts.listingName || 'Business';
    const avatarUrl = opts.avatarUrl || null;

    currentUser = _getUser();

    // Build DOM
    _buildWidget(avatarUrl);

    // Connect socket
    socket = io({ transports:['websocket','polling'] });
    socket.on('connect', ()=>{
      const token = localStorage.getItem(TOKEN_KEY);
      if(token) socket.emit('auth', token);
    });
    socket.on('chat_message',  _onIncomingMessage);
    socket.on('typing',        _onTypingIndicator);

    // Check online status
    _checkOnline();
    setInterval(_checkOnline, 30000);
  }

  // ── Build Widget DOM ───────────────────────────────
  function _buildWidget(avatarUrl){
    // FAB button
    const fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.id = 'chat-fab';
    fab.setAttribute('aria-label', 'Open live chat');
    fab.innerHTML = '💬<span class="chat-fab-badge hidden" id="chat-fab-badge">0</span>';
    fab.addEventListener('click', toggleChat);
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'chat-panel hidden';
    panel.id = 'chat-panel';
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${listingName}"/>`
      : '🏪';
    panel.innerHTML = `
      <div class="chat-panel-header">
        <div class="chat-biz-avatar" id="chat-avatar">${avatarHtml}</div>
        <div class="chat-biz-info">
          <div class="chat-biz-name">${_esc(listingName)}</div>
          <div class="chat-status">
            <span class="chat-status-dot offline" id="chat-status-dot"></span>
            <span id="chat-status-text">Checking…</span>
          </div>
        </div>
        <button class="chat-panel-close" onclick="window.vmChat.close()" aria-label="Close chat">✕</button>
      </div>

      <!-- Guest form (shown if not logged in and no thread yet) -->
      <div class="chat-guest-form" id="chat-guest-form">
        <h4>💬 Start a conversation</h4>
        <p>We'll reply as soon as possible.</p>
        <input type="text"  id="chat-guest-name"  placeholder="Your name *" required/>
        <input type="email" id="chat-guest-email" placeholder="Your email (optional)"/>
        <button onclick="window.vmChat.startGuest()">Start Chat →</button>
      </div>

      <!-- Messages area (hidden until thread is ready) -->
      <div class="chat-messages hidden" id="chat-messages"></div>
      <div class="chat-typing hidden" id="chat-typing"></div>

      <!-- Upload preview -->
      <div class="chat-upload-preview hidden" id="chat-upload-preview">
        <span id="chat-upload-thumb"></span>
        <span id="chat-upload-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
        <button class="remove-preview" onclick="window.vmChat.clearFile()">✕</button>
      </div>

      <!-- Input bar -->
      <div class="chat-input-bar hidden" id="chat-input-bar">
        <input type="file" id="chat-file-input" accept="image/*,video/mp4,video/webm,video/quicktime"/>
        <button class="chat-attach-btn" onclick="document.getElementById('chat-file-input').click()" title="Attach image or video">📎</button>
        <textarea id="chat-textarea" placeholder="Type a message…" rows="1" maxlength="1000"></textarea>
        <button class="chat-send-btn" id="chat-send-btn" onclick="window.vmChat.sendMessage()" disabled title="Send">➤</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Events
    const textarea = document.getElementById('chat-textarea');
    textarea.addEventListener('input', _onTextareaInput);
    textarea.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); window.vmChat.sendMessage(); }
    });

    const fileInput = document.getElementById('chat-file-input');
    fileInput.addEventListener('change', e=>{ if(e.target.files[0]) _previewFile(e.target.files[0]); });
  }

  // ── Toggle ─────────────────────────────────────────
  function toggleChat(){
    isOpen ? close() : open();
  }

  function open(){
    isOpen = true;
    document.getElementById('chat-panel').classList.remove('hidden');
    // If already have a thread (user is logged in with existing thread), load it
    if(!threadId && currentUser){
      _loadOrCreateThread();
    }
    _hideFabBadge();
  }

  function close(){
    isOpen = false;
    document.getElementById('chat-panel').classList.add('hidden');
  }

  // ── Guest start ────────────────────────────────────
  function startGuest(){
    const name  = document.getElementById('chat-guest-name').value.trim();
    const email = document.getElementById('chat-guest-email').value.trim();
    if(!name){ alert('Please enter your name.'); return; }
    _createThread(null, name, email);
  }

  // ── Thread management ──────────────────────────────
  function _loadOrCreateThread(){
    const cached = sessionStorage.getItem('vm_thread_' + listingId);
    if(cached){
      threadId = cached;
      _loadThread(threadId);
      return;
    }
    _createThread(currentUser, null, null);
  }

  function _createThread(user, guestName, guestEmail){
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type':'application/json' };
    if(token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/chat/thread', {
      method:'POST',
      headers,
      body: JSON.stringify({ listingId, guestName, guestEmail })
    })
    .then(r=>r.json())
    .then(data=>{
      if(data.thread){
        threadId = data.thread.id;
        sessionStorage.setItem('vm_thread_' + listingId, threadId);
        _showChatUI(data.thread);
      }
    })
    .catch(err=>console.error('Chat thread error:', err));
  }

  function _loadThread(id){
    fetch('/api/chat/thread/' + id)
      .then(r=>r.json())
      .then(data=>{ if(data.id) _showChatUI(data); })
      .catch(err=>console.error('Load thread error:', err));
  }

  function _showChatUI(thread){
    // Hide guest form, show messages + input
    document.getElementById('chat-guest-form').classList.add('hidden');
    document.getElementById('chat-messages').classList.remove('hidden');
    document.getElementById('chat-input-bar').classList.remove('hidden');

    // Render existing messages
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if(thread.messages && thread.messages.length>0){
      thread.messages.forEach(m=>_renderMessage(m));
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:24px 0">Say hello! 👋</div>';
    }
    _scrollToBottom();

    // Join socket room
    if(socket) socket.join ? socket.emit('join_thread', thread.id) : socket.emit('join_thread', thread.id);

    // Mark as read
    const token = localStorage.getItem(TOKEN_KEY);
    if(token){
      fetch('/api/chat/thread/' + thread.id + '/read', {
        method:'PUT',
        headers:{ 'Authorization':'Bearer ' + token }
      }).catch(()=>{});
    }
  }

  // ── Send message ───────────────────────────────────
  function sendMessage(){
    if(pendingFile) { _uploadFile(); return; }
    const textarea = document.getElementById('chat-textarea');
    const text = textarea.value.trim();
    if(!text) return;

    if(socket && socket.connected){
      socket.emit('send_message', { threadId, text });
    } else {
      // REST fallback
      const token = localStorage.getItem(TOKEN_KEY);
      const headers = { 'Content-Type':'application/json' };
      if(token) headers['Authorization'] = 'Bearer ' + token;
      fetch('/api/chat/thread/' + threadId + '/message', {
        method:'POST', headers,
        body: JSON.stringify({ text })
      }).then(r=>r.json()).then(d=>{ if(d.message) _renderMessage(d.message); }).catch(console.error);
    }
    textarea.value = '';
    textarea.style.height = 'auto';
    document.getElementById('chat-send-btn').disabled = true;
    _sendTypingStop();
  }

  // ── File upload ────────────────────────────────────
  function _previewFile(file){
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);
    pendingFile = { file, previewUrl: url, type: isVideo ? 'video' : 'image' };

    const thumb = document.getElementById('chat-upload-thumb');
    const nameEl = document.getElementById('chat-upload-name');
    if(isVideo){
      thumb.innerHTML = `<video src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px"></video>`;
    } else {
      thumb.innerHTML = `<img src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px"/>`;
    }
    nameEl.textContent = file.name;
    document.getElementById('chat-upload-preview').classList.remove('hidden');
    document.getElementById('chat-send-btn').disabled = false;
  }

  function clearFile(){
    pendingFile = null;
    document.getElementById('chat-upload-preview').classList.add('hidden');
    document.getElementById('chat-upload-thumb').innerHTML = '';
    document.getElementById('chat-file-input').value = '';
    const textarea = document.getElementById('chat-textarea');
    document.getElementById('chat-send-btn').disabled = !textarea.value.trim();
  }

  function _uploadFile(){
    if(!pendingFile) return;
    const formData = new FormData();
    formData.append('file', pendingFile.file);
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = {};
    if(token) headers['Authorization'] = 'Bearer ' + token;

    // Optimistic placeholder
    const placeholderMsg = {
      id: 'pending_' + Date.now(),
      createdAt: new Date().toISOString(),
      senderId: currentUser?.id || null,
      senderName: currentUser?.name || 'You',
      isOwner: false,
      type: pendingFile.type,
      fileUrl: pendingFile.previewUrl,
      pending: true
    };
    _renderMessage(placeholderMsg);
    _scrollToBottom();

    fetch('/api/chat/thread/' + threadId + '/upload', {
      method:'POST', headers,
      body: formData
    })
    .then(r=>r.json())
    .then(d=>{
      if(d.message){
        // Replace placeholder
        const el = document.getElementById('msg_' + placeholderMsg.id);
        if(el) el.remove();
        _renderMessage(d.message);
        _scrollToBottom();
      }
    })
    .catch(err=>{ console.error('Upload error:', err); alert('Upload failed. Please try again.'); });

    clearFile();
  }

  // ── Incoming message ───────────────────────────────
  function _onIncomingMessage(msg){
    // Avoid duplicates
    if(document.getElementById('msg_' + msg.id)) return;
    _renderMessage(msg);
    _scrollToBottom();
    if(!isOpen) _showFabBadge();
  }

  // ── Typing indicator ───────────────────────────────
  function _onTypingIndicator({ senderName, isTyping: t }){
    const el = document.getElementById('chat-typing');
    if(!el) return;
    if(t){ el.textContent = senderName + ' is typing…'; el.classList.remove('hidden'); }
    else { el.textContent = ''; el.classList.add('hidden'); }
  }

  function _onTextareaInput(e){
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    const hasText = textarea.value.trim().length > 0;
    document.getElementById('chat-send-btn').disabled = !hasText && !pendingFile;

    // Typing events
    if(!isTyping && hasText){
      isTyping = true;
      if(socket) socket.emit('typing', { threadId, isTyping: true });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(_sendTypingStop, 2000);
  }

  function _sendTypingStop(){
    if(isTyping){
      isTyping = false;
      if(socket) socket.emit('typing', { threadId, isTyping: false });
    }
  }

  // ── Render a message bubble ────────────────────────
  function _renderMessage(msg){
    const container = document.getElementById('chat-messages');
    // Clear "say hello" placeholder if present
    const placeholder = container.querySelector('[data-placeholder]');
    if(placeholder) placeholder.remove();

    const isMine = currentUser ? msg.senderId===currentUser.id : !msg.isOwner;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (isMine ? 'mine' : 'theirs');
    div.id = 'msg_' + msg.id;
    if(msg.pending) div.style.opacity = '0.6';

    let content = '';
    if(msg.type==='image'){
      content = `<img src="${_esc(msg.fileUrl)}" alt="image" onclick="window.open('${_esc(msg.fileUrl)}','_blank')"/>`;
    } else if(msg.type==='video'){
      content = `<video src="${_esc(msg.fileUrl)}" controls></video>`;
    } else {
      content = _esc(msg.text||'').replace(/\n/g,'<br>');
    }

    div.innerHTML = `
      <div class="chat-bubble">${content}</div>
      <div class="chat-msg-meta">${_timeAgo(msg.createdAt)}${!isMine?' · '+_esc(msg.senderName):''}</div>
    `;
    container.appendChild(div);
  }

  // ── Scroll to bottom ───────────────────────────────
  function _scrollToBottom(){
    const el = document.getElementById('chat-messages');
    if(el) el.scrollTop = el.scrollHeight;
  }

  // ── Online status ──────────────────────────────────
  function _checkOnline(){
    if(!listingId) return;
    // We check if the listing owner's userId is online
    // The business.js provides ownerId via opts
    const ownerId = window._chatOwnerId;
    if(!ownerId) return;
    fetch('/api/chat/online/' + ownerId)
      .then(r=>r.json())
      .then(d=>{
        ownerOnline = d.online;
        const dot  = document.getElementById('chat-status-dot');
        const text = document.getElementById('chat-status-text');
        if(!dot||!text) return;
        if(d.online){ dot.classList.remove('offline'); text.textContent = 'Online now'; }
        else { dot.classList.add('offline'); text.textContent = 'Usually replies soon'; }
      })
      .catch(()=>{});
  }

  // ── FAB badge ──────────────────────────────────────
  function _showFabBadge(){
    const b = document.getElementById('chat-fab-badge');
    if(b){ const n = (parseInt(b.textContent)||0)+1; b.textContent = n; b.classList.remove('hidden'); }
  }
  function _hideFabBadge(){
    const b = document.getElementById('chat-fab-badge');
    if(b){ b.textContent='0'; b.classList.add('hidden'); }
  }

  // ── Helpers ────────────────────────────────────────
  function _getUser(){
    try{
      const t = localStorage.getItem(TOKEN_KEY);
      if(!t) return null;
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload;
    }catch{ return null; }
  }

  function _esc(str){
    if(!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _timeAgo(iso){
    if(!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if(diff < 60)  return 'just now';
    if(diff < 3600) return Math.floor(diff/60) + 'm ago';
    if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return new Date(iso).toLocaleDateString();
  }

  // ── Public API ─────────────────────────────────────
  window.vmChat = { init, open, close, toggleChat, sendMessage, startGuest, clearFile };

})();
