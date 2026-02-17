// Tank minigame network callbacks
// Extracted from main.js for modularity

/**
 * Set up tank minigame network event handlers.
 * @param {NetworkManager} networkManager
 * @param {Object} gameState - Shared game state object
 */
export function setupTankCallbacks(networkManager, gameState) {
  networkManager.onTankSync = (data) => {
    if (gameState.game && gameState.game.activeMinigame && gameState.game.activeMinigame.tankEnemies) {
      gameState.game.activeMinigame.applyServerSync(data);
    }
  };

  networkManager.onTankWaveStart = (data) => {
    if (gameState.game && gameState.game.activeMinigame && gameState.game.activeMinigame.showWaveBanner) {
      gameState.game.activeMinigame.showWaveBanner(data.wave, data.isBoss);
    }
  };

  networkManager.onTankKilled = (data) => {
    if (!gameState.game) return;
    if (data.x !== undefined && data.y !== undefined) {
      gameState.game.spawnDeathParticles(data.x, data.y);
      gameState.game.triggerScreenShake(CONFIG.SCREEN_SHAKE_ENEMY_KILL, 0.1);
    }
    if (gameState.audioManager) {
      gameState.audioManager.playSound('enemy_death', {
        volume: CONFIG.AUDIO_ENEMY_DEATH_VOLUME || 0.35
      });
    }
    if (gameState.game.activeMinigame && gameState.game.activeMinigame.tankEnemies && data.tankId) {
      gameState.game.activeMinigame.tankEnemies = gameState.game.activeMinigame.tankEnemies.filter(t => t.id !== data.tankId);
    }
  };

  networkManager.onTankPlayerHit = (data) => {
    if (!gameState.game || !gameState.game.localPlayer) return;
    if (!networkManager || data.playerId !== networkManager.playerId) return;
    gameState.game.localPlayer.takeDamage(data.damage);
  };

  networkManager.onTankPickupCollected = (data) => {
    if (!gameState.game || !gameState.game.activeMinigame) return;
    gameState.game.activeMinigame.handlePickupCollected(data);
    if (data.playerId === networkManager.playerId && gameState.game.localPlayer) {
      gameState.game.localPlayer.hp = Math.min(
        gameState.game.localPlayer.maxHp,
        gameState.game.localPlayer.hp + (data.healAmount || 25)
      );
    }
  };

  networkManager.onTankCrateDestroyed = (data) => {
    if (gameState.game && gameState.game.activeMinigame && gameState.game.activeMinigame.handleCrateDestroyed) {
      gameState.game.activeMinigame.handleCrateDestroyed(data);
    }
  };

  networkManager.onTankGameOver = (data) => {
    if (gameState.game && gameState.game.activeMinigame && gameState.game.activeMinigame.applyServerSync) {
      if (data.reason === 'victory') {
        gameState.game.activeMinigame.victory = true;
        gameState.game.activeMinigame.waveBanner = { text: 'VICTORY!', timer: 5.0 };
      } else {
        gameState.game.activeMinigame.gameOver = true;
        gameState.game.activeMinigame.waveBanner = { text: 'MISSION FAILED', timer: 999 };
      }
    }
  };

  networkManager.onTankStateReset = (data) => {
    if (gameState.game && gameState.game.activeMinigame && gameState.game.activeMinigame.handleServerReset) {
      gameState.game.activeMinigame.handleServerReset(data);
    }
  };
}
