const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH =
  process.env.NODE_ENV === 'production'
    ? '/app/bkup/swimlog.db' // Railway volume( Should match the exact name as created in railway volume)
    : './data/swimlog.db'; // Local development

// Ensure the directory exists in production
if (process.env.NODE_ENV === 'production') {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    console.log(`Creating database directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

let _db;
async function getDb() {
  if (_db) return _db;
  _db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await _db.run('PRAGMA journal_mode = WAL');
  await _db.run('PRAGMA foreign_keys = ON');
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    UNIQUE NOT NULL,
      phone       TEXT    NOT NULL,
      photo_path  TEXT,
      swim_count  INTEGER DEFAULT 0,
      last_swim   DATETIME,
      created_at  DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      token        TEXT    UNIQUE NOT NULL,
      window_start DATETIME NOT NULL,
      used         INTEGER DEFAULT 0,
      used_at      DATETIME,
      email_sent   INTEGER DEFAULT 0,
      created_at   DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  // Migration: add email_sent column if it doesn't exist yet (for existing DBs)
  try { await _db.run('ALTER TABLE email_tokens ADD COLUMN email_sent INTEGER DEFAULT 0'); } catch {}
  return _db;
}

// 9am IST = 03:30 UTC
function getCurrentWindowStart() {
  const now = new Date();
  const todayWindow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0, 0
  ));
  return now >= todayWindow ? todayWindow : new Date(todayWindow.getTime() - 86400000);
}

module.exports = {
  init: getDb,

  async getLeaderboard() {
    const db = await getDb();
    return db.all(`
      SELECT id, name, email, phone, photo_path, swim_count, last_swim, created_at
      FROM users
      ORDER BY swim_count DESC, last_swim DESC, name ASC
    `);
  },

  async getUserCount() {
    const db = await getDb();
    const row = await db.get('SELECT COUNT(*) AS c FROM users');
    return row.c;
  },

  async getUserByEmail(email) {
    const db = await getDb();
    return db.get('SELECT * FROM users WHERE email = ?', email);
  },

  async getUserById(id) {
    const db = await getDb();
    return db.get('SELECT * FROM users WHERE id = ?', id);
  },

  async getAllUsers() {
    const db = await getDb();
    return db.all('SELECT * FROM users');
  },

  async createUser(name, email, phone, photoPath) {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO users (name, email, phone, photo_path) VALUES (?, ?, ?, ?)',
      name, email, phone, photoPath
    );
    return this.getUserById(result.lastID);
  },

  async createEmailToken(userId, token) {
    const db = await getDb();
    const windowStart = getCurrentWindowStart().toISOString();
    await db.run(
      'INSERT INTO email_tokens (user_id, token, window_start) VALUES (?, ?, ?)',
      userId, token, windowStart
    );
  },

  async getEmailToken(token) {
    const db = await getDb();
    return db.get('SELECT * FROM email_tokens WHERE token = ?', token);
  },

  async markEmailSent(token) {
    const db = await getDb();
    await db.run('UPDATE email_tokens SET email_sent = 1 WHERE token = ?', token);
  },

  async getAllUsersWithEmailStats() {
    const db = await getDb();
    return db.all(`
      SELECT u.*,
        COALESCE((
          SELECT COUNT(*) FROM email_tokens e
          WHERE e.user_id = u.id AND e.email_sent = 1
            AND date(e.created_at) = date('now')
        ), 0) AS today_email_count
      FROM users u
    `);
  },

  async getSwimHistory(userId) {
    const db = await getDb();
    const rows = await db.all(`
      SELECT date(used_at) AS day
      FROM email_tokens
      WHERE user_id = ? AND used = 1 AND used_at IS NOT NULL
      GROUP BY date(used_at)
      ORDER BY day ASC
    `, userId);
    return rows.map(r => r.day);
  },

  async deleteUser(id) {
    const db = await getDb();
    const user = await this.getUserById(id);
    await db.run('DELETE FROM email_tokens WHERE user_id = ?', id);
    await db.run('DELETE FROM users WHERE id = ?', id);
    return user;
  },

  async resetSwimCount(id) {
    const db = await getDb();
    await db.run('UPDATE users SET swim_count = 0, last_swim = NULL WHERE id = ?', id);
  },

  async decrementSwimCount(id) {
    const db = await getDb();
    await db.run(
      'UPDATE users SET swim_count = MAX(0, swim_count - 1) WHERE id = ?',
      id
    );
  },

  async markTokenUsed(token) {
    const db = await getDb();
    await db.run(
      "UPDATE email_tokens SET used = 1, used_at = datetime('now') WHERE token = ?",
      token
    );
  },

  async incrementSwimCount(userId) {
    const db = await getDb();
    await db.run(
      "UPDATE users SET swim_count = swim_count + 1, last_swim = datetime('now') WHERE id = ?",
      userId
    );
  },

  getCurrentWindowStart,
};
