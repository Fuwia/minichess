/**
 * Battlepass System — Season 1 "Founders Season"
 * 
 * XP grants, tier progression, and title management.
 */
const { v4: uuidv4 } = require('uuid');

let db = null;

function setDb(database) {
  db = database;
}

// ==================== XP & Tier Logic ====================

/**
 * Grant XP to a user after a game.
 * @param {number} userId
 * @param {number} amount - XP amount to grant
 * @returns {{ leveledUp: boolean, newTier: number, unlockedTitle: string|null }}
 */
function grantXP(userId, amount) {
  if (!db) return { leveledUp: false, newTier: 0, unlockedTitle: null };

  // Ensure user has a battlepass row
  ensureUserBattlepass(userId);

  // Get current battlepass row
  const bp = getUserBattlepassRow(userId);
  let { xp, tier, season } = bp;
  const claimed = safeParse(bp.claimed_rewards, []);

  xp += amount;

  // Check if they've leveled up past the current tier
  const allTiers = getSeasonTiers(season);
  let newTier = tier;
  let unlockedTitle = null;

  for (const t of allTiers) {
    if (t.tier > newTier && xp >= t.xp_required) {
      newTier = t.tier;
    }
  }

  const leveledUp = newTier > tier;

  // If leveled up and new tier has a title, auto-unlock it
  if (leveledUp) {
    for (let t = tier + 1; t <= newTier; t++) {
      const tierDef = allTiers.find(td => td.tier === t);
      if (tierDef && tierDef.title) {
        unlockTitle(userId, tierDef.title, season, t);
        if (!unlockedTitle) {
          unlockedTitle = tierDef.title;
        }
      }
    }
  }

  // Update battlepass row
  const updateStmt = db.prepare(`
    UPDATE user_battlepass SET xp = ?, tier = ? WHERE user_id = ?
  `);
  updateStmt.run([xp, newTier, userId]);
  updateStmt.free();

  return { leveledUp, newTier, unlockedTitle };
}

/**
 * Ensure a user_battlepass row exists for this user.
 */
function ensureUserBattlepass(userId) {
  const stmt = db.prepare('SELECT id FROM user_battlepass WHERE user_id = ?');
  const row = stmt.getAsObject([userId]);
  stmt.free();

  if (!row.id) {
    const insert = db.prepare(`
      INSERT INTO user_battlepass (user_id, season, xp, tier, claimed_rewards)
      VALUES (?, 1, 0, 1, '[]')
    `);
    insert.run([userId]);
    insert.free();
  }
}

/**
 * Reset a user's battlepass progress to a clean slate.
 * Clears XP, tier, claimed rewards, unlocked titles, and equipped title.
 * Useful for testing tier progression from the admin panel.
 * @param {number} userId
 * @returns {{ success: boolean, message?: string }}
 */
function resetBattlepass(userId) {
  if (!db) return { success: false, message: 'Database not initialized' };

  ensureUserBattlepass(userId);

  // Reset battlepass progress
  const bpStmt = db.prepare(`
    UPDATE user_battlepass SET xp = 0, tier = 1, claimed_rewards = '[]' WHERE user_id = ?
  `);
  bpStmt.run([userId]);
  bpStmt.free();

  // Clear unlocked titles and equipped title on the user row
  const userStmt = db.prepare(`
    UPDATE users SET unlocked_titles = '[]', title = NULL WHERE id = ?
  `);
  userStmt.run([userId]);
  userStmt.free();

  return { success: true };
}

function getUserBattlepassRow(userId) {
  const stmt = db.prepare(`
    SELECT season, xp, tier, claimed_rewards FROM user_battlepass WHERE user_id = ?
  `);
  const row = stmt.getAsObject([userId]);
  stmt.free();
  return row;
}

/**
 * Get all tiers for a given season.
 */
