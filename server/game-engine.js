/**
 * MiniChess Engine - 6×6 Crazyhouse Variant
 * 
 * Board layout (ranks 0-5, rank 0 = white's back rank):
 * Rank 5: a6 b6 c6 d6 e6 f6  (black's back rank)
 * Rank 4: a5 b5 c5 d5 e5 f5
 * Rank 3: a4 b4 c4 d4 e4 f4
 * Rank 2: a3 b3 c3 d3 e3 f3
 * Rank 1: a2 b2 c2 d2 e2 f2
 * Rank 0: a1 b1 c1 d1 e1 f1  (white's back rank)
 * 
 * FEN format: [board]/[side w] [castling -] [en-passant -] [white pocket]/[black pocket]
 * Example: 2bnrk/5p/6/6/P5/KRNB2 w - - []/[]
 */

// Piece types
const KING = 'k';
const QUEEN = 'q';
const ROOK = 'r';
const BISHOP = 'b';
const KNIGHT = 'n';
const PAWN = 'p';

const WHITE = 'white';
const BLACK = 'black';

/**
 * Parse a FEN string into a game state
 */
function parseFen(fen) {
  const parts = fen.split(' ');
  if (parts.length < 5) {
    throw new Error('Invalid FEN: expected at least 5 space-separated parts');
  }

  const boardPart = parts[0];
  const activeColor = parts[1] === 'w' ? WHITE : BLACK;
  const castling = parts[2];
  const enPassant = parts[3];
  const pocketPart = parts[4]; // [wp]/[bp] or just []

  // Parse board - FEN lists ranks from top (rank 8/6) to bottom (rank 1).
  // We reverse so board[0] = white's back rank (1), board[5] = black's back rank (6).
  const ranks = boardPart.split('/').reverse();
  if (ranks.length !== 6) {
    throw new Error('Invalid FEN: board must have exactly 6 ranks');
  }

  const board = [];
  for (let row = 0; row < 6; row++) {
    board[row] = [];
    let col = 0;
    const rank = ranks[row];
    for (const ch of rank) {
      if (ch >= '1' && ch <= '6') {
        const empty = parseInt(ch, 10);
        for (let i = 0; i < empty; i++) {
          board[row][col] = null;
          col++;
        }
      } else {
        const piece = {
          type: ch.toLowerCase(),
          color: ch === ch.toUpperCase() ? WHITE : BLACK
        };
        board[row][col] = piece;
        col++;
      }
    }
    if (col !== 6) {
      throw new Error(`Invalid FEN: rank ${row} has ${col} files, expected 6`);
    }
  }

  // Parse pockets
  let whitePocket = [];
  let blackPocket = [];
  
  if (pocketPart && pocketPart !== '-') {
    // Format: "[]/[]" or "[p,n]/[r,b]"
    const pocketMatch = pocketPart.match(/^\[([^\]]*)\]\s*\/\s*\[([^\]]*)\]$/);
    if (pocketMatch) {
      whitePocket = parsePocketString(pocketMatch[1]);
      blackPocket = parsePocketString(pocketMatch[2]);
    }
  }

  return {
    board,
    activeColor,
    castling,
    enPassant,
    pockets: {
      [WHITE]: whitePocket,
      [BLACK]: blackPocket
    },
    moveHistory: [],
    halfMoves: 0,
    fullMoves: 1
  };
}

