// Network callback handlers
// Extracted from main.js for modularity

/**
 * Set up all network event handlers
 * @param {NetworkManager} networkManager
 * @param {GameState} state - Game state object
 * @param {Object} handlers - Custom handler overrides
 */
function setupNetworkCallbacks(networkManager, state, handlers = {}) {
  if (!networkManager) return;

  networkManager.onRoomUpdate = (data) => {
    if (handlers.onRoomUpdate) {
      handlers.onRoomUpdate(data);
    }
    state.currentRoomPlayers = data.players || [];

    if (state.game && networkManager) {
      const zonePlayers = state.getZonePlayers();
      state.game.syncMultiplayerPlayers(zonePlayers, networkManager.playerId);
    }

    if (data.hostId) {
      state.setHostId(data.hostId);
    }
  };

  networkManager.onPlayerState = (data) => {
    if (!state.game || !state.game.localPlayer) return;
    if (data.playerId === state.game.localPlayer.id) return;

    const player = state.game.players.find(p => p.id === data.playerId);
    if (player) {
      player.setState(data.state);
    }
  };

  networkManager.onGameStart = (data) => {
    if (handlers.onGameStart) {
      handlers.onGameStart(data);
    }
  };

  networkManager.onZoneEnter = (data) => {
    if (state.game && data.zoneId && data.playerId === networkManager.playerId) {
      const zonePlayers = data.zonePlayers || [];
      state.game.transitionZone(data.zoneId, zonePlayers, networkManager.playerId);
      state.updateZoneHostStatus();
    }
  };

  networkManager.onPlayerZoneChange = (data) => {
    if (!state.game || !data.playerId || !data.zoneId) return;

    // Update player's zone in tracking
    const playerInfo = state.currentRoomPlayers.find(p => p.id === data.playerId);
    if (playerInfo) {
      playerInfo.zone = data.zoneId;
    }

    // If host changed zones, update zone host status
    if (data.playerId === state.currentHostId) {
      state.updateZoneHostStatus();
    }

    // Handle player leaving/entering our zone
    const localZoneId = state.game.zoneId || 'hub';
    if (data.zoneId !== localZoneId) {
      state.game.players = state.game.players.filter(p => p.id !== data.playerId);
    } else if (data.zoneId === localZoneId && data.playerId !== networkManager.playerId) {
      const existingPlayer = state.game.players.find(p => p.id === data.playerId);
      if (!existingPlayer && playerInfo) {
        const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
        const color = colors[state.game.players.length % colors.length];
        const newPlayer = new Player(
          state.game.zone.startX,
          state.game.zone.startY,
          color,
          data.playerId,
          playerInfo.username,
          playerInfo.character
        );
        state.game.players.push(newPlayer);
      }
    }
  };

  networkManager.onBalanceUpdate = (data) => {
    if (handlers.onBalanceUpdate) {
      handlers.onBalanceUpdate(data.balance);
    }
  };

  networkManager.onEnemyRespawn = (data) => {
    if (!state.game || !data.enemyId || !data.zone) return;
    if (state.game.zoneId !== data.zone) return;

    const zoneData = typeof ZONES !== 'undefined' ? ZONES[data.zone] : null;
    if (zoneData && zoneData.enemies) {
      const enemyIndex = parseInt(data.enemyId.split('-').pop());
      if (!isNaN(enemyIndex) && enemyIndex >= 0 && enemyIndex < zoneData.enemies.length) {
        const enemyConfig = zoneData.enemies[enemyIndex];
        const enemy = new Enemy(enemyConfig.x, enemyConfig.y, data.enemyId, {
          stationary: enemyConfig.stationary,
          passive: enemyConfig.passive,
          hp: enemyConfig.hp,
          maxHp: enemyConfig.maxHp
        });
        state.game.enemies.push(enemy);
      }
    }
  };

  networkManager.onEnemySync = (data) => {
    if (state.game && !state.game.isHost && !state.game.isZoneHost) {
      state.game.applyEnemySync(data.enemies);
    }
  };

  networkManager.onHostAssigned = (data) => {
    if (data.hostId) {
      state.setHostId(data.hostId);
    }
  };

  networkManager.onEnemyDamage = (data) => {
    if (state.isAuthoritative() && data.enemyId && typeof data.damage === 'number') {
      const enemy = state.game.enemies.find(e => e.id === data.enemyId);
      if (enemy) {
        enemy.takeDamage(data.damage);
      }
    }
  };

  networkManager.onPlayerLeft = (data) => {
    if (state.game) {
      state.game.players = state.game.players.filter(p => p.id !== data.playerId);
    }
  };

  networkManager.onRoomFull = (data) => {
    if (handlers.onRoomFull) {
      handlers.onRoomFull(data.maxPlayers);
    }
  };

  networkManager.onPlayerFire = (data) => {
    if (state.game && data.playerId && data.playerId !== networkManager.playerId) {
      state.game.spawnRemoteProjectile(data.x, data.y, data.angle, data.playerId);
    }
  };
}

// Make setupNetworkCallbacks available globally
if (typeof window !== 'undefined') {
  window.setupNetworkCallbacks = setupNetworkCallbacks;
}
