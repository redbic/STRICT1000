// Server-authoritative zone simulation session
// Runs enemy AI, processes combat, broadcasts state at 20Hz

const WebSocket = require('ws');
const { ServerCollision } = require('./simulation/collision');
const SIM = require('./simulation/constants');

/**
 * @typedef {Object} ServerEnemy
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} speed
 * @property {number} damage
 * @property {number} attackRange
 * @property {number} aggroRange
 * @property {number} attackCooldown
 * @property {boolean} stunned
 * @property {number} stunnedTime
 * @property {boolean} stationary
 * @property {boolean} passive
 * @property {number} knockbackVX
 * @property {number} knockbackVY
 * @property {number} spawnX
 * @property {number} spawnY
 */

/**
 * @typedef {Object} ZonePlayer
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {boolean} isDead
 * @property {WebSocket} ws
 * @property {string} username
 */

class ZoneSession {
  /**
   * @param {string} roomId
   * @param {string} zoneId
   * @param {Object} zoneData - Parsed zone JSON
   * @param {Object} deps - External dependencies
   * @param {Function} deps.onEnemyDeath - Called when enemy dies: (roomId, zoneId, enemyId, killerUsername, killerWs) => void
   */
  constructor(roomId, zoneId, zoneData, deps) {
    this.roomId = roomId;
    this.zoneId = zoneId;
    this.deps = deps;

    // Collision system
    this.collision = new ServerCollision(zoneData);

    // Enemy state
    this.enemies = this._initEnemies(zoneData);
    this.killedEnemyIds = new Set();
    this.respawnTimers = new Map();

    // Player positions (updated from player_update messages)
    /** @type {Map<string, ZonePlayer>} */
    this.players = new Map();

    // Tick loop
    this.tickInterval = null;
    this.running = false;
  }

  /**
   * Initialize enemies from zone data
   * @param {Object} zoneData
   * @returns {ServerEnemy[]}
   */
  _initEnemies(zoneData) {
    if (!zoneData || !Array.isArray(zoneData.enemies)) return [];

    return zoneData.enemies.map((e, index) => {
      const hp = e.hp || SIM.ENEMY_DEFAULT_HP;
      const maxHp = Math.max(e.maxHp || SIM.ENEMY_DEFAULT_HP, hp);
      return {
        id: `${this.zoneId}-enemy-${index}`,
        x: e.x,
        y: e.y,
        width: SIM.ENEMY_SIZE,
        height: SIM.ENEMY_SIZE,
        hp,
        maxHp,
        speed: e.speed || SIM.ENEMY_DEFAULT_SPEED,
        damage: e.damage || SIM.ENEMY_DEFAULT_DAMAGE,
        attackRange: SIM.ENEMY_ATTACK_RANGE,
        aggroRange: SIM.ENEMY_AGGRO_RANGE,
        attackCooldown: 0,
        stunned: false,
        stunnedTime: 0,
        stationary: e.stationary || false,
        passive: e.passive || false,
        knockbackVX: 0,
        knockbackVY: 0,
        spawnX: e.x,
        spawnY: e.y,
      };
    });
  }

  /**
   * Start the simulation tick loop
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.tickInterval = setInterval(() => this.tick(), 1000 / SIM.TICK_RATE);
  }

  /**
   * Stop the simulation and clean up
   */
  shutdown() {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();
    this.players.clear();
  }

  /**
   * Add a player to this zone session
   * @param {string} playerId
   * @param {WebSocket} ws
   * @param {string} username
   */
  addPlayer(playerId, ws, username) {
    this.players.set(playerId, {
      x: 0,
      y: 0,
      hp: 100,
      isDead: false,
      ws,
      username,
    });

    // Start ticking if this is the first player
    if (this.players.size === 1) {
      this.start();
    }
  }

  /**
   * Remove a player from this zone session
   * @param {string} playerId
   * @returns {boolean} true if zone session is now empty and should be cleaned up
   */
  removePlayer(playerId) {
    this.players.delete(playerId);

    if (this.players.size === 0) {
      this.shutdown();
      return true; // Signal caller to remove this session
    }
    return false;
  }

