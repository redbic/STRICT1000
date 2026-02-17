// Core game network callbacks
// Extracted from main.js for modularity

/**
 * Set up core game network event handlers.
 * @param {NetworkManager} networkManager
 * @param {Object} gameState - Shared game state object
 * @param {Object} opts - Callback hooks for UI integration
 * @param {Function} opts.updateBalanceDisplay
 * @param {Function} opts.showScreen
 * @param {Function} opts.startGame
 * @param {Function} opts.appendChatMessage
 * @param {Function} opts.hydrateRoomAvatars
 * @param {Function} opts.updatePlayersList
 */
export function setupGameCallbacks(networkManager, gameState, opts) {
  const {
    updateBalanceDisplay,
    showScreen,
    startGame,
    appendChatMessage,
    hydrateRoomAvatars,
    updatePlayersList,
  } = opts;

  networkManager.onRoomUpdate = (data) => {
    updatePlayersList(data.players);
    gameState.currentRoomPlayers = data.players || [];
    if (gameState.game && networkManager) {
      const localZoneId = gameState.game.zoneId || 'hub';
      const zonePlayers = gameState.currentRoomPlayers.filter(p => p.zone === localZoneId);
      gameState.game.syncMultiplayerPlayers(zonePlayers, networkManager.playerId);
      hydrateRoomAvatars(zonePlayers);
    }
    if (data.hostId) {
      gameState.currentHostId = data.hostId;
    }
  };

  networkManager.onPlayerState = (data) => {
    if (gameState.game && gameState.game.localPlayer) {
      if (data.playerId === gameState.game.localPlayer.id) return;
      const player = gameState.game.players.find(p => p.id === data.playerId);
      if (player) {
        player.setState(data.state);
      }
    }
  };

  networkManager.onGameStart = () => {
    startGame('hub');
  };

  networkManager.onZoneEnter = async (data) => {
    if (gameState.game && data.zoneId && data.playerId === networkManager.playerId) {
      const zonePlayers = data.zonePlayers || [];
      const serverEnemies = data.enemies || null;

      if (gameState.game.zoneId === data.zoneId && gameState.game.gameStarted) {
        if (serverEnemies && Array.isArray(serverEnemies)) {
          gameState.game.enemies = serverEnemies.map(enemyData => {
            return new Enemy(enemyData.x, enemyData.y, enemyData.id, {
              stationary: enemyData.stationary,
              passive: enemyData.passive,
              hp: enemyData.hp,
              maxHp: enemyData.maxHp
            });
          });
        }
        gameState.game.syncMultiplayerPlayers(zonePlayers, networkManager.playerId);
      } else {
        await gameState.game.transitionZone(data.zoneId, zonePlayers, networkManager.playerId, serverEnemies);
      }

      // Apply initial tank state if entering a tank zone
      if (data.tankState && gameState.game.activeMinigame && gameState.game.activeMinigame.applyServerSync) {
        gameState.game.activeMinigame.applyServerSync(data.tankState);
      }

      const selfInRoster = gameState.currentRoomPlayers.find(p => p.id === networkManager.playerId);
      if (selfInRoster) {
        selfInRoster.zone = data.zoneId;
      }
    }
  };

  networkManager.onPlayerZoneChange = (data) => {
    if (!gameState.game || !data.playerId || !data.zoneId) return;

    const playerInfo = gameState.currentRoomPlayers.find(p => p.id === data.playerId);
    if (playerInfo) {
      playerInfo.zone = data.zoneId;
    }

    const localZoneId = gameState.game.zoneId || 'hub';
    if (data.zoneId !== localZoneId) {
      gameState.game.players = gameState.game.players.filter(p => p.id !== data.playerId);
    } else if (data.zoneId === localZoneId) {
      if (data.playerId === networkManager.playerId) return;

      const existingPlayer = gameState.game.players.find(p => p.id === data.playerId);
      if (!existingPlayer && playerInfo) {
        const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
        const color = colors[gameState.game.players.length % colors.length];
        const newPlayer = new Player(
          gameState.game.zone.startX,
          gameState.game.zone.startY,
          color,
          data.playerId,
          playerInfo.username,
          playerInfo.character
        );
        gameState.game.players.push(newPlayer);
      }
    }
  };

  networkManager.onBalanceUpdate = (data) => {
    updateBalanceDisplay(data.balance);
  };

  networkManager.onEnemyRespawn = (data) => {
    if (gameState.game && data.enemyId && data.zone) {
      if (gameState.game.zoneId !== data.zone) return;

      if (data.enemy) {
        const enemyData = data.enemy;
        const enemy = new Enemy(enemyData.x, enemyData.y, data.enemyId, {
          stationary: enemyData.stationary,
          passive: enemyData.passive,
          hp: enemyData.hp,
          maxHp: enemyData.maxHp
        });
        gameState.game.enemies.push(enemy);
        return;
      }

      // Fallback for legacy respawn format
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
          gameState.game.enemies.push(enemy);
        }
      }
    }
  };

  networkManager.onEnemyStateUpdate = (data) => {
    if (!gameState.game || !data.enemyId) return;

    const enemy = gameState.game.enemies.find(e => e.id === data.enemyId);
    if (enemy) {
      if (data.hp < enemy.hp) {
        enemy.damageFlashTimer = CONFIG.ENEMY_DAMAGE_FLASH_DURATION || 0.12;
      }
      enemy.hp = data.hp;
      if (data.maxHp !== undefined) {
        enemy.maxHp = data.maxHp;
      }
      return;
    }

    // Also check active minigame enemies (tank, etc.)
    if (gameState.game.activeMinigame && gameState.game.activeMinigame.tankEnemies) {
      const tank = gameState.game.activeMinigame.tankEnemies.find(t => t.id === data.enemyId);
      if (tank) {
        tank.hp = data.hp;
        if (data.maxHp !== undefined) tank.maxHp = data.maxHp;
        tank.flashTimer = 0.15;
      }
    }
  };

  networkManager.onEnemyKilledSync = (data) => {
    if (!gameState.game || !data.enemyId) return;
    if (data.zone && gameState.game.zoneId !== data.zone) return;

    const enemy = gameState.game.enemies.find(e => e.id === data.enemyId);
    if (enemy) {
      gameState.game.spawnDeathParticles(enemy.x, enemy.y);
      gameState.game.triggerScreenShake(CONFIG.SCREEN_SHAKE_ENEMY_KILL, 0.1);
      gameState.game.triggerHitStop(CONFIG.HIT_STOP_KILL_DURATION);
      if (gameState.audioManager) {
        gameState.audioManager.playSound('enemy_death', {
          volume: CONFIG.AUDIO_ENEMY_DEATH_VOLUME || 0.35
        });
      }
    }

    gameState.game.enemies = gameState.game.enemies.filter(e => e.id !== data.enemyId);
  };

  networkManager.onEnemySync = (data) => {
    if (gameState.game) {
      gameState.game.applyEnemySync(data.enemies);
    }
  };

  networkManager.onHostAssigned = (data) => {
    if (data.hostId) {
      gameState.currentHostId = data.hostId;
    }
  };

  networkManager.onEnemyAttack = (data) => {
    if (!gameState.game || !gameState.game.localPlayer) return;
    if (!networkManager || data.targetPlayerId !== networkManager.playerId) return;
    gameState.game.localPlayer.takeDamage(data.damage);
  };

  networkManager.onPlayerLeft = (data) => {
    if (gameState.game) {
      gameState.game.players = gameState.game.players.filter(p => p.id !== data.playerId);
    }
  };

  networkManager.onRoomFull = (data) => {
    alert(`Room is full. Max party size is ${data.maxPlayers}.`);
    networkManager.disconnect();
    gameState.networkManager = null;
    showScreen('menu');
  };

  networkManager.onPlayerFire = (data) => {
    if (gameState.game && data.playerId && data.playerId !== networkManager.playerId) {
      gameState.game.spawnRemoteProjectile(data.x, data.y, data.angle, data.playerId);
    }
  };

  networkManager.onChatMessage = (data) => {
    if (gameState.game && data.playerId && data.playerId !== networkManager.playerId) {
      const player = gameState.game.players.find(p => p.id === data.playerId);
      if (player) {
        player.setSpeech(data.text);
        if (window.StrictHotelTTS) {
          window.StrictHotelTTS.speakPlayerMessage(data.username, data.text);
        }
      }
    }
    appendChatMessage(data.username, data.text);
  };
}
