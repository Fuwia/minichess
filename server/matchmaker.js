/**
 * Simple matchmaking queue
 * Players are matched based on ELO proximity.
 * Queue items: { socket, userId, username, elo }
 */

class Matchmaker {
  constructor() {
    this.queue = [];
  }

  /**
   * Add a player to the matchmaking queue
   */
  joinQueue(player) {
    // Check if already in queue
    const existing = this.queue.findIndex(p => p.userId === player.userId);
    if (existing !== -1) {
      this.queue[existing] = player; // update socket
      return null;
    }

    this.queue.push(player);
    console.log(`[Matchmaker] ${player.username} (${player.elo}) joined queue. Queue size: ${this.queue.length}`);

    // Try to find a match
    return this.tryMatch();
  }

  /**
   * Remove a player from the queue
   */
  leaveQueue(userId) {
    const index = this.queue.findIndex(p => p.userId === userId);
    if (index !== -1) {
      const player = this.queue[index];
      this.queue.splice(index, 1);
      console.log(`[Matchmaker] ${player.username} left queue. Queue size: ${this.queue.length}`);
      return player;
    }
    return null;
  }

  /**
   * Try to match two players with similar ELO
   */
  tryMatch() {
    if (this.queue.length < 2) return null;

    // Sort by time waiting (first in, first matched)
    // Find the closest ELO match for the longest-waiting player
    const player1 = this.queue[0];
    let bestMatchIndex = 1;
    let bestEloDiff = Math.abs(player1.elo - this.queue[1].elo);

    for (let i = 2; i < this.queue.length; i++) {
      const diff = Math.abs(player1.elo - this.queue[i].elo);
      // Prioritize close ELO, but allow wider range if waiting long
      if (diff < bestEloDiff || (bestEloDiff > 300 && diff < bestEloDiff)) {
        bestEloDiff = diff;
        bestMatchIndex = i;
      }
    }

    const player2 = this.queue[bestMatchIndex];

    // Remove both from queue
    this.queue.splice(bestMatchIndex, 1); // remove later index first
    this.queue.splice(0, 1); // then remove first

    console.log(`[Matchmaker] Matched: ${player1.username} (${player1.elo}) vs ${player2.username} (${player2.elo}) | ELO diff: ${bestEloDiff}`);

    return {
      player1,
      player2
    };
  }

  /**
   * Check if a user is currently in queue
   */
  isInQueue(userId) {
    return this.queue.some(p => p.userId === userId);
  }

  /**
   * Get queue size
   */
  getQueueSize() {
    return this.queue.length;
  }
}

module.exports = Matchmaker;