/**
 * MiniChess Bot — Minimax with Alpha-Beta Pruning
 * 
 * Difficulty profiles:
 *   Novice       (600)  — depth 1, 30% best move, 70% bottom-half blunder
 *   Casual       (900)  — depth 2, 50% best move, 50% lower-scored
 *   Intermediate (1200) — depth 2, 70% best move, 30% 2nd-3rd pick
 *   Advanced     (1650) — depth 3, 90% best move, 10% 2nd best
 *   Master       (1900) — depth 4, 100% best move
 */

const engine = require('./game-engine');

// Material values (centipawns)
const PIECE_VALUES = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000
};

// Piece-square tables for 6x6 board (rank 0 = white's back rank)
// Values in centipawns, positive = better for the piece

// Pawn PST (encourages advancement)
const PAWN_PST = [
  [  0,  0,  0,  0,  0,  0],
  [ 50, 50, 50, 50, 50, 50],
  [ 20, 20, 30, 30, 20, 20],
  [ 10, 10, 20, 20, 10, 10],
  [  5,  5, 10, 10,  5,  5],
  [  0,  0,  0,  0,  0,  0],
];

// Knight PST (centralize)
const KNIGHT_PST = [
  [-30,-10,-10,-10,-10,-30],
  [-10,  0,  5,  5,  0,-10],
  [-10,  5, 15, 15,  5,-10],
  [-10,  5, 15, 15,  5,-10],
  [-10,  0,  5,  5,  0,-10],
  [-30,-10,-10,-10,-10,-30],
];

// Bishop PST
const BISHOP_PST = [
  [-10, -5, -5, -5, -5,-10],
  [ -5, 10,  5,  5, 10, -5],
  [ -5,  5, 10, 10,  5, -5],
  [ -5,  5, 10, 10,  5, -5],
  [ -5, 10,  5,  5, 10, -5],
  [-10, -5, -5, -5, -5,-10],
];

// Rook PST
const ROOK_PST = [
  [  0,  0,  0,  0,  0,  0],
  [  5, 10, 10, 10, 10,  5],
  [ -5,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0, -5],
  [  5, 10, 10, 10, 10,  5],
  [  0,  0,  0,  0,  0,  0],
];

// Queen PST
const QUEEN_PST = [
  [-10, -5, -5, -5, -5,-10],
  [ -5,  0,  5,  5,  0, -5],
  [ -5,  5, 10, 10,  5, -5],
  [ -5,  5, 10, 10,  5, -5],
  [ -5,  0,  5,  5,  0, -5],
  [-10, -5, -5, -5, -5,-10],
];

// King PST
const KING_MIDDLEGAME_PST = [
  [-20,-20,-20,-20,-20,-20],
  [-20,-10,-10,-10,-10,-20],
  [-20,-10, 10, 10,-10,-20],
  [-20,-10, 10, 10,-10,-20],
  [-20,-10,-10,-10,-10,-20],
  [-20,-20,-20,-20,-20,-20],
];

function getPstValue(pieceType, row, col, isWhite) {
  const r = isWhite ? row : 5 - row;
  const c = isWhite ? col : 5 - col;
  switch (pieceType) {
    case 'p': return PAWN_PST[r][c];
    case 'n': return KNIGHT_PST[r][c];
    case 'b': return BISHOP_PST[r][c];
    case 'r': return ROOK_PST[r][c];
    case 'q': return QUEEN_PST[r][c];
    case 'k': return KING_MIDDLEGAME_PST[r][c];
    default: return 0;
  }
}

// Transposition table (Map with LRU-like cap)
const TRANSPOSITION_TABLE = new Map();
const TT_MAX_SIZE = 100000;

function ttKey(state) {
  return engine.toFen(state);
}

function ttGet(state) {
  const entry = TRANSPOSITION_TABLE.get(ttKey(state));
  if (entry) return entry;
  return null;
}

