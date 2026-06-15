/**
 * Board rendering helpers for MiniChess
 * Most board logic is inline in game.html since it interacts
 * directly with the DOM and game state.
 */

// Piece symbols for display
const PIECE_SYMBOLS = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

function getPieceSymbolDisplay(piece) {
  return PIECE_SYMBOLS[piece.type] || piece.type;
}