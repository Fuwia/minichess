/**
 * Socket.IO client initialization for MiniChess
 */

let socket = null;

function getActiveGuestName() {
  try {
    if (typeof getGuestSession === 'function') {
      const g = getGuestSession();
      if (g && g.username && (g.isGuest || g.username.startsWith('Guest_'))) {
        return g.username;
      }
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.currentUser && window.currentUser.username) {
      if (window.currentUser.isGuest || window.currentUser.username.startsWith('Guest_')) {
        return window.currentUser.username;
      }
    }
  } catch (e) {}
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('minichess_guest');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.username && (parsed.isGuest || parsed.username.startsWith('Guest_'))) {
          return parsed.username;
        }
      }
    }
  } catch (e) {}
  return null;
}

function initSocket(user) {
  const gName = (user && user.username && (user.isGuest || user.username.startsWith('Guest_')))
    ? user.username
    : getActiveGuestName();

  // If socket object already exists
  if (socket) {
    if (gName) {
      if (!socket.auth) socket.auth = {};
      socket.auth.guestUsername = gName;
      if (socket.connected) {
        socket.emit('authenticate', { guestUsername: gName });
      } else {
        socket.once('connect', () => {
          socket.emit('authenticate', { guestUsername: getActiveGuestName() || gName });
        });
      }
    }
    return socket;
  }

  socket = io({
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: {
      guestUsername: gName
    },
    query: {
      guestUsername: gName || ''
    }
  });

  // Intercept socket.emit to automatically enrich payloads with guestUsername for guest players
  const origEmit = socket.emit.bind(socket);
  socket.emit = function(event, ...args) {
    const curGName = getActiveGuestName();
    if (curGName) {
      if (args.length === 0) {
        args.push({ guestUsername: curGName });
      } else if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        if (!args[0].guestUsername) {
          args[0].guestUsername = curGName;
        }
      }
    }
    return origEmit(event, ...args);
  };

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    const curGuestName = getActiveGuestName();
    if (curGuestName) {
      if (!socket.auth) socket.auth = {};
      socket.auth.guestUsername = curGuestName;
      socket.emit('authenticate', { guestUsername: curGuestName });
    }
  });

  socket.on('authenticated', (data) => {
    console.log('[Socket] Authenticated:', data);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('auth_required', (data) => {
    console.warn('[Socket] Auth required:', data.message);
    const curGuestName = getActiveGuestName();
    if (curGuestName) {
      socket.emit('authenticate', { guestUsername: curGuestName });
    }
  });

  socket.on('banned', (data) => {
    console.warn('[Socket] Account banned:', data);
    alert(data.reason || 'Hesabınız yönetici tarafından engellenmiştir.');
    try {
      if (typeof clearGuestSession === 'function') clearGuestSession();
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = 'index.html';
  });

  socket.on('system_announcement', (data) => {
    console.log('[System Announcement]', data);
    if (typeof showToast === 'function') {
      showToast('📢 ' + data.message, data.type || 'info');
    } else {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #374151;z-index:99999;font-weight:600;font-size:14px;';
      banner.textContent = '📢 ' + data.message;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 6000);
    }
  });

  return socket;
}