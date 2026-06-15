/**
 * Auth helper functions for MiniChess
 */

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