function parsePocketString(str) {
  if (!str || str.trim() === '') return [];
  return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Serialize game state back to FEN string
 */
function toFen(state) {
  // Board - output in standard FEN order (black's back rank first = row 5 down to row 0)
  const fenRanks = [];
  for (let row = 5; row >= 0; row--) {
    let rankStr = '';
    let empty = 0;
    for (let col = 0; col < 6; col++) {
      const piece = state.board[row][col];
      if (piece === null) {
        empty++;
      } else {
        if (empty > 0) {
          rankStr += empty;
          empty = 0;
        }
        const ch = piece.type;
        rankStr += piece.color === WHITE ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) rankStr += empty;
    fenRanks.push(rankStr);
  }
  let fen = fenRanks.join('/');

  // Pocket
  const wp = state.pockets[WHITE].join(',');
  const bp = state.pockets[BLACK].join(',');
  const colorChar = state.activeColor === WHITE ? 'w' : 'b';
  fen += ` ${colorChar} ${state.castling || '-'} ${state.enPassant || '-'}`;
  fen += ` [${wp}]/[${bp}]`;

  return fen;
}

/**
 * Clone the game state (deep copy)
 */
function cloneState(state) {
  return {
    board: state.board.map(row => row.map(cell => cell ? { ...cell } : null)),
    activeColor: state.activeColor,
    castling: state.castling,
    enPassant: state.enPassant,
    pockets: {
      [WHITE]: [...state.pockets[WHITE]],
      [BLACK]: [...state.pockets[BLACK]]
    },
    moveHistory: [...state.moveHistory],
    halfMoves: state.halfMoves,
    fullMoves: state.fullMoves
  };
}

/**
 * Get piece at a given algebraic square (e.g. "a1")
 */
function getPieceAt(state, square) {
  const { row, col } = squareToCoords(square);
  return state.board[row][col];
}

function squareToCoords(square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10) - 1;
  return { row: rank, col: file };
}

function coordsToSquare(row, col) {
  const file = String.fromCharCode('a'.charCodeAt(0) + col);
  const rank = row + 1;
  return file + rank;
}

function isValidSquare(row, col) {
  return row >= 0 && row < 6 && col >= 0 && col < 6;
}

/**
 * Get pseudo-legal moves for a piece at a given position.
 * Does NOT check for self-check — that's done in filterLegalMoves.
 */
function getPseudoLegalMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];

  const moves = [];
  const color = piece.color;
  const opponent = color === WHITE ? BLACK : WHITE;
  const forward = color === WHITE ? 1 : -1;
  const homeRank = color === WHITE ? 1 : 4; // pawn starting rank (0-based: 1 for white, 4 for black)
  const promoRank = color === WHITE ? 5 : 0;

  function addMove(toRow, toCol) {
    if (!isValidSquare(toRow, toCol)) return false;
    const target = state.board[toRow][toCol];
    if (target && target.color === color) return false; // can't capture own piece
    moves.push({
      from: coordsToSquare(row, col),
      to: coordsToSquare(toRow, toCol),
      piece: piece,
      captured: target,
      isDrop: false,
      promotion: null
    });
    return !target; // return true if square was empty (can continue sliding)
  }

  function slideMoves(dirs) {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (isValidSquare(r, c)) {
        if (!addMove(r, c)) break;
        r += dr;
        c += dc;
      }
    }
  }

  switch (piece.type) {
    case KING:
      // One square in any direction
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          addMove(row + dr, col + dc);
        }
      }
      break;

    case QUEEN:
      slideMoves([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);
      break;

    case ROOK:
      slideMoves([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      break;

    case BISHOP:
      slideMoves([[1, 1], [-1, -1], [1, -1], [-1, 1]]);
      break;

    case KNIGHT:
      const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of knightMoves) {
        addMove(row + dr, col + dc);
      }
      break;

    case PAWN:
      // Forward one step
      const fr = row + forward;
      if (isValidSquare(fr, col) && !state.board[fr][col]) {
        // Check promotion
        if (fr === promoRank) {
          // Promotion moves
          for (const promoType of [QUEEN, ROOK, BISHOP, KNIGHT]) {
            moves.push({
              from: coordsToSquare(row, col),
              to: coordsToSquare(fr, col),
              piece: piece,
              captured: null,
              isDrop: false,
              promotion: promoType
            });
          }
        } else {
          addMove(fr, col);
        }
        
        // Forward two from home rank
        const fr2 = row + 2 * forward;
        if (row === homeRank && isValidSquare(fr2, col) && !state.board[fr2][col]) {
          const fromSq = coordsToSquare(row, col);
          const toSq = coordsToSquare(fr2, col);
          moves.push({
            from: fromSq,
            to: toSq,
            piece: piece,
            captured: null,
            isDrop: false,
            promotion: null,
            enPassantTarget: coordsToSquare(fr, col) // set en passant target
          });
        }
      }

      // Captures (diagonal)
      for (const dc of [-1, 1]) {
        const tc = col + dc;
        if (!isValidSquare(fr, tc)) continue;
        
        const target = state.board[fr][tc];
        
        // Normal capture
        if (target && target.color === opponent) {
          if (fr === promoRank) {
            for (const promoType of [QUEEN, ROOK, BISHOP, KNIGHT]) {
              moves.push({
                from: coordsToSquare(row, col),
                to: coordsToSquare(fr, tc),
                piece: piece,
                captured: target,
                isDrop: false,
                promotion: promoType
              });
            }
          } else {
            moves.push({
              from: coordsToSquare(row, col),
              to: coordsToSquare(fr, tc),
              piece: piece,
              captured: target,
              isDrop: false,
              promotion: null
            });
          }
        }
        
        // En passant
        if (state.enPassant && state.enPassant === coordsToSquare(fr, tc)) {
          const epRow = row; // the captured pawn is on row, not fr
          const capturedPawn = state.board[epRow][tc];
          moves.push({
            from: coordsToSquare(row, col),
            to: coordsToSquare(fr, tc),
            piece: piece,
            captured: capturedPawn,
            isDrop: false,
            promotion: null,
            isEnPassant: true
          });
        }
      }
      break;
  }

  return moves;
}

