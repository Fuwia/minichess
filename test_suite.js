const http = require('http');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=== Running MiniChess Verification Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  [PASS]', message);
      passed++;
    } else {
      console.error('  [FAIL]', message);
      failed++;
    }
  }

  // 1. Verify i18n Dictionary and Functionality
  console.log('\n--- Test Group 1: i18n Module & Vocabulary ---');
  // Load i18n in a simulated window
  const i18nCode = fs.readFileSync(path.join(__dirname, 'public/js/i18n.js'), 'utf8');
  const mockStorage = {};
  const mockWindow = {
    localStorage: {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
      removeItem: (k) => { delete mockStorage[k]; }
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
  evalI18n(mockWindow, mockWindow.document, mockWindow.localStorage, function() {}, { TEXT_NODE: 3 });

  assert(typeof mockWindow.t === 'function', 't(key) is exported');
  assert(typeof mockWindow.setLanguage === 'function', 'setLanguage(lang) is exported');
  assert(typeof mockWindow.getLang === 'function', 'getLang() is exported');

  // Test language toggle persistence
  mockWindow.setLanguage('tr');
  assert(mockWindow.getLang() === 'tr', 'setLanguage("tr") updates language');
  assert(mockStorage['minichess_lang'] === 'tr', 'Language is stored in localStorage under minichess_lang');

  mockWindow.setLanguage('en');
  assert(mockWindow.getLang() === 'en', 'setLanguage("en") updates language');
  assert(mockStorage['minichess_lang'] === 'en', 'Language storage updated to "en"');

  // Verify all required task vocabulary
  mockWindow.setLanguage('tr');
  const REQUIRED_VOCAB = [
    { en: 'Play', expected: 'Oyna' },
    { en: 'Leaderboard', expected: 'Liderlik Tablosu' },
    { en: 'Battlepass', expected: 'Savaş Bileti' },
    { en: 'Shop', expected: 'Mağaza' },
    { en: 'Profile', expected: 'Profil' },
    { en: 'Sign Out', expected: 'Çıkış Yap' },
    { en: 'Welcome back', expected: 'Tekrar hoş geldin' },
    { en: 'Current ELO', expected: 'Güncel ELO' },
    { en: 'Multiplayer', expected: 'Çok Oyunculu' },
    { en: 'Vs Computer', expected: 'Bilgisayara Karşı' },
    { en: 'Play a Friend', expected: 'Arkadaşla Oyna' },
    { en: 'Find Match', expected: 'Maç Bul' },
    { en: 'Searching for Opponent...', expected: 'Rakip Aranıyor...' },
    { en: 'Daily Quests', expected: 'Günlük Görevler' },
    { en: 'Top Players', expected: 'En İyi Oyuncular' },
    { en: 'Recent Activity', expected: 'Son Aktiviteler' },
    { en: 'Your Pocket', expected: 'Senin Cebin' },
    { en: "Opponent's Pocket", expected: 'Rakibin Cebi' },
    { en: 'Moves', expected: 'Hamleler' },
    { en: 'No moves yet', expected: 'Henüz hamle yok' },
    { en: 'Draw', expected: 'Beraberlik' },
    { en: 'Resign', expected: 'Pes Et' },
    { en: 'Leave', expected: 'Ayrıl' },
    { en: 'Your Turn', expected: 'Sıra Sende' },
    { en: 'Wins', expected: 'Galibiyet' },
    { en: 'Losses', expected: 'Mağlubiyet' },
    { en: 'Draws', expected: 'Beraberlik' },
    { en: 'Win Rate', expected: 'Kazanma Oranı' },
    { en: 'Achievements', expected: 'Başarımlar' },
    { en: 'Friends', expected: 'Arkadaşlar' },
    { en: 'Game History', expected: 'Maç Geçmişi' },
    { en: 'Board Themes', expected: 'Tahta Temaları' },
    { en: 'Win Effects', expected: 'Galibiyet Efektleri' },
    { en: 'Name Colors', expected: 'İsim Renkleri' },
    { en: 'Equipped', expected: 'Kullanılıyor' },
    { en: 'Owned', expected: 'Sahip Olunan' },
    { en: 'Tier', expected: 'Aşama' },
    { en: 'Tiers', expected: 'Aşamalar' },
    { en: 'Unlocked', expected: 'Açıldı' },
    { en: 'Pending', expected: 'Bekleyen' },
    { en: 'Play a Match', expected: 'Maç Yap' }
  ];

  for (const item of REQUIRED_VOCAB) {
    const translated = mockWindow.t(item.en);
    assert(
      translated === item.expected,
      `Term "${item.en}" -> expected "${item.expected}", got "${translated}"`
    );
  }

  // 2. Start server on isolated port to test endpoints
  console.log('\n--- Test Group 2: Live Backend Guest Endpoints ---');
  process.env.PORT = '4567';
  process.env.NODE_ENV = 'test';

  const { getDb } = require('./server/db');
  await getDb();
  const serverModule = require('./server/server.js');

  await new Promise(resolve => setTimeout(resolve, 800));

  function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 4567,
        path,
        method,
        headers: {}
      };
      if (body) {
        options.headers['Content-Type'] = 'application/json';
      }
      if (cookie) {
        options.headers['Cookie'] = cookie;
      }
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

  // Test POST /api/guest
  const guestRes1 = await request('POST', '/api/guest', {});
  assert(guestRes1.statusCode === 200, 'POST /api/guest returns 200');
  assert(guestRes1.body && guestRes1.body.success === true, 'POST /api/guest returns success: true');
  assert(guestRes1.body && /^Guest_\d{4}$/.test(guestRes1.body.user.username), `Guest username has 4-digit format: ${guestRes1.body?.user?.username}`);
  assert(guestRes1.body && guestRes1.body.user.elo === 1200, 'Guest initial ELO is 1200');
  assert(guestRes1.body && guestRes1.body.user.isGuest === true, 'Guest user has isGuest: true');
  assert(!!guestRes1.setCookie, 'Guest session cookie is returned');

  const guestCookie = guestRes1.setCookie;

  // Test GET /api/me with guest session
  const meRes = await request('GET', '/api/me', null, guestCookie);
  assert(meRes.statusCode === 200, 'GET /api/me returns 200');
  assert(meRes.body && meRes.body.user && meRes.body.user.isGuest === true, 'GET /api/me recognizes guest session');
  assert(meRes.body && meRes.body.user.username === guestRes1.body.user.username, 'GET /api/me returns matching username');

  // Test protected room creation with guest session
  const roomRes = await request('POST', '/api/rooms/create', {}, guestCookie);
  assert(roomRes.statusCode === 200, 'POST /api/rooms/create succeeds for guest (no 401 Unauthorized)');
  assert(roomRes.body && roomRes.body.success === true && !!roomRes.body.roomId, `Guest created room successfully: ${roomRes.body?.roomId}`);

  // Test second distinct guest session
  const guestRes2 = await request('POST', '/api/guest', {});
  assert(guestRes2.body && guestRes2.body.user.username !== guestRes1.body.user.username, 'Second guest receives a distinct username');

  // Test that guests do not pollute the global leaderboard
  const lbRes = await request('GET', '/api/leaderboard', null, null);
  assert(lbRes.statusCode === 200, 'GET /api/leaderboard returns 200');
  const lbLeaders = (lbRes.body && lbRes.body.leaderboard) || [];
  const guestInLb = lbLeaders.some(p => p.username && p.username.startsWith('Guest_'));
  assert(!guestInLb, 'Guest accounts do not appear in Global Leaderboard');

  // Test guest restrictions on shop buy
  const shopBuyRes = await request('POST', '/api/shop/buy', { itemId: 'ocean', category: 'board_themes' }, guestCookie);
  assert(shopBuyRes.statusCode === 200, 'POST /api/shop/buy returns 200 for guest');
  assert(shopBuyRes.body && shopBuyRes.body.success === false && shopBuyRes.body.isGuest === true, 'POST /api/shop/buy rejects guest with isGuest: true');

  // Test guest restrictions on battlepass claim
  const bpClaimRes = await request('POST', '/api/battlepass/claim', { tier: 1 }, guestCookie);
  assert(bpClaimRes.statusCode === 200, 'POST /api/battlepass/claim returns 200 for guest');
  assert(bpClaimRes.body && bpClaimRes.body.success === false && bpClaimRes.body.isGuest === true, 'POST /api/battlepass/claim rejects guest with isGuest: true');

  // Test guest restrictions on avatar upload and friend request
  const avatarRes = await request('POST', '/api/me/avatar', {}, guestCookie);
  assert(avatarRes.body && avatarRes.body.success === false && avatarRes.body.isGuest === true, 'POST /api/me/avatar rejects guest with isGuest: true');

  const friendRes = await request('POST', '/api/friends/request', { friendUsername: 'AnyUser' }, guestCookie);
  assert(friendRes.body && friendRes.body.success === false && friendRes.body.isGuest === true, 'POST /api/friends/request rejects guest with isGuest: true');

  // Test POST /api/logout
  const logoutRes = await request('POST', '/api/logout', {}, guestCookie);
  assert(logoutRes.statusCode === 200, 'POST /api/logout returns 200');
  const meAfterLogout = await request('GET', '/api/me', null, guestCookie);
  assert(meAfterLogout.body && meAfterLogout.body.user === null, 'Session destroyed after logout, GET /api/me returns null');

  // --- Test Group 3: Registered User Protection & Guest Game Entry ---
  console.log('\n--- Test Group 3: Registered User Protection & Guest Game Entry ---');

  // Test real user registration & session check
  const regUsername = 'RealUser_' + Math.floor(1000 + Math.random() * 9000);
  const regUserRes = await request('POST', '/api/register', { username: regUsername, password: 'password123' });
  assert(regUserRes.body && regUserRes.body.success === true, 'Registered user created');
  const regCookie = regUserRes.setCookie;

  // Test reserved username blocking for registration
  const blockedReg1 = await request('POST', '/api/register', { username: 'Guest_Master', password: 'password123' });
  assert(blockedReg1.body && blockedReg1.body.success === false, 'POST /api/register blocks usernames starting with "Guest"');
  const blockedReg2 = await request('POST', '/api/register', { username: 'guest_player', password: 'password123' });
  assert(blockedReg2.body && blockedReg2.body.success === false, 'POST /api/register blocks usernames starting with "guest" (case-insensitive)');

  const regMeRes = await request('GET', '/api/me', null, regCookie);
  assert(regMeRes.body && regMeRes.body.user && regMeRes.body.user.isGuest === false, 'Registered user has isGuest: false in /api/me');
  assert(regMeRes.body && regMeRes.body.user && regMeRes.body.user.username === regUsername, 'Registered user username matches');

  // Attempting to become a guest while logged in as a registered user MUST fail
  const blockedGuestRes = await request('POST', '/api/guest', {}, regCookie);
  assert(blockedGuestRes.statusCode === 400, 'POST /api/guest returns 400 when user is already logged into a registered account');
  assert(blockedGuestRes.body && blockedGuestRes.body.success === false, 'Blocked guest login returns success: false');

  // Verify that guest user can join match queue and play bot game without "Not authenticated"
  const newGuestRes = await request('POST', '/api/guest', {});
  assert(newGuestRes.statusCode === 200, 'Created fresh guest session');
  const guestUserObj = newGuestRes.body.user;

  // Test socket simulation for guest user
  const guestEvents = [];
  const mockGuestSocket = {
    id: 'mock_guest_socket_1',
    request: {
      session: {
        userId: guestUserObj.id,
        username: guestUserObj.username,
        isGuest: true,
        save: (cb) => { if (cb) cb(); }
      }
    },
    handshake: { auth: {} },
    emit: (evt, data) => { guestEvents.push({ evt, data }); }
  };

  const ioServer = serverModule.io;
  let socketConnHandler = null;
  if (ioServer && ioServer.listeners) {
    const listeners = ioServer.listeners('connection');
    if (listeners && listeners.length > 0) {
      socketConnHandler = listeners[0];
    }
  }

  assert(typeof socketConnHandler === 'function', 'Socket.IO connection handler is accessible');

  if (socketConnHandler) {
    const socketListeners = {};
    mockGuestSocket.on = (evt, handler) => { socketListeners[evt] = handler; };
    socketConnHandler(mockGuestSocket);

    // Call join_queue as guest
    guestEvents.length = 0;
    if (socketListeners['join_queue']) {
      socketListeners['join_queue']();
    }
    const hasQueueJoined = guestEvents.some(e => e.evt === 'queue_joined');
    const hasNotAuthError = guestEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(hasQueueJoined, 'Guest successfully joined matchmaking queue');
    assert(!hasNotAuthError, 'Guest did NOT receive "Not authenticated" error when joining matchmaking');

    // Leave queue
    if (socketListeners['leave_queue']) {
      socketListeners['leave_queue']();
    }

    // Call join_dice_queue as guest
    guestEvents.length = 0;
    if (socketListeners['join_dice_queue']) {
      socketListeners['join_dice_queue']();
    }
    const hasDiceQueueJoined = guestEvents.some(e => e.evt === 'queue_joined');
    const hasDiceNotAuth = guestEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(hasDiceQueueJoined, 'Guest successfully joined MiniDice queue');
    assert(!hasDiceNotAuth, 'Guest did NOT receive "Not authenticated" error in MiniDice queue');

    // Leave dice queue
    if (socketListeners['leave_dice_queue']) {
      socketListeners['leave_dice_queue']();
    }

    // Call start_bot_game as guest
    guestEvents.length = 0;
    if (socketListeners['start_bot_game']) {
      socketListeners['start_bot_game']({ difficulty: 'easy' });
    }
    const hasMatchFound = guestEvents.some(e => e.evt === 'match_found');
    const hasBotNotAuthError = guestEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(hasMatchFound, 'Guest successfully started bot game');
    assert(!hasBotNotAuthError, 'Guest did NOT receive "Not authenticated" error when starting bot game');

    // Test socket authenticate event properly associates guest user
    guestEvents.length = 0;
    const testGuest2Name = 'Guest_' + Math.floor(1000 + Math.random() * 9000);
    if (socketListeners['authenticate']) {
      socketListeners['authenticate']({ guestUsername: testGuest2Name });
    }
    const hasAuthEvt = guestEvents.some(e => e.evt === 'authenticated' && e.data && e.data.username === testGuest2Name);
    assert(hasAuthEvt, 'Socket authenticate handler resolves guest username: ' + testGuest2Name);

    // Test registered user socket protects against guest authenticate
    const regSocketEvents = [];
    const mockRegSocket = {
      id: 'mock_reg_socket_1',
      request: {
        session: {
          userId: regMeRes.body.user.id, // registered user ID
          username: regUsername,
          isGuest: false,
          save: (cb) => { if (cb) cb(); }
        }
      },
      handshake: { auth: {} },
      emit: (evt, data) => { regSocketEvents.push({ evt, data }); }
    };
    const regListeners = {};
    mockRegSocket.on = (evt, handler) => { regListeners[evt] = handler; };
    socketConnHandler(mockRegSocket);

    regSocketEvents.length = 0;
    if (regListeners['authenticate']) {
      regListeners['authenticate']({ guestUsername: 'Guest_7777' });
    }
    const hasRegStayedAuth = regSocketEvents.some(e => e.evt === 'authenticated' && e.data && e.data.username === regUsername);
    assert(hasRegStayedAuth, 'Registered user socket refuses to downgrade to guest and preserves registered account identity');

    // Test Cookieless / Disconnected Guest Socket with payload (simulating Guest_1579 issue)
    const cookielessEvents = [];
    const mockCookielessSocket = {
      id: 'mock_cookieless_socket_1',
      request: { session: { save: (cb) => { if (cb) cb(); } } },
      handshake: { auth: {} },
      emit: (evt, data) => { cookielessEvents.push({ evt, data }); }
    };
    const cookielessListeners = {};
    mockCookielessSocket.on = (evt, handler) => { cookielessListeners[evt] = handler; };
    socketConnHandler(mockCookielessSocket);

    // Call join_queue with guestUsername in payload
    cookielessEvents.length = 0;
    if (cookielessListeners['join_queue']) {
      cookielessListeners['join_queue']({ guestUsername: 'Guest_1579' });
    }
    const clQueueJoined = cookielessEvents.some(e => e.evt === 'queue_joined');
    const clQueueNotAuth = cookielessEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(clQueueJoined, 'Cookieless Guest_1579 joined queue successfully');
    assert(!clQueueNotAuth, 'Cookieless Guest_1579 did NOT receive "Not authenticated" error in join_queue');

    if (cookielessListeners['leave_queue']) {
      cookielessListeners['leave_queue']();
    }

    // Call start_bot_game with guestUsername in payload
    cookielessEvents.length = 0;
    if (cookielessListeners['start_bot_game']) {
      cookielessListeners['start_bot_game']({ difficulty: 'easy', guestUsername: 'Guest_1579' });
    }
    const clBotMatchFound = cookielessEvents.some(e => e.evt === 'match_found');
    const clBotNotAuth = cookielessEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(clBotMatchFound, 'Cookieless Guest_1579 started bot game successfully');
    assert(!clBotNotAuth, 'Cookieless Guest_1579 did NOT receive "Not authenticated" error in start_bot_game');

    // Test socket with NO credentials at all: auto-assigns guest and allows bot game
    const anonymousEvents = [];
    const mockAnonSocket = {
      id: 'mock_anon_socket_1',
      request: { session: { save: (cb) => { if (cb) cb(); } } },
      handshake: { auth: {} },
      emit: (evt, data) => { anonymousEvents.push({ evt, data }); }
    };
    const anonListeners = {};
    mockAnonSocket.on = (evt, handler) => { anonListeners[evt] = handler; };
    socketConnHandler(mockAnonSocket);

    anonymousEvents.length = 0;
    if (anonListeners['start_bot_game']) {
      anonListeners['start_bot_game']({ difficulty: 'easy' });
    }
    const anonBotMatch = anonymousEvents.some(e => e.evt === 'match_found');
    const anonBotNotAuth = anonymousEvents.some(e => e.evt === 'error' && e.data && e.data.message === 'Not authenticated');
    assert(anonBotMatch, 'Completely anonymous socket auto-assigned guest and started bot game');
    assert(!anonBotNotAuth, 'Completely anonymous socket did NOT receive "Not authenticated" error');
  }

  // Test Group 4: UI helpers in auth.js
  console.log('\n--- Test Group 4: Frontend Guest Nav Lock & Restriction Card ---');
  const authCode = fs.readFileSync(path.join(__dirname, 'public/js/auth.js'), 'utf8');

  // Create mock DOM for testing renderGuestBadges and renderGuestRestriction
  function createMockElement(id, tagName = 'div') {
    const classes = new Set();
    const attrs = {};
    const children = [];
    return {
      id,
      tagName: tagName.toUpperCase(),
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c); else classes.add(c);
          } else if (force) {
            classes.add(c);
          } else {
            classes.delete(c);
          }
        }
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => attrs[k] || null,
      removeAttribute: (k) => { delete attrs[k]; },
      appendChild: (ch) => { children.push(ch); },
      querySelector: (sel) => {
        if (sel === '.guest-badge') return children.find(c => c.classList && c.classList.contains('guest-badge')) || null;
        if (sel === '.guest-lock-indicator') return children.find(c => c.classList && c.classList.contains('guest-lock-indicator')) || null;
        return null;
      },
      parentElement: null,
      parentNode: null,
      style: {},
      innerHTML: '',
      textContent: '',
      addEventListener: () => {}
    };
  }

  const mockDomElements = {
    sidebarUsername: createMockElement('sidebarUsername'),
    heroUsername: createMockElement('heroUsername'),
    playerName: createMockElement('playerName'),
    profileUsername: createMockElement('profileUsername'),
    navBattlepass: createMockElement('navBattlepass', 'a'),
    navShop: createMockElement('navShop', 'a'),
    navProfile: createMockElement('navProfile', 'a')
  };

  const mockParent = createMockElement('mockParent');
  mockDomElements.sidebarUsername.parentElement = mockParent;
  mockDomElements.sidebarUsername.parentNode = mockParent;
  mockDomElements.heroUsername.parentElement = mockParent;
  mockDomElements.heroUsername.parentNode = mockParent;
  mockDomElements.playerName.parentElement = mockParent;
  mockDomElements.playerName.parentNode = mockParent;
  mockDomElements.profileUsername.parentElement = mockParent;
  mockDomElements.profileUsername.parentNode = mockParent;

  const evalAuth = new Function('window', 'document', 'localStorage', 'sessionStorage', authCode);
  const mockAuthWindow = {
    localStorage: mockWindow.localStorage,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    getLang: () => 'tr',
    t: mockWindow.t
  };
  const mockBody = createMockElement('body', 'body');
  mockDomElements.body = mockBody;

  const mockBentoLink = createMockElement('bentoLink', 'a');
  mockBentoLink.classList.add('bento-action-link');
  mockBentoLink.setAttribute('href', 'battlepass.html');
  mockBentoLink.closest = (sel) => null;

  mockDomElements.navBattlepass.closest = (sel) => mockParent;
  mockDomElements.navShop.closest = (sel) => mockParent;
  mockDomElements.navProfile.closest = (sel) => mockParent;

  const docListeners = {};
  const mockAuthDoc = {
    body: mockBody,
    getElementById: (id) => mockDomElements[id] || null,
    querySelectorAll: (sel) => {
      const results = [];
      if (sel.includes('navBattlepass')) results.push(mockDomElements.navBattlepass);
      if (sel.includes('navShop')) results.push(mockDomElements.navShop);
      if (sel.includes('navProfile')) results.push(mockDomElements.navProfile);
      if (sel.includes('battlepass.html')) results.push(mockBentoLink);
      return results;
    },
    createElement: (tag) => createMockElement(null, tag),
    addEventListener: (evt, handler, capture) => { docListeners[evt] = handler; }
  };

  evalAuth(mockAuthWindow, mockAuthDoc, mockAuthWindow.localStorage, mockAuthWindow.sessionStorage);

  // Test guest user locking Battlepass, Shop, Profile
  const guestUser = { username: 'Guest_9999', isGuest: true, elo: 1200 };
  mockAuthWindow.renderGuestBadges(guestUser);

  assert(mockDomElements.navBattlepass.classList.contains('guest-locked'), 'navBattlepass is guest-locked');
  assert(mockDomElements.navBattlepass.getAttribute('data-guest-locked') === 'true', 'navBattlepass has data-guest-locked="true"');
  assert(mockDomElements.navBattlepass.getAttribute('title') === 'Giriş yaparsan erişebilirsin', 'navBattlepass title is "Giriş yaparsan erişebilirsin"');
  assert(mockDomElements.navShop.classList.contains('guest-locked'), 'navShop is guest-locked');
  assert(mockDomElements.navProfile.classList.contains('guest-locked'), 'navProfile is guest-locked');
  assert(mockBentoLink.classList.contains('guest-locked'), 'Non-sidebar bento link to battlepass.html is guest-locked');
  assert(mockBody.classList.contains('is-guest'), 'document.body has class "is-guest" when guest user is active');

  // Test registered user unlocking Battlepass, Shop, Profile
  const registeredUser = { username: 'RealPlayer_1', isGuest: false, elo: 1400 };
  mockAuthWindow.renderGuestBadges(registeredUser);

  assert(!mockDomElements.navBattlepass.classList.contains('guest-locked'), 'navBattlepass unlocked for registered user');
  assert(!mockDomElements.navShop.classList.contains('guest-locked'), 'navShop unlocked for registered user');
  assert(!mockDomElements.navProfile.classList.contains('guest-locked'), 'navProfile unlocked for registered user');
  assert(!mockBentoLink.classList.contains('guest-locked'), 'Non-sidebar bento link unlocked for registered user');
  assert(!mockBody.classList.contains('is-guest'), 'document.body does NOT have class "is-guest" for registered user');

  // Test renderGuestBadges with NO arguments when window.currentUser is a registered user (as happens on SPA nav / i18n changes)
  mockAuthWindow.currentUser = registeredUser;
  mockAuthWindow.renderGuestBadges();
  assert(!mockDomElements.navBattlepass.classList.contains('guest-locked'), 'renderGuestBadges() with no arguments leaves navigation unlocked for registered user');
  assert(!mockBody.classList.contains('is-guest'), 'document.body does not have "is-guest" after renderGuestBadges() with registered window.currentUser');

  // Test click interception
  let defaultPrevented = false;
  let propagationStopped = false;
  let toastMessage = '';
  mockAuthWindow.currentUser = guestUser;
  mockDomElements.navBattlepass.classList.add('guest-locked');
  mockAuthWindow.showToast = (msg) => { toastMessage = msg; };
  mockAuthWindow.isGuest = () => true;

  if (docListeners['click']) {
    const mockClickEvent = {
      target: {
        closest: (sel) => mockDomElements.navBattlepass
      },
      preventDefault: () => { defaultPrevented = true; },
      stopPropagation: () => { propagationStopped = true; },
      stopImmediatePropagation: () => {}
    };
    docListeners['click'](mockClickEvent);
    assert(defaultPrevented, 'Global click interceptor prevented navigation for guest on locked link');
    assert(propagationStopped, 'Global click interceptor stopped propagation');
    assert(toastMessage === 'Giriş yaparsan erişebilirsin', 'Global click interceptor popped toast "Giriş yaparsan erişebilirsin"');
  }

  // Test renderGuestRestriction content
  const testContainer = createMockElement('testMain');
  mockAuthWindow.renderGuestRestriction(testContainer, 'battlepass');
  assert(testContainer.innerHTML.includes('Giriş yaparsan erişebilirsin'), 'Restriction view includes "Giriş yaparsan erişebilirsin"');
  assert(testContainer.innerHTML.includes('Lobiye Dön'), 'Restriction view includes "Lobiye Dön" link');

  console.log(`\nVerification Suite Complete: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
