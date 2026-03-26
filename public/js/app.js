/* global document, fetch, FileReader, FormData, performance, requestAnimationFrame, setTimeout */

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const elLeaderboard   = document.getElementById('leaderboard');
const elPodium        = document.getElementById('podium');
const elPodiumSection = document.getElementById('podiumSection');
const elModalOverlay  = document.getElementById('modalOverlay');
const elForm          = document.getElementById('registerForm');
const elFormError     = document.getElementById('formError');
const elSubmitBtn     = document.getElementById('submitBtn');
const elSubmitLabel   = document.getElementById('submitLabel');

// ─── Init ──────────────────────────────────────────────────────────────────────
loadLeaderboard();
setInterval(loadLeaderboard, 60_000); // refresh every minute

// ─── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const res   = await fetch('/api/leaderboard');
    const users = await res.json();
    renderStats(users);
    renderPodium(users);
    renderRows(users);
  } catch {
    elLeaderboard.innerHTML =
      '<div class="loading">Unable to load leaderboard — retrying soon…</div>';
  }
}

function renderStats(users) {
  const total = users.reduce((s, u) => s + u.swim_count, 0);
  const leader = users[0];

  animateNum('totalUsers',   users.length);
  animateNum('totalClasses', total);

  const elTop = document.getElementById('topSwimmer');
  elTop.textContent = leader ? leader.name.split(' ')[0] : '–';
}

function renderPodium(users) {
  if (users.length < 2) {
    elPodiumSection.style.display = 'none';
    return;
  }

  elPodiumSection.style.display = '';

  const top3   = users.slice(0, Math.min(3, users.length));
  const medals = ['🥇', '🥈', '🥉'];

  // Visual order: silver | gold | bronze (classic podium layout)
  const order = top3.length === 2 ? [1, 0] : [1, 0, 2];

  elPodium.innerHTML = order.map(i => {
    const u    = top3[i];
    const rank = i + 1;
    return `
      <div class="podium-card rank-${rank}" title="${escHtml(u.name)}">
        <div class="podium-medal">${medals[i]}</div>
        ${avatar(u, 'podium-avatar')}
        <div class="podium-name">${escHtml(u.name)}</div>
        <div class="podium-count">${u.swim_count}</div>
        <div class="podium-count-label">class${u.swim_count !== 1 ? 'es' : ''}</div>
      </div>`;
  }).join('');
}

function renderRows(users) {
  if (users.length === 0) {
    elLeaderboard.innerHTML = `
      <div class="empty-state">
        <h3>🌊 No swimmers yet!</h3>
        <p>Be the first to join the squad and start logging your classes.</p>
      </div>`;
    return;
  }

  const maxCount = users[0].swim_count || 1;

  elLeaderboard.innerHTML = users.map((u, i) => {
    const rank    = i + 1;
    const medal   = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const pct     = Math.max(4, Math.round((u.swim_count / maxCount) * 100));

    return `
      <div class="lb-row" role="listitem" style="animation-delay:${i * 40}ms">
        <span class="lb-rank ${rankCls}" aria-label="Rank ${rank}">${medal}</span>
        ${avatar(u, 'lb-avatar')}
        <div class="lb-info">
          <div class="lb-name">${escHtml(u.name)}</div>
          <div class="lb-progress-wrap" role="progressbar" aria-valuenow="${u.swim_count}" aria-valuemin="0" aria-valuemax="${maxCount}">
            <div class="lb-progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="lb-count">
          <span class="lb-count-num">${u.swim_count}</span>
          <span class="lb-count-label">class${u.swim_count !== 1 ? 'es' : ''}</span>
        </div>
      </div>`;
  }).join('');
}

function avatar(u, cls) {
  if (u.photo_path) {
    return `<div class="${cls}"><img src="${escHtml(u.photo_path)}" alt="${escHtml(u.name)}" loading="lazy"></div>`;
  }
  return `<div class="${cls}"><span>${initials(u.name)}</span></div>`;
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
document.getElementById('openRegister').addEventListener('click', openModal);
document.getElementById('closeModal').addEventListener('click', closeModal);

elModalOverlay.addEventListener('click', e => {
  if (e.target === elModalOverlay) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

function openModal() {
  elModalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('reg-name').focus();
}

function closeModal() {
  elModalOverlay.classList.remove('active');
  document.body.style.overflow = '';
  elForm.reset();
  document.getElementById('photoPreview').style.display = 'none';
  document.getElementById('photoPlaceholder').style.display = '';
  elFormError.style.display = 'none';
}

// ─── Photo preview ─────────────────────────────────────────────────────────────
const elPhotoUpload  = document.getElementById('photoUpload');
const elPhotoInput   = document.getElementById('reg-photo');
const elPhotoPreview = document.getElementById('photoPreview');
const elPhotoHolder  = document.getElementById('photoPlaceholder');

elPhotoUpload.addEventListener('click', () => elPhotoInput.click());

elPhotoUpload.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elPhotoInput.click(); }
});

elPhotoInput.addEventListener('change', () => {
  const file = elPhotoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    elPhotoPreview.src = ev.target.result;
    elPhotoPreview.style.display = 'block';
    elPhotoHolder.style.display  = 'none';
  };
  reader.readAsDataURL(file);
});

// ─── Registration submit ────────────────────────────────────────────────────────
elForm.addEventListener('submit', async e => {
  e.preventDefault();
  elFormError.style.display = 'none';
  elSubmitBtn.disabled = true;
  elSubmitLabel.textContent = 'Joining…';

  try {
    const res  = await fetch('/api/register', { method: 'POST', body: new FormData(elForm) });
    const data = await res.json();

    if (!res.ok) {
      showFormError(data.error || 'Registration failed. Please try again.');
      return;
    }

    closeModal();
    showToast(`Welcome, ${data.user.name}! 🎉 You're on the leaderboard.`, 'success');
    await loadLeaderboard();
  } catch {
    showFormError('Network error — please check your connection.');
  } finally {
    elSubmitBtn.disabled = false;
    elSubmitLabel.textContent = 'Join SwimLog';
  }
});

function showFormError(msg) {
  elFormError.textContent = msg;
  elFormError.style.display = 'block';
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function animateNum(id, target) {
  const el    = document.getElementById(id);
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;

  const dur   = 600;
  const t0    = performance.now();

  (function tick(now) {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(start + (target - start) * easeOut(p));
    if (p < 1) requestAnimationFrame(tick);
  })(performance.now());
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, 4200);
}
