/**
 * Targeted verification script for MiniChess edge cases and deep fixes:
 * 1. Spectator mode dice roll DOM update (diceRollNum, dicePieceName)
 * 2. Spectator drag/drop guards (onDragStart, onDragEnd, onPocketDragStart)
 * 3. Battlepass grantXP COALESCE(coins, 0) test with null coins
 * 4. Spectator game_over payload with players metadata
 * 5. Full i18n parity check for all 324+ dictionary keys across TR and EN
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

console.log('=== Running MiniChess Deep Edge Cases Test Suite ===\n');
let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log('  [PASS]', message);
    passed++;
  } else {
    console.error('  [FAIL]', message);
    failed++;
  }
}

async function run() {
  // 1. i18n Parity Check
  console.log('--- Test Group 1: i18n Parity & Completeness ---');
  const i18n = require('./public/js/i18n.js');
  const tr = i18n.TRANSLATIONS.tr;
  const en = i18n.TRANSLATIONS.en;
  const trKeys = Object.keys(tr);
  const enKeys = Object.keys(en);

  check(trKeys.length === enKeys.length, `TR and EN have identical key counts (${trKeys.length} keys)`);
  const missingInEn = trKeys.filter(k => en[k] === undefined);
  const missingInTr = enKeys.filter(k => tr[k] === undefined);
  check(missingInEn.length === 0, 'No keys missing in EN dictionary');
  check(missingInTr.length === 0, 'No keys missing in TR dictionary');

  // Check specific newly added keys
  const newKeys = [
    'variant', 'top_players_desc', 'no_recent_activity', 'no_players_yet',
    'failed_load_leaderboard', 'failed_load_shop', 'join_private_game',
    'checking_room', 'no_tier_data', 'empty_match_history_desc',
    'empty_friends_desc', 'send_request_status', 'enter_username_status',
    'confirm_remove_friend'
  ];
  newKeys.forEach(k => {
    check(tr[k] && en[k], `New key "${k}" exists in both languages (TR: "${tr[k]}", EN: "${en[k]}")`);
  });

  // 2. Battlepass COALESCE(coins, 0) logic
  console.log('\n--- Test Group 2: Battlepass Null Coins Immunity ---');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      coins INTEGER,
      unlocked_titles TEXT DEFAULT '[]',
      title TEXT
    );
    CREATE TABLE battlepass_tiers (
      id INTEGER PRIMARY KEY,
      season INTEGER,
      tier INTEGER,
      xp_required INTEGER,
      title TEXT,
      reward_coins INTEGER DEFAULT 0
    );
    CREATE TABLE user_battlepass (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      season INTEGER,
      xp INTEGER,
      tier INTEGER,
      claimed_rewards TEXT
    );
  `);

  // Insert user with NULL coins
  db.run("INSERT INTO users (id, username, coins) VALUES (1, 'TestUser', NULL)");
  db.run("INSERT INTO battlepass_tiers (season, tier, xp_required, title, reward_coins) VALUES (1, 1, 0, NULL, 0), (1, 2, 50, 'Scout', 100)");

  const battlepass = require('./server/battlepass.js');
  battlepass.setDb(db);

  // Grant 60 XP to trigger level up to Tier 2 with 100 coins
  const bpResult = battlepass.grantXP(1, 60);
  check(bpResult.leveledUp === true, 'User leveled up in battlepass');
  check(bpResult.coinsEarned === 100, 'User earned 100 coins');

  const stmt = db.prepare('SELECT coins FROM users WHERE id = ?');
  const userRow = stmt.getAsObject([1]);
  stmt.free();
  check(userRow.coins === 100, `User with initially NULL coins correctly received 100 coins (got: ${userRow.coins})`);

  // 3. Game HTML Spectator Dice DOM Binding
  console.log('\n--- Test Group 3: Spectator Dice Roll DOM Binding in game.html ---');
  const gameHtml = fs.readFileSync(path.join(__dirname, 'public/game.html'), 'utf8');
  check(gameHtml.includes("const numEl = document.getElementById('diceRollNum');"), "Spectator dice listener updates 'diceRollNum'");
  check(gameHtml.includes("const pieceEl = document.getElementById('dicePieceName');"), "Spectator dice listener updates 'dicePieceName'");
  check(!gameHtml.includes("diceRollVal"), "No reference to obsolete 'diceRollVal' in game.html");

  // 4. Game HTML Spectator Drag & Drop Guards
  console.log('\n--- Test Group 4: Spectator Drag & Drop Guards in game.html ---');
  check(gameHtml.includes('function onDragStart(e, row, col) {\n      if (gameOver || isReplay || isSpectator) return;'), 'onDragStart includes isSpectator guard');
  check(gameHtml.includes('function onDragEnd(row, col) {\n      if (gameOver || isReplay || isSpectator) return;'), 'onDragEnd includes isSpectator guard');
  check(gameHtml.includes('function onPocketDragStart(e, type) {\n      if (gameOver || isReplay || isSpectator) return;'), 'onPocketDragStart includes isSpectator guard');

  // 5. Spectator Game Over payload in server.js
  console.log('\n--- Test Group 5: Spectator Game Over Payload in server.js ---');
  const serverCode = fs.readFileSync(path.join(__dirname, 'server/server.js'), 'utf8');
  const matches = serverCode.match(/socket\.emit\('game_over',\s*\{[\s\S]*?players:\s*\{[\s\S]*?white:[\s\S]*?black:[\s\S]*?\}\s*\}\);/g);
  check(matches && matches.length >= 2, `server.js includes players metadata in spectator game_over emits (${matches ? matches.length : 0} instances)`);

  console.log(`\n=== Deep Edge Cases Suite Complete: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
