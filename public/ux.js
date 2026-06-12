/* VyneMarket — Universal UX helpers */

// ── Scroll to top button ──────────────────────────────
(function() {
  const btn = document.createElement('button');
  btn.id = 'scroll-top-btn';
  btn.innerHTML = '↑';
  btn.setAttribute('aria-label', 'Back to top');
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
})();

// ── Mobile menu close on link click ──────────────────
document.addEventListener('DOMContentLoaded', function() {
  const mob = document.getElementById('mobile-menu');
  if (mob) {
    mob.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => mob.classList.remove('open'));
    });
  }
});

// ── Auto-update nav for logged-in users (all pages) ──
(function() {
  const token = localStorage.getItem('gm_token');
  if (!token) return;
  let user;
  try { user = JSON.parse(localStorage.getItem('gm_user')); } catch { return; }
  if (!user) return;

  // On login page or register page, redirect to dashboard
  const path = window.location.pathname;
  if (path === '/login.html' || path === '/register.html') {
    window.location = '/dashboard.html';
    return;
  }

  // Update any nav-login links
  const navLogin = document.getElementById('nav-login');
  if (navLogin) {
    navLogin.textContent = 'My Dashboard';
    navLogin.href = '/dashboard.html';
  }

  // Update mobile sign-in link
  const mobileSignin = document.getElementById('mobile-signin');
  if (mobileSignin) {
    mobileSignin.textContent = 'My Dashboard';
    mobileSignin.href = '/dashboard.html';
  }
})();

// ── Copy to clipboard helper ──────────────────────────
window.vyneClipboard = async function(text, btn, successText) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = successText || '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
    return true;
  } catch {
    return false;
  }
};
