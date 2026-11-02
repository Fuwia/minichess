/**
 * MiniChess — Auth & Guest Session Manager
 * Handles user auth, guest mode persistence, badges, and guest restriction prompts.
 */

const GUEST_STORAGE_KEY = 'minichess_guest';

function getGuestHeader() {
  const g = getGuestSession();
  return (g && g.username && (g.isGuest || g.username.startsWith('Guest_'))) ? g.username : null;
}

async function apiPost(url, data) {
  const headers = { 'Content-Type': 'application/json' };
  const gUser = getGuestHeader();
  if (gUser) headers['x-guest-username'] = gUser;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  return res.json();
}

async function apiGet(url) {
  const headers = {};
  const gUser = getGuestHeader();
  if (gUser) headers['x-guest-username'] = gUser;
  const res = await fetch(url, { headers });
  return res.json();
}

function getGuestSession() {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.isGuest || (parsed.username && parsed.username.startsWith('Guest_')))) {
        return parsed;
      }
    }
  } catch (e) {}
  return null;
}

function isGuest() {
  const g = getGuestSession();
  return !!(g && (g.isGuest || (g.username && g.username.startsWith('Guest_'))));
}

function clearGuestSession() {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch (e) {}
}

async function createGuestSession(forceNew = false) {
  // If already logged in as a registered user, do not create a guest session
  try {
    const me = await apiGet('/api/me');
    if (me && me.user && !me.user.isGuest && !(me.user.username && me.user.username.startsWith('Guest_'))) {
      clearGuestSession();
      return me.user;
    }
  } catch (e) {}

  // Reuse existing guest session if present to prevent opening new profiles on every visit
  if (!forceNew) {
    const existing = getGuestSession();
    if (existing && existing.username && existing.username.startsWith('Guest_')) {
      try {
        const res = await apiPost('/api/guest', { username: existing.username });
        if (res && res.success && res.user) {
          const fullGuest = { ...existing, ...res.user, isGuest: true };
          try {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(fullGuest));
          } catch (e) {}
          return fullGuest;
        }
      } catch (e) {}
    }
  }

  // Generate random 4-digit number: Guest_XXXX
  const guestNumber = Math.floor(1000 + Math.random() * 9000);
  const guestUser = {
    username: `Guest_${guestNumber}`,
    elo: 1200,
    isGuest: true,
    wins: 0,
    losses: 0,
    draws: 0,
    coins: 0,
    board_theme: 'default',
    win_effect: 'none',
    username_color: ''
  };

  // Synchronize with server session
  try {
    const res = await apiPost('/api/guest', { username: guestUser.username });
    if (res && res.success && res.user) {
      const fullGuest = { ...guestUser, ...res.user, isGuest: true };
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(fullGuest));
      } catch (e) {}
      return fullGuest;
    } else {
      // Server rejected (e.g. 400 Already logged in)
      clearGuestSession();
      const cur = await apiGet('/api/me');
      if (cur && cur.user && !cur.user.isGuest) {
        return cur.user;
      }
      return null;
    }
  } catch (e) {
    console.warn('Backend guest registration offline, continuing with local guest session:', e);
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestUser));
    } catch (err) {}
    return guestUser;
  }
}

async function register(username, password) {
  const res = await apiPost('/api/register', { username, password });
  if (res && res.success) {
    clearGuestSession();
    if (res.user) window.currentUser = { ...res.user, isGuest: false };
  }
  return res;
}

async function login(username, password) {
  const res = await apiPost('/api/login', { username, password });
  if (res && res.success) {
    clearGuestSession();
    if (res.user) window.currentUser = { ...res.user, isGuest: false };
  }
  return res;
}

async function logout() {
  clearGuestSession();
  try {
    await apiPost('/api/logout', {});
  } catch (e) {}
  window.location.href = 'index.html';
}

async function getCurrentUser() {
  let user = null;
  try {
    const data = await apiGet('/api/me');
    if (data && data.user) {
      user = data.user;
    }
  } catch (e) {}

  // If currently active server session belongs to a registered user:
  if (user && !user.isGuest && !(user.username && user.username.startsWith('Guest_'))) {
    clearGuestSession();
    user.isGuest = false;
    window.currentUser = user;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('is-guest');
    }
    return user;
  }

  const localGuest = getGuestSession();
  if (localGuest) {
    if (!user) {
      // Re-establish guest session on the server so that session cookie & userId exist
      try {
        const guestRes = await apiPost('/api/guest', { username: localGuest.username });
        if (guestRes && guestRes.success && guestRes.user) {
          user = { ...localGuest, ...guestRes.user, isGuest: true };
          try {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(user));
          } catch (e) {}
        } else {
          // If server rejected (e.g. user is registered user), clear guest session!
          clearGuestSession();
          const meAgain = await apiGet('/api/me');
          if (meAgain && meAgain.user && !meAgain.user.isGuest) {
            user = meAgain.user;
            user.isGuest = false;
            window.currentUser = user;
            if (typeof document !== 'undefined' && document.body) {
              document.body.classList.remove('is-guest');
            }
            return user;
          }
          user = null;
        }
      } catch (e) {
        user = localGuest;
      }
    } else {
      user.isGuest = true;
    }
  } else if (user && (user.isGuest || (user.username && user.username.startsWith('Guest_')))) {
    user.isGuest = true;
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  if (user) {
    window.currentUser = user;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('is-guest', !!user.isGuest);
    }
  }

  return user;
}

