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
  
  // Shop and Customization columns
  try { db.run('ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0'); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN unlocked_items TEXT DEFAULT \'[]\''); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN board_theme TEXT DEFAULT \'default\''); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN win_effect TEXT DEFAULT \'none\''); } catch (e) { }
  try { db.run('ALTER TABLE users ADD COLUMN username_color TEXT DEFAULT \'\''); } catch (e) { }
  
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
      reward_coins INTEGER DEFAULT 0,
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
  
  try { db.run('ALTER TABLE battlepass_tiers ADD COLUMN reward_coins INTEGER DEFAULT 0'); } catch (e) { }

  // Seed Season 1 tiers (idempotent — uses INSERT OR IGNORE)
  seedBattlepassTiers();

  // Create activities table
  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      username TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  seedActivities();
}

function seedActivities() {
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM activities');
  const row = checkStmt.getAsObject();
  checkStmt.free();

  if (row.count === 0) {
    const seed = [
      { type: 'season_start', username: 'System', details: { text: 'Season 1: Under the Canopy has officially begun!' } },
      { type: 'achievement', username: 'Kairoth', details: { achievementName: 'Fast Mate' } },
      { type: 'elo_milestone', username: 'Fuwia', details: { milestone: 1400 } },
      { type: 'shop_purchase', username: 'AKACAN', details: { itemName: 'Emerald Forest Theme' } },
      { type: 'ranked_win', username: 'sansomeister', details: { opponent: 'Kairoth', winnerElo: 1250 } },
      { type: 'battlepass_tier', username: 'Fuwia', details: { tier: 10 } }
    ];

    // Seeding in reverse order of display so newer appears first
    const stmt = db.prepare('INSERT INTO activities (type, username, details) VALUES (?, ?, ?)');
    for (const act of seed) {
      stmt.run([act.type, act.username, JSON.stringify(act.details)]);
    }
    stmt.free();
    saveDb();
    console.log('[DB] Seeded initial activities feed.');
  }
}

function seedBattlepassTiers() {
  const tiers = [
    { tier: 1,  xp: 0,    title: null, coins: 0 },
    { tier: 2,  xp: 50,   title: null, coins: 50 },
    { tier: 3,  xp: 100,  title: null, coins: 50 },
    { tier: 4,  xp: 160,  title: null, coins: 100 },
    { tier: 5,  xp: 230,  title: 'Pioneer', coins: 150 },
    { tier: 6,  xp: 310,  title: null, coins: 50 },
    { tier: 7,  xp: 400,  title: null, coins: 100 },
    { tier: 8,  xp: 500,  title: null, coins: 100 },
    { tier: 9,  xp: 610,  title: null, coins: 150 },
    { tier: 10, xp: 730,  title: 'Founder', coins: 300 },
    { tier: 11, xp: 860,  title: null, coins: 100 },
    { tier: 12, xp: 1000, title: null, coins: 100 },
    { tier: 13, xp: 1150, title: null, coins: 150 },
    { tier: 14, xp: 1310, title: null, coins: 150 },
    { tier: 15, xp: 1480, title: 'Trailblazer', coins: 300 },
    { tier: 16, xp: 1660, title: null, coins: 100 },
    { tier: 17, xp: 1850, title: null, coins: 150 },
    { tier: 18, xp: 2050, title: null, coins: 150 },
    { tier: 19, xp: 2260, title: null, coins: 200 },
    { tier: 20, xp: 2480, title: 'Veteran', coins: 400 },
    { tier: 21, xp: 2710, title: null, coins: 150 },
    { tier: 22, xp: 2950, title: null, coins: 150 },
    { tier: 23, xp: 3200, title: null, coins: 200 },
    { tier: 24, xp: 3460, title: null, coins: 200 },
    { tier: 25, xp: 3730, title: 'Legend', coins: 500 },
    { tier: 26, xp: 4010, title: null, coins: 200 },
    { tier: 27, xp: 4300, title: null, coins: 200 },
    { tier: 28, xp: 4600, title: null, coins: 250 },
    { tier: 29, xp: 4910, title: null, coins: 250 },
    { tier: 30, xp: 5230, title: 'Founders Champion', coins: 1000 },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO battlepass_tiers (season, tier, xp_required, title, reward_coins)
    VALUES (1, ?, ?, ?, ?)
  `);

  for (const t of tiers) {
    stmt.run([t.tier, t.xp, t.title, t.coins]);
  }
  stmt.free();
  
  // Also update existing tiers to retroactively add coins for existing databases
  const updateStmt = db.prepare(`
    UPDATE battlepass_tiers SET reward_coins = ? WHERE season = 1 AND tier = ? AND reward_coins = 0
  `);
  for (const t of tiers) {
    if (t.coins > 0) {
      updateStmt.run([t.coins, t.tier]);
    }
  }
  updateStmt.free();
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