/**
 * Generate all drop moves (placing a piece from pocket onto empty square)
 */
function getDropMoves(state) {
  const moves = [];
  const pocket = state.pockets[state.activeColor];
  const promoRank = state.activeColor === WHITE ? 5 : 0;
  const homeRank = state.activeColor === WHITE ? 0 : 5;

  for (let i = 0; i < pocket.length; i++) {
    const pieceType = pocket[i];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if (state.board[row][col] !== null) continue;
        
        // Pawn can't be dropped on promotion rank or home rank
        if (pieceType === PAWN && (row === promoRank || row === homeRank)) continue;

        moves.push({
          from: null, // drop has no from square
          to: coordsToSquare(row, col),
          pieceType: pieceType,
          pocketIndex: i,
          isDrop: true,
          promotion: null
        });
      }
    }
  }

  return moves;
}

/**
 * Execute a move on a cloned state, return the new state.
 * Does NOT validate legality — caller should use getLegalMoves + isMoveLegal.
 */
function applyMove(state, move) {
  const newState = cloneState(state);
  
  if (move.isDrop) {
    // Remove piece from pocket
    const pocket = newState.pockets[newState.activeColor];
    pocket.splice(move.pocketIndex, 1);

    // Place piece on board
    const { row, col } = squareToCoords(move.to);
    newState.board[row][col] = {
      type: move.pieceType,
      color: newState.activeColor
    };
  } else {
    const fromCoords = squareToCoords(move.from);
    const toCoords = squareToCoords(move.to);
    const piece = newState.board[fromCoords.row][fromCoords.col];

    // Handle en passant capture
    if (move.isEnPassant) {
      const epRow = fromCoords.row;
      const capturedPawn = newState.board[epRow][toCoords.col];
      if (capturedPawn) {
        // Captured pawn flips color and goes to capturer's pocket
        addToPocket(newState, newState.activeColor, capturedPawn.type);
        newState.board[epRow][toCoords.col] = null;
      }
    }

    // Handle normal capture
    if (move.captured && !move.isEnPassant) {
      // Captured piece flips color and goes to capturer's pocket
      addToPocket(newState, newState.activeColor, move.captured.type);
    }

    // Move the piece
    if (move.promotion) {
      newState.board[toCoords.row][toCoords.col] = {
        type: move.promotion,
        color: piece.color
      };
    } else {
      newState.board[toCoords.row][toCoords.col] = piece;
    }
    newState.board[fromCoords.row][fromCoords.col] = null;

    // Set en passant target for next move
    if (move.enPassantTarget) {
      newState.enPassant = move.enPassantTarget;
    } else {
      newState.enPassant = '-';
    }
  }

  // Switch active color
  newState.activeColor = newState.activeColor === WHITE ? BLACK : WHITE;
  
  // Increment move counters
  if (newState.activeColor === WHITE) {
    newState.fullMoves++;
  }

  // Store move in history
  newState.moveHistory.push(move);

  return newState;
}

function addToPocket(state, color, pieceType) {
  // Piece changes color when captured
  state.pockets[color].push(pieceType);
}

/**
 * Find the king position for a given color
 */
