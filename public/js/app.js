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
      <div class="lb-row" role="listitem" style="animation-delay:${i * 40}ms" data-user-id="${u.id}">
        <span class="lb-rank ${rankCls}" aria-label="Rank ${rank}">${medal}</span>
        ${avatar(u, 'lb-avatar')}
        <div class="lb-info">
          <button class="lb-name lb-name-btn" data-user-id="${u.id}" title="View profile">${escHtml(u.name)}</button>
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

  // Attach click listeners to name buttons
  elLeaderboard.querySelectorAll('.lb-name-btn').forEach(btn => {
    btn.addEventListener('click', () => openProfile(parseInt(btn.dataset.userId, 10)));
  });
}

function avatar(u, cls) {
  if (u.photo_path) {
    return `<div class="${cls}"><img src="${escHtml(u.photo_path)}" alt="${escHtml(u.name)}" loading="lazy"></div>`;
  }
  return `<div class="${cls}"><span>${initials(u.name)}</span></div>`;
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
const elProfileOverlay = document.getElementById('profileOverlay');
document.getElementById('closeProfile').addEventListener('click', closeProfile);
elProfileOverlay.addEventListener('click', e => { if (e.target === elProfileOverlay) closeProfile(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfile(); });

async function openProfile(userId) {
  try {
    const res  = await fetch(`/api/user/${userId}`);
    if (!res.ok) { showToast('Could not load profile.', 'error'); return; }
    const u = await res.json();

    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    if (u.photo_path) {
      avatarEl.innerHTML = `<img src="${escHtml(u.photo_path)}" alt="${escHtml(u.name)}">`;
    } else {
      avatarEl.innerHTML = `<span>${initials(u.name)}</span>`;
      avatarEl.removeAttribute('style');
    }

    document.getElementById('profileName').textContent  = u.name;
    document.getElementById('profileEmail').textContent = u.email;
    document.getElementById('profilePhone').textContent = u.phone;
    document.getElementById('profileCount').textContent = u.swim_count;
    document.getElementById('profileSince').textContent =
      new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    // Streak
    document.getElementById('profileStreak').textContent = calcStreak(u.history);

    // Badge
    const badge = document.getElementById('profileBadge');
    const cnt = u.swim_count;
    badge.textContent = cnt >= 50 ? '🏆 Legend' : cnt >= 30 ? '🌟 Elite' : cnt >= 20 ? '⭐ Pro' : cnt >= 10 ? '💪 Regular' : cnt >= 5 ? '🌊 Beginner' : '🐣 Newbie';

    // Activity graph
    renderActivityGraph(u.history);

    elProfileOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch {
    showToast('Failed to load profile.', 'error');
  }
}

function closeProfile() {
  elProfileOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// ─── Activity Graph (GitHub-style, current year) ───────────────────────────
const CELL      = 13;   // cell size px
const GAP       = 3;    // gap between cells px
const COL       = CELL + GAP;   // 16px per week column
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

// Tooltip element — single shared instance
let agTooltip;
function getTooltip() {
  if (!agTooltip) {
    agTooltip = document.createElement('div');
    agTooltip.className = 'ag-tooltip';
    document.body.appendChild(agTooltip);
  }
  return agTooltip;
}

function renderActivityGraph(history) {
  const swimSet = new Set(history);
  const year    = new Date().getFullYear();
  const today   = new Date().toISOString().slice(0, 10);

  document.getElementById('activityYear').textContent = year;

  const jan1   = new Date(year, 0, 1);
  const dec31  = new Date(year, 11, 31);

  const startSun = new Date(jan1);
  startSun.setDate(jan1.getDate() - jan1.getDay());

  const endSat = new Date(dec31);
  endSat.setDate(dec31.getDate() + (6 - dec31.getDay()));

  const cols        = [];
  const monthLabels = [];
  let lastMonth     = -1;
  let colIdx        = 0;

  const cur = new Date(startSun);
  while (cur <= endSat) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dateStr  = cur.toISOString().slice(0, 10);
      const thisYear = cur.getFullYear() === year;
      const inFuture = dateStr > today;
      col.push({ date: dateStr, active: swimSet.has(dateStr), future: inFuture, dimmed: !thisYear });
      if (d === 0 && thisYear) {
        const m = cur.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ col: colIdx, label: cur.toLocaleString('default', { month: 'short' }) });
          lastMonth = m;
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
    colIdx++;
  }

  const graphEl  = document.getElementById('activityGraph');
  const monthsEl = document.getElementById('activityMonths');

  const DAY_COL_W = 28;
  monthsEl.style.position   = 'relative';
  monthsEl.style.height     = '18px';
  monthsEl.style.marginLeft = `${DAY_COL_W}px`;
  monthsEl.style.width      = `${cols.length * COL}px`;
  monthsEl.innerHTML = monthLabels.map(ml =>
    `<span style="left:${ml.col * COL}px">${ml.label}</span>`
  ).join('');

  // Graph HTML
  graphEl.innerHTML =
    `<div class="ag-day-labels">${DAY_LABELS.map(l => `<span>${l}</span>`).join('')}</div>` +
    `<div class="ag-cols">${
      cols.map(col => {
        return `<div class="ag-col">${col.map(cell => {
          let c = 'ag-cell';
          if (cell.dimmed)  c += ' ag-dim';
          if (cell.active)  c += ' ag-active';
          if (cell.future)  c += ' ag-future';
          // Friendly tooltip label e.g. "Thu, Mar 26"
          const d = new Date(cell.date + 'T00:00:00');
          const label = cell.dimmed ? '' : d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
          return `<div class="${c}" data-tip="${label}"></div>`;
        }).join('')}</div>`
      }).join('')
    }</div>`;

  // Tooltip events — single delegated listener on the graph
  const tip = getTooltip();
  graphEl.addEventListener('mousemove', e => {
    const cell = e.target.closest('.ag-cell');
    if (!cell || !cell.dataset.tip) { tip.style.display = 'none'; return; }
    tip.textContent = cell.dataset.tip;
    tip.style.display = 'block';
    // Position above the cursor
    const r = cell.getBoundingClientRect();
    tip.style.left = `${r.left + window.scrollX + r.width / 2}px`;
    tip.style.top  = `${r.top  + window.scrollY - 34}px`;
  });
  graphEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

function calcStreak(history) {
  if (!history || history.length === 0) return 0;
  const sorted = [...history].sort().reverse();
  const today  = new Date().toISOString().slice(0, 10);
  const yest   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sorted[0] !== today && sorted[0] !== yest) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    prev.setDate(prev.getDate() - 1);
    if (prev.toISOString().slice(0, 10) === sorted[i]) streak++;
    else break;
  }
  return streak;
}

// ─── Test Email Button ────────────────────────────────────────────────────────
document.getElementById('testEmailBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testEmailBtn');
  btn.disabled = true;
  btn.textContent = '📨 Sending…';
  try {
    const res  = await fetch('/api/send-test-emails', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Emails sent!', 'success');
    } else {
      showToast(data.error || 'Failed to send emails.', 'error');
    }
  } catch {
    showToast('Network error — could not send emails.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📧 Send Test Emails';
  }
});

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
