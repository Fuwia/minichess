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
  const stmt = db.prepare('SELECT id, username, elo, wins, losses, draws, created_at FROM users WHERE id = ?');
  const row = stmt.getAsObject([id]);
  stmt.free();
  return row.id ? row : null;
}

function getUserByUsername(username) {
  const stmt = db.prepare('SELECT id, username, password_hash, elo, wins, losses, draws FROM users WHERE username = ?');
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

module.exports = { setDb, hashPassword, verifyPassword, registerUser, loginUser, getUserById, getUserByUsername, getLeaderboard, updateElo, calculateElo };