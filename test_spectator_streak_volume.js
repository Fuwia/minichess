/**
 * Verification Test Suite for Paket 2 & Paket 4:
 * Paket 2: Canlı Maç İzleyici (Live Spectator Mode & Lobby Live Matches Showcase)
 * Paket 4: Sadakat, Gamification (7-Day Login Streak) & Ses Seviyesi (Volume Slider)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

console.log('=== Running MiniChess Spectator, Streak & Volume Test Suite ===\n');
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
// Test Group 1: Volume Slider & Sound Manager (Audio & Persistence)
// -------------------------------------------------------------
console.log('--- Test Group 1: Volume Slider & Sound Manager ---');

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

function createMockSlider(id) {
  return {
    id,
    value: 80,
    min: 0,
    max: 100
  };
}

function createMockVal(id) {
  return {
    id,
    textContent: '80%'
  };
}

const mockDoc = {
  getElementById(id) {
    for (const b of mockElements) {
      if (b.btn && b.btn.id === id) return b.btn;
      if (b.slider && b.slider.id === id) return b.slider;
      if (b.val && b.val.id === id) return b.val;
    }
    return null;
  },
  querySelectorAll(sel) {
    if (sel.includes('sound-volume-slider')) {
      return mockElements.filter(x => x.slider).map(x => x.slider);
    }
    if (sel.includes('sound-volume-val')) {
      return mockElements.filter(x => x.val).map(x => x.val);
    }
    if (sel.includes('sound-toggle-btn') || sel.includes('soundToggleBtn') || sel.includes('gameSoundToggleBtn')) {
      return mockElements.filter(x => x.btn).map(x => x.btn);
    }
    return [];
  },
  addEventListener() {}
};

const gameMock = createMockBtn('gameSoundToggleBtn');
const lobbyMock = createMockBtn('lobbySoundToggleBtn');
const soundMock = createMockBtn('soundToggleBtn');
const gameSlider = { slider: createMockSlider('gameVolumeSlider') };
const lobbySlider = { slider: createMockSlider('lobbyVolumeSlider') };
const soundSlider = { slider: createMockSlider('soundVolumeSlider') };
const gameVal = { val: createMockVal('gameVolumeVal') };
const lobbyVal = { val: createMockVal('lobbyVolumeVal') };
const soundVal = { val: createMockVal('soundVolumeVal') };

mockElements.push(gameMock, lobbyMock, soundMock, gameSlider, lobbySlider, soundSlider, gameVal, lobbyVal, soundVal);

const mockWindow = {
  localStorage: {
    getItem(k) { return mockStorage[k] || null; },
    setItem(k, v) { mockStorage[k] = String(v); },
    removeItem(k) { delete mockStorage[k]; }
  },
  document: mockDoc,
  lucide: { createIcons: () => {} },
  AudioContext: class {
    constructor() { this.state = 'running'; }
    createOscillator() {
      return {
        connect() {},
        start() {},
        stop() {},
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
      };
    }
    createGain() {
      return {
        connect() {},
        gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }
      };
    }
  }
};

const runContext = {
  window: mockWindow,
  localStorage: mockWindow.localStorage,
  document: mockDoc,
  AudioContext: mockWindow.AudioContext,
  webkitAudioContext: mockWindow.AudioContext,
  console
};

const evalSound = new Function('window', 'document', 'localStorage', soundCode + '; return SoundManager;');
const SoundManager = evalSound(mockWindow, mockDoc, mockWindow.localStorage);

check(typeof SoundManager.getVolume === 'function', 'SoundManager.getVolume() is exported');
check(typeof SoundManager.setVolume === 'function', 'SoundManager.setVolume() is exported');
check(typeof SoundManager.getVolumePercent === 'function', 'SoundManager.getVolumePercent() is exported');
check(SoundManager.getVolume() === 0.8, 'Default volume is 0.8 (80%)');
check(SoundManager.getVolumePercent() === 80, 'Default volume percent is 80');

// Test setVolume with various formats
SoundManager.setVolume(50);
check(SoundManager.getVolume() === 0.5, 'setVolume(50) normalizes to 0.5');
check(SoundManager.getVolumePercent() === 50, 'getVolumePercent() returns 50');
check(parseFloat(mockStorage['minichess_sfx_volume']) === 0.5, 'Volume 0.5 saved to localStorage');
check(gameSlider.slider.value === 50, 'Slider element value updated to 50');
check(gameVal.val.textContent === '50%', 'Value label updated to 50%');

// Test setVolume 0 (mute level icon)
SoundManager.setVolume(0);
check(SoundManager.getVolume() === 0, 'setVolume(0) sets volume to 0');
check(gameMock.innerIcon.getAttribute('data-lucide') === 'volume-x', 'Icon switches to volume-x when volume is 0');

// Test setVolume low (volume-1 icon)
SoundManager.setVolume(30);
check(gameMock.innerIcon.getAttribute('data-lucide') === 'volume-1', 'Icon switches to volume-1 when volume <= 50%');

// Test setVolume high (volume-2 icon)
SoundManager.setVolume(90);
check(gameMock.innerIcon.getAttribute('data-lucide') === 'volume-2', 'Icon switches to volume-2 when volume > 50%');

// Test clamping
SoundManager.setVolume(-20);
check(SoundManager.getVolume() === 0, 'Negative volume clamped to 0');
SoundManager.setVolume(150);
check(SoundManager.getVolume() === 1.0, 'Volume > 100 clamped to 1.0');

// Test mute preserves volume setting
SoundManager.setVolume(70);
SoundManager.toggleMute();
check(SoundManager.isMuted() === true, 'Mute toggled to true');
check(SoundManager.getVolume() === 0.7, 'Stored volume retained as 0.7 while muted');
check(gameMock.innerIcon.getAttribute('data-lucide') === 'volume-x', 'Icon shows volume-x when muted');

SoundManager.toggleMute();
check(SoundManager.isMuted() === false, 'Mute toggled back to false');
check(gameMock.innerIcon.getAttribute('data-lucide') === 'volume-2', 'Icon restored to volume-2 (>50%) upon unmuting');


// -------------------------------------------------------------
// Test Group 2: 7-Day Login Streak Gamification Logic
// -------------------------------------------------------------
console.log('\n--- Test Group 2: 7-Day Login Streak Gamification Logic ---');

const authModule = require('./server/auth');

check(Array.isArray(authModule.DAILY_STREAK_REWARDS), 'DAILY_STREAK_REWARDS array exists');
check(authModule.DAILY_STREAK_REWARDS.length === 7, 'DAILY_STREAK_REWARDS has exactly 7 days');

const rewards = authModule.DAILY_STREAK_REWARDS;
check(rewards[0].day === 1 && rewards[0].xp === 50 && rewards[0].coins === 0, 'Day 1 reward: +50 XP');
check(rewards[1].day === 2 && rewards[1].xp === 75 && rewards[1].coins === 0, 'Day 2 reward: +75 XP');
check(rewards[2].day === 3 && rewards[2].xp === 0 && rewards[2].coins === 100, 'Day 3 reward: +100 Coins');
check(rewards[3].day === 4 && rewards[3].xp === 125 && rewards[3].coins === 0, 'Day 4 reward: +125 XP');
check(rewards[4].day === 5 && rewards[4].xp === 0 && rewards[4].coins === 150, 'Day 5 reward: +150 Coins');
check(rewards[5].day === 6 && rewards[5].xp === 200 && rewards[5].coins === 0, 'Day 6 reward: +200 XP');
check(rewards[6].day === 7 && rewards[6].xp === 250 && rewards[6].coins === 300 && rewards[6].badge === 'streak_master',
  'Day 7 Grand Prize: +250 XP, +300 Coins & "streak_master" Rozet');

// Test getDayDiff helper
const getDayDiff = authModule.getDayDiff;
const now = new Date();
const todayStr = now.toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

check(getDayDiff(null) === null, 'getDayDiff(null) returns null');
check(getDayDiff(todayStr) === 0, 'getDayDiff(today) returns 0');
check(getDayDiff(yesterday) === 1, 'getDayDiff(yesterday) returns 1');
check(getDayDiff(twoDaysAgo) >= 2, 'getDayDiff(twoDaysAgo) returns >= 2');
check(getDayDiff(todayStr + 'T14:35:20.123Z') === 0, 'getDayDiff handles full ISO strings with timestamps');
check(getDayDiff('2026-10-31', '2026-10-30') === -1, 'getDayDiff accurately returns negative on past comparisons');


// -------------------------------------------------------------
// Test Group 3: Server Live Endpoints & Full Streak Lifecycle
// -------------------------------------------------------------
async function runServerAndLiveTests() {
  console.log('\n--- Test Group 3: Live Endpoints & Streak Lifecycle ---');
  process.env.PORT = '4568';
  process.env.NODE_ENV = 'test';

  const { getDb } = require('./server/db');
  const db = await getDb();

  // Verify DB columns
  const tableInfo = db.exec("PRAGMA table_info(users)");
  const colNames = tableInfo[0].values.map(v => v[1]);
  check(colNames.includes('daily_streak'), 'Database table users has daily_streak column');
  check(colNames.includes('last_daily_streak_date'), 'Database table users has last_daily_streak_date column');

  const serverModule = require('./server/server.js');
  await new Promise(resolve => setTimeout(resolve, 800));

  function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 4568,
        path,
        method,
        headers: {}
      };
      if (body) options.headers['Content-Type'] = 'application/json';
      if (cookie) options.headers['Cookie'] = cookie;
      const req = http.request(options, (res) => {
        let data = '';
        const setCookie = res.headers['set-cookie'];
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              setCookie: setCookie ? setCookie[0].split(';')[0] : null,
              body: data ? JSON.parse(data) : null
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              setCookie: setCookie ? setCookie[0].split(';')[0] : null,
              rawBody: data
            });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Register test user
  const streakUser = 'StreakMaster_' + Math.floor(1000 + Math.random() * 9000);
  const regRes = await request('POST', '/api/register', { username: streakUser, password: 'password123' });
  check(regRes.body && regRes.body.success, 'Test user registered: ' + streakUser);
  const userCookie = regRes.setCookie;
  const userRecord = regRes.body.user;

  // 1. Initial streak check
  const streakRes1 = await request('GET', '/api/me/daily-streak', null, userCookie);
  check(streakRes1.statusCode === 200, 'GET /api/me/daily-streak returns 200');
  check(streakRes1.body.streak === 0, 'Initial streak is 0');
  check(streakRes1.body.canClaim === true, 'Initial canClaim is true');

  // 2. Claim Day 1
  const claimRes1 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes1.statusCode === 200, 'POST /api/me/daily-streak/claim returns 200');
  check(claimRes1.body.success === true, 'Claim Day 1 succeeds');
  check(claimRes1.body.streak === 1, 'Streak incremented to 1');
  check(claimRes1.body.reward.day === 1 && claimRes1.body.reward.xp === 50, 'Day 1 reward awarded 50 XP');

  // 3. Double claim guard on same day
  const doubleClaimRes = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(doubleClaimRes.statusCode === 400, 'Duplicate claim on same day returns 400 Bad Request');
  check(doubleClaimRes.body.success === false, 'Duplicate claim rejected with success: false');

  // 4. Simulate consecutive Day 2 (update last_daily_streak_date in DB to yesterday)
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const streakRes2 = await request('GET', '/api/me/daily-streak', null, userCookie);
  check(streakRes2.body.canClaim === true, 'Consecutive day allows claiming (canClaim: true)');
  check(streakRes2.body.streak === 1, 'Current streak is 1');

  const claimRes2 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes2.body.success === true && claimRes2.body.streak === 2, 'Claim Day 2 succeeds, streak = 2');
  check(claimRes2.body.reward.xp === 75, 'Day 2 reward awarded 75 XP');

  // 5. Simulate Days 3 to 7
  // Day 3: Coins
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes3 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes3.body.streak === 3 && claimRes3.body.reward.coins === 100, 'Claim Day 3 awards 100 Coins, streak = 3');

  // Day 4: XP
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes4 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes4.body.streak === 4 && claimRes4.body.reward.xp === 125, 'Claim Day 4 awards 125 XP, streak = 4');

  // Day 5: Coins
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes5 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes5.body.streak === 5 && claimRes5.body.reward.coins === 150, 'Claim Day 5 awards 150 Coins, streak = 5');

  // Day 6: XP
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes6 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes6.body.streak === 6 && claimRes6.body.reward.xp === 200, 'Claim Day 6 awards 200 XP, streak = 6');

  // Day 7: Grand Prize (XP + Coins + Badge)
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes7 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes7.body.streak === 7, 'Claim Day 7 reaches full 7-day streak');
  check(claimRes7.body.reward.xp === 250, 'Day 7 awards 250 XP');
  check(claimRes7.body.reward.coins === 300, 'Day 7 awards 300 Coins');
  check(claimRes7.body.reward.badge === 'streak_master', 'Day 7 awards "streak_master" Badge');

  // 6. Day 8 Loop around to Day 1
  db.run("UPDATE users SET last_daily_streak_date = ? WHERE id = ?", [yesterday, userRecord.id]);
  const claimRes8 = await request('POST', '/api/me/daily-streak/claim', {}, userCookie);
  check(claimRes8.body.streak === 1, 'Consecutive claim after Day 7 cleanly loops back to Day 1 (streak = 1)');
  check(claimRes8.body.reward.day === 1 && claimRes8.body.reward.xp === 50, 'Loop awards Day 1 reward (+50 XP)');

  // 7. Missed day reset test (>1 day gap)
  db.run("UPDATE users SET last_daily_streak_date = ?, daily_streak = 5 WHERE id = ?", [twoDaysAgo, userRecord.id]);
  const streakResReset = await request('GET', '/api/me/daily-streak', null, userCookie);
  check(streakResReset.body.streak === 0, 'Streak resets to 0 after missed day');
  check(streakResReset.body.canClaim === true, 'User can claim fresh streak after reset');

  // 8. Guest access guard
  const guestRes = await request('POST', '/api/guest', {});
  const guestCookie = guestRes.setCookie;
  const guestStreakRes = await request('POST', '/api/me/daily-streak/claim', {}, guestCookie);
  check(guestStreakRes.body && guestStreakRes.body.success === false, 'Guest user cannot claim daily streak rewards');

  // -------------------------------------------------------------
  // Test Group 4: Live Games API & Spectator Lifecycle via Sockets
  // -------------------------------------------------------------
  console.log('\n--- Test Group 4: Live Matches & Spectator Mode ---');

  // 1. Initial live games should be empty
  const liveGamesRes1 = await request('GET', '/api/games/live');
  check(liveGamesRes1.statusCode === 200, 'GET /api/games/live returns 200');
  check(Array.isArray(liveGamesRes1.body.games), 'games array is returned');
  const initialLiveCount = liveGamesRes1.body.games.length;

  // Set up socket server connection simulation
  const ioServer = serverModule.io;
  const socketConnHandler = ioServer.listeners('connection')[0];
  check(typeof socketConnHandler === 'function', 'Socket.IO connection handler is accessible');

  const registeredMockSockets = new Map();
  const origTo = ioServer.to.bind(ioServer);
  ioServer.to = function(target) {
    const op = origTo(target);
    const origEmit = op.emit.bind(op);
    op.emit = function(ev, ...args) {
      const mockSock = registeredMockSockets.get(target);
      if (mockSock && typeof mockSock.emit === 'function') {
        mockSock.emit(ev, args[0]);
      }
      return origEmit(ev, ...args);
    };
    return op;
  };

  // Create player 1 (White)
  const p1Events = [];
  const p1Socket = {
    id: 'mock_player_w_' + Date.now(),
    request: { session: { userId: userRecord.id, username: streakUser, isGuest: false, save: cb => cb && cb() } },
    handshake: { auth: {} },
    emit: (evt, data) => p1Events.push({ evt, data })
  };
  registeredMockSockets.set(p1Socket.id, p1Socket);
  const p1Listeners = {};
  p1Socket.on = (evt, handler) => { p1Listeners[evt] = handler; };
  socketConnHandler(p1Socket);

  // Start bot game to establish active game
  p1Events.length = 0;
  p1Listeners['start_bot_game']({ difficulty: 'easy' });

  const matchEvent = p1Events.find(e => e.evt === 'match_found');
  check(matchEvent && matchEvent.data && matchEvent.data.gameId, 'Player started active game: ' + (matchEvent ? matchEvent.data.gameId : 'none'));
  const activeGameId = matchEvent.data.gameId;

  // 2. Check live games endpoint now includes this game
  const liveGamesRes2 = await request('GET', '/api/games/live');
  const foundLiveGame = liveGamesRes2.body.games.find(g => g.id === activeGameId);
  check(foundLiveGame !== undefined, 'Active game is listed in GET /api/games/live');
  check(foundLiveGame.white && foundLiveGame.white.username === streakUser, 'White player is accurately populated in live game');
  check(foundLiveGame.spectatorsCount === 0, 'Initial spectators count is 0');

  // 3. Connect Spectator Socket
  const specEvents = [];
  const specSocket = {
    id: 'mock_spec_' + Date.now(),
    request: { session: { userId: 'spec_user_1', username: 'Observer', isGuest: false, save: cb => cb && cb() } },
    handshake: { auth: {} },
    emit: (evt, data) => specEvents.push({ evt, data })
  };
  registeredMockSockets.set(specSocket.id, specSocket);
  const specListeners = {};
  specSocket.on = (evt, handler) => { specListeners[evt] = handler; };
  socketConnHandler(specSocket);

  // Join as spectator
  specEvents.length = 0;
  specListeners['spectate_game']({ gameId: activeGameId });

  const specStartEvt = specEvents.find(e => e.evt === 'spectator_game_state');
  check(specStartEvt !== undefined, 'Spectator received spectator_game_state event upon spectate_game');
  check(specStartEvt && specStartEvt.data.isSpectator === true, 'spectator_game_state has isSpectator: true flag');
  check(specStartEvt && specStartEvt.data.spectatorsCount === 1, 'spectator_game_state reflects updated spectator count: 1');

  // Live games API should show spectatorsCount: 1
  const liveGamesRes3 = await request('GET', '/api/games/live');
  const specLiveGame = liveGamesRes3.body.games.find(g => g.id === activeGameId);
  check(specLiveGame && specLiveGame.spectatorsCount === 1, 'GET /api/games/live reflects 1 spectator');

  // 4. Test live move broadcast to spectator
  specEvents.length = 0;
  // White makes a move (pawn a2 to a3)
  p1Listeners['make_move']({ gameId: activeGameId, move: { from: 'a2', to: 'a3' } });

  const specMoveEvt = specEvents.find(e => e.evt === 'move_result');
  check(specMoveEvt !== undefined, 'Spectator received move_result broadcast in real-time');
  check(specMoveEvt && specMoveEvt.data.fen !== undefined, 'move_result broadcast includes updated fen');

  // 5. Test spectator cannot make moves
  specEvents.length = 0;
  p1Events.length = 0;
  if (specListeners['make_move']) {
    specListeners['make_move']({ gameId: activeGameId, move: { from: 'd3', to: 'd4' } });
  }
  const specIllegalMove = p1Events.find(e => e.evt === 'move_result');
  check(specIllegalMove === undefined, 'Spectator cannot execute moves on the board');

  // 6. Test spectator cannot resign for players
  specEvents.length = 0;
  p1Events.length = 0;
  if (specListeners['resign']) {
    specListeners['resign']({ gameId: activeGameId });
  }
  const specIllegalGameOver = p1Events.find(e => e.evt === 'game_over');
  check(specIllegalGameOver === undefined, 'Spectator cannot resign or forfeit game');

  // Test spectator cannot offer draw or skip dice
  specEvents.length = 0;
  if (specListeners['request_draw']) {
    specListeners['request_draw']({ gameId: activeGameId });
  }
  const specDrawErr = specEvents.find(e => e.evt === 'error' && e.data.message === 'Spectators cannot offer draw');
  check(specDrawErr !== undefined, 'Spectator draw request is rejected with explicit spectator error');

  if (specListeners['dice_skip']) {
    specListeners['dice_skip']({ gameId: activeGameId });
  }
  const specDiceErr = specEvents.find(e => e.evt === 'error' && e.data.message === 'Spectators cannot skip turns');
  check(specDiceErr !== undefined, 'Spectator dice skip is rejected with explicit spectator error');

  // Test player opening a spectator socket is still prevented from acting through that spectator socket
  const playerSpecSocket = {
    id: 'mock_player_spec_' + Date.now(),
    request: { session: { userId: userRecord.id, username: streakUser, isGuest: false, save: cb => cb && cb() } },
    handshake: { auth: {} },
    emit: (evt, data) => specEvents.push({ evt, data })
  };
  registeredMockSockets.set(playerSpecSocket.id, playerSpecSocket);
  const playerSpecListeners = {};
  playerSpecSocket.on = (evt, handler) => { playerSpecListeners[evt] = handler; };
  socketConnHandler(playerSpecSocket);
  playerSpecListeners['spectate_game']({ gameId: activeGameId });

  specEvents.length = 0;
  playerSpecListeners['make_move']({ gameId: activeGameId, move: { from: 'b2', to: 'b3' } });
  const playerSpecMoveErr = specEvents.find(e => e.evt === 'error' && e.data.message === 'Spectators cannot make moves');
  check(playerSpecMoveErr !== undefined, 'Player operating via spectator socket is blocked from submitting moves');

  playerSpecListeners['resign']({ gameId: activeGameId });
  const playerSpecResignErr = specEvents.find(e => e.evt === 'error' && e.data.message === 'Spectators cannot resign');
  check(playerSpecResignErr !== undefined, 'Player operating via spectator socket is blocked from resigning');

  registeredMockSockets.delete(playerSpecSocket.id);
  playerSpecListeners['disconnect']();

  // 7. Test spectator disconnect does NOT disrupt active game
  p1Events.length = 0;
  registeredMockSockets.delete(specSocket.id);
  specListeners['disconnect']();

  const oppDiscEvent = p1Events.find(e => e.evt === 'opponent_disconnected');
  check(oppDiscEvent === undefined, 'Spectator disconnect does NOT trigger opponent_disconnected for players');

  const liveGamesRes4 = await request('GET', '/api/games/live');
  const gameAfterSpecLeave = liveGamesRes4.body.games.find(g => g.id === activeGameId);
  check(gameAfterSpecLeave && gameAfterSpecLeave.spectatorsCount === 0, 'Spectator count returned to 0 after spectator disconnect');

  // 8. Reconnect spectator and trigger player resignation -> Game Over broadcast
  const specSocket2 = {
    id: 'mock_spec_2_' + Date.now(),
    request: { session: { userId: 'spec_user_2', username: 'Observer2', isGuest: false, save: cb => cb && cb() } },
    handshake: { auth: {} },
    emit: (evt, data) => specEvents.push({ evt, data })
  };
  registeredMockSockets.set(specSocket2.id, specSocket2);
  const specListeners2 = {};
  specSocket2.on = (evt, handler) => { specListeners2[evt] = handler; };
  socketConnHandler(specSocket2);
  specListeners2['spectate_game']({ gameId: activeGameId });

  specEvents.length = 0;
  p1Listeners['resign']({ gameId: activeGameId });

  const specGameOverEvt = specEvents.find(e => e.evt === 'game_over');
  check(specGameOverEvt !== undefined, 'Spectator received game_over broadcast when match concluded');

  // -------------------------------------------------------------
  // Test Group 5: DOM Integrity & Internationalization (TR & EN)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 5: DOM Integrity & i18n ---');

  const gameHtml = fs.readFileSync(path.join(__dirname, 'public/game.html'), 'utf8');
  const lobbyHtml = fs.readFileSync(path.join(__dirname, 'public/lobby.html'), 'utf8');
  const i18nCode = fs.readFileSync(path.join(__dirname, 'public/js/i18n.js'), 'utf8');

  // Check game.html DOM elements
  check(gameHtml.includes('id="spectatorBanner"'), 'game.html contains #spectatorBanner');
  check(gameHtml.includes('id="spectatorCountNum"'), 'game.html contains #spectatorCountNum');
  check(gameHtml.includes('id="gameVolumeSlider"'), 'game.html contains #gameVolumeSlider');
  check(gameHtml.includes('id="gameVolumeVal"'), 'game.html contains #gameVolumeVal');
  check(gameHtml.includes('id="gameVolumePopover"'), 'game.html contains #gameVolumePopover');
  check(gameHtml.includes('id="gameSoundToggleBtn"'), 'game.html preserves #gameSoundToggleBtn');

  // Check lobby.html DOM elements
  check(lobbyHtml.includes('id="dailyStreakCard"'), 'lobby.html contains #dailyStreakCard');
  check(lobbyHtml.includes('id="streakDaysTrack"'), 'lobby.html contains #streakDaysTrack');
  check(lobbyHtml.includes('id="streakCurrentCount"'), 'lobby.html contains #streakCurrentCount');
  check(lobbyHtml.includes('id="streakClaimBtn"'), 'lobby.html contains #streakClaimBtn');
  check(lobbyHtml.includes('id="liveMatchesCard"'), 'lobby.html contains #liveMatchesCard');
  check(lobbyHtml.includes('id="liveMatchesList"'), 'lobby.html contains #liveMatchesList');
  check(lobbyHtml.includes('id="soundVolumeSlider"'), 'lobby.html contains #soundVolumeSlider');
  check(lobbyHtml.includes('id="lobbyVolumeSlider"'), 'lobby.html contains #lobbyVolumeSlider');
  check(lobbyHtml.includes('id="soundToggleBtn"'), 'lobby.html preserves #soundToggleBtn');
  check(lobbyHtml.includes('id="lobbySoundToggleBtn"'), 'lobby.html preserves #lobbySoundToggleBtn');

  // Check profile.html achievements definition
  const profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
  check(profileHtml.includes("id: 'streak_master'"), 'profile.html includes streak_master in ACHIEVEMENTS_DEF');

  // Check i18n dictionary completeness in both TR and EN
  const requiredKeys = [
    'live_matches',
    'live_matches_desc',
    'spectate',
    'spectating_live',
    'spectators',
    'spectator_count',
    'no_live_matches',
    'spectator_mode',
    'spectator_banner_hint',
    'daily_login_streak',
    'daily_streak_sub',
    'claim_daily_reward',
    'streak_claimed_today',
    'streak_day',
    'streak_bonus_claimed',
    'grand_prize',
    'volume',
    'wins_suffix',
    'white_to_move',
    'black_to_move',
    'white_pocket',
    'black_pocket',
    'guest_streak_login_prompt',
    'streak_master',
    'badge'
  ];

  const mockI18nWindow = {
    localStorage: mockWindow.localStorage,
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
  const t = mockI18nWindow.t;
  const setLanguage = mockI18nWindow.setLanguage;

  setLanguage('tr');
  for (const k of requiredKeys) {
    const val = t(k, '__MISSING__');
    check(val !== '__MISSING__', `TR i18n dictionary has translation for key "${k}": "${val}"`);
  }

  setLanguage('en');
  for (const k of requiredKeys) {
    const val = t(k, '__MISSING__');
    check(val !== '__MISSING__', `EN i18n dictionary has translation for key "${k}": "${val}"`);
  }

  console.log(`\nSpectator, Streak & Volume Suite Complete: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runServerAndLiveTests().catch(err => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});
