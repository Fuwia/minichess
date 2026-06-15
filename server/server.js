const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { getDb, saveDb } = require('./db');
const auth = require('./auth');
const engine = require('./game-engine');
const Matchmaker = require('./matchmaker');

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
app.use(express.static(path.join(__dirname, '..', 'public')));

const sessionMiddleware = session({
  secret: 'minichess-secret-key-' + uuidv4(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
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
  
  const passwordHash = await auth.hashPassword(password);
  const result = auth.registerUser(username, passwordHash);
  
  if (result.success) {
    const user = auth.getUserByUsername(username);
    req.session.userId = user.id;
    req.session.username = user.username;
  }
  
  res.json(result);
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }
  
  const result = auth.loginUser(username, password);
  
  if (result.success) {
    req.session.userId = result.user.id;
    req.session.username = result.user.username;
  }
  
  res.json(result);
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  
  const user = auth.getUserById(req.session.userId);
  res.json({ user });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = auth.getLeaderboard();
  res.json({ leaderboard });
});

// ==================== Friends API ====================

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { friendUsername } = req.body;
  if (!friendUsername) return res.json({ success: false, message: 'Username required' });
  const result = auth.sendFriendRequest(req.session.userId, friendUsername);
  res.json(result);
});

app.post('/api/friends/accept', requireAuth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.json({ success: false, message: 'Request ID required' });
  const result = auth.acceptFriendRequest(req.session.userId, requestId);
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

// ==================== Private Rooms API ====================

app.post('/api/rooms/create', requireAuth, (req, res) => {
  const { roomId } = auth.createPrivateRoom(req.session.userId);

  // Store in-memory for socket matching
  privateRooms.set(roomId, {
    creator: { userId: req.session.userId, username: req.session.username },
    joiner: null,
    gameId: null
  });

  res.json({ success: true, roomId });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = auth.getPrivateRoom(req.params.roomId);
  if (!room || !room.is_active) {
    return res.json({ success: false, message: 'Room not found or expired' });
  }
  res.json({ success: true, room: { id: room.id, creator_id: room.creator_id, has_joiner: !!room.joiner_id } });
});

// ==================== Game State Management ====================

// Active games: gameId -> game state
const activeGames = new Map();

// Socket to game mapping
const socketGames = new Map(); // socketId -> { gameId, color }

// User to socket mapping
const userSockets = new Map(); // userId -> Set of socketIds

// Matchmaker instances
const matchmaker = new Matchmaker();
const diceMatchmaker = new Matchmaker();

// Private rooms (in-memory)
const privateRooms = new Map(); // roomId -> { creator: {userId, username}, joiner: null|{userId,username}, gameId: null|string }

const INITIAL_TIME = 120000; // 2 minutes per side in ms

// Dice piece mapping: 1=Pawn, 2=Knight, 3=Bishop, 4=Rook, 5=King
const DICE_PIECES = [engine.PAWN, engine.KNIGHT, engine.BISHOP, engine.ROOK, engine.KING];

function rollDice() {
  return Math.floor(Math.random() * 5) + 1;
}

function diceToPieceType(roll) {
  return DICE_PIECES[roll - 1];
}

function createGame(player1, player2, mode = 'standard') {
  const gameId = uuidv4();
  const state = engine.parseFen(INITIAL_FEN);
  
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
    whiteTime: INITIAL_TIME,
    blackTime: INITIAL_TIME,
    lastTickTime: Date.now(),
    clockStarted: false,
    mode: mode,
    diceRoll: mode === 'dice' ? rollDice() : null,
  };
  
  activeGames.set(gameId, game);
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
  const userId = socket.request.session.userId;
  const username = socket.request.session.username;
  
  if (!userId) {
    socket.emit('auth_required', { message: 'Please log in' });
    // Don't disconnect — wait for login via socket
  }

  // Track user sockets
  if (userId) {
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
  }

  // --- Matchmaking ---

  socket.on('join_queue', () => {
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

    if (match) {
      // Start a new game
      const game = createGame(match.player1, match.player2);

      // Notify both players
      match.player1.socket.emit('match_found', {
        gameId: game.id,
        color: 'white',
        opponent: { username: game.blackUsername, elo: game.blackElo },
        fen: engine.toFen(game.state)
      });

      match.player2.socket.emit('match_found', {
        gameId: game.id,
        color: 'black',
        opponent: { username: game.whiteUsername, elo: game.whiteElo },
        fen: engine.toFen(game.state)
      });

      // Track socket-to-game
      socketGames.set(match.player1.socket.id, { gameId: game.id, color: 'white' });
      socketGames.set(match.player2.socket.id, { gameId: game.id, color: 'black' });

      console.log(`[Game] Started: ${game.whiteUsername} vs ${game.blackUsername} (${game.id})`);
    }
  });

  socket.on('leave_queue', () => {
    if (!userId) return;
    const removed = matchmaker.leaveQueue(userId);
    if (removed) {
      socket.emit('queue_left', { message: 'Left queue' });
    }
  });

  // --- Dice Matchmaking ---

  socket.on('join_dice_queue', () => {
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

  socket.on('leave_dice_queue', () => {
    if (!userId) return;
    const removed = diceMatchmaker.leaveQueue(userId);
    if (removed) {
      socket.emit('queue_left', { message: 'Left dice queue' });
    }
  });

  // --- Game Play ---

  socket.on('make_move', (data) => {
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

    const color = getPlayerColor(game, userId);
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
    } else {
      game.blackTime = Math.max(0, game.blackTime - elapsed);
    }

    // Apply the move
    game.state = engine.applyMove(state, matchedMove);
    const newFen = engine.toFen(game.state);

    // Broadcast the move result to both players
    const opponentId = getOpponentId(game, userId);
    
    const movePayload = {
      move: {
        from: matchedMove.from,
        to: matchedMove.to,
        pieceType: matchedMove.pieceType || matchedMove.piece?.type,
        captured: matchedMove.captured ? matchedMove.captured.type : null,
        isDrop: matchedMove.isDrop,
        promotion: matchedMove.promotion
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
  });

  // --- Game: Resign ---
  socket.on('resign', (data) => {
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    
    const color = getPlayerColor(game, userId);
    if (!color) return;

    const result = color === 'white' ? 'black_wins' : 'white_wins';
    handleGameOver(game, result);
    
    socket.emit('resigned', { message: 'You resigned' });
  });

  // --- Game: Draw Offer ---
  socket.on('request_draw', (data) => {
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;

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
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

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
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

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
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.isOver) return;

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

    // Remove from matchmaking
    if (userId) {
      matchmaker.leaveQueue(userId);

      // Remove from user sockets tracking
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }

      // Handle game disconnect only if user has no other active sockets
      // (Prevents false disconnect trigger when navigating from lobby → game)
      const gameInfo = socketGames.get(socket.id);
      if (gameInfo) {
        const userSockSet = userSockets.get(userId);
        const hasOtherSockets = userSockSet && userSockSet.size > 0;
        
        if (!hasOtherSockets) {
          const game = activeGames.get(gameInfo.gameId);
          if (game && !game.isOver) {
            const color = gameInfo.color;
            game.connected[color] = false;

            // Notify opponent
            const opponentId = getOpponentId(game, userId);
            const opponentSockets = userSockets.get(opponentId);
            if (opponentSockets) {
              for (const sockId of opponentSockets) {
                io.to(sockId).emit('opponent_disconnected', {
                  message: 'Your opponent disconnected. You win!',
                  gameId: game.id
                });
              }
            }

            // Auto-resolve after 30 seconds if they don't reconnect
            setTimeout(() => {
              if (activeGames.has(game.id) && !game.connected[color]) {
                const result = color === 'white' ? 'black_wins' : 'white_wins';
                handleGameOver(game, result);
              }
            }, 30000);
          }
        }
        socketGames.delete(socket.id);
      }
    }
  });

  // --- Reconnect to game ---
  socket.on('reconnect_game', (data) => {
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const color = getPlayerColor(game, userId);
    if (!color) {
      socket.emit('error', { message: 'Not your game' });
      return;
    }

    game.connected[color] = true;
    socketGames.set(socket.id, { gameId, color });
    
    const opponentColor = color === 'white' ? 'black' : 'white';
    const opponentId = game.players[opponentColor];
    
    const gameStatePayload = {
      fen: engine.toFen(game.state),
      color: color,
      opponent: {
        username: opponentColor === 'white' ? game.whiteUsername : game.blackUsername,
        elo: opponentColor === 'white' ? game.whiteElo : game.blackElo
      },
      pockets: game.state.pockets,
      activeColor: game.state.activeColor,
      mode: game.mode || 'standard'
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
  });

  // --- Private Rooms ---

  socket.on('join_private_room', (data) => {
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
      { userId, username: user.username, elo: user.elo }
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
          fen: engine.toFen(game.state)
        });
        socketGames.set(sockId, { gameId: game.id, color: 'white' });
      }
    }

    // Notify joiner
    socket.emit('match_found', {
      gameId: game.id,
      color: 'black',
      opponent: { username: game.whiteUsername, elo: game.whiteElo },
      fen: engine.toFen(game.state)
    });
    socketGames.set(socket.id, { gameId: game.id, color: 'black' });

    console.log(`[Room] ${room.creator.username} vs ${user.username} — Private game started (${game.id})`);
  });

  socket.on('cancel_private_room', (data) => {
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
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
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

    // Send new dice roll to both players
    emitDiceRoll(game, null, io);
  });
});

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
  game.isOver = true;
  console.log(`[Game] Over: ${game.id} | Result: ${result}`);

  // Notify both players
  for (const [color, playerId] of Object.entries(game.players)) {
    const sockets = userSockets.get(playerId);
    if (sockets) {
      for (const sockId of sockets) {
        io.to(sockId).emit('game_over', { result, gameId: game.id });
      }
    }
  }

  // Update ELO
  if (result === 'white_wins') {
    const elos = auth.calculateElo(game.whiteElo, game.blackElo);
    auth.updateElo(game.whiteId, elos.winnerNew, 'win');
    auth.updateElo(game.blackId, elos.loserNew, 'loss');
  } else if (result === 'black_wins') {
    const elos = auth.calculateElo(game.blackElo, game.whiteElo);
    auth.updateElo(game.blackId, elos.winnerNew, 'win');
    auth.updateElo(game.whiteId, elos.loserNew, 'loss');
  } else if (result === 'draw') {
    const elos = auth.calculateElo(game.whiteElo, game.blackElo, true);
    auth.updateElo(game.whiteId, elos.winnerNew, 'draw');
    auth.updateElo(game.blackId, elos.loserNew, 'draw');
  }

  // Save game to database
  const db = auth.getDb ? null : null; // we need to get db, but auth.setDb was called
  // We'll use getDb from db module
  const { getDb } = require('./db');
  getDb().then(database => {
    const stmt = database.prepare(
      'INSERT INTO games (white_id, black_id, result, fen_final, moves_json) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run([
      game.whiteId,
      game.blackId,
      result,
      engine.toFen(game.state),
      JSON.stringify(game.state.moveHistory)
    ]);
    stmt.free();
    saveDb();
  }).catch(err => {
    console.error('Failed to save game to DB:', err);
  });

  // Clean up socket-games mapping
  for (const [sockId, info] of socketGames) {
    if (info.gameId === game.id) {
      socketGames.delete(sockId);
    }
  }

  // Remove game from active games after a delay
  setTimeout(() => {
    activeGames.delete(game.id);
  }, 60000); // Keep for 1 minute in case of reconnection
}

// ==================== Start Server ====================

async function start() {
  const database = await getDb();
  auth.setDb(database);

  server.listen(PORT, () => {
    console.log(`\n♟  MiniChess Server`);
    console.log(`   Running on http://localhost:${PORT}`);
    console.log(`   Game: MiniChess — a 6×6 Crazyhouse variant\n`);
  });
}

start();