/**
 * Complete Test Suite for Package 3 (Paket 3)
 * 1. Custom Time Controls (1+0 Bullet, 3+0 Blitz, 5+0 Rapid)
 * 2. Bot Takeback & Minimax Hint
 * 3. Post-Game Interactive Move Stepper & FEN Export
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

async function run() {
  console.log('=== Running MiniChess Package 3 Test Suite ===\n');

  // --- Group 1: i18n Parity for Package 3 Keys ---
  console.log('--- Test Group 1: i18n Parity for Package 3 Keys ---');
  const i18n = require('./public/js/i18n.js');
  const enKeys = Object.keys(i18n.TRANSLATIONS.en);
  const trKeys = Object.keys(i18n.TRANSLATIONS.tr);

  assert(enKeys.length === trKeys.length, `TR and EN have matching length (${enKeys.length} keys)`);

  const pkg3Keys = [
    'time_control',
    'bullet_1m',
    'blitz_3m',
    'rapid_5m',
    'takeback',
    'hint',
    'takeback_done',
    'no_takeback_available',
    'calculating_hint',
    'hint_suggested',
    'copy_fen',
    'fen_copied',
    'review_game',
    'show_result',
    'game_finished_review',
    'wait_your_turn',
    'final_position',
    'move_step',
    'only_bot_takeback',
    'only_bot_hint',
    'failed_copy_fen',
    'no_board_state',
    'joining_game',
    'room_has_two_players',
    'no_room_id_provided',
    'room_check_failed',
    'failed_create_room'
  ];

  pkg3Keys.forEach(k => {
    assert(Boolean(i18n.TRANSLATIONS.en[k]), `EN has translation for key "${k}" (${i18n.TRANSLATIONS.en[k]})`);
    assert(Boolean(i18n.TRANSLATIONS.tr[k]), `TR has translation for key "${k}" (${i18n.TRANSLATIONS.tr[k]})`);
  });

  // --- Group 2: FEN Export in Engine ---
  console.log('\n--- Test Group 2: FEN Export in Engine ---');
  const engine = require('./server/game-engine.js');
  const clientEngine = require('./public/js/engine.js');

  const startState = engine.parseFen('2bnrk/5p/6/6/P5/KRNB2 w - - []/[]');
  const serverFen = engine.toFen(startState);
  assert(serverFen === '2bnrk/5p/6/6/P5/KRNB2 w - - []/[]', `server toFen matches INITIAL_FEN: ${serverFen}`);

  const clientFen = clientEngine.toFen(startState);
  assert(clientFen === serverFen, `client toFen matches server toFen: ${clientFen}`);

  // Test state with pocket pieces
  const customState = engine.cloneState(startState);
  customState.pockets.white.push('p', 'n');
  customState.pockets.black.push('r');
  const pocketFen = clientEngine.toFen(customState);
  assert(pocketFen.includes('[p,n]/[r]'), `client toFen formats pockets correctly: ${pocketFen}`);

  // --- Group 3: Server HTTP Time Control Parsing & Rooms ---
  console.log('\n--- Test Group 3: Server HTTP Time Control Parsing & Rooms ---');
  process.env.PORT = '4572';
  process.env.NODE_ENV = 'test';

  const { getDb } = require('./server/db');
  await getDb();
  const serverModule = require('./server/server.js');
  await new Promise(resolve => setTimeout(resolve, 800));

  function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 4572,
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

  // Register a test user
  const testerUsername = 'Pkg3User_' + Math.floor(Math.random() * 9000 + 1000);
  const regRes = await request('POST', '/api/register', {
    username: testerUsername,
    password: 'Password123!'
  });
  assert(regRes.body && regRes.body.success, `Registered test user ${testerUsername}`);
  const userCookie = regRes.setCookie;

  // Create room with Bullet (60000ms)
  const roomBulletRes = await request('POST', '/api/rooms/create', { timeControl: 60000 }, userCookie);
  assert(roomBulletRes.body && roomBulletRes.body.success, `Room created with Bullet 60s`);
  assert(roomBulletRes.body.timeControl === 60000, `POST /api/rooms/create returned timeControl: 60000`);

  // Fetch room info
  const getBulletRes = await request('GET', '/api/rooms/' + roomBulletRes.body.roomId);
  assert(getBulletRes.body && getBulletRes.body.success, `GET /api/rooms/:id returned 200`);
  assert(getBulletRes.body.room.timeControl === 60000, `GET /api/rooms/:id reports timeControl: 60000`);

  // Create room with Rapid (300000ms)
  const roomRapidRes = await request('POST', '/api/rooms/create', { timeControl: 300000 }, userCookie);
  assert(roomRapidRes.body && roomRapidRes.body.timeControl === 300000, `POST /api/rooms/create returned timeControl: 300000 (Rapid)`);

  // Create room with default (Blitz 180000ms)
  const roomBlitzRes = await request('POST', '/api/rooms/create', {}, userCookie);
  assert(roomBlitzRes.body && roomBlitzRes.body.timeControl === 180000, `POST /api/rooms/create defaults to 180000 (3+0 Blitz)`);

  // Create room with minute format (5m / 5 / 3 / 1)
  const roomMinute5Res = await request('POST', '/api/rooms/create', { timeControl: '5m' }, userCookie);
  assert(roomMinute5Res.body && roomMinute5Res.body.timeControl === 300000, `POST /api/rooms/create accepts "5m" as 300000`);

  const roomNum5Res = await request('POST', '/api/rooms/create', { timeControl: 5 }, userCookie);
  assert(roomNum5Res.body && roomNum5Res.body.timeControl === 300000, `POST /api/rooms/create accepts 5 as 300000`);

  const roomNum3Res = await request('POST', '/api/rooms/create', { timeControl: 3 }, userCookie);
  assert(roomNum3Res.body && roomNum3Res.body.timeControl === 180000, `POST /api/rooms/create accepts 3 as 180000`);

  const roomNum1Res = await request('POST', '/api/rooms/create', { timeControl: 1 }, userCookie);
  assert(roomNum1Res.body && roomNum1Res.body.timeControl === 60000, `POST /api/rooms/create accepts 1 as 60000`);

  // --- Group 4: Live Bot Match Takeback & Hint via Socket Simulation ---
  console.log('\n--- Test Group 4: Live Bot Match Takeback & Hint via Socket Simulation ---');
  const ioServer = serverModule.io;
  const socketConnHandler = ioServer.listeners('connection')[0];
  assert(typeof socketConnHandler === 'function', `Socket.IO connection handler is accessible`);

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

  const clientEvents = [];
  const clientSocket = {
    id: 'mock_pkg3_' + Date.now(),
    request: { session: { userId: 99991, username: testerUsername, isGuest: false, save: cb => cb && cb() } },
    handshake: { auth: {} },
    emit: (evt, data) => clientEvents.push({ evt, data })
  };
  registeredMockSockets.set(clientSocket.id, clientSocket);
  const clientListeners = {};
  clientSocket.on = (evt, handler) => { clientListeners[evt] = handler; };
  socketConnHandler(clientSocket);

  // Authenticate socket
  if (clientListeners['authenticate']) {
    clientListeners['authenticate']({ userId: 99991, username: testerUsername });
  }

  // Start bot match with 60000ms timeControl
  clientEvents.length = 0;
  clientListeners['start_bot_game']({
    difficulty: 'easy',
    timeControl: 60000,
    guestUsername: testerUsername
  });

  const matchEvent = clientEvents.find(e => e.evt === 'match_found');
  assert(Boolean(matchEvent), `Bot match started, match_found received`);
  assert(matchEvent.data.mode === 'bot', `Match mode is 'bot'`);
  assert(matchEvent.data.isBot === true, `Match has isBot: true`);
  assert(matchEvent.data.timeControl === 60000, `Match timeControl is 60000`);
  assert(matchEvent.data.whiteTime === 60000, `Match whiteTime is 60000`);
  assert(matchEvent.data.blackTime === 60000, `Match blackTime is 60000`);

  const botGameId = matchEvent.data.gameId;

  // Test Hint on White's turn
  clientEvents.length = 0;
  await clientListeners['bot_hint']({ gameId: botGameId, guestUsername: testerUsername });

  const hintEvent = clientEvents.find(e => e.evt === 'bot_hint_result');
  assert(Boolean(hintEvent), `Received bot_hint_result`);
  assert(hintEvent.data.gameId === botGameId, `bot_hint_result matches gameId`);
  assert(Boolean(hintEvent.data.move), `bot_hint_result contains calculated move`);
  assert(typeof hintEvent.data.move.to === 'string', `Hint move target square is valid: ${hintEvent.data.move.to}`);

  // Test Takeback before any moves -> error
  clientEvents.length = 0;
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });
  const takebackErr = clientEvents.find(e => e.evt === 'bot_takeback_error');
  assert(Boolean(takebackErr), `Takeback with no moves yields bot_takeback_error: "${takebackErr ? takebackErr.data.message : ''}"`);

  // Make a legal move for White (pawn a2 -> a3: row 1, col 0 to row 2, col 0)
  const initialFen = matchEvent.data.fen;
  const parsedState = engine.parseFen(initialFen);
  const legalMoves = engine.getAllLegalMoves(parsedState, 'white');
  assert(legalMoves.length > 0, `Generated ${legalMoves.length} legal moves for White`);
  const moveToPlay = legalMoves[0];

  clientEvents.length = 0;
  clientListeners['make_move']({
    gameId: botGameId,
    move: moveToPlay
  });

  const whiteMoveResult = clientEvents.find(e => e.evt === 'move_result');
  assert(Boolean(whiteMoveResult), `White move applied, move_result received`);

  // Wait for bot to execute its move
  await new Promise(resolve => setTimeout(resolve, 800));

  const botMoveResult = clientEvents.filter(e => e.evt === 'move_result')[1];
  assert(Boolean(botMoveResult), `Bot made responding move`);
  assert(botMoveResult.data.activeColor === 'white', `Turn returned back to White`);

  // Now White takes back both moves
  clientEvents.length = 0;
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });

  const takebackSuccess = clientEvents.find(e => e.evt === 'bot_takeback_success');
  assert(Boolean(takebackSuccess), `Received bot_takeback_success`);
  assert(takebackSuccess.data.activeColor === 'white', `Active color after takeback is White`);
  assert(takebackSuccess.data.fen === initialFen, `FEN reverted back to start: ${takebackSuccess.data.fen}`);
  assert(takebackSuccess.data.whiteTime === 60000, `White time restored to initial`);

  // Race condition probe: Takeback while bot is computing/delaying
  clientEvents.length = 0;
  clientListeners['make_move']({
    gameId: botGameId,
    move: moveToPlay
  });
  // Immediately request takeback before bot move completes
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });

  await new Promise(resolve => setTimeout(resolve, 600));
  const immediateTakeback = clientEvents.find(e => e.evt === 'bot_takeback_success');
  assert(Boolean(immediateTakeback), `Immediate takeback during bot delay succeeds`);
  assert(immediateTakeback.data.activeColor === 'white', `Immediate takeback restored activeColor to white`);
  const staleBotMoves = clientEvents.filter(e => e.evt === 'move_result' && e.data.activeColor === 'white');
  assert(staleBotMoves.length === 0, `No stale bot moves emitted after takeback cancelled bot timer`);

  // Multi-turn takeback test: play 2 moves, take back twice
  const legalMoves2 = engine.getAllLegalMoves(engine.parseFen(initialFen), 'white');
  clientEvents.length = 0;
  clientListeners['make_move']({ gameId: botGameId, move: legalMoves2[0] });
  await new Promise(resolve => setTimeout(resolve, 600));

  const afterMove1Fen = clientEvents.filter(e => e.evt === 'move_result').pop().data.fen;
  const legalMoves3 = engine.getAllLegalMoves(engine.parseFen(afterMove1Fen), 'white');
  clientListeners['make_move']({ gameId: botGameId, move: legalMoves3[0] });
  await new Promise(resolve => setTimeout(resolve, 600));

  // Takeback move 2 pair
  clientEvents.length = 0;
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });
  const tb1 = clientEvents.find(e => e.evt === 'bot_takeback_success');
  assert(Boolean(tb1), `Multi-turn takeback 1 succeeded`);
  assert(tb1.data.fen === afterMove1Fen, `Multi-turn takeback 1 returned to move 1 state`);

  // Takeback move 1 pair
  clientEvents.length = 0;
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });
  const tb2 = clientEvents.find(e => e.evt === 'bot_takeback_success');
  assert(Boolean(tb2), `Multi-turn takeback 2 succeeded`);
  assert(tb2.data.fen === initialFen, `Multi-turn takeback 2 returned to initial start`);

  // Third takeback -> should report no moves
  clientEvents.length = 0;
  clientListeners['bot_takeback']({ gameId: botGameId, guestUsername: testerUsername });
  const tb3Err = clientEvents.find(e => e.evt === 'bot_takeback_error');
  assert(Boolean(tb3Err), `Third takeback correctly reports no moves to take back`);

  // --- Group 5: DOM Elements & Post-Game Replay Markup ---
  console.log('\n--- Test Group 5: DOM Elements & Post-Game Replay Markup ---');
  const gameHtml = fs.readFileSync(path.join(__dirname, 'public/game.html'), 'utf8');
  const lobbyHtml = fs.readFileSync(path.join(__dirname, 'public/lobby.html'), 'utf8');
  const joinHtml = fs.readFileSync(path.join(__dirname, 'public/join.html'), 'utf8');
  const styleCss = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf8');

  // Time control selectors in lobby.html
  assert(lobbyHtml.includes('time-control-selector'), `lobby.html has .time-control-selector`);
  assert(lobbyHtml.includes('selectRoomTimeControl'), `lobby.html has selectRoomTimeControl function`);
  assert(lobbyHtml.includes('selectBotTimeControl'), `lobby.html has selectBotTimeControl function`);
  assert(lobbyHtml.includes('bullet_1m'), `lobby.html references bullet_1m`);
  assert(lobbyHtml.includes('blitz_3m'), `lobby.html references blitz_3m`);
  assert(lobbyHtml.includes('rapid_5m'), `lobby.html references rapid_5m`);

  // join.html displays time control
  assert(joinHtml.includes('room.timeControl'), `join.html checks room.timeControl`);
  assert(joinHtml.includes('room-tc-info'), `join.html retains .room-tc-info badge`);
  assert(joinHtml.includes('joining_game'), `join.html references joining_game i18n key`);

  // game.html buttons & review stepper
  assert(gameHtml.includes('id="takebackBtn"'), `game.html has #takebackBtn`);
  assert(gameHtml.includes('id="hintBtn"'), `game.html has #hintBtn`);
  assert(gameHtml.includes('id="reviewBanner"'), `game.html has #reviewBanner`);
  assert(gameHtml.includes('reviewFinishedGame()'), `game.html has reviewFinishedGame()`);
  assert(gameHtml.includes('copyCurrentFen()'), `game.html has copyCurrentFen()`);
  assert(gameHtml.includes('id="copyFenBtn"'), `game.html has #copyFenBtn in replay controls`);
  assert(gameHtml.includes('go-review-btn'), `game.html has .go-review-btn in game over card`);
  assert(gameHtml.includes('go-copy-fen-btn'), `game.html has .go-copy-fen-btn in game over card`);
  assert(gameHtml.includes('hint-source'), `game.html uses hint-source square highlight`);
  assert(gameHtml.includes('hint-target'), `game.html uses hint-target square highlight`);
  assert(gameHtml.includes('hint-pocket'), `game.html uses hint-pocket highlight`);
  assert(gameHtml.includes('highlightReplayMove'), `game.html has highlightReplayMove function`);

  // style.css highlights and stepper styles
  assert(styleCss.includes('.square.hint-source'), `style.css defines .square.hint-source`);
  assert(styleCss.includes('.square.hint-target'), `style.css defines .square.hint-target`);
  assert(styleCss.includes('.pocket-piece.hint-pocket'), `style.css defines .hint-pocket`);
  assert(styleCss.includes('.review-banner'), `style.css defines .review-banner`);
  assert(styleCss.includes('.go-actions-row'), `style.css defines .go-actions-row`);
  assert(styleCss.includes('.active-move'), `style.css defines .active-move highlight`);

  console.log(`\nPackage 3 Suite Complete: ${passedTests} passed, ${failedTests} failed.`);
  process.exit(failedTests > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
