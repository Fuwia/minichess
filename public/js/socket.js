/**
 * Socket.IO client initialization for MiniChess
 */

let socket = null;

function initSocket() {
  if (socket && socket.connected) return;

  socket = io({
    transports: ['websocket', 'polling'],
    withCredentials: true
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('auth_required', (data) => {
    console.warn('[Socket] Auth required:', data.message);
  });
}