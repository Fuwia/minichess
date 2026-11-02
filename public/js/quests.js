/**
 * MiniChess Daily Quests Manager
 * Tracks daily quest progression in localStorage with date-based daily reset.
 * 
 * Quests:
 * 1. "Bugün 1 Maç Tamamla" (+100 XP)
 * 2. "Cepten 2 Taş Bırak (Crazyhouse Drop)" (+150 XP)
 * 3. "Bir Botu Mağlup Et" (+200 XP)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DailyQuests = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'minichess_daily_quests';

  function getTodayString() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getDefaultQuests() {
    return [
      {
        id: 1,
        titleKey: 'quest_1_title',
        descKey: 'quest_1_desc',
        defaultTitle: 'Bugün 1 Maç Tamamla',
        defaultDesc: 'En az 1 maçı tamamla',
        current: 0,
        target: 1,
        xp: 100,
        claimed: false
      },
      {
        id: 2,
        titleKey: 'quest_2_title',
        descKey: 'quest_2_desc',
        defaultTitle: 'Cepten 2 Taş Bırak (Crazyhouse Drop)',
        defaultDesc: 'Cepten tahtaya 2 adet taş yerleştir',
        current: 0,
        target: 2,
        xp: 150,
        claimed: false
      },
      {
        id: 3,
        titleKey: 'quest_3_title',
        descKey: 'quest_3_desc',
        defaultTitle: 'Bir Botu Mağlup Et',
        defaultDesc: 'Herhangi bir yapay zeka botuna karşı galip gel',
        current: 0,
        target: 1,
        xp: 200,
        claimed: false
      }
    ];
  }

  function loadData() {
    if (typeof localStorage === 'undefined') {
      return { date: getTodayString(), quests: getDefaultQuests() };
    }
    const today = getTodayString();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.date === today && Array.isArray(parsed.quests) && parsed.quests.length === 3) {
          return parsed;
        }
      }
    } catch (e) {}

    // Initialize fresh quests for today
    const fresh = { date: today, quests: getDefaultQuests() };
    saveData(fresh);
    return fresh;
  }

  function saveData(data) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function getQuests() {
    return loadData().quests;
  }

  function recordMatch(params) {
    const isWin = params && params.isWin;
    const isBot = params && params.isBot;
    const data = loadData();
    let changed = false;

    // Quest 1: "Bugün 1 Maç Tamamla"
    const q1 = data.quests.find(q => q.id === 1);
    if (q1 && q1.current < q1.target) {
      q1.current = Math.min(q1.target, q1.current + 1);
      changed = true;
    }

    // Quest 3: "Bir Botu Mağlup Et"
    if (isBot && isWin) {
      const q3 = data.quests.find(q => q.id === 3);
      if (q3 && q3.current < q3.target) {
        q3.current = Math.min(q3.target, q3.current + 1);
        changed = true;
      }
    }

    if (changed) {
      saveData(data);
    }
    return data.quests;
  }

  function recordDrop() {
    const data = loadData();
    const q2 = data.quests.find(q => q.id === 2);
    if (q2 && q2.current < q2.target) {
      q2.current = Math.min(q2.target, q2.current + 1);
      saveData(data);
    }
    return data.quests;
  }

  function claim(questId) {
    const data = loadData();
    const q = data.quests.find(item => item.id === Number(questId));
    if (!q) {
      return { success: false, message: 'Quest not found' };
    }
    if (q.current < q.target) {
      return { success: false, message: 'Quest not completed yet' };
    }
    if (q.claimed) {
      return { success: false, message: 'Reward already claimed' };
    }

    q.claimed = true;
    saveData(data);
    return { success: true, quest: q };
  }

  return {
    getTodayString,
    getQuests,
    recordMatch,
    recordDrop,
    claim
  };
});