function findKing(state, color) {
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const piece = state.board[row][col];
      if (piece && piece.type === KING && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

/**
 * Check if a square is attacked by the opponent
 */
function isSquareAttacked(state, row, col, byColor) {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const piece = state.board[r][c];
      if (!piece || piece.color !== byColor) continue;
      
      // For each opponent piece, check if it can attack (row, col)
      const attacks = getRawAttacks(state, r, c, piece);
      if (attacks.some(([ar, ac]) => ar === row && ac === col)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get raw attack squares for a piece (not filtered for check)
 */
function getRawAttacks(state, row, col, piece) {
  const attacks = [];
  const color = piece.color;

  function addAttack(r, c) {
    if (isValidSquare(r, c)) attacks.push([r, c]);
  }

  switch (piece.type) {
    case KING:
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          addAttack(row + dr, col + dc);
        }
      }
      break;

    case QUEEN:
      slideAttacks([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);
      break;

    case ROOK:
      slideAttacks([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      break;

    case BISHOP:
      slideAttacks([[1, 1], [-1, -1], [1, -1], [-1, 1]]);
      break;

    case KNIGHT:
      for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        addAttack(row + dr, col + dc);
      }
      break;

    case PAWN:
      const forward = color === WHITE ? 1 : -1;
      addAttack(row + forward, col - 1);
      addAttack(row + forward, col + 1);
      break;
  }

  function slideAttacks(dirs) {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (isValidSquare(r, c)) {
        addAttack(r, c);
        if (state.board[r][c] !== null) break; // blocked by any piece
        r += dr;
        c += dc;
      }
    }
  }

  return attacks;
}

/**
 * Check if the current player is in check
 */
function isInCheck(state) {
  const king = findKing(state, state.activeColor);
  if (!king) return true; // king missing = technically in check
  const opponent = state.activeColor === WHITE ? BLACK : WHITE;
  return isSquareAttacked(state, king.row, king.col, opponent);
}

/**
 * Check if the current player is in checkmate
 */
function isCheckmate(state) {
  return isInCheck(state) && getAllLegalMoves(state).length === 0;
}

/**
 * Check if the current player is in stalemate
 */
function isStalemate(state) {
  return !isInCheck(state) && getAllLegalMoves(state).length === 0;
}

/**
 * Filter pseudo-legal moves to only legal ones (don't leave own king in check)
 */
function filterLegalMoves(state, moves) {
  return moves.filter(move => {
    const newState = applyMove(state, move);
    // After applying the move, check if OUR king (the one that just moved) is in check
    const ourColor = state.activeColor; // we just moved, so our color is the one that moved
    const opponent = ourColor === WHITE ? BLACK : WHITE;
    const king = findKing(newState, ourColor);
    if (!king) return false; // king captured = illegal
    return !isSquareAttacked(newState, king.row, king.col, opponent);
  });
}

/**
 * Get all legal moves for the current player
 */
function getAllLegalMoves(state) {
  const normalMoves = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const piece = state.board[row][col];
      if (piece && piece.color === state.activeColor) {
        normalMoves.push(...getPseudoLegalMoves(state, row, col));
      }
    }
  }

  const dropMoves = getDropMoves(state);

  const allPseudo = [...normalMoves, ...dropMoves];
  return filterLegalMoves(state, allPseudo);
}

/**
 * Check if a specific move is legal
 */
function isMoveLegal(state, move) {
  let newState;
  if (move.isDrop) {
    // Reconstruct the full move with pocket index
    const dropMoves = getDropMoves(state);
    const match = dropMoves.find(dm => 
      dm.to === move.to && dm.pieceType === move.pieceType
    );
    if (!match) return false;
    newState = applyMove(state, match);
  } else {
    const fromCoords = squareToCoords(move.from);
    const pseudoMoves = getPseudoLegalMoves(state, fromCoords.row, fromCoords.col);
    const match = pseudoMoves.find(m => 
      m.to === move.to && m.promotion === move.promotion
    );
    if (!match) return false;
    newState = applyMove(state, match);
  }

  const ourColor = state.activeColor;
  const opponent = ourColor === WHITE ? BLACK : WHITE;
  const king = findKing(newState, ourColor);
  if (!king) return false;
  return !isSquareAttacked(newState, king.row, king.col, opponent);
}

/**
 * Check for game over conditions
 */
function getGameResult(state) {
  const legalMoves = getAllLegalMoves(state);
  const inCheck = isInCheck(state);

  if (legalMoves.length === 0) {
    if (inCheck) {
      // Checkmate - current player loses
      return state.activeColor === WHITE ? 'black_wins' : 'white_wins';
    } else {
      // Stalemate - draw
      return 'draw';
    }
  }

  // Check for insufficient material (optional, simplified)
  // Could add more conditions here

  return null; // game continues
}

module.exports = {
  parseFen,
  toFen,
  cloneState,
  getPseudoLegalMoves,
  getDropMoves,
  getAllLegalMoves,
  isMoveLegal,
  applyMove,
  isInCheck,
  isCheckmate,
  isStalemate,
  getGameResult,
  findKing,
  isSquareAttacked,
  squareToCoords,
  coordsToSquare,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING
};