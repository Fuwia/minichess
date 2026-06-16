/**
 * Socket.IO client initialization for MiniChess
 */

let socket = null;

function initSocket() {
  if (socket && socket.connected) return;

  const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'http://194.146.47.167:3000';

  socket = io(socketUrl, {
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