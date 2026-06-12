/* post-ad.js — GrowthMarket v3 */

let currentStep = 1;
let editListingId = null;

// Nav update
(function() {
  const user = (typeof Auth !== 'undefined') ? Auth.getUser?.() : null;
  const cta  = document.getElementById('nav-cta');
  if (user && cta) cta.innerHTML = `<a href="/dashboard.html" class="btn-ghost">My Dashboard</a>`;
  const ham = document.getElementById('hamburger');
  const mob = document.getElementById('mobile-menu');
  ham?.addEventListener('click', () => mob?.classList.toggle('open'));
})();

// ── Edit mode: pre-fill form if ?edit=ID is in URL ───
(async function checkEditMode() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (!editId) return;
  editListingId = editId;

  // Update page title
  const titleEl = document.querySelector('.sidebar-brand h3');
  if (titleEl) titleEl.textContent = 'Edit Your Listing';
  const submitBtn = document.getElementById('submit-btn');
  const submitText = document.getElementById('submit-text');
  if (submitText) submitText.textContent = 'Save Changes';
  else if (submitBtn) submitBtn.textContent = 'Save Changes';

  // Fetch existing listing data
  try {
    const token = localStorage.getItem('gm_token');
    const r = await fetch(`/api/listings/${editId}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const d = await r.json();
    const l = d.listing || d;
    if (!l || !l.businessName) return;

    // Pre-fill Step 1
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    const setName = (name, val) => { const el = document.querySelector(`[name="${name}"]`); if (el && val !== undefined) el.value = val; };

    set('businessName', l.businessName);
    set('category', l.category);
    set('description', l.description);
    setName('tagline', l.tagline);
    if (document.getElementById('desc-count')) document.getElementById('desc-count').textContent = (l.description||'').length;

    // Pre-fill Step 2
    setName('phone', l.phone);
    setName('whatsapp', l.whatsapp || l.phone);
    const emailEl = document.getElementById('contact-email'); if (emailEl) emailEl.value = l.email || '';
    setName('website', l.website);
    setName('address', l.address);
    set('country', l.country);
    setName('city', l.city);

    // Pre-fill Step 4 (social)
    setName('instagram', l.instagram);
    setName('facebook', l.facebook);
    setName('twitter', l.twitter);
    setName('tiktok', l.tiktok);
    setName('linkedin', l.linkedin);
    setName('youtube', l.youtube);

    // Show existing images
    if (l.images && l.images.length) {
      const container = document.getElementById('image-previews');
      if (container) {
        container.innerHTML = l.images.map(url => `
          <div class="image-preview-item">
            <img src="${url}" alt="existing photo" style="object-fit:cover;width:100%;height:100%"/>
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);font-size:0.7rem;text-align:center;padding:3px;color:#aaa">Existing</div>
          </div>`).join('');
      }
    }

  } catch(e) { console.warn('Edit prefill failed:', e); }
})();

// Step navigation
function showStep(n) {
  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  const el = (typeof n === 'string')
    ? document.getElementById('step-' + n)
    : document.getElementById('step-' + n);
  if (el) el.classList.add('active');

  document.querySelectorAll('.progress-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active','done');
    if (s === n) el.classList.add('active');
    else if (s < n) el.classList.add('done');
  });
  if (typeof n === 'number') currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep(n) { if (!validateStep(currentStep)) return; showStep(n); }
function prevStep(n) { showStep(n); }
window.nextStep = nextStep;
window.prevStep = prevStep;

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('businessName')?.value.trim();
    const cat  = document.getElementById('category')?.value;
    const desc = document.getElementById('description')?.value.trim();
    if (!name) { showError('Please enter a business name.'); return false; }
    if (!cat)  { showError('Please select a category.'); return false; }
    if (!desc || desc.length < 20) { showError('Please write a description (at least 20 characters).'); return false; }
  }
  if (step === 2) {
    const country  = document.getElementById('country')?.value;
    const whatsapp = document.querySelector('[name="whatsapp"]')?.value.trim();
    const phone    = document.querySelector('[name="phone"]')?.value.trim();
    const email    = document.getElementById('contact-email')?.value.trim();
    if (!country) { showError('Please select your country.'); return false; }
    if (!whatsapp && !phone && !email) { showError('Please add at least one contact method (WhatsApp, phone, or email).'); return false; }
  }
  return true;
}

function showError(msg) {
  const errEl = document.getElementById('submit-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; setTimeout(()=>errEl.style.display='none',5000); }
  else alert(msg);
}

// Description char count
document.getElementById('description')?.addEventListener('input', function() {
  document.getElementById('desc-count').textContent = this.value.length;
});

// Image preview
window.previewImages = function(input) {
  const container = document.getElementById('image-previews');
  if (!container) return;
  container.innerHTML = '';
  Array.from(input.files).slice(0,8).forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `<img src="${url}" alt="preview"/><button type="button" class="image-preview-remove" onclick="removeImage(${i})">✕</button>`;
    container.appendChild(div);
  });
};

window.removeImage = function(idx) {
  const input = document.getElementById('images');
  const dt    = new DataTransfer();
  Array.from(input.files).forEach((f,i) => { if (i !== idx) dt.items.add(f); });
  input.files = dt.files;
  previewImages(input);
};

window.previewVideos = function(input) {
  const box = document.getElementById('video-names');
  if (box) box.innerHTML = Array.from(input.files).map(f => `<div>🎬 ${f.name}</div>`).join('');
};

window.previewSampleVideo = function(input) {
  const box = document.getElementById('sample-video-preview');
  const zone = document.getElementById('sample-video-zone');
  if (!input.files[0]) return;
  const file = input.files[0];
  const url  = URL.createObjectURL(file);
  if (box) {
    box.innerHTML = `
      <div style="position:relative;display:inline-block;max-width:200px;border-radius:12px;overflow:hidden;border:2px solid var(--brand)">
        <video src="${url}" controls style="width:100%;display:block;max-height:320px;object-fit:cover"></video>
        <div style="position:absolute;top:6px;right:6px">
          <button type="button" onclick="clearSampleVideo()" style="background:rgba(0,0,0,0.7);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.9rem">✕</button>
        </div>
      </div>
      <div style="font-size:0.8rem;color:var(--brand);font-weight:600;margin-top:6px">✅ Reel ready — you'll appear in the homepage feed!</div>`;
  }
  if (zone) {
    const inner = zone.querySelector('.upload-zone-inner');
    if (inner) inner.style.display = 'none';
  }
};

