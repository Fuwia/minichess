/**
 * MiniChess Bot — Main Module
 *
 * Spawns a worker thread to run the intensive minimax search so the main Node.js
 * event loop remains unblocked, allowing concurrent matches and realtime site
 * responsiveness.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const engine = require('./game-engine');

const PROFILES = {
  toddler:      { depth: 1, elo: 600,  name: 'Toddler' },
  novice:       { depth: 1, elo: 750,  name: 'Novice' },
  apprentice:   { depth: 1, elo: 900,  name: 'Apprentice' },
  casual:       { depth: 2, elo: 1050, name: 'Casual' },
  amateur:      { depth: 2, elo: 1200, name: 'Amateur' },
  club_player:  { depth: 2, elo: 1350, name: 'Club Player' },
  intermediate: { depth: 2, elo: 1500, name: 'Intermediate' },
  advanced:     { depth: 3, elo: 1700, name: 'Advanced' },
  expert:       { depth: 3, elo: 1900, name: 'Expert' },
  master:       { depth: 4, elo: 2100, name: 'Master' },
};

function getProfile(difficulty) {
  return PROFILES[difficulty] || PROFILES.amateur;
}

function getDepth(difficulty) {
  return getProfile(difficulty).depth;
}

function getBotElo(difficulty) {
  return getProfile(difficulty).elo;
}

function getBotName(difficulty) {
  return 'Computer (' + getProfile(difficulty).name + ')';
}

function getDifficultyList() {
  return Object.keys(PROFILES);
}

/**
 * Asynchronously selects a bot move using a worker thread.
 */
function selectBotMoveAsync(state, depth, playerColor, difficulty) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'bot-worker.js'));
    
    // We send the FEN string to the worker instead of the full state object
    const stateFen = engine.toFen(state);
    
    worker.on('message', (msg) => {
      if (msg.type === 'move_result') {
        resolve(msg.move);
        worker.terminate();
      }
    });

    worker.on('error', (err) => {
      reject(err);
      worker.terminate();
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Bot worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage({
      type: 'calculate_move',
      payload: { stateFen, depth, playerColor, difficulty }
    });
  });
}

// For backwards compatibility or tests, throw error if sync used
function selectBotMove(state, depth, playerColor, difficulty) {
  throw new Error("selectBotMove is deprecated. Use selectBotMoveAsync instead to avoid blocking the event loop.");
}

function ttClear() {
  // handled within the worker per-move
}

module.exports = {
  selectBotMoveAsync,
  selectBotMove,
  getDepth,
  getBotElo,
  getBotName,
  getDifficultyList,
  ttClear
};
