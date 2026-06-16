const bcrypt = require('bcryptjs');

let db = null;

function setDb(database) {
  db = database;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function registerUser(username, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  try {
    stmt.run([username, passwordHash]);
    stmt.free();
    return { success: true, message: 'Registration successful' };
  } catch (err) {
    stmt.free();
    if (err.message && err.message.includes('UNIQUE')) {
      return { success: false, message: 'Username already taken' };
    }
    return { success: false, message: 'Registration failed' };
  }
}

function loginUser(username, plainPassword) {
  const stmt = db.prepare('SELECT id, username, password_hash, elo, wins, losses, draws FROM users WHERE username = ?');
  const row = stmt.getAsObject([username]);
  stmt.free();
  
  if (!row.id) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  const valid = bcrypt.compareSync(plainPassword, row.password_hash);
  if (!valid) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  return {
    success: true,
    user: {
      id: row.id,
      username: row.username,
      elo: row.elo,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws
    }
  };
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, username, elo, wins, losses, draws, created_at, avatar_url FROM users WHERE id = ?');
  const row = stmt.getAsObject([id]);
  stmt.free();
  return row.id ? row : null;
}

function getUserByUsername(username) {
  const stmt = db.prepare('SELECT id, username, password_hash, elo, wins, losses, draws, created_at, avatar_url FROM users WHERE username = ?');
  const row = stmt.getAsObject([username]);
  stmt.free();
  return row.id ? row : null;
}

function getLeaderboard(limit = 50) {
  const stmt = db.prepare('SELECT username, elo, wins, losses, draws FROM users ORDER BY elo DESC');
  const results = [];
  stmt.bind([]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  // Apply limit manually since sql.js bind with LIMIT ? has issues
  return results.slice(0, limit);
}

function updateElo(userId, newElo, result) {
  const stmt = db.prepare(`
    UPDATE users SET elo = ?, 
    wins = wins + CASE WHEN ? = 'win' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN ? = 'loss' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN ? = 'draw' THEN 1 ELSE 0 END
    WHERE id = ?
  `);
  stmt.run([newElo, result, result, result, userId]);
  stmt.free();
}

function calculateElo(winnerElo, loserElo, isDraw = false) {
  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;
  
  if (isDraw) {
    return {
      winnerNew: Math.round(winnerElo + K * (0.5 - expectedWinner)),
      loserNew: Math.round(loserElo + K * (0.5 - expectedLoser))
    };
  }
  
  return {
    winnerNew: Math.round(winnerElo + K * (1 - expectedWinner)),
    loserNew: Math.round(loserElo + K * (0 - expectedLoser))
  };
}

function updateAvatar(userId, avatarUrl) {
  const stmt = db.prepare('UPDATE users SET avatar_url = ?, last_avatar_change = datetime(\'now\') WHERE id = ?');
  stmt.run([avatarUrl, userId]);
  stmt.free();
}

// ==================== Friends ====================

function sendFriendRequest(userId, friendUsername) {
  const friend = getUserByUsername(friendUsername);
  if (!friend) return { success: false, message: 'User not found' };
  if (friend.id === userId) return { success: false, message: 'Cannot friend yourself' };

  // Check if already friends or pending
  const checkStmt = db.prepare(
    'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
  );
  const existing = checkStmt.getAsObject([userId, friend.id, friend.id, userId]);
  checkStmt.free();

  if (existing.id) {
    if (existing.status === 'accepted') return { success: false, message: 'Already friends' };
    if (existing.user_id === userId) return { success: false, message: 'Friend request already sent' };
    // The other person already sent a request — auto-accept
    const updateStmt = db.prepare('UPDATE friends SET status = ? WHERE id = ?');
    updateStmt.run(['accepted', existing.id]);
    updateStmt.free();
    return { success: true, message: 'Friend request accepted (already pending)', friend };
  }

  const stmt = db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)');
  stmt.run([userId, friend.id, 'pending']);
  stmt.free();
  return { success: true, message: 'Friend request sent', friend };
}

function acceptFriendRequest(userId, requestId) {
  const stmt = db.prepare('UPDATE friends SET status = ? WHERE id = ? AND friend_id = ? AND status = ?');
  stmt.run(['accepted', requestId, userId, 'pending']);
  stmt.free();
  return { success: true, message: 'Friend request accepted' };
}

function declineFriendRequest(userId, requestId) {
  // Decline a specific pending request by its row ID
  const stmt = db.prepare('DELETE FROM friends WHERE id = ? AND friend_id = ? AND status = ?');
  stmt.run([requestId, userId, 'pending']);
  stmt.free();
  return { success: true, message: 'Request declined' };
}

function removeFriend(userId, friendId) {
  const stmt = db.prepare(
    'DELETE FROM friends WHERE (user_id = ? AND friend_id = ? AND status = ?) OR (user_id = ? AND friend_id = ? AND status = ?)'
  );
  stmt.run([userId, friendId, 'accepted', friendId, userId, 'accepted']);
  stmt.free();
  return { success: true, message: 'Friend removed' };
}

function getFriends(userId) {
  const stmt = db.prepare(`
    SELECT u.id, u.username, u.elo, f.id as friendship_id
    FROM friends f
    JOIN users u ON (u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END)
    WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
  `);
  const results = [];
  stmt.bind([userId, userId, userId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getPendingRequests(userId) {
  const stmt = db.prepare(`
    SELECT f.id, u.username, u.elo
    FROM friends f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending'
  `);
  const results = [];
  stmt.bind([userId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ==================== Private Rooms ====================

function createPrivateRoom(creatorId) {
  const roomId = require('uuid').v4().substring(0, 8).toUpperCase();
  const stmt = db.prepare('INSERT INTO private_rooms (id, creator_id) VALUES (?, ?)');
  stmt.run([roomId, creatorId]);
  stmt.free();
  return { roomId };
}

function getPrivateRoom(roomId) {
  const stmt = db.prepare('SELECT * FROM private_rooms WHERE id = ?');
  const row = stmt.getAsObject([roomId]);
  stmt.free();
  return row.id ? row : null;
}

function joinPrivateRoom(roomId, joinerId) {
  const stmt = db.prepare('UPDATE private_rooms SET joiner_id = ?, is_active = 0 WHERE id = ? AND joiner_id IS NULL AND is_active = 1');
  stmt.run([joinerId, roomId]);
  const changes = db.getRowsModified();
  stmt.free();
  return changes > 0;
}

function deactivatePrivateRoom(roomId) {
  const stmt = db.prepare('UPDATE private_rooms SET is_active = 0 WHERE id = ?');
  stmt.run([roomId]);
  stmt.free();
}

// ==================== Admin ====================

function isAdmin(userId) {
  const stmt = db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const row = stmt.getAsObject([userId]);
  stmt.free();
  return row && row.is_admin === 1;
}

function getAllUsers() {
  const stmt = db.prepare('SELECT id, username, elo, wins, losses, draws, created_at, avatar_url, is_admin FROM users ORDER BY id ASC');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function deleteUser(userId) {
  // Remove all related data for this user
  db.run('DELETE FROM games WHERE white_id = ? OR black_id = ?', [userId, userId]);
  db.run('DELETE FROM friends WHERE user_id = ? OR friend_id = ?', [userId, userId]);
  db.run('DELETE FROM private_rooms WHERE creator_id = ? OR joiner_id = ?', [userId, userId]);
  
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run([userId]);
  const changes = db.getRowsModified();
  stmt.free();
  return changes > 0;
}

function resetAllStats() {
  db.run('UPDATE users SET elo = 1200, wins = 0, losses = 0, draws = 0');
  return true;
}

function resetUserStats(userId) {
  const stmt = db.prepare('UPDATE users SET elo = 1200, wins = 0, losses = 0, draws = 0 WHERE id = ?');
  stmt.run([userId]);
  const changes = db.getRowsModified();
  stmt.free();
  return changes > 0;
}

module.exports = {
  setDb,
  hashPassword,
  verifyPassword,
  registerUser,
  loginUser,
  getUserById,
  getUserByUsername,
  getLeaderboard,
  updateElo,
  calculateElo,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriends,
  getPendingRequests,
  updateAvatar,
  createPrivateRoom,
  getPrivateRoom,
  joinPrivateRoom,
  deactivatePrivateRoom,
  isAdmin,
  getAllUsers,
  deleteUser,
  resetAllStats,
  resetUserStats
};
