const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/swimlog.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE NOT NULL,
    phone       TEXT    NOT NULL,
    photo_path  TEXT,
    swim_count  INTEGER DEFAULT 0,
    last_swim   DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    token        TEXT    UNIQUE NOT NULL,
    window_start DATETIME NOT NULL,
    used         INTEGER DEFAULT 0,
    used_at      DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 9am IST = 03:30 UTC
function getCurrentWindowStart() {
  const now = new Date();
  const todayWindow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0, 0
  ));
  return now >= todayWindow ? todayWindow : new Date(todayWindow.getTime() - 86400000);
}

module.exports = {
  getLeaderboard() {
    return db.prepare(`
      SELECT id, name, email, phone, photo_path, swim_count, last_swim, created_at
      FROM users
      ORDER BY swim_count DESC, name ASC
    `).all();
  },

  getUserCount() {
    return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  },

  getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  getAllUsers() {
    return db.prepare('SELECT * FROM users').all();
  },

  createUser(name, email, phone, photoPath) {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (name, email, phone, photo_path) VALUES (?, ?, ?, ?)'
    ).run(name, email, phone, photoPath);
    return this.getUserById(lastInsertRowid);
  },

  createEmailToken(userId, token) {
    const windowStart = getCurrentWindowStart().toISOString();
    db.prepare(
      'INSERT INTO email_tokens (user_id, token, window_start) VALUES (?, ?, ?)'
    ).run(userId, token, windowStart);
  },

  getEmailToken(token) {
    return db.prepare('SELECT * FROM email_tokens WHERE token = ?').get(token);
  },

  markTokenUsed(token) {
    db.prepare(
      "UPDATE email_tokens SET used = 1, used_at = datetime('now') WHERE token = ?"
    ).run(token);
  },

  incrementSwimCount(userId) {
    db.prepare(
      "UPDATE users SET swim_count = swim_count + 1, last_swim = datetime('now') WHERE id = ?"
    ).run(userId);
  },

  getCurrentWindowStart,
};
