/**
 * Sound Manager for MiniChess
 * Preloads audio files and provides playSound() for game events.
 * 
 * Place these MP3 files in public/sounds/:
 *   move.mp3, capture.mp3, check.mp3, drop.mp3, gameover.mp3
 */

const SoundManager = (function () {
  const sounds = {};
  const basePath = '/sounds/';
  const fileNames = ['move', 'capture', 'check', 'drop', 'gameover'];
  let muted = false;
  let loaded = false;

  function init() {
    if (loaded) return;
    fileNames.forEach(name => {
      const audio = new Audio(basePath + name + '.mp3');
      audio.preload = 'auto';
      audio.volume = 0.5;
      sounds[name] = audio;
    });
    loaded = true;
  }

  /**
   * Play a sound by name.
   * @param {'move'|'capture'|'check'|'drop'|'gameover'} name
   */
  function play(name) {
    if (muted) return;
    if (!loaded) init();

    const audio = sounds[name];
    if (!audio) return;

    // Reset playback to allow rapid successive plays
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Browser may block autoplay — silently ignore
      });
    } catch (e) {
      // Audio not available — silently ignore
    }
  }

  function toggleMute() {
    muted = !muted;
    return muted;
  }

  function isMuted() {
    return muted;
  }

  return { init, play, toggleMute, isMuted };
})();

// Auto-init when script loads
SoundManager.init();