function getSeasonTiers(season) {
  const stmt = db.prepare(`
    SELECT tier, xp_required, title FROM battlepass_tiers
    WHERE season = ? ORDER BY tier ASC
  `);
  const results = [];
  stmt.bind([season]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ==================== Claim System ====================

/**
 * Claim a tier reward (mark it as claimed so the UI shows it's been collected).
 * For now, rewards are the titles themselves — claiming acknowledges the unlock.
 */
function claimTierReward(userId, tierNumber) {
  const bp = getUserBattlepassRow(userId);
  if (!bp) return { success: false, message: 'No battlepass data' };

  const claimed = safeParse(bp.claimed_rewards, []);
  if (claimed.includes(tierNumber)) {
    return { success: false, message: 'Tier already claimed' };
  }

  // Can only claim tiers you've reached
  if (tierNumber > bp.tier) {
    return { success: false, message: 'Tier not yet reached' };
  }

  claimed.push(tierNumber);
  claimed.sort((a, b) => a - b);

  const updateStmt = db.prepare(`
    UPDATE user_battlepass SET claimed_rewards = ? WHERE user_id = ?
  `);
  updateStmt.run([JSON.stringify(claimed), userId]);
  updateStmt.free();

  return { success: true, claimed: claimed };
}

// ==================== Title Management ====================

function unlockTitle(userId, titleName, season, tier) {
  const user = getUserByIdRaw(userId);
  if (!user) return;

  const unlocked = safeParse(user.unlocked_titles, []);

  // Title internal ID (e.g., "s1_t5_Pioneer")
  const titleId = `s${season}_t${tier}_${titleName.replace(/\s+/g, '_')}`;

  // Avoid duplicates
  if (unlocked.some(t => t.id === titleId)) return;

  unlocked.push({ id: titleId, name: titleName, season, tier });

  const updateStmt = db.prepare(`
    UPDATE users SET unlocked_titles = ? WHERE id = ?
  `);
  updateStmt.run([JSON.stringify(unlocked), userId]);
  updateStmt.free();
}

function getUserByIdRaw(id) {
  const stmt = db.prepare('SELECT id, unlocked_titles FROM users WHERE id = ?');
  const row = stmt.getAsObject([id]);
  stmt.free();
  return row.id ? row : null;
}

/**
 * Get all titles a user has unlocked.
 */
function getUnlockedTitles(userId) {
  const user = getUserByIdRaw(userId);
  if (!user) return [];
  return safeParse(user.unlocked_titles, []);
}

/**
 * Set the user's currently equipped title.
 */
function setEquippedTitle(userId, titleId) {
  // Verify user owns this title
  const titles = getUnlockedTitles(userId);
  const title = titles.find(t => t.id === titleId);
  if (!title) {
    return { success: false, message: 'Title not unlocked' };
  }

  const stmt = db.prepare('UPDATE users SET title = ? WHERE id = ?');
  stmt.run([title.name, userId]);
  stmt.free();

  return { success: true, title: title.name };
}

/**
 * Remove equipped title (set to null).
 */
function clearEquippedTitle(userId) {
  const stmt = db.prepare('UPDATE users SET title = NULL WHERE id = ?');
  stmt.run([userId]);
  stmt.free();
  return { success: true };
}

/**
 * Get the user's current battlepass status for API responses.
 */
function getBattlepassStatus(userId) {
  ensureUserBattlepass(userId);
  const bp = getUserBattlepassRow(userId);
  const tiers = getSeasonTiers(bp.season || 1);

  // Find current tier definition and next tier
  const currentTier = tiers.find(t => t.tier === bp.tier) || tiers[0];
  const nextTier = tiers.find(t => t.tier === bp.tier + 1);

  const xpInCurrentTier = nextTier
    ? bp.xp - (currentTier ? currentTier.xp_required : 0)
    : 0;
  const xpNeededForNext = nextTier
    ? nextTier.xp_required - (currentTier ? currentTier.xp_required : 0)
    : 0;

  const claimed = safeParse(bp.claimed_rewards, []);

  return {
    season: bp.season,
    xp: bp.xp,
    tier: bp.tier,
    maxTier: tiers.length,
    xpInCurrentTier,
    xpNeededForNext,
    claimedRewards: claimed,
    tiers: tiers.map(t => ({
      tier: t.tier,
      xpRequired: t.xp_required,
      title: t.title,
      unlocked: t.tier <= bp.tier,
      claimed: claimed.includes(t.tier)
    }))
  };
}

// ==================== Helpers ====================

function safeParse(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

module.exports = {
  setDb,
  grantXP,
  resetBattlepass,
  claimTierReward,
  getBattlepassStatus,
  getUnlockedTitles,
  setEquippedTitle,
  clearEquippedTitle,
  getSeasonTiers
};
