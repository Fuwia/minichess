/**
 * MiniChess Admin Panel Verification Suite
 * Tests:
 * 1. Admin access control (401 / 403)
 * 2. GET /api/admin/users default exclusion of guests from bannable list
 * 3. Guest accounts cannot be banned (POST /api/admin/users/:guestId/ban blocked)
 * 4. Ban / Unban for registered accounts (blocks login, blocks /api/me)
 * 5. Guest cleanup (inactivity & 0-games cleanup)
 * 6. Guest logout auto-cleanup for empty profiles
 * 7. Admin role toggle & safety (cannot demote self, cannot promote guest)
 * 8. Grant coins endpoint
 * 9. Admin stats, active games, recent matches, and broadcast endpoints
 */

const http = require('http');

async function runAdminTests() {
  console.log('=== Running MiniChess Admin Panel Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  process.env.PORT = '4568';
  process.env.NODE_ENV = 'test';
  const { getDb } = require('./server/db');
  await getDb();
  require('./server/server.js');
  await new Promise(resolve => setTimeout(resolve, 800));

  function assert(condition, message) {
    if (condition) {
      console.log('  [PASS]', message);
      passed++;
    } else {
      console.error('  [FAIL]', message);
      failed++;
    }
  }

  // Helper HTTP request
  function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const dataStr = body ? JSON.stringify(body) : null;
      const headers = {};
      if (dataStr) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(dataStr);
      }
      if (cookie) {
        headers['Cookie'] = cookie;
      }

      const req = http.request({
        hostname: '127.0.0.1',
        port: 4568,
        path,
        method,
        headers
      }, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(resData); } catch(e) { parsed = resData; }
          const setCookie = res.headers['set-cookie'];
          let cookieStr = null;
          if (setCookie && setCookie.length > 0) {
            cookieStr = setCookie[0].split(';')[0];
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, cookie: cookieStr });
        });
      });

      req.on('error', reject);
      if (dataStr) req.write(dataStr);
      req.end();
    });
  }

  // 1. Test unauthenticated / non-admin access
  console.log('--- Test Group 1: Access Control ---');
  const unauthRes = await request('GET', '/api/admin/users');
  assert(unauthRes.status === 401, 'Unauthenticated GET /api/admin/users returns 401');

  // Register a normal non-admin user
  const normalUserNum = Math.floor(1000 + Math.random() * 9000);
  const normalReg = await request('POST', '/api/register', {
    username: `NormalUser_${normalUserNum}`,
    password: 'password123'
  });
  const normalCookie = normalReg.cookie;

  const normalAdminCheck = await request('GET', '/api/admin/users', null, normalCookie);
  assert(normalAdminCheck.status === 403, 'Non-admin user receives 403 on GET /api/admin/users');

  // 2. Setup an Admin User
  console.log('\n--- Test Group 2: Admin Session & Users Separation ---');
  // Register an admin user and promote them directly in the DB
  const auth = require('./server/auth');
  const { saveDb } = require('./server/db');
  const adminName = `Admin_${Math.floor(1000 + Math.random() * 9000)}`;
  const adminReg = await request('POST', '/api/register', {
    username: adminName,
    password: 'adminPassword123'
  });
  const adminCookie = adminReg.cookie;
  const adminUser = auth.getUserByUsername(adminName);
  auth.setAdminRole(adminUser.id, true);
  saveDb();

  const adminVerify = await request('GET', '/api/me/admin', null, adminCookie);
  assert(adminVerify.body.isAdmin === true, `Admin role successfully granted to ${adminName}`);

  // Create 3 guest accounts
  const guest1 = await request('POST', '/api/guest', {});
  const guest2 = await request('POST', '/api/guest', {});
  const guest3 = await request('POST', '/api/guest', {});
  assert(guest1.body.user.username.startsWith('Guest_'), 'Guest 1 created');
  assert(guest2.body.user.username.startsWith('Guest_'), 'Guest 2 created');
  assert(guest3.body.user.username.startsWith('Guest_'), 'Guest 3 created');

  // Fetch /api/admin/users with admin cookie
  const adminUsersRes = await request('GET', '/api/admin/users', null, adminCookie);
  assert(adminUsersRes.status === 200, 'Admin can fetch /api/admin/users');
  assert(adminUsersRes.body.success === true, 'Response has success: true');

  // Check default users array: MUST NOT contain Guest_ accounts!
  const hasGuestsInDefaultList = adminUsersRes.body.users.some(u => u.username.startsWith('Guest_'));
  assert(!hasGuestsInDefaultList, 'Default /api/admin/users does NOT contain Guest_ accounts (no clutter in bannable list)');

  // Check that registered users ARE in the list
  const hasAdminInList = adminUsersRes.body.users.some(u => u.id === adminUser.id);
  assert(hasAdminInList, 'Admin and registered users appear in the primary list');

  // Check that guests are provided separately in guestUsers array
  assert(Array.isArray(adminUsersRes.body.guestUsers), 'Response includes guestUsers array');
  const hasGuestInGuestArray = adminUsersRes.body.guestUsers.some(u => u.username === guest1.body.user.username);
  assert(hasGuestInGuestArray, 'Guest accounts are isolated in guestUsers array');

  // Check stats object
  assert(adminUsersRes.body.stats !== undefined, 'Response includes system stats');
  assert(adminUsersRes.body.stats.guestCount >= 3, `Guest count is reported accurately (${adminUsersRes.body.stats.guestCount})`);
  assert(adminUsersRes.body.stats.registeredCount >= 2, `Registered count reported accurately (${adminUsersRes.body.stats.registeredCount})`);

  // 3. Test Guest Ban Prevention ("banlanabilir olarak gözükmemeliler")
  console.log('\n--- Test Group 3: Guest Ban Prevention ---');
  const guest1Id = guest1.body.user.id;
  const banGuestRes = await request('POST', `/api/admin/users/${guest1Id}/ban`, { reason: 'Test Ban' }, adminCookie);
  assert(banGuestRes.body.success === false, 'POST /api/admin/users/:guestId/ban is rejected with success: false');
  assert(banGuestRes.body.message.includes('Misafir') || banGuestRes.body.message.includes('Guest'), 'Rejection message explains guests cannot be banned');

  // 4. Test Registered User Ban & Unban
  console.log('\n--- Test Group 4: Registered User Ban & Unban ---');
  const targetUserNum = Math.floor(1000 + Math.random() * 9000);
  const targetUsername = `Bannable_${targetUserNum}`;
  const targetPass = 'testpass123';
  const targetReg = await request('POST', '/api/register', { username: targetUsername, password: targetPass });
  const targetCookie = targetReg.cookie;
  const targetUser = auth.getUserByUsername(targetUsername);

  // Admin cannot ban their own account
  const selfBanRes = await request('POST', `/api/admin/users/${adminUser.id}/ban`, {}, adminCookie);
  assert(selfBanRes.body.success === false, 'Admin cannot ban self');

  // Ban target registered user
  const banRes = await request('POST', `/api/admin/users/${targetUser.id}/ban`, {
    reason: 'Cheating detected in ranked match'
  }, adminCookie);
  assert(banRes.body.success === true, `Admin banned ${targetUsername}`);

  // Target user tries to call /api/me with their active session
  const bannedMe = await request('GET', '/api/me', null, targetCookie);
  assert(bannedMe.body.user === null && bannedMe.body.banned === true, 'Banned user is ejected from /api/me with banned: true');

  // Target user tries to login again
  const bannedLogin = await request('POST', '/api/login', { username: targetUsername, password: targetPass });
  assert(bannedLogin.body.success === false && bannedLogin.body.banned === true, 'Banned user is prevented from logging in');
  assert(bannedLogin.body.message.includes('Cheating detected') || bannedLogin.body.message.includes('engellendi'), 'Login error reflects ban reason');

  // Admin unbans user
  const unbanRes = await request('POST', `/api/admin/users/${targetUser.id}/unban`, {}, adminCookie);
  assert(unbanRes.body.success === true, `Admin unbanned ${targetUsername}`);

  // User can now log in
  const unbannedLogin = await request('POST', '/api/login', { username: targetUsername, password: targetPass });
  assert(unbannedLogin.body.success === true, 'Unbanned user logs in successfully');

  // 5. Test Guest Cleanup & Auto-Cleanup on Logout
  console.log('\n--- Test Group 5: Guest Cleanup Tools ---');
  // Initial guest count
  const preCleanupRes = await request('GET', '/api/admin/users?type=all', null, adminCookie);
  const preGuests = preCleanupRes.body.guestUsers.length;
  assert(preGuests >= 3, `Pre-cleanup guest count: ${preGuests}`);

  // Run cleanup-guests (emptyOnly: true)
  const cleanupRes = await request('POST', '/api/admin/cleanup-guests', { emptyOnly: true }, adminCookie);
  assert(cleanupRes.body.success === true, 'POST /api/admin/cleanup-guests succeeds');
  assert(cleanupRes.body.deletedCount >= 3, `Cleaned up ${cleanupRes.body.deletedCount} empty guest profiles`);

  const postCleanupRes = await request('GET', '/api/admin/users?type=all', null, adminCookie);
  assert(postCleanupRes.body.guestUsers.length < preGuests, 'Guest count decreased after cleanup');

  // Test guest logout auto-cleanup:
  const freshGuest = await request('POST', '/api/guest', {});
  const freshGId = freshGuest.body.user.id;
  const freshGCookie = freshGuest.cookie;
  assert(auth.getUserById(freshGId) !== null, 'Fresh guest exists before logout');

  // Guest logs out without playing games
  const guestLogoutRes = await request('POST', '/api/logout', {}, freshGCookie);
  assert(guestLogoutRes.status === 200, 'Guest logged out');
  assert(auth.getUserById(freshGId) === null, 'Empty guest profile was automatically cleaned up on logout');

  // 6. Test Admin Role Toggle & Coin Grant
  console.log('\n--- Test Group 6: Toggle Admin & Grant Coins ---');
  // Toggle admin for targetUser
  const toggleRes = await request('POST', `/api/admin/users/${targetUser.id}/toggle-admin`, {}, adminCookie);
  assert(toggleRes.body.success === true && toggleRes.body.isAdmin === true, 'Target user promoted to admin');

  const demoteRes = await request('POST', `/api/admin/users/${targetUser.id}/toggle-admin`, {}, adminCookie);
  assert(demoteRes.body.success === true && demoteRes.body.isAdmin === false, 'Target user demoted back to normal user');

  // Grant coins
  const initialCoins = auth.getUserById(targetUser.id).coins || 0;
  const grantCoinsRes = await request('POST', `/api/admin/users/${targetUser.id}/grant-coins`, { amount: 500 }, adminCookie);
  assert(grantCoinsRes.body.success === true, 'POST /api/admin/users/:id/grant-coins succeeded');
  assert(grantCoinsRes.body.coins === initialCoins + 500, `Coins increased to ${initialCoins + 500}`);

  // 7. System Stats, Games & Broadcast
  console.log('\n--- Test Group 7: Stats, Active Games, Broadcast ---');
  const statsRes = await request('GET', '/api/admin/stats', null, adminCookie);
  assert(statsRes.body.success === true, 'GET /api/admin/stats succeeded');
  assert(typeof statsRes.body.stats.uptimeSeconds === 'number', 'Uptime reported in stats');
  assert(typeof statsRes.body.stats.totalGamesCount === 'number', 'Accurate totalGamesCount in stats');
  assert(typeof statsRes.body.stats.emptyGuestCount === 'number', 'emptyGuestCount reported in stats');

  // Verify totalGamesCount and guest breakdown are also in GET /api/admin/users
  const usersWithStats = await request('GET', '/api/admin/users', null, adminCookie);
  assert(typeof usersWithStats.body.stats.totalGamesCount === 'number', 'GET /api/admin/users stats includes totalGamesCount');
  assert(typeof usersWithStats.body.stats.emptyGuestCount === 'number', 'GET /api/admin/users stats includes emptyGuestCount');

  const activeGamesRes = await request('GET', '/api/admin/games/active', null, adminCookie);
  assert(activeGamesRes.body.success === true && Array.isArray(activeGamesRes.body.games), 'GET /api/admin/games/active returns games array');

  const recentGamesRes = await request('GET', '/api/admin/games/recent', null, adminCookie);
  assert(recentGamesRes.body.success === true && Array.isArray(recentGamesRes.body.games), 'GET /api/admin/games/recent returns games array');

  const broadcastRes = await request('POST', '/api/admin/broadcast', {
    message: 'Test system announcement',
    type: 'warning'
  }, adminCookie);
  assert(broadcastRes.body.success === true, 'POST /api/admin/broadcast succeeded');

  // 8. Guest Session Reuse on Gir-Çık
  console.log('\n--- Test Group 8: Guest Session Reuse & Gir-Çık Proliferation Prevention ---');
  const initialUserCount = auth.getAllUsers().length;
  // First visit creates a guest
  const gVisit1 = await request('POST', '/api/guest', {});
  const gUsername = gVisit1.body.user.username;
  const gId = gVisit1.body.user.id;
  assert(auth.getAllUsers().length === initialUserCount + 1, 'First guest visit increments user count');

  // User leaves, comes back and enters with existing guest username (re-entering)
  const gVisit2 = await request('POST', '/api/guest', { username: gUsername });
  assert(gVisit2.body.success === true, 'Re-entering guest request succeeds');
  assert(gVisit2.body.user.id === gId, 'Re-entering guest preserves existing user ID');
  assert(gVisit2.body.user.username === gUsername, 'Re-entering guest preserves existing username');
  assert(auth.getAllUsers().length === initialUserCount + 1, 'Re-entering as guest did NOT create a duplicate profile in database');

  // 9. Registering Account Cleans Up Empty Guest
  console.log('\n--- Test Group 9: Registering / Login Cleans Up Empty Guest Profile ---');
  const tempGuest = await request('POST', '/api/guest', {});
  const tempGuestId = tempGuest.body.user.id;
  const tempGuestCookie = tempGuest.cookie;
  assert(auth.getUserById(tempGuestId) !== null, 'Temporary guest exists before registering');

  // Register while holding guest cookie
  const regNum = Math.floor(1000 + Math.random() * 9000);
  const convUserReg = await request('POST', '/api/register', {
    username: `Converted_${regNum}`,
    password: 'password123'
  }, tempGuestCookie);
  assert(convUserReg.body.success === true, 'Registration succeeded');
  assert(auth.getUserById(tempGuestId) === null, 'Prior empty guest profile was purged upon user registration');

  // 10. Guest Protection on XP, Coins, Battlepass & olderThanMinutes Cleanup
  console.log('\n--- Test Group 10: Admin Action Guards on Guests & Time-Filtered Cleanup ---');
  const freshGuestForGuards = await request('POST', '/api/guest', {});
  const guardGuestId = freshGuestForGuards.body.user.id;

  const xpGuestRes = await request('POST', `/api/admin/users/${guardGuestId}/grant-xp`, { amount: 100 }, adminCookie);
  assert(xpGuestRes.body.success === false, 'POST /api/admin/users/:guestId/grant-xp is rejected');

  const coinsGuestRes = await request('POST', `/api/admin/users/${guardGuestId}/grant-coins`, { amount: 100 }, adminCookie);
  assert(coinsGuestRes.body.success === false, 'POST /api/admin/users/:guestId/grant-coins is rejected');

  const bpGuestRes = await request('POST', `/api/admin/users/${guardGuestId}/reset-battlepass`, {}, adminCookie);
  assert(bpGuestRes.body.success === false, 'POST /api/admin/users/:guestId/reset-battlepass is rejected');

  // Cleanup with olderThanMinutes
  const timeCleanup = await request('POST', '/api/admin/cleanup-guests', {
    emptyOnly: true,
    olderThanMinutes: 30
  }, adminCookie);
  assert(timeCleanup.body.success === true, 'POST /api/admin/cleanup-guests with olderThanMinutes succeeds');

  // 11. Guest Stats Reset Protection, Deletion & Dual Game Replay Lookup
  console.log('\n--- Test Group 11: Stats Protection, Deletion & Dual Game Lookup ---');
  // Attempt to reset stats of guest
  const guestStatsRes = await request('POST', `/api/admin/users/${guardGuestId}/reset-stats`, {}, adminCookie);
  assert(guestStatsRes.body.success === false, 'POST /api/admin/users/:guestId/reset-stats is rejected for guests');

  // Reset stats of registered user
  const regStatsRes = await request('POST', `/api/admin/users/${targetUser.id}/reset-stats`, {}, adminCookie);
  assert(regStatsRes.body.success === true, 'POST /api/admin/users/:userId/reset-stats succeeds for registered users');

  // Delete user
  const deleteUserRes = await request('DELETE', `/api/admin/users/${guardGuestId}`, null, adminCookie);
  assert(deleteUserRes.body.success === true, 'DELETE /api/admin/users/:userId succeeds');
  assert(auth.getUserById(guardGuestId) === null, 'Deleted user is purged from database');

  // Verify GET /api/games/:gameUuid works with integer ID
  const testDb = await getDb();
  const testGameStmt = testDb.prepare("SELECT id, game_uuid FROM games LIMIT 1");
  if (testGameStmt.step()) {
    const gRow = testGameStmt.getAsObject();
    testGameStmt.free();
    const gameByIdRes = await request('GET', `/api/games/${gRow.id}`);
    assert(gameByIdRes.status === 200 && gameByIdRes.body.success === true, 'GET /api/games/:id resolves game by numeric ID');
    if (gRow.game_uuid) {
      const gameByUuidRes = await request('GET', `/api/games/${gRow.game_uuid}`);
      assert(gameByUuidRes.status === 200 && gameByUuidRes.body.success === true, 'GET /api/games/:uuid resolves game by UUID');
    }
  } else {
    testGameStmt.free();
  }

  console.log(`\nAdmin Suite Complete: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAdminTests().catch(err => {
  console.error('Fatal admin test runner error:', err);
  process.exit(1);
});
