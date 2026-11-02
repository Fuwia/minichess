/**
 * Sound Manager for MiniChess
 * Preloads audio files and provides play() for game events.
 * Supports persistent mute preferences via localStorage ('minichess_sfx_muted'),
 * dynamic volume-2 / volume-x UI toggling, and synthetic Web Audio fallbacks
 * for match notifications and clock countdown alerts.
 */

const SoundManager = (function () {
  const sounds = {};
  const basePath = '/sounds/';
  const fileNames = ['move', 'capture', 'check', 'drop', 'gameover'];
  let muted = false;
  let volume = 0.8;
  let loaded = false;
  let audioCtx = null;

  try {
    if (typeof localStorage !== 'undefined') {
      muted = localStorage.getItem('minichess_sfx_muted') === 'true';
      const storedVol = localStorage.getItem('minichess_sfx_volume');
      if (storedVol !== null) {
        const parsed = parseFloat(storedVol);
        if (!isNaN(parsed)) {
          volume = parsed > 1 ? Math.min(parsed / 100, 1) : Math.max(0, parsed);
        }
      }
    }
  } catch (e) {
    muted = false;
    volume = 0.8;
  }

  function getAudioContext() {
    if (!audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          audioCtx = new AudioContextClass();
        } catch (e) {}
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function init() {
    if (loaded || typeof Audio === 'undefined') return;
    fileNames.forEach(name => {
      try {
        const audio = new Audio(basePath + name + '.mp3');
        audio.preload = 'auto';
        audio.volume = volume;
        sounds[name] = audio;
      } catch (e) {}
    });
    loaded = true;
  }

  /**
   * Synthesize tone using Web Audio API for match chimes and low time warnings.
   */
  function playTone(type) {
    if (muted || volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      if (type === 'match') {
        // Bright fanfare chime (C5 -> E5 -> G5)
        const notes = [
          { f: 523.25, t: 0, d: 0.18 },
          { f: 659.25, t: 0.12, d: 0.22 },
          { f: 783.99, t: 0.24, d: 0.45 }
        ];
        notes.forEach(n => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.f, now + n.t);
          gain.gain.setValueAtTime(0.25 * volume, now + n.t);
          gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.t);
          osc.stop(now + n.t + n.d + 0.05);
        });
      } else if (type === 'warning') {
        // Urgent alert for entering last 10 seconds (two distinct high beeps)
        [0, 0.14].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 0 ? 660 : 880, now + offset);
          gain.gain.setValueAtTime(0.28 * volume, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.13);
        });
      } else if (type === 'lowtime' || type === 'tick') {
        // Crisp clock countdown tick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.18 * volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
  }

  /**
   * Play a sound by name.
   * @param {'move'|'capture'|'check'|'drop'|'gameover'|'match'|'warning'|'lowtime'|'tick'} name
   */
  function play(name) {
    if (muted || volume <= 0) return;
    if (!loaded) init();

    if (name === 'match' || name === 'warning' || name === 'lowtime' || name === 'tick') {
      playTone(name);
      return;
    }

    const audio = sounds[name];
    if (!audio) return;

    try {
      audio.volume = volume;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  function toggleMute() {
    muted = !muted;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minichess_sfx_muted', muted ? 'true' : 'false');
      }
    } catch (e) {}
    updateUI();
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function setMuted(val) {
    muted = !!val;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minichess_sfx_muted', muted ? 'true' : 'false');
      }
    } catch (e) {}
    updateUI();
    return muted;
  }

  function getVolume() {
    return volume;
  }

  function getVolumePercent() {
    return Math.round(volume * 100);
  }

  function setVolume(val) {
    let num = parseFloat(val);
    if (isNaN(num)) return volume;
    if (num > 1) num = num / 100;
    num = Math.max(0, Math.min(1, num));
    volume = num;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minichess_sfx_volume', volume.toFixed(2));
      }
    } catch (e) {}

    if (volume > 0 && muted) {
      muted = false;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('minichess_sfx_muted', 'false');
        }
      } catch (e) {}
    } else if (volume === 0 && !muted) {
      muted = true;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('minichess_sfx_muted', 'true');
        }
      } catch (e) {}
    }

    Object.values(sounds).forEach(audio => {
      try { audio.volume = volume; } catch (e) {}
    });

    updateUI();
    return volume;
  }

  function updateUI() {
    if (typeof document === 'undefined') return;
    const isM = isMuted() || volume === 0;
    let iconName = 'volume-2';
    if (isM) {
      iconName = 'volume-x';
    } else if (volume <= 0.5) {
      iconName = 'volume-1';
    } else {
      iconName = 'volume-2';
    }

    const tooltip = isM
      ? (typeof window.t === 'function' ? window.t('unmute_sound', 'Sesi Aç') : 'Sesi Aç')
      : (typeof window.t === 'function' ? window.t('mute_sound', 'Sesi Kapat') : 'Sesi Kapat');

    const buttons = document.querySelectorAll(
      '#soundToggleBtn, #gameSoundToggleBtn, #lobbySoundToggleBtn, .sound-toggle-btn'
    );

    buttons.forEach(btn => {
      btn.setAttribute('title', tooltip);
      btn.setAttribute('aria-label', tooltip);
      btn.classList.toggle('is-muted', isM);

      // Update inner icon if present
      const icon = btn.querySelector('[data-lucide], i, svg');
      if (icon) {
        if (icon.tagName && icon.tagName.toLowerCase() === 'svg') {
          const iEl = document.createElement('i');
          iEl.setAttribute('data-lucide', iconName);
          if (icon.id) iEl.id = icon.id;
          icon.parentNode.replaceChild(iEl, icon);
        } else {
          icon.setAttribute('data-lucide', iconName);
        }
      }

      // Update text label if present
      const label = btn.querySelector('.sound-btn-label, #gameSoundLabel, #soundToggleText');
      if (label) {
        label.textContent = isM
          ? (typeof window.t === 'function' ? window.t('unmute', 'Sesi Aç') : 'Sesi Aç')
          : (typeof window.t === 'function' ? window.t('sound', 'Ses') : 'Ses');
      }
    });

    // Update volume range sliders
    const sliders = document.querySelectorAll(
      '#soundVolumeSlider, #gameVolumeSlider, #lobbyVolumeSlider, .sound-volume-slider'
    );
    sliders.forEach(slider => {
      slider.value = Math.round(volume * 100);
    });

    // Update volume percentage text badges
    const valLabels = document.querySelectorAll(
      '#soundVolumeVal, #gameVolumeVal, #lobbyVolumeVal, .sound-volume-val'
    );
    valLabels.forEach(lbl => {
      lbl.textContent = Math.round(volume * 100) + '%';
    });

    if (typeof window.lucide !== 'undefined' && window.lucide.createIcons) {
      try {
        window.lucide.createIcons();
      } catch (e) {}
    }
  }

  return { init, play, toggleMute, isMuted, setMuted, getVolume, setVolume, getVolumePercent, updateUI, playTone, getAudioContext };
})();

if (typeof window !== 'undefined') {
  window.SoundManager = SoundManager;
  window.toggleSoundMute = () => SoundManager.toggleMute();
  window.setSoundVolume = (v) => SoundManager.setVolume(v);
  window.getSoundVolume = () => SoundManager.getVolume();

  const unlockAudio = () => {
    try {
      const ctx = typeof SoundManager.getAudioContext === 'function' ? SoundManager.getAudioContext() : null;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}
    document.removeEventListener('click', unlockAudio, true);
    document.removeEventListener('keydown', unlockAudio, true);
    document.removeEventListener('touchstart', unlockAudio, true);
  };
  document.addEventListener('click', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);
  document.addEventListener('touchstart', unlockAudio, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SoundManager.updateUI());
  } else {
    SoundManager.updateUI();
  }
}

// Auto-init when script loads
SoundManager.init();