function ttSet(state, depth, value, flag) {
  if (TRANSPOSITION_TABLE.size >= TT_MAX_SIZE) {
    let count = 0;
    for (const key of TRANSPOSITION_TABLE.keys()) {
      TRANSPOSITION_TABLE.delete(key);
      if (++count >= 100) break;
    }
  }
  TRANSPOSITION_TABLE.set(ttKey(state), { depth, value, flag });
}

function ttClear() {
  TRANSPOSITION_TABLE.clear();
}

/**
 * Static evaluation of a position from the perspective of the given player.
 */
function evaluate(state, playerColor) {
  const opponent = playerColor === 'white' ? 'black' : 'white';
  let score = 0;

  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const piece = state.board[row][col];
      if (!piece) continue;
      
      const baseValue = PIECE_VALUES[piece.type] || 0;
      const pstValue = getPstValue(piece.type, row, col, piece.color === 'white');
      const pieceScore = baseValue + pstValue;

      if (piece.color === playerColor) {
        score += pieceScore;
      } else {
        score -= pieceScore;
      }
    }
  }

  // Pocket material (scaled down)
  const playerPocket = state.pockets[playerColor] || [];
  const oppPocket = state.pockets[opponent] || [];
  
  for (const pt of playerPocket) {
    score += (PIECE_VALUES[pt] || 0) * 0.5;
  }
  for (const pt of oppPocket) {
    score -= (PIECE_VALUES[pt] || 0) * 0.5;
  }

  // Mobility bonus
  const playerMoves = engine.getAllLegalMoves(state).length;
  const origColor = state.activeColor;
  state.activeColor = opponent;
  const oppMoves = engine.getAllLegalMoves(state).length;
  state.activeColor = origColor;
  
  score += (playerMoves - oppMoves) * 3;

  return score;
}

/**
 * Sort moves for better alpha-beta pruning.
 */
function orderMoves(state, moves) {
  return moves.slice().sort((a, b) => {
    let aScore = 0, bScore = 0;
    if (a.captured) aScore += PIECE_VALUES[a.captured.type] || 0;
    if (b.captured) bScore += PIECE_VALUES[b.captured.type] || 0;
    if (a.promotion) aScore += 300;
    if (b.promotion) bScore += 300;
    if (a.isDrop) aScore -= 50;
    if (b.isDrop) bScore -= 50;
    return bScore - aScore;
  });
}

/**
 * Alpha-Beta Minimax search.
 */
function alphaBeta(state, depth, alpha, beta, maximizingPlayer, playerColor) {
  const tt = ttGet(state);
  if (tt && tt.depth >= depth) {
    if (tt.flag === 'exact') return tt.value;
    if (tt.flag === 'lower' && tt.value >= beta) return tt.value;
    if (tt.flag === 'upper' && tt.value <= alpha) return tt.value;
  }

  if (depth === 0) {
    const score = evaluate(state, playerColor);
    ttSet(state, 0, score, 'exact');
    return score;
  }

  const result = engine.getGameResult(state);
  if (result) {
    if (result === 'white_wins') {
      const score = playerColor === 'white' ? 99999 : -99999;
      ttSet(state, depth, score, 'exact');
      return score;
    }
    if (result === 'black_wins') {
      const score = playerColor === 'black' ? 99999 : -99999;
      ttSet(state, depth, score, 'exact');
      return score;
    }
    ttSet(state, depth, 0, 'exact');
    return 0;
  }

  let moves = engine.getAllLegalMoves(state);
  moves = orderMoves(state, moves);

  if (moves.length === 0) {
    const score = evaluate(state, playerColor);
    ttSet(state, depth, score, 'exact');
    return score;
  }

  let bestScore;
  let flag = 'exact';

  if (maximizingPlayer) {
    bestScore = -100000;
    for (const move of moves) {
      const newState = engine.applyMove(state, move);
      const score = alphaBeta(newState, depth - 1, alpha, beta, false, playerColor);
      if (score > bestScore) bestScore = score;
      alpha = Math.max(alpha, score);
      if (alpha >= beta) {
        flag = 'lower';
        break;
      }
    }
  } else {
    bestScore = 100000;
    for (const move of moves) {
      const newState = engine.applyMove(state, move);
      const score = alphaBeta(newState, depth - 1, alpha, beta, true, playerColor);
      if (score < bestScore) bestScore = score;
      beta = Math.min(beta, score);
      if (alpha >= beta) {
        flag = 'upper';
        break;
      }
    }
  }

  ttSet(state, depth, bestScore, flag);
  return bestScore;
}