  /**
   * Update a player's position (called from player_update handler)
   * @param {string} playerId
   * @param {number} x
   * @param {number} y
   * @param {number} [hp]
   * @param {boolean} [isDead]
   */
  updatePlayerPosition(playerId, x, y, hp, isDead) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.x = x;
    player.y = y;
    if (hp !== undefined) player.hp = hp;
    if (isDead !== undefined) player.isDead = isDead;
  }

  /**
   * Get current alive enemies for sending to a newly entering player
   * @returns {Array}
   */
  getAliveEnemies() {
    return this.enemies
      .filter(e => !this.killedEnemyIds.has(e.id))
      .map(e => ({
        id: e.id,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        stationary: e.stationary,
        passive: e.passive,
      }));
  }

  /**
   * Apply damage to an enemy from a player's projectile
   * @param {string} enemyId
   * @param {number} damage
   * @param {number} fromX - Projectile hit X (for knockback direction)
   * @param {number} fromY - Projectile hit Y
   * @param {string} attackerUsername
   * @param {WebSocket} attackerWs
   * @returns {boolean} true if damage was applied
   */
  applyDamage(enemyId, damage, fromX, fromY, attackerUsername, attackerWs) {
    const enemy = this.enemies.find(e => e.id === enemyId);
    if (!enemy || this.killedEnemyIds.has(enemyId)) return false;

    // Apply damage
    enemy.hp = Math.max(0, enemy.hp - damage);

    // Apply knockback
    if (Number.isFinite(fromX) && Number.isFinite(fromY)) {
      const dx = enemy.x - fromX;
      const dy = enemy.y - fromY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        enemy.knockbackVX = (dx / dist) * SIM.KNOCKBACK_FORCE;
        enemy.knockbackVY = (dy / dist) * SIM.KNOCKBACK_FORCE;
      }
    }

    // Apply stun
    enemy.stunned = true;
    enemy.stunnedTime = SIM.ENEMY_STUN_DURATION;

    // Broadcast HP update immediately for responsive feedback
    this._broadcastToZone({
      type: 'enemy_state_update',
      enemyId: enemy.id,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
    });

    // Handle death
    if (enemy.hp <= 0) {
      this._handleEnemyDeath(enemy, attackerUsername, attackerWs);
    }

    return true;
  }

  /**
   * Main simulation tick - runs at 20Hz
   */
  tick() {
    const dt = SIM.TICK_DT;

    for (const enemy of this.enemies) {
      if (this.killedEnemyIds.has(enemy.id)) continue;

      // 1. Apply knockback
      this._updateKnockback(enemy, dt);

      // 2. Stun check
      if (enemy.stunned) {
        enemy.stunnedTime -= dt;
        if (enemy.stunnedTime <= 0) {
          enemy.stunned = false;
          enemy.stunnedTime = 0;
        }
        // Tick attack cooldown even while stunned
        if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;
        continue;
      }

      // 3. Skip AI for stationary enemies
      if (enemy.stationary) {
        if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;
        continue;
      }

      // 4. Find nearest alive player
      const target = this._getNearestPlayer(enemy);
      if (!target) {
        if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;
        continue;
      }

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);

      // 5. Chase or attack
      if (dist < enemy.aggroRange) {
        if (dist > enemy.attackRange) {
          // Chase
          const nx = dx / dist;
          const ny = dy / dist;
          const oldX = enemy.x;
          const oldY = enemy.y;
          enemy.x += nx * enemy.speed * dt;
          enemy.y += ny * enemy.speed * dt;
          if (this.collision.checkCollision(enemy)) {
            enemy.x = oldX;
            enemy.y = oldY;
          }
        } else if (enemy.attackCooldown <= 0 && !enemy.passive) {
          // Melee attack
          this._enemyAttack(enemy, target);
          enemy.attackCooldown = SIM.ENEMY_ATTACK_COOLDOWN;
        }
      }

      // 6. Tick attack cooldown
      if (enemy.attackCooldown > 0) {
        enemy.attackCooldown -= dt;
      }
    }

    // Broadcast enemy positions to all players in this zone
    this._broadcastEnemySync();
  }

  /**
   * Update enemy knockback physics
   * @param {ServerEnemy} enemy
   * @param {number} dt
   */
  _updateKnockback(enemy, dt) {
    if (Math.abs(enemy.knockbackVX) > 1 || Math.abs(enemy.knockbackVY) > 1) {
      const oldX = enemy.x;
      const oldY = enemy.y;
      enemy.x += enemy.knockbackVX * dt;
      enemy.y += enemy.knockbackVY * dt;
      if (this.collision.checkCollision(enemy)) {
        enemy.x = oldX;
        enemy.y = oldY;
      }
      // Frame-rate independent decay: match client behavior at 60fps
      const decay = Math.pow(SIM.KNOCKBACK_DECAY, dt * 60);
      enemy.knockbackVX *= decay;
      enemy.knockbackVY *= decay;
    } else {
      enemy.knockbackVX = 0;
      enemy.knockbackVY = 0;
    }
  }

  /**
   * Find the nearest alive player to an enemy
   * @param {ServerEnemy} enemy
   * @returns {ZonePlayer|null}
   */
  _getNearestPlayer(enemy) {
    let nearest = null;
    let minDist = Infinity;

    for (const [, player] of this.players) {
      if (player.isDead || player.hp <= 0) continue;
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = player;
      }
    }

    return nearest;
  }

  /**
   * Execute enemy melee attack on a player
   * @param {ServerEnemy} enemy
   * @param {ZonePlayer} target
   */
  _enemyAttack(enemy, target) {
    if (!target.ws || target.ws.readyState !== WebSocket.OPEN) return;

    // Find the playerId for this target
    let targetPlayerId = null;
    for (const [id, p] of this.players) {
      if (p === target) {
        targetPlayerId = id;
        break;
      }
    }
    if (!targetPlayerId) return;

    // Update server-side HP tracking
    target.hp = Math.max(0, target.hp - enemy.damage);

    // Send attack notification to the target player
    try {
      target.ws.send(JSON.stringify({
        type: 'enemy_attack',
        enemyId: enemy.id,
        damage: enemy.damage,
        targetPlayerId,
      }));
    } catch (_) {
      /* ignore send errors */
    }
  }

  /**
   * Handle enemy death
   * @param {ServerEnemy} enemy
   * @param {string} killerUsername
   * @param {WebSocket} killerWs
   */
  _handleEnemyDeath(enemy, killerUsername, killerWs) {
    if (this.killedEnemyIds.has(enemy.id)) return;

    this.killedEnemyIds.add(enemy.id);

    // Broadcast death to all players in zone
    this._broadcastToZone({
      type: 'enemy_killed_sync',
      enemyId: enemy.id,
      zone: this.zoneId,
    });

    // Delegate coin award to external handler (server.js has pool access)
    if (this.deps.onEnemyDeath) {
      this.deps.onEnemyDeath(this.roomId, this.zoneId, enemy.id, killerUsername, killerWs);
    }

    // Set up respawn timer
    if (this.respawnTimers.has(enemy.id)) {
      clearTimeout(this.respawnTimers.get(enemy.id));
    }

    const timerId = setTimeout(() => {
      this._respawnEnemy(enemy);
    }, SIM.ENEMY_RESPAWN_DELAY_MS);

    this.respawnTimers.set(enemy.id, timerId);
  }

  /**
   * Respawn an enemy at its original position
   * @param {ServerEnemy} enemy
   */
  _respawnEnemy(enemy) {
    this.killedEnemyIds.delete(enemy.id);
    this.respawnTimers.delete(enemy.id);

    // Reset enemy state
    enemy.x = enemy.spawnX;
    enemy.y = enemy.spawnY;
    enemy.hp = enemy.maxHp;
    enemy.knockbackVX = 0;
    enemy.knockbackVY = 0;
    enemy.stunned = false;
    enemy.stunnedTime = 0;
    enemy.attackCooldown = 0;

    // Broadcast respawn
    this._broadcastToZone({
      type: 'enemy_respawn',
      enemyId: enemy.id,
      zone: this.zoneId,
      enemy: {
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        stationary: enemy.stationary,
        passive: enemy.passive,
      },
    });
  }

  /**
   * Broadcast enemy sync to all players in this zone
   */
  _broadcastEnemySync() {
    const aliveEnemies = [];
    for (const enemy of this.enemies) {
      if (this.killedEnemyIds.has(enemy.id)) continue;
      aliveEnemies.push({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        stunned: enemy.stunned,
        stunnedTime: enemy.stunnedTime,
        attackCooldown: enemy.attackCooldown,
        knockbackVX: enemy.knockbackVX,
        knockbackVY: enemy.knockbackVY,
      });
    }

    this._broadcastToZone({
      type: 'enemy_sync',
      enemies: aliveEnemies,
    });
  }

  /**
   * Broadcast a message to all players in this zone session
   * @param {Object} message
   */
  _broadcastToZone(message) {
    const payload = JSON.stringify(message);
    for (const [, player] of this.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        try {
          player.ws.send(payload);
        } catch (_) {
          /* ignore send errors */
        }
      }
    }
  }
}

module.exports = { ZoneSession };
