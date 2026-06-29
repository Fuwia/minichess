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
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add columns if upgrading from older schema
  try { db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN last_avatar_change TEXT'); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch (e) { }
  
  // Grant admin to user "Fuwia" if they exist
  const grantStmt = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ? AND is_admin = 0');
  grantStmt.run(['Fuwia']);
  const changes = db.getRowsModified();
  grantStmt.free();
  if (changes > 0) {
    console.log('[DB] Granted admin privileges to Fuwia');
  }
  
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

  // ==================== Battlepass Tables ====================

  db.run(`
    CREATE TABLE IF NOT EXISTS battlepass_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      tier INTEGER NOT NULL,
      xp_required INTEGER NOT NULL,
      title TEXT,
      UNIQUE(season, tier)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_battlepass (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      season INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      tier INTEGER DEFAULT 1,
      claimed_rewards TEXT DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add columns for battlepass titles if upgrading from older schema
  try { db.run('ALTER TABLE users ADD COLUMN title TEXT'); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN unlocked_titles TEXT DEFAULT \'[]\''); } catch (e) { }

  // Seed Season 1 tiers (idempotent — uses INSERT OR IGNORE)
  seedBattlepassTiers();
}

function seedBattlepassTiers() {
  const tiers = [
    { tier: 1,  xp: 0,    title: null },
    { tier: 2,  xp: 50,   title: null },
    { tier: 3,  xp: 100,  title: null },
    { tier: 4,  xp: 160,  title: null },
    { tier: 5,  xp: 230,  title: 'Pioneer' },
    { tier: 6,  xp: 310,  title: null },
    { tier: 7,  xp: 400,  title: null },
    { tier: 8,  xp: 500,  title: null },
    { tier: 9,  xp: 610,  title: null },
    { tier: 10, xp: 730,  title: 'Founder' },
    { tier: 11, xp: 860,  title: null },
    { tier: 12, xp: 1000, title: null },
    { tier: 13, xp: 1150, title: null },
    { tier: 14, xp: 1310, title: null },
    { tier: 15, xp: 1480, title: 'Trailblazer' },
    { tier: 16, xp: 1660, title: null },
    { tier: 17, xp: 1850, title: null },
    { tier: 18, xp: 2050, title: null },
    { tier: 19, xp: 2260, title: null },
    { tier: 20, xp: 2480, title: 'Veteran' },
    { tier: 21, xp: 2710, title: null },
    { tier: 22, xp: 2950, title: null },
    { tier: 23, xp: 3200, title: null },
    { tier: 24, xp: 3460, title: null },
    { tier: 25, xp: 3730, title: 'Legend' },
    { tier: 26, xp: 4010, title: null },
    { tier: 27, xp: 4300, title: null },
    { tier: 28, xp: 4600, title: null },
    { tier: 29, xp: 4910, title: null },
    { tier: 30, xp: 5230, title: 'Founders Champion' },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO battlepass_tiers (season, tier, xp_required, title)
    VALUES (1, ?, ?, ?)
  `);

  for (const t of tiers) {
    stmt.run([t.tier, t.xp, t.title]);
  }
  stmt.free();
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