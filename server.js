require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('./db/database');
const emailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// ─── Ensure runtime directories ───────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer (profile photos) ───────────────────────────────────────────────────
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (Object.keys(MIME_TO_EXT).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  },
});

// ─── HTML escape helper ────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── API Routes ────────────────────────────────────────────────────────────────

app.get('/api/user/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const history = db.getSwimHistory(id);
    // Never expose password-like fields — only safe profile fields
    res.json({
      id:         user.id,
      name:       user.name,
      email:      user.email,
      phone:      user.phone,
      photo_path: user.photo_path,
      swim_count: user.swim_count,
      last_swim:  user.last_swim,
      created_at: user.created_at,
      history,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/leaderboard', (_req, res) => {
  try {
    res.json(db.getLeaderboard());
  } catch {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.post('/api/register', upload.single('photo'), (req, res) => {
  const cleanup = () => {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };

  try {
    const { name, email, phone } = req.body;

    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      cleanup();
      return res.status(400).json({ error: 'Name, email, and phone are required.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      cleanup();
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (db.getUserCount() >= 10) {
      cleanup();
      return res.status(400).json({ error: 'The squad is full! Maximum 10 swimmers allowed.' });
    }

    if (db.getUserByEmail(email.trim().toLowerCase())) {
      cleanup();
      return res.status(400).json({ error: 'This email is already registered.' });
    }

    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const user = db.createUser(
      name.trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      photoPath
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error('Register error:', err);
    cleanup();
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── Email Confirmation ────────────────────────────────────────────────────────

app.get('/confirm/:token', (req, res) => {
  try {
    const { token } = req.params;

    // Validate token format to prevent probing attacks
    if (!/^[0-9a-f-]{36}$/.test(token)) {
      return res.status(400).send(confirmPage('error', null, 0));
    }

    const emailToken = db.getEmailToken(token);
    if (!emailToken) {
      return res.status(404).send(confirmPage('error', null, 0));
    }

    const user = db.getUserById(emailToken.user_id);

    if (emailToken.used) {
      return res.send(confirmPage('duplicate', user, user.swim_count));
    }

    db.markTokenUsed(token);
    db.incrementSwimCount(emailToken.user_id);
    const updated = db.getUserById(emailToken.user_id);

    return res.send(confirmPage('success', updated, updated.swim_count));
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).send(confirmPage('error', null, 0));
  }
});

// ─── Admin API (protected by ADMIN_KEY) ───────────────────────────────────────

function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers['x-api-key'] !== key) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  try {
    res.json(db.getAllUsers());
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const user = db.deleteUser(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Clean up uploaded photo from disk
    if (user.photo_path) {
      const photoFile = path.join(__dirname, 'public', user.photo_path);
      try { fs.unlinkSync(photoFile); } catch {}
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/admin/users/:id/reset', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    if (!db.getUserById(id)) return res.status(404).json({ error: 'User not found' });
    db.resetSwimCount(id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reset count' });
  }
});

// Serve admin page — only if ADMIN_KEY is set
app.get('/admin', (req, res) => {
  if (!process.env.ADMIN_KEY) {
    return res.status(403).send('<h2>Admin is disabled. Set ADMIN_KEY in your environment.</h2>');
  }
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// ─── Test: send emails NOW (no auth — REMOVE before going to prod) ──────────────

app.post('/api/send-test-emails', async (req, res) => {
  console.warn('[TEST] /api/send-test-emails called — remove this endpoint before production');
  try {
    const count = await sendDailyEmails();
    res.json({ success: true, message: `Sent ${count} email(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: manually trigger daily emails (protected by ADMIN_KEY) ─────────────

app.post('/api/trigger-emails', async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers['x-api-key'] !== adminKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const count = await sendDailyEmails();
    res.json({ success: true, message: `Sent ${count} email(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cron: 9:00 AM IST = 03:30 UTC ───────────────────────────────────────────

cron.schedule('30 3 * * *', () => {
  console.log('[CRON] Sending daily swim reminders...');
  sendDailyEmails()
    .then(n => console.log(`[CRON] Sent ${n} email(s)`))
    .catch(err => console.error('[CRON] Error:', err.message));
}, { timezone: 'UTC' });

async function sendDailyEmails() {
  const users = db.getAllUsers();
  let sent = 0;
  for (const user of users) {
    const token = uuidv4();
    db.createEmailToken(user.id, token);
    try {
      await emailService.sendSwimReminder(user, `${APP_URL}/confirm/${token}`);
      sent++;
    } catch (err) {
      console.error(`Email failed for ${user.email}: ${err.message}`);
    }
  }
  return sent;
}

// ─── Confirmation Page HTML ────────────────────────────────────────────────────

function confirmPage(status, user, count) {
  const cfg = {
    success: {
      icon: '🏊',
      title: 'Splash! You did it!',
      message: `Great job, ${esc(user?.name)}! Your swim class has been logged.`,
      sub: `You've now completed <strong>${count}</strong> swimming class${count !== 1 ? 'es' : ''}. Keep it up!`,
      color: '#0077b6',
      bg: 'linear-gradient(135deg,#03045e 0%,#0077b6 100%)',
      showBadge: true,
    },
    duplicate: {
      icon: '🚫',
      title: 'Already Confirmed!',
      message: `Hey ${esc(user?.name)}, you've already logged your swim today.`,
      sub: 'Only one swimming class counts per day (9am–9am IST). See you in the pool tomorrow! 🌊',
      color: '#f77f00',
      bg: 'linear-gradient(135deg,#7b2d00 0%,#f77f00 100%)',
      showBadge: false,
    },
    error: {
      icon: '❌',
      title: 'Invalid Link',
      message: 'This confirmation link is invalid or has already been processed.',
      sub: 'Please use the link from your most recent daily reminder email.',
      color: '#d62828',
      bg: 'linear-gradient(135deg,#6a0000 0%,#d62828 100%)',
      showBadge: false,
    },
  }[status] || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SwimLog — Confirmation</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${cfg.bg};padding:20px}
    .card{background:white;border-radius:24px;padding:52px 44px;text-align:center;max-width:440px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.35);animation:pop .5s cubic-bezier(.175,.885,.32,1.275)}
    @keyframes pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
    .icon{font-size:68px;display:block;margin-bottom:14px}
    h1{font-size:28px;font-weight:900;color:#03045e;margin-bottom:12px}
    .msg{font-size:16px;color:#444;margin-bottom:8px}
    .sub{font-size:14px;color:#777;margin-bottom:32px;line-height:1.6}
    .badge{display:inline-flex;align-items:center;justify-content:center;background:${cfg.color};color:white;font-size:44px;font-weight:900;width:96px;height:96px;border-radius:50%;margin:0 auto 28px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
    .btn{display:inline-block;background:${cfg.color};color:white;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;transition:transform .2s,box-shadow .2s}
    .btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.2)}
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">${cfg.icon}</span>
    <h1>${cfg.title}</h1>
    <p class="msg">${cfg.message}</p>
    <p class="sub">${cfg.sub}</p>
    ${cfg.showBadge ? `<div class="badge">${count}</div>` : ''}
    <a href="/" class="btn">View Leaderboard →</a>
  </div>
</body>
</html>`;
}

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🏊  SwimLog running → http://localhost:${PORT}`);
  console.log(`    Daily emails cron: 03:30 UTC (9:00 AM IST)`);
  if (!process.env.SMTP_HOST) {
    console.warn('    ⚠️  SMTP not configured — emails will not send!');
  }
});