async function requireAuth(options = { allowGuest: true }) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  if (options && options.allowGuest === false && (user.isGuest || isGuest())) {
    promptGuestCreateAccount(options.message);
    return null;
  }
  return user;
}

/**
 * Guest restriction modal prompt (for Shop, Battlepass, etc.)
 */
function promptGuestCreateAccount(customMessage) {
  const currentLang = (typeof window.getLang === 'function') ? window.getLang() : 'en';
  const title = (typeof window.t === 'function') ? window.t('guest_prompt_title', 'Guest Mode') : 'Guest Mode';
  const defaultMsg = currentLang === 'tr'
    ? 'İlerlemenizi kaydetmek ve tüm ödüllere erişmek için lütfen bir hesap oluşturun!'
    : 'Please create an account to save your progress and claim rewards!';
  const message = customMessage || defaultMsg;
  const createText = (typeof window.t === 'function') ? window.t('guest_create_account', 'Create Account') : 'Create Account';
  const cancelText = (typeof window.t === 'function') ? window.t('cancel', 'Cancel') : 'Cancel';

  let modal = document.getElementById('guestPromptModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'guestPromptModal';
    modal.className = 'guest-prompt-modal-backdrop';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  modal.innerHTML = `
    <div class="guest-prompt-card" onclick="event.stopPropagation()">
      <div class="guest-prompt-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
      </div>
      <h3 class="guest-prompt-title">${title}</h3>
      <p class="guest-prompt-desc">${message}</p>
      <div class="guest-prompt-actions">
        <button type="button" class="guest-prompt-btn-secondary" onclick="document.getElementById('guestPromptModal').classList.remove('active')">${cancelText}</button>
        <a href="register.html" class="guest-prompt-btn-primary" onclick="try{sessionStorage.setItem('redirectAfterLogin',window.location.href);}catch(e){}">${createText}</a>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

/**
 * Render sleek guest badges and sidebar Create Account button
 */
function renderGuestBadges(user) {
  const activeUser = user || (typeof currentUser !== 'undefined' ? currentUser : null) || window.currentUser;
  let isGuestUser = false;
  if (activeUser) {
    if (activeUser.username && !activeUser.username.startsWith('Guest_') && activeUser.isGuest !== true) {
      isGuestUser = false;
      clearGuestSession();
    } else {
      isGuestUser = !!(activeUser.isGuest || (activeUser.username && activeUser.username.startsWith('Guest_')));
    }
  } else {
    isGuestUser = isGuest();
  }

  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.toggle('is-guest', isGuestUser);
  }

  const currentLang = (typeof window.getLang === 'function') ? window.getLang() : 'en';
  const badgeLabel = currentLang === 'tr' ? 'MİSAFİR' : 'GUEST';
  const lockTitle = currentLang === 'tr' ? 'Giriş yaparsan erişebilirsin' : 'Log in to access';

  // Target elements to attach guest badges
  const targets = [
    document.getElementById('sidebarUsername'),
    document.getElementById('heroUsername'),
    document.getElementById('playerName'),
    document.getElementById('profileUsername')
  ];

  targets.forEach(el => {
    if (!el) return;
    let badge = el.parentElement ? el.parentElement.querySelector('.guest-badge') : null;
    if (isGuestUser) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'guest-badge';
        badge.setAttribute('data-i18n', 'badge_guest');
        if (el.nextSibling) {
          el.parentNode.insertBefore(badge, el.nextSibling);
        } else {
          el.parentNode.appendChild(badge);
        }
      }
      badge.textContent = badgeLabel;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.remove ? badge.remove() : (badge.style.display = 'none');
    }
  });

  // Sidebar "Create Account" button next to Sign Out
  const guestCreateAccBtns = document.querySelectorAll('#guestCreateAccBtn, .guest-create-acc-btn');
  guestCreateAccBtns.forEach(btn => {
    btn.style.display = isGuestUser ? 'inline-flex' : 'none';
  });

  // Lock / Unlock guest-restricted navigation items: Battlepass, Shop, Profile
  // Targets sidebar nav IDs as well as any anchors pointing to battlepass, shop, or profile
  const restrictedLinks = new Set();
  ['navBattlepass', 'navShop', 'navProfile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) restrictedLinks.add(el);
  });
  if (typeof document.querySelectorAll === 'function') {
    try {
      const qLinks = document.querySelectorAll(
        '#navBattlepass, #navShop, #navProfile, a[href*="battlepass.html"], a[href*="shop.html"], a[href*="profile.html"]'
      );
      if (qLinks && qLinks.forEach) {
        qLinks.forEach(el => restrictedLinks.add(el));
      }
    } catch (e) {}
  }

  restrictedLinks.forEach(navEl => {
    if (!navEl) return;

    if (isGuestUser) {
      navEl.classList.add('guest-locked');
      navEl.setAttribute('data-guest-locked', 'true');
      navEl.setAttribute('title', lockTitle);
      navEl.setAttribute('aria-disabled', 'true');

      let indicator = navEl.querySelector('.guest-lock-indicator');
      const isSidebarNav = typeof navEl.closest === 'function' ? navEl.closest('.sidebar-nav') : false;
      const isBento = navEl.classList && navEl.classList.contains && navEl.classList.contains('bento-action-link');
      const isNavId = navEl.id && navEl.id.startsWith && navEl.id.startsWith('nav');
      if (!indicator && (isBento || isSidebarNav || isNavId)) {
        indicator = document.createElement('span');
        indicator.className = 'guest-lock-indicator';
        indicator.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        navEl.appendChild(indicator);
      }
    } else {
      navEl.classList.remove('guest-locked');
      navEl.removeAttribute('data-guest-locked');
      navEl.removeAttribute('title');
      navEl.removeAttribute('aria-disabled');
      const indicator = navEl.querySelector('.guest-lock-indicator');
      if (indicator) indicator.remove();
    }
  });
}

/**
 * Render access restriction message for guest users on Battlepass, Shop, and Profile pages
 */
function renderGuestRestriction(target, pageType) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const currentLang = (typeof window.getLang === 'function') ? window.getLang() : 'en';
  const title = (typeof window.t === 'function')
    ? window.t('guest_restricted_title', 'Giriş yaparsan erişebilirsin')
    : (currentLang === 'tr' ? 'Giriş yaparsan erişebilirsin' : 'Log in to access');
  const desc = (typeof window.t === 'function')
    ? window.t('guest_restricted_desc', 'Bu sayfaya erişebilmek ve özelliklerinden faydalanabilmek için lütfen giriş yapın veya yeni bir hesap oluşturun.')
    : (currentLang === 'tr' ? 'Savaş Bileti, Mağaza ve Profil sayfalarına erişmek için giriş yapmanız gerekmektedir. Şimdi giriş yapın veya ücretsiz hesap oluşturun!' : 'You must log in to access this page.');
  const loginText = currentLang === 'tr' ? 'Giriş Yap' : 'Log In';
  const createText = (typeof window.t === 'function') ? window.t('create_account', 'Hesap Oluştur') : (currentLang === 'tr' ? 'Hesap Oluştur' : 'Create Account');
  const lobbyText = (typeof window.t === 'function') ? window.t('back_to_lobby', 'Lobiye Dön') : (currentLang === 'tr' ? 'Lobiye Dön' : 'Back to Lobby');

  container.innerHTML = `
    <div class="guest-restricted-wrapper">
      <div class="guest-restricted-card">
        <div class="guest-restricted-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 class="guest-restricted-title">${title}</h2>
        <p class="guest-restricted-desc">${desc}</p>
        <div class="guest-restricted-actions">
          <a href="index.html" class="guest-restricted-btn-primary" onclick="try{sessionStorage.setItem('redirectAfterLogin',window.location.href);}catch(e){}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
            ${loginText}
          </a>
          <a href="register.html" class="guest-restricted-btn-accent" onclick="try{sessionStorage.setItem('redirectAfterLogin',window.location.href);}catch(e){}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
            ${createText}
          </a>
          <a href="lobby.html" class="guest-restricted-btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            ${lobbyText}
          </a>
        </div>
      </div>
    </div>
  `;
}

// Global click & auxclick interceptor: block clicking on guest-locked navigation items
if (typeof document !== 'undefined') {
  function handleGuestInterception(e) {
    const lockedLink = e.target.closest(
      '.guest-locked, [data-guest-locked="true"], a[href*="battlepass.html"], a[href*="shop.html"], a[href*="profile.html"]'
    );
    if (!lockedLink) return;

    let guestActive = false;
    const activeUser = (typeof currentUser !== 'undefined' ? currentUser : null) || window.currentUser;
    if (activeUser && activeUser.username && !activeUser.username.startsWith('Guest_') && activeUser.isGuest !== true) {
      guestActive = false;
    } else if (typeof isGuest === 'function' && isGuest()) {
      guestActive = true;
    } else if (lockedLink.classList.contains('guest-locked') || lockedLink.getAttribute('data-guest-locked') === 'true') {
      guestActive = true;
    } else if (document.body && document.body.classList.contains('is-guest')) {
      guestActive = true;
    }

    if (guestActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const currentLang = (typeof window.getLang === 'function') ? window.getLang() : 'en';
      const msg = (typeof window.t === 'function')
        ? window.t('guest_login_required', 'Giriş yaparsan erişebilirsin')
        : (currentLang === 'tr' ? 'Giriş yaparsan erişebilirsin' : 'Log in to access');
      if (typeof window.showToast === 'function') {
        window.showToast(msg, 'warning');
      }
      if (typeof window.promptGuestCreateAccount === 'function') {
        window.promptGuestCreateAccount(msg);
      }
      return false;
    }
  }

  document.addEventListener('click', handleGuestInterception, true);
  document.addEventListener('auxclick', handleGuestInterception, true);
}

/**
 * Competitive Rank Tier Helper
 * ELO thresholds:
 *   < 1100: Bronze (#cd7f32)
 *   1100 - 1299: Silver (#94a3b8)
 *   1300 - 1499: Gold (#fbbf24)
 *   1500 - 1799: Emerald (#10b981)
 *   1800+: Master (#a855f7)
 */
function getRankTier(elo) {
  let rating;
  if (elo === null || elo === undefined || elo === '') {
    rating = 1200;
  } else {
    const parsed = Number(elo);
    rating = Number.isFinite(parsed) ? parsed : 1200;
  }

  if (rating < 1100) {
    return { name: 'Bronze', color: '#cd7f32', icon: 'shield', min: 0, max: 1099 };
  } else if (rating < 1300) {
    return { name: 'Silver', color: '#94a3b8', icon: 'shield', min: 1100, max: 1299 };
  } else if (rating < 1500) {
    return { name: 'Gold', color: '#fbbf24', icon: 'shield', min: 1300, max: 1499 };
  } else if (rating < 1800) {
    return { name: 'Emerald', color: '#10b981', icon: 'shield', min: 1500, max: 1799 };
  } else {
    return { name: 'Master', color: '#a855f7', icon: 'crown', min: 1800, max: Infinity };
  }
}

function renderRankBadge(elo, options = {}) {
  const tier = getRankTier(elo);
  let rating;
  if (elo === null || elo === undefined || elo === '') {
    rating = 1200;
  } else {
    const parsed = Number(elo);
    rating = Number.isFinite(parsed) ? parsed : 1200;
  }
  const sizeClass = options.size ? ` ${options.size}` : '';
  const icon = tier.icon;

  const iconSvg = icon === 'crown'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="rank-badge-icon lucide lucide-crown" data-lucide="crown"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="rank-badge-icon lucide lucide-shield" data-lucide="shield"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`;

  return `<span class="rank-tier-badge rank-tier-${tier.name.toLowerCase()}${sizeClass}" style="--tier-color:${tier.color};">
    ${iconSvg}
    <span class="rank-badge-text"><span class="tier-name">${tier.name}</span> <span class="tier-sep">•</span> <span class="tier-elo">${rating}</span></span>
  </span>`;
}

if (typeof window !== 'undefined') {
  window.apiPost = apiPost;
  window.apiGet = apiGet;
  window.register = register;
  window.login = login;
  window.logout = logout;
  window.getCurrentUser = getCurrentUser;
  window.requireAuth = requireAuth;
  window.getGuestSession = getGuestSession;
  window.isGuest = isGuest;
  window.clearGuestSession = clearGuestSession;
  window.createGuestSession = createGuestSession;
  window.promptGuestCreateAccount = promptGuestCreateAccount;
  window.renderGuestBadges = renderGuestBadges;
  window.renderGuestRestriction = renderGuestRestriction;
  window.getRankTier = getRankTier;
  window.renderRankBadge = renderRankBadge;

  if (typeof window.showToast !== 'function') {
    window.showToast = function (message, type = 'info') {
      if (typeof document === 'undefined') return;
      const toast = document.createElement('div');
      toast.className = 'toast ' + (type || 'info');
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    apiPost,
    apiGet,
    register,
    login,
    logout,
    getCurrentUser,
    requireAuth,
    getGuestSession,
    isGuest,
    clearGuestSession,
    createGuestSession,
    promptGuestCreateAccount,
    renderGuestBadges,
    renderGuestRestriction,
    getRankTier,
    renderRankBadge
  };
}