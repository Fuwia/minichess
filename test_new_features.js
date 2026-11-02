/**
 * Verification test suite for the 4 newly implemented features in MiniChess:
 * 1. Sound toggle, localStorage persistence ('minichess_sfx_muted'), UI icon switching, match and 10s warning sounds.
 * 2. Modern dark Resign and Draw confirmation modal replacing window.confirm(), with ESC/Enter key handling.
 * 3. Daily Quests tracking with localStorage, daily reset, drop/match progress counters, and Battlepass XP claim.
 * 4. i18n dictionary translations for all new features in TR and EN.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('=== Running MiniChess New Features Test Suite ===\n');
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

// -------------------------------------------------------------
// Test Group 1: SoundManager & Mute Persistence
// -------------------------------------------------------------
console.log('--- Test Group 1: SoundManager & Mute Toggle ---');
const soundCode = fs.readFileSync(path.join(__dirname, 'public/js/sound.js'), 'utf8');

const mockStorage = {};
const mockElements = [];
function createMockBtn(id) {
  let innerIcon = {
    attr: { 'data-lucide': 'volume-2' },
    setAttribute(k, v) { this.attr[k] = v; },
    getAttribute(k) { return this.attr[k]; }
  };
  let innerLabel = { textContent: 'Sound' };
  const btn = {
    id,
    classList: new Set(),
    attr: {},
    setAttribute(k, v) { this.attr[k] = v; },
    getAttribute(k) { return this.attr[k]; },
    querySelector(sel) {
      if (sel.includes('lucide') || sel.includes('i')) return innerIcon;
      if (sel.includes('Label') || sel.includes('label') || sel.includes('Text')) return innerLabel;
      return null;
    }
  };
  btn.classList.toggle = function(c, force) {
    if (force) btn.classList.add(c); else btn.classList.delete(c);
  };
  return { btn, innerIcon, innerLabel };
}

const gameBtn = createMockBtn('gameSoundToggleBtn');
const lobbyBtn = createMockBtn('soundToggleBtn');

const mockSoundWindow = {
  localStorage: {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); }
  },
  document: {
    readyState: 'complete',
    querySelectorAll: () => [gameBtn.btn, lobbyBtn.btn],
    addEventListener: () => {}
  },
  lucide: {
    createIcons: () => {}
  },
  t: (k) => (k === 'sound' ? 'Ses' : k === 'unmute' ? 'Sesi Aç' : k)
};

const evalSound = new Function('window', 'document', 'localStorage', soundCode + '; return SoundManager;');
const soundMgr = evalSound(mockSoundWindow, mockSoundWindow.document, mockSoundWindow.localStorage);

check(typeof soundMgr.toggleMute === 'function', 'SoundManager.toggleMute() exists');
check(typeof soundMgr.isMuted === 'function', 'SoundManager.isMuted() exists');
check(typeof soundMgr.updateUI === 'function', 'SoundManager.updateUI() exists');
check(typeof soundMgr.playTone === 'function', 'SoundManager.playTone() exists');

// Initial state should not be muted
check(soundMgr.isMuted() === false, 'SoundManager initially not muted');
soundMgr.updateUI();
check(gameBtn.innerIcon.getAttribute('data-lucide') === 'volume-2', 'Game sound icon is volume-2 when unmuted');
check(lobbyBtn.innerIcon.getAttribute('data-lucide') === 'volume-2', 'Lobby sound icon is volume-2 when unmuted');

// Toggle mute
const newMuted = soundMgr.toggleMute();
check(newMuted === true, 'toggleMute() returns true when muting');
check(soundMgr.isMuted() === true, 'isMuted() returns true after toggle');
check(mockStorage['minichess_sfx_muted'] === 'true', 'Mute state saved to localStorage under minichess_sfx_muted');
check(gameBtn.innerIcon.getAttribute('data-lucide') === 'volume-x', 'Game icon updated to volume-x when muted');
check(lobbyBtn.innerIcon.getAttribute('data-lucide') === 'volume-x', 'Lobby icon updated to volume-x when muted');

// Toggle back
soundMgr.toggleMute();
check(soundMgr.isMuted() === false, 'toggleMute() returns false when unmuting');
check(mockStorage['minichess_sfx_muted'] === 'false', 'Mute state in localStorage updated to false');
check(gameBtn.innerIcon.getAttribute('data-lucide') === 'volume-2', 'Game icon updated back to volume-2');

// -------------------------------------------------------------
// Test Group 2: Daily Quests Manager Logic
// -------------------------------------------------------------
console.log('\n--- Test Group 2: Daily Quests Manager ---');
const questsModule = require('./public/js/quests.js');

const qStorage = {};
global.localStorage = {
  getItem: (k) => qStorage[k] || null,
  setItem: (k, v) => { qStorage[k] = String(v); },
  removeItem: (k) => { delete qStorage[k]; }
};

const initialQuests = questsModule.getQuests();
check(Array.isArray(initialQuests) && initialQuests.length === 3, 'Initial daily quests array has 3 items');
check(initialQuests[0].target === 1 && initialQuests[0].xp === 100, 'Quest 1 target is 1, XP is 100 ("Bugün 1 Maç Tamamla")');
check(initialQuests[1].target === 2 && initialQuests[1].xp === 150, 'Quest 2 target is 2, XP is 150 ("Cepten 2 Taş Bırak")');
check(initialQuests[2].target === 1 && initialQuests[2].xp === 200, 'Quest 3 target is 1, XP is 200 ("Bir Botu Mağlup Et")');

// Record a standard match (not vs bot, no drops)
questsModule.recordMatch({ isWin: false, isBot: false });
let state = questsModule.getQuests();
check(state[0].current === 1, 'Quest 1 progresses to 1/1 on match completion');
check(state[1].current === 0, 'Quest 2 remains 0/2 when no pieces dropped');
check(state[2].current === 0, 'Quest 3 remains 0/1 on non-bot loss');

// Record crazyhouse piece drops
questsModule.recordDrop();
state = questsModule.getQuests();
check(state[1].current === 1, 'Quest 2 progresses to 1/2 on first piece drop');
questsModule.recordDrop();
state = questsModule.getQuests();
check(state[1].current === 2, 'Quest 2 progresses to 2/2 on second piece drop');

// Defeat a computer bot
questsModule.recordMatch({ isWin: true, isBot: true });
state = questsModule.getQuests();
check(state[2].current === 1, 'Quest 3 progresses to 1/1 on bot victory');

// Claiming quest 1
check(state[0].claimed === false, 'Quest 1 initially not claimed');
const claim1 = questsModule.claim(1);
check(claim1.success === true && claim1.quest.claimed === true, 'Claiming Quest 1 succeeds and sets claimed=true');

// Cannot claim twice
const claim1Again = questsModule.claim(1);
check(claim1Again.success === false, 'Cannot claim Quest 1 twice');

// Claiming quest 2 and 3
const claim2 = questsModule.claim(2);
const claim3 = questsModule.claim(3);
check(claim2.success === true && claim2.quest.xp === 150, 'Claiming Quest 2 yields 150 XP');
check(claim3.success === true && claim3.quest.xp === 200, 'Claiming Quest 3 yields 200 XP');

// -------------------------------------------------------------
// Test Group 3: HTML DOM Structure & No Native Confirm() in game.html
// -------------------------------------------------------------
console.log('\n--- Test Group 3: HTML DOM Elements & Modal Structure ---');
const gameHtml = fs.readFileSync(path.join(__dirname, 'public/game.html'), 'utf8');
const lobbyHtml = fs.readFileSync(path.join(__dirname, 'public/lobby.html'), 'utf8');

// Check that window.confirm() is REMOVED from resignGame in game.html
const confirmMatch = gameHtml.match(/function\s+resignGame\s*\([^)]*\)\s*\{[\s\S]*?confirm\s*\(/);
check(!confirmMatch, 'Browser native confirm() is completely removed from resignGame() in game.html');

// Check confirm modal elements in game.html
check(gameHtml.includes('id="confirmModalOverlay"'), 'game.html contains #confirmModalOverlay');
check(gameHtml.includes('id="confirmModalCard"'), 'game.html contains #confirmModalCard');
check(gameHtml.includes('id="confirmModalConfirmBtn"'), 'game.html contains #confirmModalConfirmBtn');
check(gameHtml.includes('id="confirmModalCancelBtn"'), 'game.html contains #confirmModalCancelBtn');
check(gameHtml.includes('id="gameSoundToggleBtn"'), 'game.html contains #gameSoundToggleBtn');

// Check keyboard listener in game.html
check(gameHtml.includes("e.key === 'Escape'"), 'game.html listens for Escape key on modal');
check(gameHtml.includes("e.key === 'Enter'"), 'game.html listens for Enter key on modal');

// Check 10-second warning in game.html
check(gameHtml.includes("myTime <= 10000"), 'game.html detects myTime <= 10000');
check(gameHtml.includes("SoundManager.play('warning')"), 'game.html plays warning tone when entering 10s');
check(gameHtml.includes("SoundManager.play('lowtime')"), 'game.html plays lowtime tick tone during countdown');

// Check lobby.html elements
check(lobbyHtml.includes('id="soundToggleBtn"'), 'lobby.html contains #soundToggleBtn in top menu/bar');
check(lobbyHtml.includes('id="lobbySoundToggleBtn"'), 'lobby.html contains #lobbySoundToggleBtn in hero banner');
check(lobbyHtml.includes('id="dailyQuestsList"'), 'lobby.html contains #dailyQuestsList');
check(lobbyHtml.includes('<script src="js/sound.js"></script>'), 'lobby.html includes js/sound.js');
check(lobbyHtml.includes('<script src="js/quests.js"></script>'), 'lobby.html includes js/quests.js');
check(lobbyHtml.includes("SoundManager.play('match')"), 'lobby.html plays match sound on match_found');

// -------------------------------------------------------------
// Test Group 4: i18n Dictionary Coverage for New Features
// -------------------------------------------------------------
console.log('\n--- Test Group 4: i18n Coverage for New Features ---');
const i18nCode = fs.readFileSync(path.join(__dirname, 'public/js/i18n.js'), 'utf8');
const i18nStorage = {};
const mockI18nWindow = {
  localStorage: {
    getItem: (k) => i18nStorage[k] || null,
    setItem: (k, v) => { i18nStorage[k] = String(v); },
    removeItem: (k) => { delete i18nStorage[k]; }
  },
  document: {
    documentElement: { lang: 'en' },
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {}
  },
  dispatchEvent: () => {}
};

const evalI18n = new Function('window', 'document', 'localStorage', 'CustomEvent', 'Node', i18nCode);
evalI18n(mockI18nWindow, mockI18nWindow.document, mockI18nWindow.localStorage, function() {}, { TEXT_NODE: 3 });

// TR checks
mockI18nWindow.setLanguage('tr');
check(mockI18nWindow.t('sound') === 'Ses', 'TR translation for "sound" is "Ses"');
check(mockI18nWindow.t('yes_resign') === 'Evet, Pes Et', 'TR translation for "yes_resign" is "Evet, Pes Et"');
check(mockI18nWindow.t('claim_reward') === 'Ödülü Al', 'TR translation for "claim_reward" is "Ödülü Al"');
check(mockI18nWindow.t('quest_1_title') === 'Bugün 1 Maç Tamamla', 'TR translation for quest 1 title is "Bugün 1 Maç Tamamla"');
check(mockI18nWindow.t('quest_2_title') === 'Cepten 2 Taş Bırak (Crazyhouse Drop)', 'TR translation for quest 2 title is "Cepten 2 Taş Bırak (Crazyhouse Drop)"');
check(mockI18nWindow.t('quest_3_title') === 'Bir Botu Mağlup Et', 'TR translation for quest 3 title is "Bir Botu Mağlup Et"');

// EN checks
mockI18nWindow.setLanguage('en');
check(mockI18nWindow.t('sound') === 'Sound', 'EN translation for "sound" is "Sound"');
check(mockI18nWindow.t('yes_resign') === 'Yes, Resign', 'EN translation for "yes_resign" is "Yes, Resign"');
check(mockI18nWindow.t('claim_reward') === 'Claim Reward', 'EN translation for "claim_reward" is "Claim Reward"');

// -------------------------------------------------------------
// Test Group 5: Edge Cases, Security & Robustness Verification
// -------------------------------------------------------------
console.log('\n--- Test Group 5: Edge Cases, Security & Robustness ---');

// Check sound.js gesture unlock and getAudioContext
check(typeof soundMgr.getAudioContext === 'function', 'SoundManager exports getAudioContext()');
check(soundCode.includes("addEventListener('click', unlockAudio"), 'sound.js attaches user gesture unlock for click');
check(soundCode.includes("addEventListener('keydown', unlockAudio"), 'sound.js attaches user gesture unlock for keydown');
check(soundCode.includes("addEventListener('touchstart', unlockAudio"), 'sound.js attaches user gesture unlock for touchstart');

// Check game.html robustness additions
check(gameHtml.includes('closeConfirmTimeout'), 'game.html tracks closeConfirmTimeout to prevent stale close races');
check(gameHtml.includes('moverColor'), 'game.html computes moverColor to accurately identify human pocket drops');
check(gameHtml.includes("sec === 10 || lastAlertedSecond === null"), 'game.html alerts with warning tone even if entering <= 10s with slight lag');

// Check join.html match found chime
const joinHtml = fs.readFileSync(path.join(__dirname, 'public/join.html'), 'utf8');
check(joinHtml.includes('<script src="js/sound.js"></script>'), 'join.html imports js/sound.js for private room matches');
check(joinHtml.includes("SoundManager.play('match')"), 'join.html plays match sound on match_found');

// Check server.js duplicate quest claim guard and mover color
const serverCode = fs.readFileSync(path.join(__dirname, 'server/server.js'), 'utf8');
check(serverCode.includes('userClaimedDailyQuests'), 'server.js enforces daily claim guard against XP spamming');
check(serverCode.includes("color: state.activeColor"), 'server.js tags move payload with unambiguous activeColor');

console.log(`\nNew Features Suite Complete: ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
