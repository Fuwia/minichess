const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'minichess.db');

let db = null;

async function getDb() {
  if (db) return db;
  
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  
  initTables();
  return db;
}

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      elo INTEGER DEFAULT 1200,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      avatar_url TEXT,
      last_avatar_change TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add avatar columns if upgrading from older schema
  try { db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN last_avatar_change TEXT'); } catch (e) { }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_uuid TEXT UNIQUE,
      white_id INTEGER NOT NULL,
      black_id INTEGER NOT NULL,
      result TEXT NOT NULL,
      fen_final TEXT,
      moves_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (white_id) REFERENCES users(id),
      FOREIGN KEY (black_id) REFERENCES users(id)
    )
  `);

  // Add game_uuid column if upgrading from older schema.
  // sql.js does not support UNIQUE in ALTER TABLE, so we add the column
  // first and then create a unique index separately.
  try {
    db.run('ALTER TABLE games ADD COLUMN game_uuid TEXT');
  } catch (e) {
    // Column already exists — safe to ignore
  }
  try {
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_games_uuid ON games(game_uuid)');
  } catch (e) {
    // Index already exists — safe to ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id),
      UNIQUE(user_id, friend_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS private_rooms (
      id TEXT PRIMARY KEY,
      creator_id INTEGER NOT NULL,
      joiner_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (joiner_id) REFERENCES users(id)
    )
  `);
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

// Auto-save every 30 seconds
setInterval(() => {
  if (db) saveDb();
}, 30000);

// Save on exit
process.on('exit', closeDb);
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  closeDb();
  process.exit(1);
});

module.exports = { getDb, saveDb };