/**
 * Get all legal moves scored and sorted from best to worst.
 * Returns: [{ move, score }, ...]
 */
function getScoredMoves(state, depth, playerColor) {
  let moves = engine.getAllLegalMoves(state);
  if (moves.length === 0) return [];

  moves = orderMoves(state, moves);

  const scored = [];
  for (const move of moves) {
    const newState = engine.applyMove(state, move);
    const score = alphaBeta(newState, depth - 1, -100000, 100000, false, playerColor);
    scored.push({ move, score });
  }

  // Sort best to worst (highest score first)
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Select a move based on difficulty profile with blunder/mistake probabilities.
 */
function selectBotMove(state, depth, playerColor, difficulty) {
  const scored = getScoredMoves(state, depth, playerColor);
  if (scored.length === 0) return null;
  if (scored.length === 1) return scored[0].move;

  const roll = Math.random();

  // Helper: pick a random move from the bottom half (blunder for weak bots)
  function blunderBottomHalf() {
    const halfIdx = Math.ceil(scored.length / 2);
    const bottomHalf = scored.slice(halfIdx);
    const pick = bottomHalf[Math.floor(Math.random() * bottomHalf.length)];
    return pick.move;
  }

  // Helper: pick a random suboptimal move (skip best, pick from rest)
  function suboptimal() {
    const rest = scored.slice(1);
    const pick = rest[Math.floor(Math.random() * rest.length)];
    return pick.move;
  }

  // Helper: pick from 2nd or 3rd best
  function pick2ndOr3rd() {
    const candidates = scored.slice(1, Math.min(4, scored.length));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return pick.move;
  }

  switch (difficulty) {
    // Depth 1 bots — varying best-move % + blunder
    case 'toddler':
      return roll < 0.15 ? scored[0].move : blunderBottomHalf();
    case 'novice':
      return roll < 0.30 ? scored[0].move : blunderBottomHalf();
    case 'apprentice':
      return roll < 0.45 ? scored[0].move : blunderBottomHalf();

    // Depth 2 bots — varying best-move % + suboptimal
    case 'casual':
      return roll < 0.55 ? scored[0].move : suboptimal();
    case 'amateur':
      return roll < 0.65 ? scored[0].move : suboptimal();

    // Depth 2 bots — 2nd/3rd best mistakes
    case 'club_player':
      return roll < 0.75 ? scored[0].move : pick2ndOr3rd();

    // Depth 2 bot — 2nd best only
    case 'intermediate':
      if (roll < 0.85 || scored.length < 2) return scored[0].move;
      return scored[1].move;

    // Depth 3 bots — 2nd best only
    case 'advanced':
      if (roll < 0.90 || scored.length < 2) return scored[0].move;
      return scored[1].move;
    case 'expert':
      if (roll < 0.95 || scored.length < 2) return scored[0].move;
      return scored[1].move;

    // Depth 4 — perfect
    case 'master':
      return scored[0].move;

    default:
      return scored[0].move;
  }
}

/**
 * Find the absolute best move (no blunder — used internally or for reference).
 */
function findBestMove(state, depth, playerColor) {
  const scored = getScoredMoves(state, depth, playerColor);
  if (scored.length === 0) return null;
  return scored[0].move;
}

/**
 * Bot difficulty profiles: key → { depth, elo, name }
 */
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

/**
 * Get all difficulty keys for the UI dropdown
 */
function getDifficultyList() {
  return Object.keys(PROFILES);
}

module.exports = {
  findBestMove,
  selectBotMove,
  evaluate,
  getDepth,
  getBotElo,
  getBotName,
  getDifficultyList,
  ttClear
};