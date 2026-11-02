const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const { getDb, saveDb } = require('./db');
let db = null;
const auth = require('./auth');
const engine = require('./game-engine');
const Matchmaker = require('./matchmaker');
const bot = require('./bot');
const battlepass = require('./battlepass');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Initial FEN for MiniChess (6x6)
const INITIAL_FEN = '2bnrk/5p/6/6/P5/KRNB2 w - - []/[]';

// ==================== Middleware ====================

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'minichess-secret-key-production-session',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, (err) => {
    if (err) return next(err);
    const session = socket.request.session;
    // If session already belongs to a registered user, NEVER treat as guest!
    if (session && session.userId) {
      const regUser = auth.getUserById(session.userId);
      if (regUser) {
        if (regUser.is_banned === 1) {
          return next(new Error('ACCOUNT_BANNED'));
        }
        if (!regUser.username.startsWith('Guest_')) {
          session.isGuest = false;
        }
        return next();
      } else {
        session.userId = null;
      }
    }
    const gName = (session && session.username) ||
                  (socket.handshake && socket.handshake.auth && socket.handshake.auth.guestUsername) ||
                  (socket.handshake && socket.handshake.query && socket.handshake.query.guestUsername) ||
                  (socket.handshake && socket.handshake.headers && socket.handshake.headers['x-guest-username']);
    if (gName && gName.startsWith('Guest_')) {
      socket.guestUsername = gName;
      let gUser = auth.getUserByUsername(gName);
      if (!gUser) {
        auth.registerUser(gName, GUEST_DUMMY_HASH);
        saveDb();
        gUser = auth.getUserByUsername(gName);
      }
      if (gUser && session) {
        session.userId = gUser.id;
        session.username = gUser.username;
        session.isGuest = true;
        try { session.save(); } catch (e) {}
      }
    }
    next();
  });
});

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const user = auth.getUserById(req.session.userId);
    if (user) {
      if (user.is_banned === 1) {
        req.session.destroy();
        return res.status(403).json({ error: 'Account has been banned', banned: true, message: user.banned_reason || 'Bu hesap yönetici tarafından engellenmiştir.' });
      }
      return next();
    }
    req.session.userId = null;
  }
  // Auto-resolve guest session if guest username exists in session or request headers/query/body
  const gName = (req.session && req.session.username) ||
                req.headers['x-guest-username'] ||
                (req.query && req.query.guestUsername) ||
                (req.body && req.body.guestUsername);
  if ((req.session && req.session.isGuest) || (gName && gName.startsWith('Guest_'))) {
    const finalGName = (gName && gName.startsWith('Guest_')) ? gName : `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    let gUser = auth.getUserByUsername(finalGName);
    if (!gUser) {
      auth.registerUser(finalGName, GUEST_DUMMY_HASH);
      saveDb();
      gUser = auth.getUserByUsername(finalGName);
    }
    if (gUser) {
      if (req.session) {
        req.session.userId = gUser.id;
        req.session.username = gUser.username;
        req.session.isGuest = true;
        try { req.session.save(); } catch (e) {}
      }
      return next();
    }
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// ==================== REST API Routes ====================

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }
  
  if (username.length < 3 || username.length > 20) {
    return res.json({ success: false, message: 'Username must be 3-20 characters' });
  }
  
  if (password.length < 4) {
    return res.json({ success: false, message: 'Password must be at least 4 characters' });
  }

  if (/^guest/i.test(username.trim())) {
    return res.json({ success: false, message: 'Usernames starting with "Guest" are reserved for guest players' });
  }
  
  const prevGuestId = req.session && req.session.isGuest ? req.session.userId : null;
  const guestHeader = req.headers['x-guest-username'];

  const passwordHash = await auth.hashPassword(password);
  const result = auth.registerUser(username, passwordHash);
  
  if (result.success) {
    if (prevGuestId) {
      try { auth.cleanupEmptyGuest(prevGuestId); saveDb(); } catch (e) {}
    } else if (guestHeader && guestHeader.startsWith('Guest_')) {
      try {
        const gUser = auth.getUserByUsername(guestHeader);
        if (gUser) { auth.cleanupEmptyGuest(gUser.id); saveDb(); }
      } catch (e) {}
    }

    const user = auth.getUserByUsername(username);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isGuest = false;
    result.user = {
      id: user.id,
      username: user.username,
      elo: user.elo || 1200,
      wins: user.wins || 0,
      losses: user.losses || 0,
      draws: user.draws || 0,
      isGuest: false
    };
    return req.session.save((err) => {
      if (err) console.error('[Register Session Error]', err);
      res.json(result);
    });
  }
  
  res.json(result);
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }

  const prevGuestId = req.session && req.session.isGuest ? req.session.userId : null;
  const guestHeader = req.headers['x-guest-username'];
  
  const result = auth.loginUser(username, password);
  
  if (result.success) {
    if (prevGuestId) {
      try { auth.cleanupEmptyGuest(prevGuestId); saveDb(); } catch (e) {}
    } else if (guestHeader && guestHeader.startsWith('Guest_')) {
      try {
        const gUser = auth.getUserByUsername(guestHeader);
        if (gUser) { auth.cleanupEmptyGuest(gUser.id); saveDb(); }
      } catch (e) {}
    }

    req.session.userId = result.user.id;
    req.session.username = result.user.username;
    req.session.isGuest = false;
    result.user.isGuest = false;
    return req.session.save((err) => {
      if (err) console.error('[Login Session Error]', err);
      res.json(result);
    });
  }
  
  res.json(result);
});

// Logout
app.post('/api/logout', (req, res) => {
  const userId = req.session && req.session.userId;
  const isGuest = req.session && (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_')));
  req.session.destroy();
  if (isGuest && userId) {
    try {
      auth.cleanupEmptyGuest(userId);
      saveDb();
    } catch (e) {
      console.warn('[Logout Guest Cleanup Error]', e);
    }
  }
  res.json({ success: true });
});

// Precomputed dummy bcrypt hash for guests to avoid CPU event-loop blocking
const GUEST_DUMMY_HASH = '$2a$10$e8kP09k4t3FmBvB4Y0FfjeU1K6r1sK2c0N1V6e5U4V3m2P1o0N9qW';

// Guest Login
app.post('/api/guest', async (req, res) => {
  try {
    // If user is already logged in with a registered account, do not allow guest login
    if (req.session.userId || (req.session.username && !req.session.username.startsWith('Guest_'))) {
      const uId = req.session.userId;
      const existingUser = uId ? auth.getUserById(uId) : auth.getUserByUsername(req.session.username);
      if (existingUser && !existingUser.username.startsWith('Guest_')) {
        return res.status(400).json({
          success: false,
          message: 'Already logged in as a registered user. Please log out first.'
        });
      }
    }

    let username = req.body && req.body.username;
    let user = null;

    if (username && /^Guest_\d{4}$/.test(username)) {
      user = auth.getUserByUsername(username);
    }

    if (!user) {
      if (!username || !/^Guest_\d{4}$/.test(username) || auth.getUserByUsername(username)) {
        username = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      let existing = auth.getUserByUsername(username);
      let attempts = 0;
      while (existing && attempts < 100) {
        username = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
        existing = auth.getUserByUsername(username);
        attempts++;
      }

      if (existing) {
        username = `Guest_${Date.now().toString().slice(-4)}`;
      }

      let regRes = auth.registerUser(username, GUEST_DUMMY_HASH);
      if (regRes && regRes.success) saveDb();
      user = regRes && regRes.success ? auth.getUserByUsername(username) : null;
    }

    if (!user) {
      // Fallback unique username if race condition occurred
      username = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
      auth.registerUser(username, GUEST_DUMMY_HASH);
      saveDb();
      user = auth.getUserByUsername(username);
    }

    if (user) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isGuest = true;
      return req.session.save((err) => {
        if (err) console.error('[Session Error]', err);
        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            elo: user.elo || 1200,
            wins: user.wins || 0,
            losses: user.losses || 0,
            draws: user.draws || 0,
            coins: user.coins || 0,
            isGuest: true
          }
        });
      });
    }

    res.status(500).json({ success: false, message: 'Failed to create guest user' });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create guest session'
    });
  }
});

// Get current user
app.get('/api/me', (req, res) => {
  const gHeader = req.headers['x-guest-username'] || (req.query && req.query.guestUsername);
  if (!req.session.userId) {
    const gName = (req.session && req.session.username) || gHeader;
    if (((req.session && (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_')))) || (gHeader && gHeader.startsWith('Guest_'))) && gName) {
      let gUser = auth.getUserByUsername(gName);
      if (!gUser && gName.startsWith('Guest_')) {
        auth.registerUser(gName, GUEST_DUMMY_HASH);
        saveDb();
        gUser = auth.getUserByUsername(gName);
      }
      if (gUser) {
        if (req.session) {
          req.session.userId = gUser.id;
          req.session.username = gUser.username;
          req.session.isGuest = true;
          try { req.session.save(); } catch (e) {}
        }
        return res.json({
          user: {
            id: gUser.id,
            username: gUser.username,
            elo: gUser.elo || 1200,
            wins: gUser.wins || 0,
            losses: gUser.losses || 0,
            draws: gUser.draws || 0,
            coins: gUser.coins || 0,
            isGuest: true
          }
        });
      }
    }
    return res.json({ user: null });
  }
  
  let user = auth.getUserById(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.json({ user: null });
  }
  if (user.is_banned === 1) {
    req.session.destroy();
    return res.json({ user: null, banned: true, message: user.banned_reason || 'Bu hesap yönetici tarafından engellenmiştir.' });
  }
  
  if (user) {
    if (user.username && user.username.startsWith('Guest_')) {
      user.isGuest = true;
      req.session.isGuest = true;
    } else {
      user.isGuest = false;
      req.session.isGuest = false;
    }
    let changed = false;
    if (user.wins >= 1 && auth.unlockAchievement(user.id, 'first_win')) changed = true;
    if (user.elo >= 1500 && auth.unlockAchievement(user.id, 'elo_1500')) changed = true;
    if (user.elo >= 2000 && auth.unlockAchievement(user.id, 'elo_2000')) changed = true;
    if ((user.wins + user.losses + user.draws) >= 50 && auth.unlockAchievement(user.id, 'dedicated_player')) changed = true;
    
    if (changed) {
      user = auth.getUserById(req.session.userId);
      if (user.username && user.username.startsWith('Guest_')) {
        user.isGuest = true;
        req.session.isGuest = true;
      } else {
        user.isGuest = false;
        req.session.isGuest = false;
      }
    }
  }

  res.json({ user });
});

// Check if the current user has an active game (for rejoin button)
app.get('/api/me/active-game', (req, res) => {
  if (!req.session.userId) {
    return res.json({ active: false });
  }

  const game = getGameByUserId(req.session.userId);
  if (game && !game.isOver) {
    const color = getPlayerColor(game, req.session.userId);
    const opponentColor = color === 'white' ? 'black' : 'white';
    const opponentId = game.players[opponentColor];
    const opponentUser = opponentId ? auth.getUserById(opponentId) : null;

    res.json({
      active: true,
      gameId: game.id,
      color: color,
      opponent: opponentUser ? opponentUser.username : 'Unknown',
      opponentElo: opponentUser ? opponentUser.elo : 1200,
      mode: game.mode || 'standard'
    });
  } else {
    res.json({ active: false });
  }
});

// ==================== Daily Login Streak API ====================

app.get('/api/me/daily-streak', (req, res) => {
  if (!req.session.userId) {
    return res.json({
      success: true,
      streak: 0,
      canClaim: true,
      nextDay: 1,
      isGuest: true,
      rewards: auth.DAILY_STREAK_REWARDS
    });
  }
  const streakInfo = auth.getDailyStreak(req.session.userId);
  if (!streakInfo) {
    return res.json({
      success: true,
      streak: 0,
      canClaim: true,
      nextDay: 1,
      isGuest: !!req.session.isGuest,
      rewards: auth.DAILY_STREAK_REWARDS
    });
  }
  res.json({
    success: true,
    ...streakInfo,
    isGuest: !!req.session.isGuest
  });
});

app.post('/api/me/daily-streak/claim', requireAuth, (req, res) => {
  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    return res.json({
      success: false,
      isGuest: true,
      message: 'Lütfen günlük seriyi kaydetmek ve ödülleri almak için bir hesap oluşturun!'
    });
  }

  const result = auth.claimDailyStreak(req.session.userId, battlepass);
  if (!result.success) {
    return res.status(400).json(result);
  }
  saveDb();
  if (result.bpResult && result.bpResult.leveledUp) {
    notifyLevelUp(req.session.userId, result.bpResult);
  }
  const status = battlepass.getBattlepassStatus(req.session.userId);
  const updatedUser = auth.getUserById(req.session.userId);
  res.json({
    success: true,
    ...result,
    coins: updatedUser ? updatedUser.coins : 0,
    battlepass: status
  });
});

// Check if current user is admin
app.get('/api/me/admin', (req, res) => {
  if (!req.session.userId) {
    return res.json({ isAdmin: false });
  }
  res.json({ isAdmin: auth.isAdmin(req.session.userId) });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = auth.getLeaderboard();
  res.json({ leaderboard });
});

// ==================== Avatar Upload ====================

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'img', 'avatars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'user_' + req.session.userId + '_' + Date.now() + ext);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

app.post('/api/me/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.json({ success: false, isGuest: true, message: 'Please create an account to customize your profile' });
  }
  if (!req.file) {
    return res.json({ success: false, message: 'No file uploaded or invalid type.' });
  }

  const user = auth.getUserById(req.session.userId);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Check 30-second cooldown
  if (user.last_avatar_change) {
    const lastChange = new Date(user.last_avatar_change + 'Z').getTime();
    const now = Date.now();
    if (now - lastChange < 30000) {
      // Delete the just-uploaded file since it won't be used
      fs.unlink(req.file.path, () => {});
      const remaining = Math.ceil((30000 - (now - lastChange)) / 1000);
      return res.json({ success: false, message: 'Please wait ' + remaining + 's before changing avatar again.' });
    }
  }

  // Delete old avatar file if it exists
  if (user.avatar_url) {
    const oldPath = path.join(__dirname, '..', 'public', user.avatar_url);
    fs.unlink(oldPath, () => {});
  }

  // Save relative path to DB
  const avatarUrl = 'img/avatars/' + req.file.filename;
  auth.updateAvatar(req.session.userId, avatarUrl);

  if (auth.unlockAchievement(req.session.userId, 'fashionista')) {
    logAndBroadcastActivity('achievement', user.username, { achievementName: 'Fashionista' });
  }

  res.json({ success: true, avatarUrl: avatarUrl });
});

// Get a user's profile by username (public)
app.get('/api/users/by-username/:username', (req, res) => {
  let user = auth.getUserByUsername(req.params.username);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Retroactive achievement check for existing accounts
  let changed = false;
  if (user.wins >= 1 && auth.unlockAchievement(user.id, 'first_win')) changed = true;
  if (user.elo >= 1500 && auth.unlockAchievement(user.id, 'elo_1500')) changed = true;
  if (user.elo >= 2000 && auth.unlockAchievement(user.id, 'elo_2000')) changed = true;
  if ((user.wins + user.losses + user.draws) >= 50 && auth.unlockAchievement(user.id, 'dedicated_player')) changed = true;
  
  if (changed) {
    user = auth.getUserByUsername(req.params.username);
  }

  // Don't expose password_hash
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      elo: user.elo,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      createdAt: user.created_at,
      avatarUrl: user.avatar_url || null,
      title: user.title || null,
      username_color: user.username_color || '',
      unlocked_achievements: user.unlocked_achievements || '[]'
    }
  });
});

// ==================== Live Games API ====================

// Get all active live games in progress
app.get('/api/games/live', (req, res) => {
  const games = [];
  if (activeGames) {
    for (const [gameId, g] of activeGames.entries()) {
      if (g.isOver) continue;
      const whiteUser = g.whiteId !== 0 ? auth.getUserById(g.whiteId) : null;
      const blackUser = g.blackId !== 0 ? auth.getUserById(g.blackId) : null;
      const spectators = gameSpectators ? gameSpectators.get(gameId) : null;

      games.push({
        id: gameId,
        gameId: gameId,
        white: {
          id: g.whiteId,
          username: g.whiteUsername,
          elo: g.whiteElo,
          avatarUrl: whiteUser ? whiteUser.avatar_url : null,
          avatar_url: whiteUser ? whiteUser.avatar_url : null
        },
        black: {
          id: g.blackId,
          username: g.blackUsername,
          elo: g.blackElo,
          avatarUrl: blackUser ? blackUser.avatar_url : null,
          avatar_url: blackUser ? blackUser.avatar_url : null
        },
        mode: g.mode || 'standard',
        type: g.mode || 'standard',
        isRanked: !!g.isRanked,
        turn: g.state ? g.state.activeColor : 'white',
        activeColor: g.state ? g.state.activeColor : 'white',
        movesCount: (g.state && g.state.moveHistory) ? g.state.moveHistory.length : 0,
        whiteTime: g.whiteTime,
        blackTime: g.blackTime,
        spectatorsCount: spectators ? spectators.size : 0,
        isBot: !!g.isBot,
        createdAt: g.createdAt || new Date().toISOString()
      });
    }
  }
  res.json({ success: true, count: games.length, games });
});

// ==================== Game History API ====================

// Get a single game by its UUID — returns current status (active/finished)
app.get('/api/games/:gameUuid', async (req, res) => {
  const { gameUuid } = req.params;

  // 1) Check if the game is still in active memory
  const activeGame = activeGames.get(gameUuid);
  if (activeGame) {
    const whiteUser = activeGame.whiteId !== 0 ? auth.getUserById(activeGame.whiteId) : null;
    const blackUser = activeGame.blackId !== 0 ? auth.getUserById(activeGame.blackId) : null;
    const spectators = gameSpectators ? gameSpectators.get(gameUuid) : null;
    return res.json({
      success: true,
      status: activeGame.isOver ? 'finished' : 'active',
      game: {
        gameUuid: gameUuid,
        id: gameUuid,
        white: {
          id: activeGame.whiteId,
          username: activeGame.whiteUsername,
          elo: activeGame.whiteElo,
          avatarUrl: whiteUser ? whiteUser.avatar_url : null,
          avatar_url: whiteUser ? whiteUser.avatar_url : null
        },
        black: {
          id: activeGame.blackId,
          username: activeGame.blackUsername,
          elo: activeGame.blackElo,
          avatarUrl: blackUser ? blackUser.avatar_url : null,
          avatar_url: blackUser ? blackUser.avatar_url : null
        },
        result: activeGame.isOver ? (activeGame.result || 'unknown') : null,
        fen: engine.toFen(activeGame.state),
        moves: activeGame.state.moveHistory || [],
        createdAt: new Date().toISOString(),
        mode: activeGame.mode || 'standard',
        whiteTime: activeGame.whiteTime,
        blackTime: activeGame.blackTime,
        activeColor: activeGame.state.activeColor,
        spectatorsCount: spectators ? spectators.size : 0
      }
    });
  }

  // 2) Fall back to database (finished games only)
  try {
    const database = await getDb();
    const stmt = database.prepare(
      `SELECT g.*, 
        COALESCE(w.username, 'Unknown Player') as white_username, COALESCE(w.elo, 1200) as white_elo, w.avatar_url as white_avatar_url,
        COALESCE(b.username, 'Unknown Player') as black_username, COALESCE(b.elo, 1200) as black_elo, b.avatar_url as black_avatar_url
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE g.game_uuid = ? OR CAST(g.id AS TEXT) = ?`
    );
    stmt.bind([gameUuid, gameUuid]);
    
    let row = null;
    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      row = {};
      const values = stmt.get();
      cols.forEach((col, i) => { row[col] = values[i]; });
    }
    stmt.free();
    
    if (!row) {
      return res.json({ success: false, message: 'Game not found' });
    }
    
    res.json({
      success: true,
      status: 'finished',
      game: {
        gameUuid: row.game_uuid,
        white: {
          id: row.white_id,
          username: row.white_username,
          elo: row.white_elo,
          avatarUrl: row.white_avatar_url,
          avatar_url: row.white_avatar_url
        },
        black: {
          id: row.black_id,
          username: row.black_username,
          elo: row.black_elo,
          avatarUrl: row.black_avatar_url,
          avatar_url: row.black_avatar_url
        },
        result: row.result,
        fen: row.fen_final,
        moves: row.moves_json ? JSON.parse(row.moves_json) : [],
        createdAt: row.created_at
      }
    });
  } catch (err) {
    console.error('Error fetching game:', err);
    res.json({ success: false, message: 'Failed to fetch game' });
  }
});

// Get match history for a specific user (with pagination)
app.get('/api/users/:userId/games', async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const database = await getDb();
    
    // Get total count first
    const countStmt = database.prepare(
      'SELECT COUNT(*) as total FROM games WHERE white_id = ? OR black_id = ?'
    );
    countStmt.bind([userId, userId]);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();
    
    // Get paginated games (LEFT JOIN so bot games with black_id=0 still appear)
    const stmt = database.prepare(
      `SELECT g.game_uuid, g.white_id, g.black_id, g.result, g.fen_final, g.created_at,
        w.username as white_username, w.elo as white_elo,
        b.username as black_username, b.elo as black_elo
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE g.white_id = ? OR g.black_id = ?
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`
    );
    stmt.bind([userId, userId, limit, offset]);
    
    const games = [];
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const row = {};
      const values = stmt.get();
      cols.forEach((col, i) => { row[col] = values[i]; });
      
      const isWhite = row.white_id === parseInt(userId);
      let playerResult;
      if (row.result === 'draw') {
        playerResult = 'draw';
      } else if (row.result === 'white_wins') {
        playerResult = isWhite ? 'win' : 'loss';
      } else {
        playerResult = isWhite ? 'loss' : 'win';
      }
      
      // Build opponent info (handle bot games where username is null from LEFT JOIN)
      const oppUsername = isWhite ? row.black_username : row.white_username;
      const oppElo = isWhite ? row.black_elo : row.white_elo;
      games.push({
        gameUuid: row.game_uuid,
        result: playerResult,
        opponent: {
          username: oppUsername || 'Computer',
          elo: oppElo || '—'
        },
        playerColor: isWhite ? 'white' : 'black',
        createdAt: row.created_at
      });
    }
    stmt.free();
    
    res.json({ success: true, games, total });
  } catch (err) {
    console.error('Error fetching user games:', err);
    res.json({ success: false, message: 'Failed to fetch games' });
  }
});

// ==================== Friends API ====================

app.post('/api/friends/request', requireAuth, (req, res) => {
  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    return res.json({ success: false, isGuest: true, message: 'Please create an account to add friends' });
  }
  const { friendUsername } = req.body;
  if (!friendUsername) return res.json({ success: false, message: 'Username required' });
  const result = auth.sendFriendRequest(req.session.userId, friendUsername);

  if (result.success && result.message === 'Friend request accepted (already pending)') {
    const user = auth.getUserById(req.session.userId);
    if (auth.unlockAchievement(req.session.userId, 'social_butterfly')) {
      logAndBroadcastActivity('achievement', user.username, { achievementName: 'Social Butterfly' });
    }
    if (result.friend) {
      if (auth.unlockAchievement(result.friend.id, 'social_butterfly')) {
        logAndBroadcastActivity('achievement', result.friend.username, { achievementName: 'Social Butterfly' });
      }
    }
  }

  res.json(result);
});

app.post('/api/friends/accept', requireAuth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.json({ success: false, message: 'Request ID required' });
  const result = auth.acceptFriendRequest(req.session.userId, requestId);
  
  if (result.success) {
    const user = auth.getUserById(req.session.userId);
    if (auth.unlockAchievement(req.session.userId, 'social_butterfly')) {
      logAndBroadcastActivity('achievement', user.username, { achievementName: 'Social Butterfly' });
    }
    
    if (result.friendId && result.friendUsername) {
      if (auth.unlockAchievement(result.friendId, 'social_butterfly')) {
        logAndBroadcastActivity('achievement', result.friendUsername, { achievementName: 'Social Butterfly' });
      }
    }
  }

  res.json(result);
});

app.post('/api/friends/decline', requireAuth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.json({ success: false, message: 'Request ID required' });
  const result = auth.declineFriendRequest(req.session.userId, requestId);
  res.json(result);
});

app.post('/api/friends/remove', requireAuth, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.json({ success: false, message: 'Friend ID required' });
  const result = auth.removeFriend(req.session.userId, friendId);
  res.json(result);
});

app.get('/api/friends', requireAuth, (req, res) => {
  const friends = auth.getFriends(req.session.userId);
  const pending = auth.getPendingRequests(req.session.userId);
  res.json({ success: true, friends, pending });
});

// Helper to parse time control options: 60s (Bullet), 180s (Blitz default), 300s (Rapid)
function parseTimeControl(tc) {
  if (!tc) return 180000;
  if (tc === 60 || tc === '60' || tc === '1+0' || tc === 'bullet' || tc === 60000 || tc === 1 || tc === '1' || tc === '1m') return 60000;
  if (tc === 300 || tc === '300' || tc === '5+0' || tc === 'rapid' || tc === 300000 || tc === 5 || tc === '5' || tc === '5m') return 300000;
  if (tc === 180 || tc === '180' || tc === '3+0' || tc === 'blitz' || tc === 180000 || tc === 3 || tc === '3' || tc === '3m') return 180000;
  const num = parseInt(tc, 10);
  if (!isNaN(num)) {
    if (num === 1) return 60000;
    if (num === 3) return 180000;
    if (num === 5) return 300000;
    if (num <= 120) return 60000;
    if (num >= 240) return 300000;
    return 180000;
  }
  return 180000;
}

// ==================== Private Rooms API ====================

app.post('/api/rooms/create', requireAuth, (req, res) => {
  const { roomId } = auth.createPrivateRoom(req.session.userId);
  const timeControl = parseTimeControl(req.body ? (req.body.timeControl || req.body.time_control) : null);

  // Store in-memory for socket matching
  privateRooms.set(roomId, {
    creator: { userId: req.session.userId, username: req.session.username },
    joiner: null,
    gameId: null,
    timeControl: timeControl
  });

  res.json({ success: true, roomId, timeControl });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = auth.getPrivateRoom(req.params.roomId);
  if (!room || !room.is_active) {
    return res.json({ success: false, message: 'Room not found or expired' });
  }
  const memRoom = privateRooms.get(req.params.roomId);
  const timeControl = (memRoom && memRoom.timeControl) ? memRoom.timeControl : 180000;
  res.json({ success: true, room: { id: room.id, creator_id: room.creator_id, has_joiner: !!room.joiner_id, timeControl } });
});

// ==================== Admin API ====================

// Middleware to check admin access for API routes
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!auth.isAdmin(req.session.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Get all users (admin only)
// By default, returns registered users in data.users so guest profiles don't flood the table.
// Supports ?type=registered | guests | all | banned
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const all = auth.getAllUsers();
  const registered = all.filter(u => !u.username.startsWith('Guest_'));
  const guests = all.filter(u => u.username.startsWith('Guest_'));
  const banned = all.filter(u => u.is_banned === 1);

  let totalGamesCount = 0;
  try {
    const database = await getDb();
    const s = database.prepare('SELECT COUNT(*) as count FROM games');
    totalGamesCount = s.getAsObject().count || 0;
    s.free();
  } catch (e) {}

  const guestCounts = auth.getGuestCounts ? auth.getGuestCounts() : { total: guests.length, empty: 0, active: 0 };

  const filterType = req.query.type;
  let returnedUsers = registered;
  if (filterType === 'all') {
    returnedUsers = all;
  } else if (filterType === 'guests') {
    returnedUsers = guests;
  } else if (filterType === 'banned') {
    returnedUsers = banned;
  }

  res.json({
    success: true,
    users: returnedUsers,
    registeredUsers: registered,
    guestUsers: guests,
    stats: {
      totalUsers: all.length,
      registeredCount: registered.length,
      guestCount: guests.length,
      emptyGuestCount: guestCounts.empty,
      activeGuestCount: guestCounts.active,
      bannedCount: banned.length,
      totalGamesCount,
      activeGamesCount: activeGames ? activeGames.size : 0,
      onlineCount: userSockets ? userSockets.size : 0,
      standardQueueCount: matchmaker.getQueueSize(),
      diceQueueCount: diceMatchmaker.getQueueSize(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
  });
});

// Ban a user (admin only)
// Guests cannot be banned as they are ephemeral profiles.
app.post('/api/admin/users/:userId/ban', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const { reason } = req.body || {};

  if (userId === req.session.userId) {
    return res.json({ success: false, message: 'Kendi admin hesabınızı banlayamazsınız.' });
  }

  const target = auth.getUserById(userId);
  if (!target) {
    return res.json({ success: false, message: 'Kullanıcı bulunamadı.' });
  }

  if (target.username.startsWith('Guest_')) {
    return res.json({
      success: false,
      message: 'Misafir profilleri geçicidir ve banlanamaz. Temizlemek için misafir temizliği veya silme kullanın.'
    });
  }

  if (target.is_admin === 1) {
    return res.json({ success: false, message: 'Yönetici hesapları banlanamaz.' });
  }

  const result = auth.banUser(userId, reason);
  if (result.success) {
    saveDb();
    // Disconnect any active sockets for this user
    const socks = userSockets.get(userId);
    if (socks) {
      for (const sId of socks) {
        const s = io.sockets.sockets.get(sId);
        if (s) {
          s.emit('banned', { reason: reason || 'Hesabınız yönetici tarafından engellenmiştir.' });
          s.disconnect(true);
        }
      }
    }
    // Remove from queues if present
    matchmaker.leaveQueue(userId);
    diceMatchmaker.leaveQueue(userId);

    // If user is in an active game, immediately forfeit/terminate the game
    const activeGame = getGameByUserId(userId);
    if (activeGame && !activeGame.isOver) {
      const color = getPlayerColor(activeGame, userId);
      if (color) {
        const winResult = color === 'white' ? 'black_wins' : 'white_wins';
        handleGameOver(activeGame, winResult);
      }
    }
  }
  res.json(result);
});

// Unban a user (admin only)
app.post('/api/admin/users/:userId/unban', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const result = auth.unbanUser(userId);
  if (result.success) saveDb();
  res.json(result);
});

// Toggle admin role (admin only)
app.post('/api/admin/users/:userId/toggle-admin', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (userId === req.session.userId) {
    return res.json({ success: false, message: 'Kendi admin yetkinizi kaldıramazsınız.' });
  }
  const user = auth.getUserById(userId);
  if (!user) return res.json({ success: false, message: 'Kullanıcı bulunamadı.' });
  if (user.username.startsWith('Guest_')) {
    return res.json({ success: false, message: 'Misafir profillerine admin yetkisi verilemez.' });
  }

  const newAdminStatus = user.is_admin === 1 ? 0 : 1;
  auth.setAdminRole(userId, newAdminStatus);
  saveDb();
  res.json({
    success: true,
    isAdmin: newAdminStatus === 1,
    message: newAdminStatus === 1 ? `"${user.username}" artık bir yönetici.` : `"${user.username}" yöneticilik yetkisi kaldırıldı.`
  });
});

// Grant coins to a user (admin only)
app.post('/api/admin/users/:userId/grant-coins', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const amount = parseInt(req.body.amount);
  if (!Number.isInteger(amount)) {
    return res.json({ success: false, message: 'Miktar geçerli bir tam sayı olmalıdır.' });
  }
  const user = auth.getUserById(userId);
  if (!user) return res.json({ success: false, message: 'Kullanıcı bulunamadı.' });

  if (user.username.startsWith('Guest_')) {
    return res.json({ success: false, message: 'Misafir profillerine altın tanımlanamaz.' });
  }

  auth.addCoins(userId, amount);
  saveDb();
  const updatedUser = auth.getUserById(userId);
  res.json({
    success: true,
    message: `"${user.username}" kullanıcısına ${amount} altın tanımlandı.`,
    coins: updatedUser ? updatedUser.coins : 0
  });
});

// Clean up temporary guest profiles (admin only)
app.post('/api/admin/cleanup-guests', requireAdmin, (req, res) => {
  const emptyOnly = req.body && req.body.emptyOnly !== false;
  const olderThanMinutes = req.body && req.body.olderThanMinutes ? parseInt(req.body.olderThanMinutes) : null;
  const result = auth.cleanupGuests({ emptyOnly, olderThanMinutes });
  saveDb();

  if (result.deletedIds && result.deletedIds.length > 0) {
    for (const dId of result.deletedIds) {
      const socks = userSockets.get(dId);
      if (socks) {
        for (const sId of socks) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('guest_expired', { message: 'Misafir oturumu temizlendi.' });
            s.disconnect(true);
          }
        }
        userSockets.delete(dId);
      }
      matchmaker.leaveQueue(dId);
      diceMatchmaker.leaveQueue(dId);
    }
  }

  res.json({
    success: true,
    deletedCount: result.deletedCount,
    message: `${result.deletedCount} misafir profili temizlendi.`
  });
});

// Admin system & game stats (admin only)
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const all = auth.getAllUsers();
    const registered = all.filter(u => !u.username.startsWith('Guest_'));
    const guests = all.filter(u => u.username.startsWith('Guest_'));
    const banned = all.filter(u => u.is_banned === 1);

    let totalGamesCount = 0;
    try {
      const database = await getDb();
      const s = database.prepare('SELECT COUNT(*) as count FROM games');
      totalGamesCount = s.getAsObject().count || 0;
      s.free();
    } catch (e) {}

    const guestCounts = auth.getGuestCounts ? auth.getGuestCounts() : { total: guests.length, empty: 0, active: 0 };

    res.json({
      success: true,
      stats: {
        totalUsers: all.length,
        registeredCount: registered.length,
        guestCount: guests.length,
        emptyGuestCount: guestCounts.empty,
        activeGuestCount: guestCounts.active,
        bannedCount: banned.length,
        totalGamesCount,
        activeGamesCount: activeGames ? activeGames.size : 0,
        onlineCount: userSockets ? userSockets.size : 0,
        standardQueueCount: matchmaker.getQueueSize(),
        diceQueueCount: diceMatchmaker.getQueueSize(),
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      }
    });
  } catch (err) {
    res.json({ success: false, message: 'Failed to compute stats' });
  }
});

// Get active ongoing games (admin only)
app.get('/api/admin/games/active', requireAdmin, (req, res) => {
  const list = [];
  if (activeGames) {
    for (const [gameId, g] of activeGames.entries()) {
      list.push({
        gameId,
        white: { id: g.whiteId, username: g.whiteUsername, elo: g.whiteElo },
        black: { id: g.blackId, username: g.blackUsername, elo: g.blackElo },
        mode: g.mode || 'standard',
        moveCount: g.state && g.state.moveHistory ? g.state.moveHistory.length : 0,
        turn: g.state ? g.state.activeColor : null,
        whiteTime: g.whiteTime,
        blackTime: g.blackTime,
        startedAt: g.createdAt || null
      });
    }
  }
  res.json({ success: true, games: list });
});

// Terminate an active game (admin only)
app.post('/api/admin/games/:gameId/terminate', requireAdmin, (req, res) => {
  const gameId = req.params.gameId;
  const game = activeGames.get(gameId);
  if (!game) {
    return res.json({ success: false, message: 'Game not found or already ended' });
  }

  handleGameOver(game, 'draw');
  res.json({ success: true, message: 'Oyun başarıyla sonlandırıldı.' });
});

// Get recent matches (admin only)
app.get('/api/admin/games/recent', requireAdmin, async (req, res) => {
  try {
    const database = await getDb();
    const s = database.prepare(`
      SELECT g.id, g.game_uuid, g.result, g.created_at,
             w.username AS white_username, w.elo AS white_elo,
             b.username AS black_username, b.elo AS black_elo
      FROM games g
      LEFT JOIN users w ON w.id = g.white_id
      LEFT JOIN users b ON b.id = g.black_id
      ORDER BY g.id DESC
      LIMIT 25
    `);
    const games = [];
    while (s.step()) {
      games.push(s.getAsObject());
    }
    s.free();
    res.json({ success: true, games });
  } catch (e) {
    res.json({ success: false, message: 'Failed to fetch games', games: [] });
  }
});

// Global system announcement broadcast (admin only)
app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  const { message, type } = req.body || {};
  if (!message || !message.trim()) {
    return res.json({ success: false, message: 'Duyuru mesajı gereklidir.' });
  }

  io.emit('system_announcement', {
    message: message.trim(),
    type: type || 'info',
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, message: 'Duyuru tüm kullanıcılara gönderildi.' });
});

// Delete a user (admin only)
app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  
  // Don't allow deleting yourself
  if (userId === req.session.userId) {
    return res.json({ success: false, message: 'Cannot delete your own admin account' });
  }

  const target = auth.getUserById(userId);
  if (!target) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Disconnect active sockets
  const socks = userSockets.get(userId);
  if (socks) {
    for (const sId of socks) {
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.emit('account_deleted', { message: 'Hesabınız silinmiştir.' });
        s.disconnect(true);
      }
    }
    userSockets.delete(userId);
  }
  matchmaker.leaveQueue(userId);
  diceMatchmaker.leaveQueue(userId);

  // Terminate active game if user is in one
  const activeGame = getGameByUserId(userId);
  if (activeGame && !activeGame.isOver) {
    const color = getPlayerColor(activeGame, userId);
    if (color) {
      const winResult = color === 'white' ? 'black_wins' : 'white_wins';
      handleGameOver(activeGame, winResult);
    }
  }
  
  const deleted = auth.deleteUser(userId);
  if (deleted) {
    saveDb();
    res.json({ success: true, message: 'User deleted' });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// Reset a single user's stats (admin only)
app.post('/api/admin/users/:userId/reset-stats', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const target = auth.getUserById(userId);
  if (!target) return res.json({ success: false, message: 'User not found' });
  if (target.username.startsWith('Guest_')) {
    return res.json({ success: false, message: 'Misafir hesapların istatistikleri sıfırlanamaz.' });
  }
  const result = auth.resetUserStats(userId);
  if (result) {
    saveDb();
    res.json({ success: true, message: 'User stats reset' });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// Reset all stats (admin only)
app.post('/api/admin/reset-stats', requireAdmin, (req, res) => {
  auth.resetAllStats();
  saveDb();
  res.json({ success: true, message: 'All stats have been reset' });
});

// Grant battlepass XP to a user (admin only) — for testing tier progression
app.post('/api/admin/users/:userId/grant-xp', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const amount = parseInt(req.body.amount);

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.json({ success: false, message: 'XP amount must be a positive integer' });
  }

  // Verify user exists
  const user = auth.getUserById(userId);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  if (user.username.startsWith('Guest_')) {
    return res.json({ success: false, message: 'Misafir hesaplara XP tanımlanamaz.' });
  }

  const bpResult = battlepass.grantXP(userId, amount);
  saveDb();

  // Notify the user in real time if they're online and leveled up
  if (bpResult.leveledUp) {
    notifyLevelUp(userId, bpResult);
  }

  const status = battlepass.getBattlepassStatus(userId);
  res.json({
    success: true,
    message: `Granted ${amount} XP to ${user.username}`,
    leveledUp: bpResult.leveledUp,
    newTier: bpResult.newTier,
    unlockedTitle: bpResult.unlockedTitle,
    battlepass: status
  });
});

// Reset a user's battlepass progress (admin only)
app.post('/api/admin/users/:userId/reset-battlepass', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);

  const user = auth.getUserById(userId);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  if (user.username.startsWith('Guest_')) {
    return res.json({ success: false, message: 'Misafir hesapların savaş bileti sıfırlanamaz.' });
  }

  const result = battlepass.resetBattlepass(userId);
  saveDb();

  if (result.success) {
    res.json({ success: true, message: `Battlepass reset for ${user.username}` });
  } else {
    res.json({ success: false, message: result.message || 'Failed to reset battlepass' });
  }
});

// ==================== Game State Management ====================

// Active games: gameId -> game state
const activeGames = new Map();

// Spectators: gameId -> Set of socketIds
const gameSpectators = new Map();

// Socket to game mapping
const socketGames = new Map(); // socketId -> { gameId, color, isSpectator }

// User to socket mapping
const userSockets = new Map(); // userId -> Set of socketIds

// Matchmaker instances
const matchmaker = new Matchmaker();
const diceMatchmaker = new Matchmaker();

function broadcastQueueCounts() {
  io.emit('queue_update', {
    standard: matchmaker.getQueueSize(),
    dice: diceMatchmaker.getQueueSize(),
    online: userSockets.size
  });
}

function broadcastToGame(game, eventName, payload) {
  if (!game) return;
  // Send to players
  for (const playerId of Object.values(game.players || {})) {
    if (playerId && playerId !== 0) {
      const sockets = userSockets.get(playerId);
      if (sockets) {
        for (const sockId of sockets) {
          io.to(sockId).emit(eventName, payload);
        }
      }
    }
  }
  // Send to spectators
  const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
  if (spectators) {
    for (const sockId of spectators) {
      io.to(sockId).emit(eventName, payload);
    }
  }
}

function broadcastLiveGames() {
  if (typeof io === 'undefined' || !io) return;
  const games = [];
  if (activeGames) {
    for (const [gameId, g] of activeGames.entries()) {
      if (g.isOver) continue;
      const whiteUser = g.whiteId !== 0 ? auth.getUserById(g.whiteId) : null;
      const blackUser = g.blackId !== 0 ? auth.getUserById(g.blackId) : null;
      const spectators = gameSpectators ? gameSpectators.get(gameId) : null;
      games.push({
        id: gameId,
        gameId: gameId,
        white: {
          id: g.whiteId,
          username: g.whiteUsername,
          elo: g.whiteElo,
          avatarUrl: whiteUser ? whiteUser.avatar_url : null,
          avatar_url: whiteUser ? whiteUser.avatar_url : null
        },
        black: {
          id: g.blackId,
          username: g.blackUsername,
          elo: g.blackElo,
          avatarUrl: blackUser ? blackUser.avatar_url : null,
          avatar_url: blackUser ? blackUser.avatar_url : null
        },
        mode: g.mode || 'standard',
        type: g.mode || 'standard',
        isRanked: !!g.isRanked,
        turn: g.state ? g.state.activeColor : 'white',
        activeColor: g.state ? g.state.activeColor : 'white',
        movesCount: (g.state && g.state.moveHistory) ? g.state.moveHistory.length : 0,
        whiteTime: g.whiteTime,
        blackTime: g.blackTime,
        spectatorsCount: spectators ? spectators.size : 0,
        isBot: !!g.isBot,
        createdAt: g.createdAt || new Date().toISOString()
      });
    }
  }
  io.emit('live_games_update', { success: true, count: games.length, games });
}

// Private rooms (in-memory)
const privateRooms = new Map(); // roomId -> { creator: {userId, username}, joiner: null|{userId,username}, gameId: null|string }

const INITIAL_TIME = 180000; // 3 minutes per side in ms (3+0 Blitz default)
const INCREMENT_TIME = 5000; // 5 seconds increment per move

// Dice piece mapping: 1=Pawn, 2=Knight, 3=Bishop, 4=Rook, 5=King
const DICE_PIECES = [engine.PAWN, engine.KNIGHT, engine.BISHOP, engine.ROOK, engine.KING];

function rollDice() {
  return Math.floor(Math.random() * 5) + 1;
}

function diceToPieceType(roll) {
  return DICE_PIECES[roll - 1];
}

function createGame(player1, player2, mode = 'standard', timeControl = INITIAL_TIME) {
  const gameId = uuidv4();
  const state = engine.parseFen(INITIAL_FEN);
  const parsedTime = parseTimeControl(timeControl);
  
  const game = {
    id: gameId,
    whiteId: player1.userId,
    blackId: player2.userId,
    whiteUsername: player1.username,
    blackUsername: player2.username,
    whiteElo: player1.elo,
    blackElo: player2.elo,
    state: state,
    players: {
      white: player1.userId,
      black: player2.userId
    },
    connected: {
      white: true,
      black: true
    },
    whiteTime: parsedTime,
    blackTime: parsedTime,
    timeControl: parsedTime,
    lastTickTime: Date.now(),
    clockStarted: false,
    mode: mode,
    diceRoll: mode === 'dice' ? rollDice() : null,
    snapshots: []
  };

  game.snapshots.push({
    fen: engine.toFen(game.state),
    state: engine.cloneState(game.state),
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    activeColor: game.state.activeColor,
    moveHistory: []
  });
  
  activeGames.set(gameId, game);
  broadcastLiveGames();
  return game;
}

function emitDiceRoll(game, targetPlayerId, io) {
  const roll = game.diceRoll;
  const pieceType = diceToPieceType(roll);
  const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', k: 'King', q: 'Queen' };
  const pieceName = pieceNames[pieceType] || pieceType;
  
  const payload = { roll, pieceType, pieceName };

  // Send to specific player or both
  if (targetPlayerId) {
    const sockets = userSockets.get(targetPlayerId);
    if (sockets) {
      for (const sockId of sockets) {
        io.to(sockId).emit('dice_roll', payload);
      }
    }
  } else {
    // Send to both
    for (const playerId of Object.values(game.players)) {
      const sockets = userSockets.get(playerId);
      if (sockets) {
        for (const sockId of sockets) {
          io.to(sockId).emit('dice_roll', payload);
        }
      }
    }
  }

  // Also broadcast to spectators
  const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
  if (spectators) {
    for (const sockId of spectators) {
      io.to(sockId).emit('dice_roll', payload);
    }
  }
}

function getGameBySocket(socketId) {
  const info = socketGames.get(socketId);
  if (!info) return null;
  return activeGames.get(info.gameId);
}

function getGameByUserId(userId) {
  for (const [gameId, game] of activeGames) {
    if (game.isOver) continue;
    if (game.players.white === userId || game.players.black === userId) {
      return game;
    }
  }
  return null;
}

function getPlayerColor(game, userId) {
  if (game.players.white === userId) return 'white';
  if (game.players.black === userId) return 'black';
  return null;
}

function getOpponentId(game, userId) {
  if (game.players.white === userId) return game.players.black;
  if (game.players.black === userId) return game.players.white;
  return null;
}

// ==================== Socket.IO ====================

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Ensure user is authenticated
  let userId = (socket.request && socket.request.session) ? socket.request.session.userId : null;
  let username = (socket.request && socket.request.session) ? socket.request.session.username : null;
  let guestName = socket.guestUsername ||
                  (socket.request && socket.request.session && socket.request.session.username) ||
                  (socket.handshake && socket.handshake.auth && socket.handshake.auth.guestUsername) ||
                  (socket.handshake && socket.handshake.query && socket.handshake.query.guestUsername) ||
                  (socket.handshake && socket.handshake.headers && socket.handshake.headers['x-guest-username']);

  function ensureUserAuth(data) {
    const candidateGuest = (data && data.guestUsername) ||
                           socket.guestUsername ||
                           (socket.handshake && socket.handshake.auth && socket.handshake.auth.guestUsername) ||
                           (socket.handshake && socket.handshake.query && socket.handshake.query.guestUsername) ||
                           (socket.handshake && socket.handshake.headers && socket.handshake.headers['x-guest-username']) ||
                           (socket.request && socket.request.session && socket.request.session.username) ||
                           guestName;

    if (candidateGuest && candidateGuest.startsWith('Guest_')) {
      const currentIsRegistered = userId && auth.getUserById(userId) && !auth.getUserById(userId).username.startsWith('Guest_');
      if (!currentIsRegistered) {
        let requestedUser = auth.getUserByUsername(candidateGuest);
        if (!requestedUser) {
          auth.registerUser(candidateGuest, GUEST_DUMMY_HASH);
          saveDb();
          requestedUser = auth.getUserByUsername(candidateGuest);
        }
        if (requestedUser) {
          if (userId && userId !== requestedUser.id && userSockets.has(userId)) {
            userSockets.get(userId).delete(socket.id);
          }
          userId = requestedUser.id;
          username = requestedUser.username;
          guestName = requestedUser.username;
          socket.guestUsername = requestedUser.username;
          if (socket.request && socket.request.session) {
            socket.request.session.userId = requestedUser.id;
            socket.request.session.username = requestedUser.username;
            socket.request.session.isGuest = true;
            try { socket.request.session.save(); } catch (e) {}
          }
        }
      }
    }

    if (userId) {
      const u = auth.getUserById(userId);
      if (!u || u.is_banned === 1) {
        if (u && u.is_banned === 1) {
          socket.emit('banned', { reason: u.banned_reason || 'Hesabınız yönetici tarafından engellenmiştir.' });
          socket.disconnect(true);
        }
        userId = null;
        username = null;
      } else {
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        return userId;
      }
    }

    const sess = socket.request ? socket.request.session : null;
    if (sess && sess.userId) {
      const u = auth.getUserById(sess.userId);
      if (u && u.is_banned !== 1) {
        userId = u.id;
        username = u.username;
      } else {
        if (u && u.is_banned === 1) {
          socket.emit('banned', { reason: u.banned_reason || 'Hesabınız yönetici tarafından engellenmiştir.' });
          socket.disconnect(true);
        }
        sess.userId = null;
      }
    }

    if (!userId) {
      let gName = candidateGuest;
      if (!gName || !gName.startsWith('Guest_')) {
        gName = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
        let attempts = 0;
        while (auth.getUserByUsername(gName) && attempts < 50) {
          gName = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
          attempts++;
        }
      }
      if (gName && gName.startsWith('Guest_')) {
        let gUser = auth.getUserByUsername(gName);
        if (!gUser) {
          auth.registerUser(gName, GUEST_DUMMY_HASH);
          saveDb();
          gUser = auth.getUserByUsername(gName);
        }
        if (gUser) {
          userId = gUser.id;
          username = gUser.username;
          guestName = gUser.username;
          socket.guestUsername = gUser.username;
          if (sess) {
            sess.userId = gUser.id;
            sess.username = gUser.username;
            sess.isGuest = true;
            try { sess.save(); } catch (e) {}
          }
        }
      }
    }

    if (userId) {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      broadcastQueueCounts();
    }
    return userId;
  }

  ensureUserAuth();

  if (!userId) {
    socket.emit('auth_required', { message: 'Please log in' });
    // Don't disconnect — wait for login via socket
  }

  socket.on('authenticate', (data) => {
    // If socket session already belongs to a registered user, NEVER downgrade or overwrite to guest!
    if (socket.request.session && socket.request.session.userId) {
      const u = auth.getUserById(socket.request.session.userId);
      if (u) {
        if (u.is_banned === 1) {
          socket.emit('banned', { reason: u.banned_reason || 'Bu hesap yönetici tarafından engellenmiştir.' });
          socket.disconnect(true);
          return;
        }
        if (!u.username.startsWith('Guest_')) {
          userId = u.id;
          username = u.username;
          socket.request.session.isGuest = false;
          socket.emit('authenticated', { userId, username });
          return;
        }
      }
    }
    if (data && data.guestUsername && data.guestUsername.startsWith('Guest_')) {
      guestName = data.guestUsername;
      let gUser = auth.getUserByUsername(data.guestUsername);
      if (!gUser) {
        auth.registerUser(data.guestUsername, GUEST_DUMMY_HASH);
        saveDb();
        gUser = auth.getUserByUsername(data.guestUsername);
      }
      if (gUser) {
        if (userId && userId !== gUser.id && userSockets.has(userId)) {
          userSockets.get(userId).delete(socket.id);
        }
        userId = gUser.id;
        username = gUser.username;
        if (socket.request.session) {
          socket.request.session.userId = gUser.id;
          socket.request.session.username = gUser.username;
          socket.request.session.isGuest = true;
          try { socket.request.session.save(); } catch (e) {}
        }
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
      }
    }
    ensureUserAuth(data);
    if (userId) {
      socket.emit('authenticated', { userId, username });
    }
  });

  // Track user sockets
  if (userId) {
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    broadcastQueueCounts();
  }

  // --- Queue count request (for SPA re-entry) ---
  socket.on('request_queue_counts', () => {
    socket.emit('queue_update', {
      standard: matchmaker.getQueueSize(),
      dice: diceMatchmaker.getQueueSize(),
      online: userSockets.size
    });
  });

  // --- Matchmaking ---

  socket.on('join_queue', (data) => {
    ensureUserAuth(data);
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Check if already in a game
    if (getGameByUserId(userId)) {
      socket.emit('error', { message: 'You are already in a game' });
      return;
    }

    const user = auth.getUserById(userId);
    if (!user) return;

    const match = matchmaker.joinQueue({
      socket,
      userId,
      username: user.username,
      elo: user.elo
    });

    socket.emit('queue_joined', { message: 'Joined queue' });
    broadcastQueueCounts();

    if (match) {
      // Start a new game
      const game = createGame(match.player1, match.player2);
      game.isRanked = true;

      // Notify both players
      const whiteUser = auth.getUserById(game.whiteId);
      const blackUser = auth.getUserById(game.blackId);
      match.player1.socket.emit('match_found', {
        gameId: game.id,
        color: 'white',
        opponent: { username: game.blackUsername, elo: game.blackElo, avatarUrl: blackUser ? blackUser.avatar_url : null },
        fen: engine.toFen(game.state)
      });

      match.player2.socket.emit('match_found', {
        gameId: game.id,
        color: 'black',
        opponent: { username: game.whiteUsername, elo: game.whiteElo, avatarUrl: whiteUser ? whiteUser.avatar_url : null },
        fen: engine.toFen(game.state)
      });

      // Track socket-to-game
      socketGames.set(match.player1.socket.id, { gameId: game.id, color: 'white' });
      socketGames.set(match.player2.socket.id, { gameId: game.id, color: 'black' });

      console.log(`[Game] Started: ${game.whiteUsername} vs ${game.blackUsername} (${game.id})`);
    }
  });

  socket.on('leave_queue', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const removed = matchmaker.leaveQueue(userId);
    if (removed) {
      socket.emit('queue_left', { message: 'Left queue' });
    }
    broadcastQueueCounts();
  });

  // --- Dice Matchmaking ---

  socket.on('join_dice_queue', (data) => {
    ensureUserAuth(data);
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (getGameByUserId(userId)) {
      socket.emit('error', { message: 'You are already in a game' });
      return;
    }

    const user = auth.getUserById(userId);
    if (!user) return;

    const match = diceMatchmaker.joinQueue({
      socket,
      userId,
      username: user.username,
      elo: user.elo
    });

    socket.emit('queue_joined', { message: 'Joined dice queue' });
    broadcastQueueCounts();

    if (match) {
      const game = createGame(match.player1, match.player2, 'dice');

      match.player1.socket.emit('match_found', {
        gameId: game.id,
        color: 'white',
        opponent: { username: game.blackUsername, elo: game.blackElo },
        fen: engine.toFen(game.state),
        mode: 'dice'
      });

      match.player2.socket.emit('match_found', {
        gameId: game.id,
        color: 'black',
        opponent: { username: game.whiteUsername, elo: game.whiteElo },
        fen: engine.toFen(game.state),
        mode: 'dice'
      });

      socketGames.set(match.player1.socket.id, { gameId: game.id, color: 'white' });
      socketGames.set(match.player2.socket.id, { gameId: game.id, color: 'black' });

      // Emit first dice roll to both players
      emitDiceRoll(game, null, io);

      console.log(`[DiceGame] Started: ${game.whiteUsername} vs ${game.blackUsername} (${game.id})`);
    }
  });

  socket.on('leave_dice_queue', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const removed = diceMatchmaker.leaveQueue(userId);
    if (removed) {
      socket.emit('queue_left', { message: 'Left dice queue' });
    }
    broadcastQueueCounts();
  });

  // --- Game Play ---

  socket.on('make_move', (data) => {
    ensureUserAuth(data);
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { gameId, move } = data;
    const game = activeGames.get(gameId);
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot make moves' });
      return;
    }

    let color = getPlayerColor(game, userId);
    if (!color && data && data.guestUsername && (game.whiteUsername === data.guestUsername || game.blackUsername === data.guestUsername)) {
      color = game.whiteUsername === data.guestUsername ? 'white' : 'black';
      const expectedUser = auth.getUserByUsername(data.guestUsername);
      if (expectedUser) {
        userId = expectedUser.id;
        username = expectedUser.username;
      }
    }
    if (!color && username && (game.whiteUsername === username || game.blackUsername === username)) {
      color = game.whiteUsername === username ? 'white' : 'black';
    }
    if (!color) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    // Check it's this player's turn
    if (game.state.activeColor !== color) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Validate and apply the move
    const state = game.state;
    let matchedMove = null;

    if (move.isDrop) {
      // Handle drop move
      const dropMoves = engine.getDropMoves(state);
      matchedMove = dropMoves.find(dm =>
        dm.to === move.to && dm.pieceType === move.pieceType
      );
    } else {
      // Handle normal move
      const fromCoords = engine.squareToCoords(move.from);
      const pseudoMoves = engine.getPseudoLegalMoves(state, fromCoords.row, fromCoords.col);
      matchedMove = pseudoMoves.find(m =>
        m.to === move.to && (m.promotion || null) === (move.promotion || null)
      );
    }

    if (!matchedMove) {
      socket.emit('error', { message: 'Invalid move' });
      return;
    }

    // Check legality (doesn't leave own king in check)
    if (!engine.isMoveLegal(state, matchedMove)) {
      socket.emit('error', { message: 'Illegal move — leaves king in check' });
      return;
    }

    // Dice validation
    if (game.mode === 'dice') {
      const diceType = diceToPieceType(game.diceRoll);
      if (move.isDrop) {
        if (move.pieceType !== diceType) {
          socket.emit('error', { message: `Must drop a ${diceType.toUpperCase()}` });
          return;
        }
      } else {
        const fromCoords = engine.squareToCoords(move.from);
        const movingPiece = state.board[fromCoords.row][fromCoords.col];
        if (!movingPiece || movingPiece.type !== diceType) {
          socket.emit('error', { message: `Must move a ${diceType.toUpperCase()}` });
          return;
        }
      }
    }

    // Start clock on first move
    if (!game.clockStarted) {
      game.clockStarted = true;
      game.lastTickTime = Date.now();
    }

    // Tick clock for the player who just moved
    const now = Date.now();
    const elapsed = now - game.lastTickTime;
    game.lastTickTime = now;
    if (color === 'white') {
      game.whiteTime = Math.max(0, game.whiteTime - elapsed);
      game.whiteTime += INCREMENT_TIME;
    } else {
      game.blackTime = Math.max(0, game.blackTime - elapsed);
      game.blackTime += INCREMENT_TIME;
    }

    // Apply the move
    game.state = engine.applyMove(state, matchedMove);
    const newFen = engine.toFen(game.state);

    if (!game.snapshots) game.snapshots = [];
    game.snapshots.push({
      fen: newFen,
      state: engine.cloneState(game.state),
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      activeColor: game.state.activeColor,
      moveHistory: [...game.state.moveHistory]
    });

    // Broadcast the move result to both players
    const opponentId = getOpponentId(game, userId);
    
    const movePayload = {
      move: {
        from: matchedMove.from,
        to: matchedMove.to,
        pieceType: matchedMove.pieceType || matchedMove.piece?.type,
        captured: matchedMove.captured ? matchedMove.captured.type : null,
        isDrop: matchedMove.isDrop,
        promotion: matchedMove.promotion,
        color: state.activeColor
      },
      fen: newFen,
      activeColor: game.state.activeColor,
      pockets: game.state.pockets,
      isCheck: engine.isInCheck(game.state),
      whiteTime: game.whiteTime,
      blackTime: game.blackTime
    };

    // Send updated state to both players
    io.to(socket.id).emit('move_result', movePayload);

    // Send to opponent
    const opponentSockets = userSockets.get(opponentId);
    if (opponentSockets) {
      for (const sockId of opponentSockets) {
        io.to(sockId).emit('move_result', movePayload);
      }
    }

    // Send to spectators
    const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
    if (spectators) {
      for (const sockId of spectators) {
        io.to(sockId).emit('move_result', movePayload);
      }
    }

    // Check for game over
    const result = engine.getGameResult(game.state);
    if (result) {
      handleGameOver(game, result);
    }

    // In dice mode, roll for next player
    if (game.mode === 'dice' && !game.isOver) {
      game.diceRoll = rollDice();
      emitDiceRoll(game, null, io);
    }

    // If this is a bot game and it's now the bot's turn, make the bot move
    if (game.isBot && !game.isOver && game.state.activeColor === 'black') {
      processBotMove(game, io);
    }
  });

  // --- Game: Resign ---
  socket.on('resign', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot resign' });
      return;
    }
    
    let color = getPlayerColor(game, userId);
    if (!color && data && data.guestUsername && (game.whiteUsername === data.guestUsername || game.blackUsername === data.guestUsername)) {
      color = game.whiteUsername === data.guestUsername ? 'white' : 'black';
    }
    if (!color) return;

    const result = color === 'white' ? 'black_wins' : 'white_wins';
    handleGameOver(game, result);
    
    socket.emit('resigned', { message: 'You resigned' });
  });

  // --- Game: Draw Offer ---
  socket.on('request_draw', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot offer draw' });
      return;
    }

    const color = getPlayerColor(game, userId);
    if (!color) return;
    if (game.isOver) return;

    // Store who offered the draw
    game.drawOfferer = userId;

    // Notify opponent
    const opponentId = getOpponentId(game, userId);
    const opponentSockets = userSockets.get(opponentId);
    if (opponentSockets) {
      for (const sockId of opponentSockets) {
        io.to(sockId).emit('draw_offered', {
          by: username,
          gameId: game.id
        });
      }
    }

    socket.emit('draw_requested', { message: 'Draw offered' });
  });

  socket.on('accept_draw', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot accept draw' });
      return;
    }

    const color = getPlayerColor(game, userId);
    if (!color) return;

    // Must have a draw offer pending
    if (!game.drawOfferer || game.drawOfferer === userId) {
      socket.emit('error', { message: 'No draw offer to accept' });
      return;
    }

    handleGameOver(game, 'draw');
  });

  socket.on('decline_draw', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot decline draw' });
      return;
    }

    const color = getPlayerColor(game, userId);
    if (!color) return;

    // Must have a draw offer pending
    if (!game.drawOfferer || game.drawOfferer === userId) {
      return;
    }

    const offererId = game.drawOfferer;
    game.drawOfferer = null;

    // Notify the offerer that the draw was declined
    const offererSockets = userSockets.get(offererId);
    if (offererSockets) {
      for (const sockId of offererSockets) {
        io.to(sockId).emit('draw_declined', { message: 'Draw offer declined' });
      }
    }
  });

  socket.on('cancel_draw', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot cancel draw' });
      return;
    }

    if (game.drawOfferer !== userId) return;

    game.drawOfferer = null;

    // Notify opponent that the offer was cancelled
    const opponentId = getOpponentId(game, userId);
    const opponentSockets = userSockets.get(opponentId);
    if (opponentSockets) {
      for (const sockId of opponentSockets) {
        io.to(sockId).emit('draw_cancelled', { message: 'Draw offer cancelled' });
      }
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    // Clean up spectator if this socket was spectating
    const specGameInfo = socketGames.get(socket.id);
    let cleanedGameId = null;
    if (specGameInfo && specGameInfo.isSpectator) {
      cleanedGameId = specGameInfo.gameId;
      if (gameSpectators && gameSpectators.has(specGameInfo.gameId)) {
        gameSpectators.get(specGameInfo.gameId).delete(socket.id);
        const specCount = gameSpectators.get(specGameInfo.gameId).size;
        const g = activeGames.get(specGameInfo.gameId);
        if (g) {
          broadcastToGame(g, 'spectator_count_update', { gameId: specGameInfo.gameId, count: specCount });
        }
        if (specCount === 0) gameSpectators.delete(specGameInfo.gameId);
      }
      socketGames.delete(socket.id);
      broadcastLiveGames();
    }
    if (gameSpectators) {
      for (const [gid, specSet] of gameSpectators.entries()) {
        if (gid !== cleanedGameId && specSet.has(socket.id)) {
          specSet.delete(socket.id);
          const specCount = specSet.size;
          const g = activeGames.get(gid);
          if (g) {
            broadcastToGame(g, 'spectator_count_update', { gameId: gid, count: specCount });
          }
          if (specCount === 0) gameSpectators.delete(gid);
          broadcastLiveGames();
        }
      }
    }

    // Remove from matchmaking
    if (userId) {
      matchmaker.leaveQueue(userId);
      diceMatchmaker.leaveQueue(userId);

      // Remove from user sockets tracking
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
      broadcastQueueCounts();

      // Handle game disconnect only if user has no other active sockets
      // (Prevents false disconnect trigger when navigating from lobby → game)
      const gameInfo = socketGames.get(socket.id);
      if (gameInfo && !gameInfo.isSpectator) {
        const userSockSet = userSockets.get(userId);
        const hasOtherSockets = userSockSet && userSockSet.size > 0;
        
        if (!hasOtherSockets) {
          const game = activeGames.get(gameInfo.gameId);
          if (game && !game.isOver) {
            const color = gameInfo.color;
            game.connected[color] = false;

            // Notify opponent — give them 20s for the disconnected player to rejoin
            const opponentId = getOpponentId(game, userId);
            const opponentSockets = userSockets.get(opponentId);
            if (opponentSockets) {
              for (const sockId of opponentSockets) {
                io.to(sockId).emit('opponent_disconnected', {
                  message: 'Your opponent disconnected. Waiting 20s for them to rejoin...',
                  gameId: game.id
                });
              }
            }

            // Store disconnect timeout on game so it can be cancelled on reconnect
            if (!game._dcTimeout) game._dcTimeout = {};
            game._dcTimeout[color] = setTimeout(() => {
              if (activeGames.has(game.id) && !game.connected[color] && !game.isOver) {
                const result = color === 'white' ? 'black_wins' : 'white_wins';
                handleGameOver(game, result);
              }
            }, 20000);
          }
        }
        socketGames.delete(socket.id);
      }
    }
  });

  // --- Spectate Game ---
  socket.on('spectate_game', (data) => {
    ensureUserAuth(data);
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (!gameSpectators.has(gameId)) {
      gameSpectators.set(gameId, new Set());
    }
    gameSpectators.get(gameId).add(socket.id);
    socketGames.set(socket.id, { gameId, isSpectator: true });

    const whiteUser = game.whiteId !== 0 ? auth.getUserById(game.whiteId) : null;
    const blackUser = game.blackId !== 0 ? auth.getUserById(game.blackId) : null;

    const spectatorPayload = {
      isSpectator: true,
      gameId: game.id,
      fen: engine.toFen(game.state),
      players: {
        white: {
          username: game.whiteUsername,
          elo: game.whiteElo,
          avatarUrl: whiteUser ? whiteUser.avatar_url : null
        },
        black: {
          username: game.blackUsername,
          elo: game.blackElo,
          avatarUrl: blackUser ? blackUser.avatar_url : null
        }
      },
      pockets: game.state.pockets,
      activeColor: game.state.activeColor,
      mode: game.mode || 'standard',
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      moveHistory: game.state.moveHistory || [],
      spectatorsCount: gameSpectators.get(gameId).size
    };

    socket.emit('spectator_game_state', spectatorPayload);

    // Send current dice roll in dice mode
    if (game.mode === 'dice' && game.diceRoll) {
      const roll = game.diceRoll;
      const pieceType = diceToPieceType(roll);
      const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', k: 'King', q: 'Queen' };
      socket.emit('dice_roll', {
        roll,
        pieceType,
        pieceName: pieceNames[pieceType] || pieceType
      });
    }

    broadcastToGame(game, 'spectator_count_update', { gameId, count: gameSpectators.get(gameId).size });
    broadcastLiveGames();

    if (game.isOver) {
      socket.emit('game_over', {
        gameId: game.id,
        result: game.result,
        players: {
          white: {
            username: game.whiteUsername,
            avatarUrl: whiteUser ? whiteUser.avatar_url : null,
            oldElo: game.whiteElo,
            newElo: game.whiteElo,
            eloDiff: 0
          },
          black: {
            username: game.blackUsername,
            avatarUrl: blackUser ? blackUser.avatar_url : null,
            oldElo: game.blackElo,
            newElo: game.blackElo,
            eloDiff: 0
          }
        },
        fen: engine.toFen(game.state),
        pockets: game.state.pockets,
        moveHistory: game.state.moveHistory || []
      });
    }
  });

  socket.on('leave_spectate', (data) => {
    const { gameId } = data || {};
    const info = socketGames.get(socket.id);
    const effectiveGameId = gameId || (info && info.gameId);
    if (effectiveGameId && gameSpectators.has(effectiveGameId)) {
      gameSpectators.get(effectiveGameId).delete(socket.id);
      const specCount = gameSpectators.get(effectiveGameId).size;
      const game = activeGames.get(effectiveGameId);
      if (game) {
        broadcastToGame(game, 'spectator_count_update', { gameId: effectiveGameId, count: specCount });
      }
      if (specCount === 0) {
        gameSpectators.delete(effectiveGameId);
      }
    }
    if (info && info.isSpectator) {
      socketGames.delete(socket.id);
    }
    broadcastLiveGames();
  });

  // --- Reconnect to game ---
  socket.on('reconnect_game', (data) => {
    ensureUserAuth(data);
    const isSpec = Boolean(data && (data.mode === 'spectate' || data.isSpectator));
    if (!userId && !isSpec && !(data && data.guestUsername)) return;
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (data && (data.mode === 'spectate' || data.isSpectator)) {
      if (!gameSpectators.has(gameId)) {
        gameSpectators.set(gameId, new Set());
      }
      gameSpectators.get(gameId).add(socket.id);
      socketGames.set(socket.id, { gameId, isSpectator: true });

      const whiteUser = game.whiteId !== 0 ? auth.getUserById(game.whiteId) : null;
      const blackUser = game.blackId !== 0 ? auth.getUserById(game.blackId) : null;

      const spectatorPayload = {
        isSpectator: true,
        gameId: game.id,
        fen: engine.toFen(game.state),
        players: {
          white: {
            username: game.whiteUsername,
            elo: game.whiteElo,
            avatarUrl: whiteUser ? whiteUser.avatar_url : null
          },
          black: {
            username: game.blackUsername,
            elo: game.blackElo,
            avatarUrl: blackUser ? blackUser.avatar_url : null
          }
        },
        pockets: game.state.pockets,
        activeColor: game.state.activeColor,
        mode: game.mode || 'standard',
        whiteTime: game.whiteTime,
        blackTime: game.blackTime,
        moveHistory: game.state.moveHistory || [],
        spectatorsCount: gameSpectators.get(gameId).size
      };

      socket.emit('spectator_game_state', spectatorPayload);

      if (game.mode === 'dice' && game.diceRoll) {
        const roll = game.diceRoll;
        const pieceType = diceToPieceType(roll);
        const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', k: 'King', q: 'Queen' };
        socket.emit('dice_roll', {
          roll,
          pieceType,
          pieceName: pieceNames[pieceType] || pieceType
        });
      }

      broadcastToGame(game, 'spectator_count_update', { gameId, count: gameSpectators.get(gameId).size });
      broadcastLiveGames();

      if (game.isOver) {
        socket.emit('game_over', {
          gameId: game.id,
          result: game.result,
          players: {
            white: {
              username: game.whiteUsername,
              avatarUrl: whiteUser ? whiteUser.avatar_url : null,
              oldElo: game.whiteElo,
              newElo: game.whiteElo,
              eloDiff: 0
            },
            black: {
              username: game.blackUsername,
              avatarUrl: blackUser ? blackUser.avatar_url : null,
              oldElo: game.blackElo,
              newElo: game.blackElo,
              eloDiff: 0
            }
          },
          fen: engine.toFen(game.state),
          pockets: game.state.pockets,
          moveHistory: game.state.moveHistory || []
        });
      }
      return;
    }

    let color = getPlayerColor(game, userId);
    if (!color && data && data.guestUsername && (game.whiteUsername === data.guestUsername || game.blackUsername === data.guestUsername)) {
      color = game.whiteUsername === data.guestUsername ? 'white' : 'black';
      const expectedUser = auth.getUserByUsername(data.guestUsername);
      if (expectedUser) {
        userId = expectedUser.id;
        username = expectedUser.username;
      }
    }
    if (!color && username && (game.whiteUsername === username || game.blackUsername === username)) {
      color = game.whiteUsername === username ? 'white' : 'black';
    }
    if (!color) {
      socket.emit('error', { message: 'Not your game' });
      return;
    }

    game.connected[color] = true;
    socketGames.set(socket.id, { gameId, color });
    
    // Cancel pending disconnect auto-resolve timeout
    if (game._dcTimeout && game._dcTimeout[color]) {
      clearTimeout(game._dcTimeout[color]);
      delete game._dcTimeout[color];
    }

    const opponentColor = color === 'white' ? 'black' : 'white';
    const opponentId = game.players[opponentColor];

    // Notify the waiting opponent that the player reconnected
    const opponentSocks = userSockets.get(opponentId);
    if (opponentSocks) {
      for (const sockId of opponentSocks) {
        io.to(sockId).emit('opponent_reconnected', {
          message: 'Your opponent reconnected!',
          gameId: game.id
        });
      }
    }
    
    const opponentUserObj = opponentId ? auth.getUserById(opponentId) : null;
    const gameStatePayload = {
      fen: engine.toFen(game.state),
      color: color,
      opponent: {
        username: opponentColor === 'white' ? game.whiteUsername : game.blackUsername,
        elo: opponentColor === 'white' ? game.whiteElo : game.blackElo,
        avatarUrl: opponentUserObj ? opponentUserObj.avatar_url : null
      },
      pockets: game.state.pockets,
      activeColor: game.state.activeColor,
      mode: game.isBot ? 'bot' : (game.mode || 'standard'),
      isBot: Boolean(game.isBot),
      timeControl: game.timeControl || game.whiteTime,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      moveHistory: game.state.moveHistory || []
    };

    socket.emit('game_state', gameStatePayload);

    // In dice mode, send current dice to reconnecting player
    if (game.mode === 'dice' && game.diceRoll) {
      const roll = game.diceRoll;
      const pieceType = diceToPieceType(roll);
      const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', k: 'King', q: 'Queen' };
      socket.emit('dice_roll', {
        roll,
        pieceType,
        pieceName: pieceNames[pieceType] || pieceType
      });
    }

    if (game.isOver) {
      socket.emit('game_over', {
        gameId: game.id,
        result: game.result,
        fen: engine.toFen(game.state),
        pockets: game.state.pockets,
        moveHistory: game.state.moveHistory || []
      });
    }
  });

  // --- Private Rooms ---

  socket.on('join_private_room', (data) => {
    ensureUserAuth(data);
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { roomId } = data;
    const room = privateRooms.get(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found or expired' });
      return;
    }

    if (room.creator.userId === userId) {
      socket.emit('error', { message: 'You created this room. Wait for a friend to join.' });
      return;
    }

    if (room.joiner) {
      socket.emit('error', { message: 'Room is already full' });
      return;
    }

    // Get joiner info
    const user = auth.getUserById(userId);
    if (!user) return;

    room.joiner = { userId, username: user.username, elo: user.elo };

    // Record in DB
    auth.joinPrivateRoom(roomId, userId);

    // Create the game
    const creatorUser = auth.getUserById(room.creator.userId);
    const game = createGame(
      { userId: room.creator.userId, username: room.creator.username, elo: creatorUser ? creatorUser.elo : 1200 },
      { userId, username: user.username, elo: user.elo },
      'standard',
      room.timeControl || 180000
    );

    room.gameId = game.id;

    // Notify creator
    const creatorSockets = userSockets.get(room.creator.userId);
    if (creatorSockets) {
      for (const sockId of creatorSockets) {
        io.to(sockId).emit('match_found', {
          gameId: game.id,
          color: 'white',
          opponent: { username: game.blackUsername, elo: game.blackElo },
          fen: engine.toFen(game.state),
          timeControl: game.timeControl,
          whiteTime: game.whiteTime,
          blackTime: game.blackTime
        });
        socketGames.set(sockId, { gameId: game.id, color: 'white' });
      }
    }

    // Notify joiner
    socket.emit('match_found', {
      gameId: game.id,
      color: 'black',
      opponent: { username: game.whiteUsername, elo: game.whiteElo },
      fen: engine.toFen(game.state),
      timeControl: game.timeControl,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime
    });
    socketGames.set(socket.id, { gameId: game.id, color: 'black' });

    console.log(`[Room] ${room.creator.username} vs ${user.username} — Private game started (${game.id})`);
  });

  socket.on('cancel_private_room', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { roomId } = data;
    const room = privateRooms.get(roomId);

    if (!room) return;
    if (room.creator.userId !== userId) return;
    if (room.joiner) return; // Already has a joiner, can't cancel

    auth.deactivatePrivateRoom(roomId);
    privateRooms.delete(roomId);
    socket.emit('room_cancelled', { message: 'Room cancelled' });
    console.log(`[Room] ${roomId} cancelled by creator`);
  });

  // --- Dice Skip ---

  socket.on('dice_skip', (data) => {
    ensureUserAuth(data);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;

    const socketInfo = socketGames.get(socket.id);
    if (socketInfo && socketInfo.isSpectator) {
      socket.emit('error', { message: 'Spectators cannot skip turns' });
      return;
    }
    if (game.mode !== 'dice') return;
    if (game.isOver) return;

    const color = getPlayerColor(game, userId);
    if (!color) return;
    if (game.state.activeColor !== color) return;

    // Verify the player truly has no valid moves for the dice piece
    const diceType = diceToPieceType(game.diceRoll);
    const state = game.state;
    const allMoves = engine.getAllLegalMoves(state);
    const hasMoves = allMoves.some(m => {
      if (m.isDrop) return m.pieceType === diceType;
      const piece = state.board[engine.squareToCoords(m.from).row][engine.squareToCoords(m.from).col];
      return piece && piece.type === diceType;
    });

    if (hasMoves) {
      socket.emit('error', { message: 'You have valid moves — cannot skip' });
      return;
    }

    // Auto-pass: reroll and notify both players
    game.diceRoll = rollDice();

    const payload = {
      skipped: true,
      skippedBy: username,
      newRoll: game.diceRoll,
      newPieceType: diceToPieceType(game.diceRoll)
    };

    const opponentId = getOpponentId(game, userId);
    for (const targetId of [userId, opponentId]) {
      const sockets = userSockets.get(targetId);
      if (sockets) {
        for (const sockId of sockets) {
          io.to(sockId).emit('dice_skip_result', payload);
        }
      }
    }

    const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
    if (spectators) {
      for (const sockId of spectators) {
        io.to(sockId).emit('dice_skip_result', payload);
      }
    }

    // Send new dice roll to both players
    emitDiceRoll(game, null, io);
  });

  // --- Bot Game ---

  socket.on('start_bot_game', (data) => {
    ensureUserAuth(data);
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (getGameByUserId(userId)) {
      socket.emit('error', { message: 'You are already in a game' });
      return;
    }

    const user = auth.getUserById(userId);
    if (!user) return;

    const difficulty = data.difficulty || 'easy';
    const botName = bot.getBotName(difficulty);
    const botElo = bot.getBotElo(difficulty);
    const botTime = parseTimeControl(data.timeControl);

    // Create game: human is white, bot is black
    const game = createGame(
      { userId, username: user.username, elo: user.elo },
      { userId: 0, username: botName, elo: botElo },
      'bot',
      botTime
    );
    game.isBot = true;
    game.botDifficulty = difficulty;

    socketGames.set(socket.id, { gameId: game.id, color: 'white' });

    socket.emit('match_found', {
      gameId: game.id,
      color: 'white',
      opponent: { username: botName, elo: botElo },
      fen: engine.toFen(game.state),
      mode: 'bot',
      isBot: true,
      timeControl: game.timeControl,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime
    });

    console.log(`[BotGame] Started: ${user.username} vs ${botName} (${game.id})`);
  });

  // --- Bot Takeback ---
  socket.on('bot_takeback', (data) => {
    ensureUserAuth(data);
    if (!userId && !(data && data.guestUsername)) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('bot_takeback_error', { message: 'Game not found' });
      return;
    }
    if (!game.isBot) {
      socket.emit('bot_takeback_error', { message: 'Takeback is only allowed in bot games' });
      return;
    }
    if (game.isOver) {
      socket.emit('bot_takeback_error', { message: 'Game is already over' });
      return;
    }

    let color = getPlayerColor(game, userId);
    if (!color && data && data.guestUsername && (game.whiteUsername === data.guestUsername)) {
      color = 'white';
    }
    if (color !== 'white') {
      socket.emit('bot_takeback_error', { message: 'Only player can request takeback' });
      return;
    }

    if (!game.snapshots || game.snapshots.length <= 1) {
      socket.emit('bot_takeback_error', { message: 'No moves to take back' });
      return;
    }

    // Cancel any pending bot move calculation/delay timer
    if (game.botTimer) {
      clearTimeout(game.botTimer);
      delete game.botTimer;
    }

    // Determine how many snapshots to pop:
    // If it is currently black's turn (user moved, bot calculating/delaying), pop 1 snapshot.
    // If it is white's turn (both user and bot moved), pop 2 snapshots to revert back before user's move.
    let popCount = (game.state.activeColor === 'black') ? 1 : 2;
    while (popCount > 0 && game.snapshots.length > 1) {
      game.snapshots.pop();
      popCount--;
    }

    const prevSnapshot = game.snapshots[game.snapshots.length - 1];
    game.state = engine.cloneState(prevSnapshot.state);
    game.whiteTime = prevSnapshot.whiteTime;
    game.blackTime = prevSnapshot.blackTime;
    game.lastTickTime = Date.now();

    const payload = {
      gameId: game.id,
      fen: engine.toFen(game.state),
      activeColor: game.state.activeColor,
      pockets: game.state.pockets,
      isCheck: engine.isInCheck(game.state),
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      moveHistory: game.state.moveHistory || []
    };

    socket.emit('bot_takeback_success', payload);

    const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
    if (spectators) {
      for (const sockId of spectators) {
        io.to(sockId).emit('spectator_takeback', payload);
      }
    }
  });

  // --- Bot Hint ---
  socket.on('bot_hint', async (data) => {
    ensureUserAuth(data);
    if (!userId && !(data && data.guestUsername)) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    const { gameId } = data || {};
    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    if (!game.isBot) {
      socket.emit('error', { message: 'Hint is only available in bot games' });
      return;
    }
    if (game.isOver) {
      socket.emit('error', { message: 'Game is already over' });
      return;
    }

    let color = getPlayerColor(game, userId);
    if (!color && data && data.guestUsername && (game.whiteUsername === data.guestUsername)) {
      color = 'white';
    }
    if (color !== 'white' || game.state.activeColor !== 'white') {
      socket.emit('error', { message: 'Hint is only available on your turn' });
      return;
    }

    try {
      const bestMove = await bot.selectBotMoveAsync(game.state, 2, 'white', 'master');
      socket.emit('bot_hint_result', {
        gameId: game.id,
        move: bestMove,
        fen: engine.toFen(game.state)
      });
    } catch (err) {
      console.error('[BotHint] Error calculating hint:', err);
      socket.emit('error', { message: 'Failed to calculate hint' });
    }
  });
});

// Helper function to process a bot move
async function processBotMove(game, io) {
  if (game.isOver) return;
  if (!game.isBot) return;

  const botColor = game.state.activeColor;
  if (botColor !== 'black') return; // Bot always plays black

  const depth = bot.getDepth(game.botDifficulty);

  try {
    const bestMove = await bot.selectBotMoveAsync(game.state, depth, 'black', game.botDifficulty);
    if (!bestMove) {
      // No legal moves — game over
      const result = engine.getGameResult(game.state);
      if (result) {
        handleGameOver(game, result);
      }
      return;
    }

    // Check if the game was ended or taken back while the bot was thinking.
    if (game.isOver || !game.isBot || game.state.activeColor !== 'black') return;

    if (game.botTimer) {
      clearTimeout(game.botTimer);
      delete game.botTimer;
    }

    // Natural delay before applying and broadcasting the move
    game.botTimer = setTimeout(() => {
      delete game.botTimer;
      if (game.isOver || !game.isBot || game.state.activeColor !== 'black') return;

      // Tick clock for bot
      const now = Date.now();
      const elapsed = now - game.lastTickTime;
      game.lastTickTime = now;
      game.blackTime = Math.max(0, game.blackTime - elapsed);
      game.blackTime += INCREMENT_TIME;

      // Apply the bot's move
      game.state = engine.applyMove(game.state, bestMove);
      const newFen = engine.toFen(game.state);

      if (!game.snapshots) game.snapshots = [];
      game.snapshots.push({
        fen: newFen,
        state: engine.cloneState(game.state),
        whiteTime: game.whiteTime,
        blackTime: game.blackTime,
        activeColor: game.state.activeColor,
        moveHistory: [...game.state.moveHistory]
      });

      const movePayload = {
        move: {
          from: bestMove.from,
          to: bestMove.to,
          pieceType: bestMove.pieceType || bestMove.piece?.type,
          captured: bestMove.captured ? bestMove.captured.type : null,
          isDrop: bestMove.isDrop,
          promotion: bestMove.promotion,
          color: 'black'
        },
        fen: newFen,
        activeColor: game.state.activeColor,
        pockets: game.state.pockets,
        isCheck: engine.isInCheck(game.state),
        whiteTime: game.whiteTime,
        blackTime: game.blackTime
      };

      // Send to human player
      const humanId = game.whiteId;
      const humanSockets = userSockets.get(humanId);
      if (humanSockets) {
        for (const sockId of humanSockets) {
          io.to(sockId).emit('move_result', movePayload);
        }
      }

      // Send to spectators
      const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
      if (spectators) {
        for (const sockId of spectators) {
          io.to(sockId).emit('move_result', movePayload);
        }
      }

      // Check for game over
      const result = engine.getGameResult(game.state);
      if (result) {
        handleGameOver(game, result);
      }
    }, 350);

  } catch (err) {
    console.error('[Bot Error]', err);
  }
}

// ==================== Clock Tick ====================

// Global tick: runs 10 times per second to update all active game clocks
setInterval(() => {
  const now = Date.now();
  for (const [gameId, game] of activeGames) {
    if (game.isOver) continue;
    if (!game.clockStarted) continue;
    
    const elapsed = now - game.lastTickTime;
    game.lastTickTime = now;
    
    if (game.state.activeColor === 'white') {
      game.whiteTime = Math.max(0, game.whiteTime - elapsed);
    } else {
      game.blackTime = Math.max(0, game.blackTime - elapsed);
    }
    
    if (game.whiteTime <= 0 && game.state.activeColor === 'white') {
      handleGameOver(game, 'black_wins');
    } else if (game.blackTime <= 0 && game.state.activeColor === 'black') {
      handleGameOver(game, 'white_wins');
    }
  }
}, 100);

// ==================== Game Over Handler ====================

function handleGameOver(game, result) {
  if (game.isOver) return; // Already processed — prevent double-save and duplicate ELO updates
  game.isOver = true;
  game.result = result;
  if (game.botTimer) {
    clearTimeout(game.botTimer);
    delete game.botTimer;
  }
  console.log(`[Game] Over: ${game.id} | Result: ${result}`);

  // Calculate ELO (update human player even for bot games, skip bot with userId=0)
  let whiteEloDiff = 0;
  let blackEloDiff = 0;
  let whiteNewElo = game.whiteElo;
  let blackNewElo = game.blackElo;

  if (result === 'white_wins') {
    const elos = auth.calculateElo(game.whiteElo, game.blackElo);
    whiteNewElo = elos.winnerNew;
    blackNewElo = elos.loserNew;
    whiteEloDiff = whiteNewElo - game.whiteElo;
    blackEloDiff = blackNewElo - game.blackElo;
    if (game.whiteId !== 0) auth.updateElo(game.whiteId, elos.winnerNew, 'win');
    if (game.blackId !== 0) auth.updateElo(game.blackId, elos.loserNew, 'loss');

    // Log activities for PvP
    if (game.whiteId !== 0 && game.blackId !== 0) {
      logAndBroadcastActivity('ranked_win', game.whiteUsername, { opponent: game.blackUsername, winnerElo: elos.winnerNew });
      checkAndLogEloMilestone(game.whiteId, game.whiteUsername, game.whiteElo, elos.winnerNew);
    }
  } else if (result === 'black_wins') {
    const elos = auth.calculateElo(game.blackElo, game.whiteElo);
    blackNewElo = elos.winnerNew;
    whiteNewElo = elos.loserNew;
    blackEloDiff = blackNewElo - game.blackElo;
    whiteEloDiff = whiteNewElo - game.whiteElo;
    if (game.blackId !== 0) auth.updateElo(game.blackId, elos.winnerNew, 'win');
    if (game.whiteId !== 0) auth.updateElo(game.whiteId, elos.loserNew, 'loss');

    // Log activities for PvP
    if (game.whiteId !== 0 && game.blackId !== 0) {
      logAndBroadcastActivity('ranked_win', game.blackUsername, { opponent: game.whiteUsername, winnerElo: elos.winnerNew });
      checkAndLogEloMilestone(game.blackId, game.blackUsername, game.blackElo, elos.winnerNew);
    }
  } else if (result === 'draw') {
    const elos = auth.calculateElo(game.whiteElo, game.blackElo, true);
    whiteNewElo = elos.winnerNew;
    blackNewElo = elos.loserNew;
    whiteEloDiff = whiteNewElo - game.whiteElo;
    blackEloDiff = blackNewElo - game.blackElo;
    if (game.whiteId !== 0) auth.updateElo(game.whiteId, elos.winnerNew, 'draw');
    if (game.blackId !== 0) auth.updateElo(game.blackId, elos.loserNew, 'draw');
  }

  // Get user details for avatars
  const whiteUser = game.whiteId !== 0 ? auth.getUserById(game.whiteId) : null;
  const blackUser = game.blackId !== 0 ? auth.getUserById(game.blackId) : null;

  const gameOverPayload = {
    result,
    gameId: game.id,
    fen: engine.toFen(game.state),
    moveHistory: game.state.moveHistory || [],
    moves: game.state.moveHistory || [],
    players: {
      white: {
        username: game.whiteUsername,
        avatarUrl: whiteUser ? whiteUser.avatar_url : null,
        oldElo: game.whiteElo,
        newElo: whiteNewElo,
        eloDiff: whiteEloDiff
      },
      black: {
        username: game.blackUsername,
        avatarUrl: blackUser ? blackUser.avatar_url : null,
        oldElo: game.blackElo,
        newElo: blackNewElo,
        eloDiff: blackEloDiff
      }
    }
  };

  // Notify both players
  for (const [color, playerId] of Object.entries(game.players)) {
    const sockets = userSockets.get(playerId);
    if (sockets) {
      for (const sockId of sockets) {
        io.to(sockId).emit('game_over', gameOverPayload);
      }
    }
  }

  // Notify spectators
  const spectators = gameSpectators ? gameSpectators.get(game.id) : null;
  if (spectators) {
    for (const sockId of spectators) {
      io.to(sockId).emit('game_over', gameOverPayload);
    }
  }

  broadcastLiveGames();

  const movesCount = (game.state.moveHistory || []).length;

  if (result === 'white_wins' || result === 'black_wins') {
    const winnerUsername = result === 'white_wins' ? game.whiteUsername : game.blackUsername;
    const winnerId = result === 'white_wins' ? game.whiteId : game.blackId;
    const loserId = result === 'white_wins' ? game.blackId : game.whiteId;
    
    // Achievements (Win based)
    if (winnerId !== 0) {
      const winnerData = auth.getUserById(winnerId);
      // First Win
      if (winnerData && winnerData.wins === 1) { // auth.updateElo is called right before this, so wins should be 1
        if (auth.unlockAchievement(winnerId, 'first_win')) {
          logAndBroadcastActivity('achievement', winnerUsername, { achievementName: 'First Blood' });
        }
      }
      
      // Fast Mate
      if (movesCount <= 10 && loserId !== 0) {
        if (auth.unlockAchievement(winnerId, 'fast_mate')) {
          logAndBroadcastActivity('achievement', winnerUsername, { achievementName: 'Lightning Speed' });
        }
      }
      
      // Bot Slayer
      if (loserId === 0) {
        if (auth.unlockAchievement(winnerId, 'bot_slayer')) {
          logAndBroadcastActivity('achievement', winnerUsername, { achievementName: 'Bot Slayer' });
        }
      }
      
      // Win Streak 10
      if (winnerData && winnerData.current_streak >= 10) {
        if (auth.unlockAchievement(winnerId, 'win_streak_10')) {
          logAndBroadcastActivity('achievement', winnerUsername, { achievementName: 'Untouchable' });
        }
      }

    }
  } else if (result === 'draw') {
    // Pacifist Achievement
    for (const pId of [game.whiteId, game.blackId]) {
      if (pId !== 0) {
        const u = auth.getUserById(pId);
        if (u && auth.unlockAchievement(pId, 'pacifist')) {
          logAndBroadcastActivity('achievement', u.username, { achievementName: 'Pacifist' });
        }
      }
    }
  }

  // Dedicated Player achievement checks
  for (const pId of [game.whiteId, game.blackId]) {
    if (pId !== 0) {
      const u = auth.getUserById(pId);
      if (u) {
        const totalGames = u.wins + u.losses + u.draws;
        if (totalGames >= 50) {
          if (auth.unlockAchievement(pId, 'dedicated_player')) {
            logAndBroadcastActivity('achievement', u.username, { achievementName: 'Dedicated Player' });
          }
        }
      }
    }
  }

  // Save game to database (includes bot games so they appear in history)
  const { getDb: loadDb } = require('./db');
  loadDb().then(database => {
    const stmt = database.prepare(
      'INSERT INTO games (game_uuid, white_id, black_id, result, fen_final, moves_json) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run([
      game.id,
      game.whiteId,
      game.blackId,
      result,
      engine.toFen(game.state),
      JSON.stringify(game.state.moveHistory || [])
    ]);
    stmt.free();
    saveDb();

    // Auto-cleanup: keep only the last 300 games per player (30 pages × 10/page)
    try {
      database.run(`
        DELETE FROM games WHERE id IN (
          SELECT id FROM (SELECT id FROM games WHERE white_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 300)
        )
      `, [game.whiteId]);
      database.run(`
        DELETE FROM games WHERE id IN (
          SELECT id FROM (SELECT id FROM games WHERE black_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 300)
        )
      `, [game.blackId]);
      saveDb();
    } catch (cleanupErr) {
      // Ignore cleanup errors — non-critical
    }
  }).catch(err => {
    console.error('Failed to save game to DB:', err);
  });

  // ===== Battlepass XP Grant =====
  const isBotGame = game.whiteId === 0 || game.blackId === 0;
  if (!isBotGame) {
    // PvP match — full XP
    const whiteXp = result === 'white_wins' ? 30 : (result === 'draw' ? 15 : 10);
    const blackXp = result === 'black_wins' ? 30 : (result === 'draw' ? 15 : 10);
    if (game.whiteId !== 0) {
      const bpResult = battlepass.grantXP(game.whiteId, whiteXp);
      if (bpResult.leveledUp) {
        notifyLevelUp(game.whiteId, bpResult);
      }
    }
    if (game.blackId !== 0) {
      const bpResult = battlepass.grantXP(game.blackId, blackXp);
      if (bpResult.leveledUp) {
        notifyLevelUp(game.blackId, bpResult);
      }
    }
  } else {
    // Bot game — half XP (only for the human player)
    const humanId = game.whiteId !== 0 ? game.whiteId : game.blackId;
    if (humanId !== 0) {
      const isHumanWhite = game.whiteId === humanId;
      const humanResult = isHumanWhite ? result : (result === 'white_wins' ? 'black_wins' : result === 'black_wins' ? 'white_wins' : result);
      const xpAmount = humanResult === 'white_wins' ? 15 : (humanResult === 'draw' ? 7 : 5);
      const bpResult = battlepass.grantXP(humanId, xpAmount);
      if (bpResult.leveledUp) {
        notifyLevelUp(humanId, bpResult);
      }
    }
  }

  // Clean up socket-games mapping
  for (const [sockId, info] of socketGames) {
    if (info.gameId === game.id) {
      socketGames.delete(sockId);
    }
  }

  // Remove game from active games after a delay
  setTimeout(() => {
    activeGames.delete(game.id);
    if (gameSpectators) gameSpectators.delete(game.id);
  }, 60000); // Keep for 1 minute in case of reconnection
}

/**
 * Notify a user that they've leveled up in the battlepass.
 */
function notifyLevelUp(userId, bpResult) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const data = {
      newTier: bpResult.newTier,
      unlockedTitle: bpResult.unlockedTitle || null,
      coinsEarned: bpResult.coinsEarned || 0,
      leveledUp: true
    };
    for (const sockId of sockets) {
      io.to(sockId).emit('battlepass_level_up', data);
    }
  }

  // Log battlepass tier reached activity
  const user = auth.getUserById(userId);
  if (user) {
    logAndBroadcastActivity('battlepass_tier', user.username, { tier: bpResult.newTier });
  }
}

/**
 * Helper to log an activity in the database and broadcast via Socket.io
 */
function logAndBroadcastActivity(type, username, details) {
  const { getDb: loadDb, saveDb } = require('./db');
  loadDb().then(database => {
    const stmt = database.prepare('INSERT INTO activities (type, username, details) VALUES (?, ?, ?)');
    stmt.run([type, username, JSON.stringify(details)]);
    stmt.free();
    saveDb();

    const activityObj = {
      type,
      username,
      details,
      created_at: new Date().toISOString()
    };
    
    // Broadcast via socket.io to all users!
    io.emit('new_activity', activityObj);
  }).catch(err => {
    console.error('Failed to log and broadcast activity:', err);
  });
}

/**
 * Helper to check for ELO milestones and log them
 */
function checkAndLogEloMilestone(userId, username, oldElo, newElo) {
  const milestones = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200];
  for (const m of milestones) {
    if (oldElo < m && newElo >= m) {
      logAndBroadcastActivity('elo_milestone', username, { milestone: m });
      break;
    }
  }

  // Achievement checks
  if (newElo >= 1500) {
    if (auth.unlockAchievement(userId, 'elo_1500')) {
      logAndBroadcastActivity('achievement', username, { achievementName: 'Rising Star' });
    }
  }
  
  if (newElo >= 2000) {
    if (auth.unlockAchievement(userId, 'elo_2000')) {
      logAndBroadcastActivity('achievement', username, { achievementName: 'Grandmaster' });
    }
  }
}

// Get the latest 15 activities
app.get('/api/activities', (req, res) => {
  const { getDb: loadDb } = require('./db');
  loadDb().then(database => {
    const stmt = database.prepare('SELECT type, username, details, created_at FROM activities ORDER BY id DESC LIMIT 15');
    const activities = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try {
        row.details = JSON.parse(row.details || '{}');
      } catch(e) {}
      activities.push(row);
    }
    stmt.free();
    res.json({ success: true, activities });
  }).catch(err => {
    console.error('Error fetching activities:', err);
    res.json({ success: false, message: 'Failed to fetch activities' });
  });
});

// ==================== Battlepass API ====================

// Get the current user's battlepass status
app.get('/api/battlepass', requireAuth, (req, res) => {
  const status = battlepass.getBattlepassStatus(req.session.userId);
  const titles = battlepass.getUnlockedTitles(req.session.userId);
  res.json({ success: true, ...status, titles });
});

// Get all tier definitions
app.get('/api/battlepass/tiers', (req, res) => {
  const tiers = battlepass.getSeasonTiers(1);
  res.json({ success: true, tiers });
});

// Claim a tier reward
app.post('/api/battlepass/claim', requireAuth, (req, res) => {
  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    return res.json({ success: false, isGuest: true, message: 'Please create an account to claim Battlepass rewards' });
  }
  const { tier } = req.body;
  if (!tier) return res.json({ success: false, message: 'Tier number required' });
  const result = battlepass.claimTierReward(req.session.userId, tier);
  res.json(result);
});

// Claim Daily Quest reward and grant Battlepass XP
const userClaimedDailyQuests = new Set();
app.post('/api/quests/claim', requireAuth, async (req, res) => {
  const { questId, xp } = req.body;
  const numericQuestId = Number(questId);
  const questXpMap = { 1: 100, 2: 150, 3: 200 };
  const grantAmount = questXpMap[numericQuestId] || Math.min(Math.max(Number(xp) || 0, 0), 250);

  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    return res.json({ success: true, isGuest: true, xpGranted: grantAmount, message: 'Quest reward claimed' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const claimKey = `${req.session.userId}:${todayStr}:${numericQuestId}`;
  if (userClaimedDailyQuests.has(claimKey)) {
    return res.status(400).json({ success: false, message: 'Quest reward already claimed today' });
  }

  // Also verify against database to persist across server restarts
  try {
    const database = db || (await getDb());
    if (database) {
      const chkStmt = database.prepare('SELECT id FROM user_daily_quests WHERE user_id = ? AND claim_date = ? AND quest_id = ?');
      chkStmt.bind([req.session.userId, todayStr, numericQuestId]);
      const alreadyClaimed = chkStmt.step();
      chkStmt.free();
      if (alreadyClaimed) {
        userClaimedDailyQuests.add(claimKey);
        return res.status(400).json({ success: false, message: 'Quest reward already claimed today' });
      }
    }
  } catch (e) {}

  const bpResult = battlepass.grantXP(req.session.userId, grantAmount);
  userClaimedDailyQuests.add(claimKey);
  try {
    const database = db || (await getDb());
    if (database) {
      const insStmt = database.prepare('INSERT OR IGNORE INTO user_daily_quests (user_id, claim_date, quest_id) VALUES (?, ?, ?)');
      insStmt.run([req.session.userId, todayStr, numericQuestId]);
      insStmt.free();
    }
  } catch (e) {}
  saveDb();
  if (bpResult.leveledUp) {
    notifyLevelUp(req.session.userId, bpResult);
  }
  const status = battlepass.getBattlepassStatus(req.session.userId);
  res.json({ success: true, xpGranted: grantAmount, bpResult, battlepass: status });
});

// Set equipped title
app.post('/api/battlepass/set-title', requireAuth, (req, res) => {
  const { titleId } = req.body;
  if (!titleId) return res.json({ success: false, message: 'Title ID required' });
  const result = battlepass.setEquippedTitle(req.session.userId, titleId);
  res.json(result);
});

// Clear equipped title
app.post('/api/battlepass/clear-title', requireAuth, (req, res) => {
  const result = battlepass.clearEquippedTitle(req.session.userId);
  res.json(result);
});

// Get all unlocked titles for current user
app.get('/api/battlepass/titles', requireAuth, (req, res) => {
  const titles = battlepass.getUnlockedTitles(req.session.userId);
  res.json({ success: true, titles });
});

// ==================== Shop / Customization API ====================

const SHOP_ITEMS = {
  board_themes: [
    { id: 'default', name: 'Obsidian Slate', price: 0, type: 'theme', cssLight: '#475569', cssDark: '#1e293b' },
    { id: 'ocean', name: 'Ocean Breeze', price: 200, type: 'theme', cssLight: '#cbd5e1', cssDark: '#0284c7' },
    { id: 'emerald', name: 'Emerald Forest', price: 250, type: 'theme', cssLight: '#d1fae5', cssDark: '#059669' },
    { id: 'midnight', name: 'Midnight Neon', price: 500, type: 'theme', cssLight: '#e9d5ff', cssDark: '#6d28d9' },
    { id: 'crimson', name: 'Crimson Blood', price: 400, type: 'theme', cssLight: '#ffe4e6', cssDark: '#e11d48' }
  ],
  win_effects: [
    { id: 'none', name: 'None', price: 0, type: 'effect' },
    { id: 'confetti', name: 'Confetti Party', price: 500, type: 'effect' }
  ],
  username_colors: [
    { id: 'default', name: 'Default', price: 0, type: 'color', value: '' },
    { id: 'gold', name: 'Gold', price: 300, type: 'color', value: '#fbbf24' },
    { id: 'red', name: 'Ruby', price: 300, type: 'color', value: '#ef4444' },
    { id: 'blue', name: 'Sapphire', price: 300, type: 'color', value: '#3b82f6' },
    { id: 'neon', name: 'Neon Cyan', price: 400, type: 'color', value: '#22d3ee' }
  ]
};

app.get('/api/shop/items', requireAuth, (req, res) => {
  res.json({ success: true, items: SHOP_ITEMS });
});

app.post('/api/shop/buy', requireAuth, (req, res) => {
  if (req.session.isGuest || (req.session.username && req.session.username.startsWith('Guest_'))) {
    return res.json({ success: false, isGuest: true, message: 'Please create an account to purchase shop items and save your progress' });
  }
  const { itemId, category } = req.body;
  
  if (!SHOP_ITEMS[category]) return res.json({ success: false, message: 'Invalid category' });
  const item = SHOP_ITEMS[category].find(i => i.id === itemId);
  if (!item) return res.json({ success: false, message: 'Item not found' });
  
  if (item.price === 0) return res.json({ success: false, message: 'This item is free and already owned' });

  const user = auth.getUserById(req.session.userId);
  let unlocked = [];
  try { unlocked = JSON.parse(user.unlocked_items || '[]'); } catch(e) {}
  
  if (unlocked.includes(itemId)) {
    return res.json({ success: false, message: 'You already own this item' });
  }
  
  if (user.coins < item.price) {
    return res.json({ success: false, message: 'Not enough coins' });
  }
  
  auth.deductCoins(req.session.userId, item.price);
  auth.unlockItem(req.session.userId, itemId);
  logAndBroadcastActivity('shop_purchase', user.username, { itemName: item.name });
  
  if (auth.unlockAchievement(req.session.userId, 'big_spender')) {
    logAndBroadcastActivity('achievement', user.username, { achievementName: 'Big Spender' });
  }
  
  res.json({ success: true, message: 'Purchase successful!' });
});

app.post('/api/shop/equip', requireAuth, (req, res) => {
  const { itemId, category } = req.body;
  
  if (!SHOP_ITEMS[category]) return res.json({ success: false, message: 'Invalid category' });
  const item = SHOP_ITEMS[category].find(i => i.id === itemId);
  if (!item) return res.json({ success: false, message: 'Item not found' });

  const user = auth.getUserById(req.session.userId);
  let unlocked = [];
  try { unlocked = JSON.parse(user.unlocked_items || '[]'); } catch(e) {}
  
  if (item.price > 0 && !unlocked.includes(itemId)) {
    return res.json({ success: false, message: 'You do not own this item' });
  }

  if (category === 'board_themes') {
    auth.equipTheme(req.session.userId, itemId);
  } else if (category === 'win_effects') {
    auth.equipWinEffect(req.session.userId, itemId);
  } else if (category === 'username_colors') {
    auth.equipUsernameColor(req.session.userId, item.value);
  }
  
  res.json({ success: true, message: 'Equipped!' });
});

// ==================== Start Server ====================

async function start() {
  db = await getDb();
  auth.setDb(db);
  battlepass.setDb(db);

  // Startup cleanup of empty guests older than 30 minutes
  try {
    const startupCleanup = auth.cleanupGuests({ emptyOnly: true, olderThanMinutes: 30 });
    if (startupCleanup && startupCleanup.deletedCount > 0) {
      saveDb();
      console.log(`[Startup Maintenance] Cleaned up ${startupCleanup.deletedCount} orphaned empty guest profiles.`);
    }
  } catch (err) {}

  // Periodic background cleanup every 15 minutes
  setInterval(() => {
    try {
      const periodicCleanup = auth.cleanupGuests({ emptyOnly: true, olderThanMinutes: 30 });
      if (periodicCleanup && periodicCleanup.deletedCount > 0) {
        saveDb();
        console.log(`[Auto-Cleanup] Pruned ${periodicCleanup.deletedCount} abandoned empty guest profiles.`);
      }
    } catch (err) {}
  }, 15 * 60 * 1000);

  server.listen(PORT, () => {
    console.log(`\n♟  MiniChess Server`);
    console.log(`   Running on http://localhost:${PORT}`);
    console.log(`   Game: MiniChess — a 6×6 Crazyhouse variant\n`);
  });
}

start();

module.exports = { app, server, io };