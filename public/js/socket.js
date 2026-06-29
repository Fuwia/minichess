/**
 * Socket.IO client initialization for MiniChess
 */

let socket = null;

function initSocket() {
  if (socket && socket.connected) return;

  // Dynamically determine the backend URL based on the environment (local vs production)
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname === '' ||
                  window.location.protocol === 'file:';
  const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

  socket = io(serverUrl, {
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