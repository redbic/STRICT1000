// Centralized game state management
// Consolidates global variables from main.js

class GameState {
  constructor() {
    // Game instance
    this.game = null;

    // Network
    this.networkManager = null;
    this.browseManager = null;  // Separate connection for room browsing

    // User info
    this.currentUsername = '';
    this.currentProfile = null;

    // Room state
    this.currentRoomPlayers = [];
    this.currentHostId = null;

    // Intervals
    this.playerUpdateInterval = null;
    this.inventorySaveTimeout = null;
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    // Clear intervals
    if (this.playerUpdateInterval) {
      clearInterval(this.playerUpdateInterval);
      this.playerUpdateInterval = null;
    }
    if (this.inventorySaveTimeout) {
      clearTimeout(this.inventorySaveTimeout);
      this.inventorySaveTimeout = null;
    }

    // Disconnect network
    if (this.networkManager) {
      this.networkManager.leaveRoom();
      this.networkManager.disconnect();
      this.networkManager = null;
    }
    if (this.browseManager) {
      this.browseManager.disconnect();
      this.browseManager = null;
    }

    // Destroy game
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }

    // Reset state
    this.currentRoomPlayers = [];
    this.currentHostId = null;
  }

  /**
   * Get players in the same zone as local player
   * @returns {Array}
   */
  getZonePlayers() {
    if (!this.game) return [];
    const localZone = this.game.zoneId || 'hub';
    return this.currentRoomPlayers.filter(p => p.zone === localZone);
  }
}

// Make GameState available globally
if (typeof window !== 'undefined') {
  window.GameState = GameState;
}
