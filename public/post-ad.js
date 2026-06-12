/* Post Ad JS */

let currentStep = 1;

// Nav update
(function() {
  const user = Auth?.getUser?.();
  const cta  = document.getElementById('nav-cta');
  if (user && cta) {
    cta.innerHTML = `<a href="/dashboard.html" class="btn-ghost">My Dashboard</a>`;
  }
  const ham = document.getElementById('hamburger');
  const mob = document.getElementById('mobile-menu');
  ham?.addEventListener('click', () => mob?.classList.toggle('open'));
})();

// Step navigation
function showStep(n) {
  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  document.getElementById('step-' + n)?.classList.add('active');

  document.querySelectorAll('.progress-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active','done');
    if (s === n) el.classList.add('active');
    else if (s < n) el.classList.add('done');
  });
  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep(n) {
  if (!validateStep(currentStep)) return;
  showStep(n);
}

function prevStep(n) { showStep(n); }

window.nextStep = nextStep;
window.prevStep = prevStep;

// Validation
function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('businessName')?.value.trim();
    const cat  = document.getElementById('category')?.value;
    const desc = document.getElementById('description')?.value.trim();
    if (!name) { alert('Please enter a business name.'); return false; }
    if (!cat)  { alert('Please select a category.'); return false; }
    if (!desc || desc.length < 20) { alert('Please write a description (at least 20 characters).'); return false; }
  }
  if (step === 2) {
    const country  = document.getElementById('country')?.value;
    const whatsapp = document.querySelector('[name="whatsapp"]')?.value.trim();
    const phone    = document.querySelector('[name="phone"]')?.value.trim();
    const email    = document.querySelector('[name="email"]')?.value.trim();
    if (!country) { alert('Please select your country.'); return false; }
    if (!whatsapp && !phone && !email) { alert('Please add at least one contact method (WhatsApp, phone, or email).'); return false; }
  }
  return true;
}

// Description char count
document.getElementById('description')?.addEventListener('input', function() {
  document.getElementById('desc-count').textContent = this.value.length;
});

// Image preview
window.previewImages = function(input) {
  const container = document.getElementById('image-previews');
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

// Video preview
window.previewVideos = function(input) {
  const box = document.getElementById('video-names');
  box.innerHTML = Array.from(input.files).map(f => `<div>🎬 ${f.name}</div>`).join('');
};

// Submit form
document.getElementById('post-ad-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!validateStep(4)) return;

  const btn     = document.getElementById('submit-btn');
  const txtEl   = document.getElementById('submit-text');
  const spinEl  = document.getElementById('submit-spinner');
  const errEl   = document.getElementById('submit-error');

  btn.disabled  = true;
  txtEl.style.display  = 'none';
  spinEl.style.display = 'inline-block';
  errEl.style.display  = 'none';

  try {
    // Handle optional registration
    const regName  = document.getElementById('reg-name')?.value.trim();
    const regEmail = document.getElementById('reg-email')?.value.trim();
    const regPass  = document.getElementById('reg-password')?.value;
    let token = Auth.getToken();

    if (!token && regName && regEmail && regPass) {
      const regRes = await fetch('/api/auth/register', {
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

    // Build form data
    const fd = new FormData(this);
    // Remove registration fields from form data
    fd.delete('reg_name'); fd.delete('reg_email'); fd.delete('reg_password');

    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res  = await fetch('/api/listings', { method: 'POST', headers, body: fd });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to submit');

    // Success
    const viewBtn = document.getElementById('view-listing-btn');
    if (viewBtn) viewBtn.href = `/business.html?id=${data.listing.id}`;
    showStep('success');

  } catch (err) {
    errEl.textContent   = err.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled        = false;
    txtEl.style.display = 'inline';
    spinEl.style.display= 'none';
  }
});
