# 🏊 SwimLog

A minimal, elegant web app for tracking swim class attendance. Registered swimmers receive a daily email at **9:00 AM IST** asking if they attended their class. One click → counter goes up. A live leaderboard shows everyone's progress.

## Features

- **Live leaderboard** with animated counters, profile photos, and a top-3 podium
- **User registration** — Name, Email, Phone, optional profile photo (max 10 swimmers)
- **Daily email reminders** — sent at 9 AM IST via a cron job
- **One-click confirmation** — secure UUID tokens, single-use per day
- **Duplicate protection** — clicking the link twice shows a friendly "already confirmed" message
- **SQLite backend** — zero setup, file-based persistence
- **Railway-ready** — deploy in minutes

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in env vars
cp .env.example .env
# Edit .env with your SMTP credentials

# 3. Run
npm run dev        # uses nodemon (hot reload)
# or
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable     | Required | Description |
|-------------|----------|-------------|
| `PORT`       | No       | HTTP port (default `3000`) |
| `APP_URL`    | Yes (prod) | Public URL of your app, e.g. `https://swimlog.railway.app` |
| `DB_PATH`    | No       | SQLite file path (default `./data/swimlog.db`) |
| `SMTP_HOST`  | Yes      | SMTP host, e.g. `smtp.gmail.com` |
| `SMTP_PORT`  | No       | SMTP port (default `587`) |
| `SMTP_SECURE`| No       | `true` for port 465, `false` otherwise |
| `SMTP_USER`  | Yes      | SMTP username / email address |
| `SMTP_PASS`  | Yes      | SMTP password or App Password |
| `SMTP_FROM`  | No       | Sender display string (defaults to `SMTP_USER`) |
| `ADMIN_KEY`  | No       | Secret key for manually triggering emails |

### Gmail setup

1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App Passwords**
3. Generate a 16-character password for "Mail"
4. Use that as `SMTP_PASS`

---

## Deploying to Railway

### One-click deploy

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
3. Select the repo
4. In **Variables**, add all required env vars (see table above)
5. Railway auto-detects Node.js and runs `npm start`

### Data persistence (important!)

Railway's filesystem is ephemeral — data is lost on redeploys unless you mount a volume.

1. In Railway, go to your service → **Volumes** → **Add Volume**
2. Mount path: `/app/data`
3. Set `DB_PATH=/app/data/swimlog.db` in Variables

Do the same for uploaded photos:
- Mount path: `/app/public/uploads`

### Manually trigger emails (testing)

```bash
curl -X POST https://your-app.railway.app/api/trigger-emails \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite via `better-sqlite3`
- **Email:** Nodemailer + node-cron
- **Frontend:** Vanilla HTML/CSS/JS
- **Deployment:** Railway
Book keeping for swimming classes