window.clearSampleVideo = function() {
  const input = document.getElementById('sampleVideo');
  const box   = document.getElementById('sample-video-preview');
  const zone  = document.getElementById('sample-video-zone');
  if (input) input.value = '';
  if (box)   box.innerHTML = '';
  if (zone) {
    const inner = zone.querySelector('.upload-zone-inner');
    if (inner) inner.style.display = '';
  }
};

// Submit
document.getElementById('post-ad-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const btn    = document.getElementById('submit-btn');
  const txtEl  = document.getElementById('submit-text');
  const spinEl = document.getElementById('submit-spinner');
  const errEl  = document.getElementById('submit-error');

  btn.disabled = true;
  if (txtEl)  txtEl.style.display  = 'none';
  if (spinEl) spinEl.style.display = 'inline-block';
  if (errEl)  errEl.style.display  = 'none';

  try {
    // Optional registration flow
    const regName  = document.getElementById('reg-name')?.value.trim();
    const regEmail = document.getElementById('reg-email')?.value.trim();
    const regPass  = document.getElementById('reg-password')?.value;
    let token = (typeof Auth !== 'undefined') ? Auth.getToken() : localStorage.getItem('gm_token');

    if (!token && regName && regEmail && regPass) {
      const regRes  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPass })
      });
      const regData = await regRes.json();
      if (regData.token) {
        token = regData.token;
        localStorage.setItem('gm_token', token);
        localStorage.setItem('gm_user', JSON.stringify(regData.user));
      }
    }

    // Build form data — contact email uses contact-email field id, but name="email" for server
    const fd = new FormData(this);
    // Clean up internal registration fields
    fd.delete('reg_name'); fd.delete('reg_email'); fd.delete('reg_password');

    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const isEdit = !!editListingId;
    const res = isEdit
      ? await fetch(`/api/listings/${editListingId}`, { method: 'PUT', headers, body: fd })
      : await fetch('/api/listings', { method: 'POST', headers, body: fd });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to submit. Please try again.');

    // Success!
    const listingId = isEdit ? editListingId : data.listing?.id;
    const viewBtn = document.getElementById('view-listing-btn');
    if (viewBtn && listingId) viewBtn.href = `/business.html?id=${listingId}`;
    showStep('success');

  } catch (err) {
    const msg = err.message || 'Something went wrong. Please try again.';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    else alert(msg);
    btn.disabled = false;
    if (txtEl)  txtEl.style.display  = 'inline';
    if (spinEl) spinEl.style.display = 'none';
  }
});
