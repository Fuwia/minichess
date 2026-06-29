/**
 * Auth helper functions for MiniChess
 */

// Dynamically determine the backend URL based on the environment (local vs production)
const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' || 
                window.location.hostname === '' ||
                window.location.protocol === 'file:';
const BACKEND_URL = isLocal ? 'http://localhost:3000' : 'https://minichess.xyz';

// Automatically intercept and rewrite relative /api/ requests to point to the correct backend host
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = BACKEND_URL + input;
    }
    return originalFetch(input, init);
  };
})();

async function apiPost(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function apiGet(url) {
  const res = await fetch(url);
  return res.json();
}

async function register(username, password) {
  return apiPost('/api/register', { username, password });
}

async function login(username, password) {
  return apiPost('/api/login', { username, password });
}

async function logout() {
  await apiPost('/api/logout', {});
  window.location.href = 'index.html';
}

async function getCurrentUser() {
  const data = await apiGet('/api/me');
  return data.user;
}