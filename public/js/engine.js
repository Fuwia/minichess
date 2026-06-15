/**
 * Client-side MiniChess engine
 * Used for FEN parsing, move display, and legal move hints.
 * All validation is done server-side.
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
 * Parse a FEN string into a game state object
 */
function parseFen(fen) {
  const parts = fen.split(' ');
  if (parts.length < 5) {
    console.error('Invalid FEN:', fen);
    return null;
  }

  const boardPart = parts[0];
  const activeColor = parts[1] === 'w' ? 'white' : 'black';
  const castling = parts[2];
  const enPassant = parts[3];
  const pocketPart = parts[4];

  // FEN lists ranks from top (black side) to bottom (white side).
  // Reverse so board[0] = white's back rank.
  const ranks = boardPart.split('/').reverse();
  if (ranks.length !== 6) {
    console.error('Invalid FEN: expected 6 ranks, got', ranks.length);
    return null;
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
        board[row][col] = {
          type: ch.toLowerCase(),
          color: ch === ch.toUpperCase() ? WHITE : BLACK
        };
        col++;
      }
    }
  }

  let whitePocket = [];
  let blackPocket = [];

  if (pocketPart && pocketPart !== '-') {
    const pocketMatch = pocketPart.match(/^\[([^\]]*)\]\s*\/\s*\[([^\]]*)\]$/);
    if (pocketMatch) {
      whitePocket = pocketMatch[1] ? pocketMatch[1].split(',').map(s => s.trim()).filter(s => s) : [];
      blackPocket = pocketMatch[2] ? pocketMatch[2].split(',').map(s => s.trim()).filter(s => s) : [];
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
    isCheck: false,
    lastMove: null
  };
}

/**
 * Square to coordinates conversion
 */
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
 * Find king position for a given color
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
 * Get pseudo-legal moves for a piece at (row, col).
 * Used for showing move hints when a piece is clicked.
 */
function getLegalMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];

  const moves = [];
  const color = piece.color;
  const opponent = color === WHITE ? BLACK : WHITE;
  const forward = color === WHITE ? 1 : -1;
  const homeRank = color === WHITE ? 1 : 4;
  const promoRank = color === WHITE ? 5 : 0;

  function addMove(toRow, toCol) {
    if (!isValidSquare(toRow, toCol)) return false;
    const target = state.board[toRow][toCol];
    if (target && target.color === color) return false;
    moves.push({
      from: coordsToSquare(row, col),
      to: coordsToSquare(toRow, toCol),
      captured: target,
      isEnPassant: false,
      promotion: null
    });
    return !target;
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
      for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        addMove(row + dr, col + dc);
      }
      break;

    case PAWN:
      const fr = row + forward;
      // Forward
      if (isValidSquare(fr, col) && !state.board[fr][col]) {
        if (fr === promoRank) {
          for (const promoType of [QUEEN, ROOK, BISHOP, KNIGHT]) {
            moves.push({
              from: coordsToSquare(row, col),
              to: coordsToSquare(fr, col),
              captured: null,
              isEnPassant: false,
              promotion: promoType
            });
          }
        } else {
          addMove(fr, col);
        }
        // Double forward
        const fr2 = row + 2 * forward;
        if (row === homeRank && isValidSquare(fr2, col) && !state.board[fr2][col]) {
          moves.push({
            from: coordsToSquare(row, col),
            to: coordsToSquare(fr2, col),
            captured: null,
            isEnPassant: false,
            promotion: null
          });
        }
      }
      // Diagonal captures
      for (const dc of [-1, 1]) {
        const tc = col + dc;
        if (!isValidSquare(fr, tc)) continue;
        const target = state.board[fr][tc];
        if (target && target.color === opponent) {
          if (fr === promoRank) {
            for (const promoType of [QUEEN, ROOK, BISHOP, KNIGHT]) {
              moves.push({
                from: coordsToSquare(row, col),
                to: coordsToSquare(fr, tc),
                captured: target,
                isEnPassant: false,
                promotion: promoType
              });
            }
          } else {
            moves.push({
              from: coordsToSquare(row, col),
              to: coordsToSquare(fr, tc),
              captured: target,
              isEnPassant: false,
              promotion: null
            });
          }
        }
        // En passant
        if (state.enPassant && state.enPassant === coordsToSquare(fr, tc)) {
          const capturedPawn = state.board[row][tc];
          moves.push({
            from: coordsToSquare(row, col),
            to: coordsToSquare(fr, tc),
            captured: capturedPawn,
            isEnPassant: true,
            promotion: null
          });
        }
      }
      break;
  }

  return moves;
}