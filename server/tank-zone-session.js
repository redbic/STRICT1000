// Server-authoritative tank minigame simulation
// Runs tank AI, projectile physics, waves, crates, pickups at 20Hz

const WebSocket = require('ws');
const { ServerCollision } = require('./simulation/collision');
const TANK = require('./simulation/tank-constants');

// Wave definitions (mirrors client tank-game.js)
const WAVES = [
  { tanks: [{ type: 'basic', count: 2 }] },
  { tanks: [{ type: 'shooter', count: 3 }] },
  { tanks: [{ type: 'shooter', count: 3 }, { type: 'red', count: 1 }] },
  { tanks: [{ type: 'shooter', count: 3 }, { type: 'red', count: 2 }] },
  { tanks: [{ type: 'boss', count: 1 }, { type: 'red', count: 2 }] },
];

const SPAWN_POINTS = [
  { x: 192, y: 192 }, { x: 480, y: 144 }, { x: 768, y: 192 },
  { x: 144, y: 384 }, { x: 816, y: 384 },
  { x: 192, y: 576 }, { x: 768, y: 576 },
];

const PILLAR_POSITIONS = [
  { x: 240, y: 240, width: 48, height: 48 },
  { x: 672, y: 240, width: 48, height: 48 },
  { x: 240, y: 624, width: 48, height: 48 },
  { x: 672, y: 624, width: 48, height: 48 },
  { x: 456, y: 432, width: 48, height: 48 },
];

const CRATE_POSITIONS = [
  { x: 360, y: 192 }, { x: 552, y: 192 },
  { x: 168, y: 432 }, { x: 744, y: 432 },
  { x: 312, y: 384 }, { x: 600, y: 384 },
  { x: 360, y: 672 }, { x: 552, y: 672 },
  { x: 456, y: 288 }, { x: 456, y: 576 },
];

let nextProjectileId = 0;
let nextPickupId = 0;

class TankZoneSession {
  constructor(roomId, zoneId, zoneData, deps) {
    this.roomId = roomId;
    this.zoneId = zoneId;
    this.deps = deps;

    // Build collision with pillars (crates added dynamically)
    this.collision = new ServerCollision(zoneData);
    this._addPillarsToCollision();

    // Game state
    this.tanks = [];
    this.projectiles = [];
    this.crates = this._initCrates();
    this.healthPickups = [];
    this.currentWave = 0;
    this.waveActive = false;
    this.waveDelay = TANK.WAVE_DELAY;
    this.victory = false;

    // Add crate walls to collision
    this._addCrateWalls();

    // Players
    this.players = new Map();

    // Tick
    this.tickInterval = null;
    this.running = false;

    // Compat: ZoneSession interface expects this
    this.enemies = [];
  }

  _addPillarsToCollision() {
    if (!this.collision.walls) this.collision.walls = [];
    for (const p of PILLAR_POSITIONS) {
      this.collision.walls.push({ ...p, _isPillar: true });
    }
  }

  _initCrates() {
    return CRATE_POSITIONS.map((pos, i) => ({
      id: `crate-${i}`,
      x: pos.x,
      y: pos.y,
      width: TANK.CRATE_WIDTH,
      height: TANK.CRATE_HEIGHT,
      hp: TANK.CRATE_HP,
      maxHp: TANK.CRATE_HP,
      alive: true,
    }));
  }

  _addCrateWalls() {
    for (const crate of this.crates) {
      if (crate.alive) {
        this.collision.walls.push({
          x: crate.x - crate.width / 2,
          y: crate.y - crate.height / 2,
          width: crate.width,
          height: crate.height,
          _crateId: crate.id,
        });
      }
    }
  }

  _removeCrateWall(crateId) {
    if (!this.collision.walls) return;
    this.collision.walls = this.collision.walls.filter(w => w._crateId !== crateId);
  }

  // --- ZoneSession-compatible interface ---

  start() {
    if (this.running) return;
    this.running = true;
    this.tickInterval = setInterval(() => this.tick(), 1000 / TANK.TICK_RATE);
  }

  shutdown() {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.players.clear();
  }

  addPlayer(playerId, ws, username) {
    this.players.set(playerId, {
      x: 480, y: 880,
      hp: 100, isDead: false,
      ws, username,
    });
    if (this.players.size === 1) {
      this.start();
    }
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size === 0) {
      this.shutdown();
      return true;
    }
    return false;
  }

  updatePlayerPosition(playerId, x, y, hp, isDead) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.x = x;
    player.y = y;
    if (hp !== undefined) player.hp = hp;
    if (isDead !== undefined) player.isDead = isDead;
  }

  getAliveEnemies() {
    // Return alive tanks in a format compatible with zone_enter
    return this.tanks.filter(t => t.alive).map(t => ({
      id: t.id,
      x: t.x,
      y: t.y,
      hp: t.hp,
      maxHp: t.maxHp,
      stationary: false,
      passive: false,
    }));
  }

  getTankState() {
    return {
      tanks: this.tanks.filter(t => t.alive).map(t => ({
        id: t.id, x: t.x, y: t.y, type: t.type,
        hp: t.hp, maxHp: t.maxHp,
        angle: t.angle, turretAngle: t.turretAngle,
        alive: t.alive, flashTimer: t.flashTimer,
        knockbackVX: t.knockbackVX, knockbackVY: t.knockbackVY,
        width: t.width, height: t.height,
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, x: p.x, y: p.y,
        vx: p.vx, vy: p.vy,
        angle: p.angle, bounces: p.bounces,
      })),
      crates: this.crates.map(c => ({
        id: c.id, hp: c.hp, alive: c.alive,
      })),
      healthPickups: this.healthPickups.map(h => ({
        id: h.id, x: h.x, y: h.y,
      })),
      wave: this.currentWave,
      waveActive: this.waveActive,
      waveDelay: this.waveDelay,
      victory: this.victory,
    };
  }

  // --- Damage handling ---

  applyDamage(enemyId, damage, fromX, fromY, attackerUsername, attackerWs) {
    const tank = this.tanks.find(t => t.id === enemyId && t.alive);
    if (!tank) return false;

    tank.hp = Math.max(0, tank.hp - damage);
    tank.flashTimer = 0.15;

    // Knockback
    if (Number.isFinite(fromX) && Number.isFinite(fromY)) {
      const dx = tank.x - fromX;
      const dy = tank.y - fromY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        tank.knockbackVX = (dx / dist) * TANK.KNOCKBACK_FORCE;
        tank.knockbackVY = (dy / dist) * TANK.KNOCKBACK_FORCE;
      }
    }

    tank.stunTimer = TANK.STUN_DURATION;

    // Broadcast immediate HP update
    this._broadcastToZone({
      type: 'enemy_state_update',
      enemyId: tank.id,
      hp: tank.hp,
      maxHp: tank.maxHp,
    });

    if (tank.hp <= 0) {
      this._killTank(tank, attackerUsername, attackerWs);
    }

    return true;
  }

  applyCrateDamage(crateId, damage) {
    const crate = this.crates.find(c => c.id === crateId && c.alive);
    if (!crate) return false;

    crate.hp = Math.max(0, crate.hp - damage);

    if (crate.hp <= 0) {
      this._destroyCrate(crate);
    }

    return true;
  }

  restart() {
    // Reset game state
    this.tanks = [];
    this.projectiles = [];
    this.healthPickups = [];
    this.victory = false;
    this.currentWave = 0;
    this.waveActive = false;
    this.waveDelay = TANK.WAVE_DELAY;

    // Reset crates
    this.crates = this._initCrates();

    // Rebuild collision walls (pillars + crates)
    this.collision.walls = this.collision.walls.filter(w => !w._crateId);
    // Re-remove pillars and re-add fresh
    this.collision.walls = this.collision.walls.filter(w => !w._isPillar);
    this._addPillarsToCollision();
    this._addCrateWalls();

    // Broadcast reset
    this._broadcastToZone({
      type: 'tank_state_reset',
      crates: this.crates.map(c => ({ id: c.id, hp: c.hp, alive: c.alive })),
      wave: 0,
    });
  }

  // --- Simulation tick ---

  tick() {
    const dt = TANK.TICK_DT;

    if (this.victory) {
      // Still broadcast state so late joiners see the victory screen
      this._broadcastTankSync();
      return;
    }

    // Wave delay countdown
    if (!this.waveActive && this.waveDelay > 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this._spawnWave(this.currentWave);
      }
    }

    // Update tanks
    this._updateTanks(dt);

    // Update projectiles
    this._updateProjectiles(dt);

    // Check player pickup collection
    this._checkPickupCollection();

    // Check wave completion
    if (this.waveActive && this.tanks.every(t => !t.alive)) {
      this.waveActive = false;
      this.currentWave++;
      if (this.currentWave >= WAVES.length) {
        this.victory = true;
        this._broadcastToZone({
          type: 'tank_game_over',
          reason: 'victory',
        });
      } else {
        this.waveDelay = TANK.WAVE_DELAY;
        this._broadcastToZone({
          type: 'tank_wave_start',
          wave: this.currentWave,
          isBoss: this.currentWave === WAVES.length - 1,
        });
      }
    }

    // Player death is handled by main game client-side (respawn to hub)
    // Server only manages victory condition (all waves cleared)

    // Broadcast full state
    this._broadcastTankSync();
  }

  // --- Wave spawning ---

  _spawnWave(waveIndex) {
    if (waveIndex >= WAVES.length) return;

    const wave = WAVES[waveIndex];
    this.tanks = [];
    let spawnIdx = 0;

    for (const def of wave.tanks) {
      for (let i = 0; i < def.count; i++) {
        const spawn = SPAWN_POINTS[spawnIdx % SPAWN_POINTS.length];
        spawnIdx++;
        this.tanks.push(this._createTank(def.type, spawn.x, spawn.y, `tank-w${waveIndex}-${this.tanks.length}`));
      }
    }

    this.waveActive = true;

    this._broadcastToZone({
      type: 'tank_wave_start',
      wave: waveIndex,
      isBoss: waveIndex === WAVES.length - 1,
    });
  }

  _createTank(type, x, y, id) {
    const base = {
      id,
      x, y, type,
      width: TANK.BODY_WIDTH,
      height: TANK.BODY_HEIGHT,
      hp: TANK.ENEMY_HP,
      maxHp: TANK.ENEMY_HP,
      speed: TANK.ENEMY_SPEED,
      canShoot: true,
      fireCooldown: TANK.FIRE_COOLDOWN,
      fireTimer: Math.random() * 2,
      projectileSpeed: TANK.PROJECTILE_SPEED,
      projectileBounces: TANK.PROJECTILE_BOUNCES,
      projectileDamage: TANK.PROJECTILE_DAMAGE,
      angle: 0,
      turretAngle: 0,
      alive: true,
      stunTimer: 0,
      knockbackVX: 0,
      knockbackVY: 0,
      patrolTarget: null,
      patrolTimer: 0,
      flashTimer: 0,
      tripleShot: false,
      spreadAngle: 0,
    };

    switch (type) {
      case 'basic':
        base.canShoot = false;
        base.speed = TANK.BASIC_SPEED;
        break;
      case 'shooter':
        break;
      case 'red':
        base.speed = TANK.RED_SPEED;
        base.fireCooldown = TANK.RED_FIRE_COOLDOWN;
        base.projectileBounces = TANK.RED_BOUNCES;
        break;
      case 'boss':
        base.hp = TANK.BOSS_HP;
        base.maxHp = TANK.BOSS_HP;
        base.width = TANK.BOSS_WIDTH;
        base.height = TANK.BOSS_HEIGHT;
        base.speed = TANK.BOSS_SPEED;
        base.fireCooldown = TANK.BOSS_FIRE_COOLDOWN;
        base.projectileBounces = TANK.BOSS_BOUNCES;
        base.tripleShot = true;
        base.spreadAngle = TANK.BOSS_SPREAD_ANGLE;
        break;
    }

    return base;
  }

  // --- Tank AI ---

  _updateTanks(dt) {
    const nearest = this._getNearestAlivePlayer();

    for (const tank of this.tanks) {
      if (!tank.alive) continue;

      // Flash timer
      if (tank.flashTimer > 0) tank.flashTimer -= dt;

      // Knockback
      if (Math.abs(tank.knockbackVX) > 1 || Math.abs(tank.knockbackVY) > 1) {
        const oldX = tank.x;
        const oldY = tank.y;
        tank.x += tank.knockbackVX * dt;
        tank.y += tank.knockbackVY * dt;
        if (this.collision.checkCollision(tank)) {
          tank.x = oldX;
          tank.y = oldY;
        }
        tank.x = Math.max(TANK.ARENA_MARGIN, Math.min(TANK.ARENA_SIZE - TANK.ARENA_MARGIN, tank.x));
        tank.y = Math.max(TANK.ARENA_MARGIN, Math.min(TANK.ARENA_SIZE - TANK.ARENA_MARGIN, tank.y));
        const decay = Math.pow(TANK.KNOCKBACK_DECAY, dt * 60);
        tank.knockbackVX *= decay;
        tank.knockbackVY *= decay;
        continue; // Skip AI while in knockback
      }

      // Stun
      if (tank.stunTimer > 0) {
        tank.stunTimer -= dt;
        continue;
      }

      if (!nearest) continue;

      // Turret always aims at nearest player
      tank.turretAngle = Math.atan2(nearest.y - tank.y, nearest.x - tank.x);

      // Patrol AI
      if (!tank.patrolTarget || tank.patrolTimer <= 0) {
        const targetAngle = Math.atan2(nearest.y - tank.y, nearest.x - tank.x);
        const randomOffset = (Math.random() - 0.5) * Math.PI;
        const moveDist = 100 + Math.random() * 150;
        tank.patrolTarget = {
          x: Math.max(TANK.PATROL_MIN, Math.min(TANK.PATROL_MAX, tank.x + Math.cos(targetAngle + randomOffset) * moveDist)),
          y: Math.max(TANK.PATROL_MIN, Math.min(TANK.PATROL_MAX, tank.y + Math.sin(targetAngle + randomOffset) * moveDist)),
        };
        tank.patrolTimer = 2 + Math.random() * 2;
      }

      tank.patrolTimer -= dt;

      // Move toward patrol target
      const dx = tank.patrolTarget.x - tank.x;
      const dy = tank.patrolTarget.y - tank.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 10) {
        const nx = dx / dist;
        const ny = dy / dist;
        const newX = tank.x + nx * tank.speed * dt;
        const newY = tank.y + ny * tank.speed * dt;

        const testObj = { x: newX, y: newY, width: tank.width, height: tank.height };
        if (!this.collision.checkCollision(testObj)) {
          tank.x = Math.max(TANK.ARENA_MARGIN, Math.min(TANK.ARENA_SIZE - TANK.ARENA_MARGIN, newX));
          tank.y = Math.max(TANK.ARENA_MARGIN, Math.min(TANK.ARENA_SIZE - TANK.ARENA_MARGIN, newY));
        } else {
          tank.patrolTimer = 0; // Pick new target
        }

        tank.angle = Math.atan2(ny, nx);
      }

      // Firing
      if (tank.canShoot && !nearest.isDead) {
        tank.fireTimer -= dt;
        if (tank.fireTimer <= 0) {
          this._fireTankProjectile(tank);
          tank.fireTimer = tank.fireCooldown;
        }
      }
    }
  }

  _fireTankProjectile(tank) {
    const angle = tank.turretAngle;

    if (tank.tripleShot) {
      const spread = tank.spreadAngle;
      for (const offset of [-spread, 0, spread]) {
        this._createProjectile(tank, angle + offset);
      }
    } else {
      this._createProjectile(tank, angle);
    }
  }

  _createProjectile(tank, angle) {
    const barrelLen = tank.type === 'boss' ? 30 : 20;
    const id = `tp-${nextProjectileId++}`;
    this.projectiles.push({
      id,
      x: tank.x + Math.cos(angle) * barrelLen,
      y: tank.y + Math.sin(angle) * barrelLen,
      vx: Math.cos(angle) * tank.projectileSpeed,
      vy: Math.sin(angle) * tank.projectileSpeed,
      angle,
      radius: TANK.PROJECTILE_RADIUS,
      damage: tank.projectileDamage,
      bounces: 0,
      maxBounces: tank.projectileBounces,
      lifetime: TANK.PROJECTILE_LIFETIME,
    });
  }

  // --- Projectile physics ---

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      proj.lifetime -= dt;
      if (proj.lifetime <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const nextX = proj.x + proj.vx * dt;
      const nextY = proj.y + proj.vy * dt;

      // Boundary bounce
      let bounced = false;
      if (nextX < proj.radius || nextX > TANK.ARENA_SIZE - proj.radius) {
        if (proj.bounces < proj.maxBounces) {
          proj.vx = -proj.vx;
          proj.bounces++;
          bounced = true;
        } else {
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      if (nextY < proj.radius || nextY > TANK.ARENA_SIZE - proj.radius) {
        if (proj.bounces < proj.maxBounces) {
          proj.vy = -proj.vy;
          proj.bounces++;
          bounced = true;
        } else {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Wall collision bounce
      if (!bounced) {
        const testObj = { x: nextX, y: nextY, width: proj.radius * 2, height: proj.radius * 2 };
        if (this.collision.checkCollision(testObj)) {
          if (proj.bounces < proj.maxBounces) {
            const testX = { x: nextX, y: proj.y, width: proj.radius * 2, height: proj.radius * 2 };
            const testY = { x: proj.x, y: nextY, width: proj.radius * 2, height: proj.radius * 2 };
            if (this.collision.checkCollision(testX)) proj.vx = -proj.vx;
            if (this.collision.checkCollision(testY)) proj.vy = -proj.vy;
            proj.bounces++;
            bounced = true;
          } else {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      if (!bounced) {
        proj.x = nextX;
        proj.y = nextY;
      } else {
        proj.x += proj.vx * dt * 0.5;
        proj.y += proj.vy * dt * 0.5;
      }

      proj.angle = Math.atan2(proj.vy, proj.vx);

      // Crate collision
      let hitCrate = false;
      for (const crate of this.crates) {
        if (!crate.alive) continue;
        const cdx = Math.abs(crate.x - proj.x);
        const cdy = Math.abs(crate.y - proj.y);
        if (cdx < crate.width / 2 + proj.radius && cdy < crate.height / 2 + proj.radius) {
          crate.hp--;
          if (crate.hp <= 0) {
            this._destroyCrate(crate);
          }
          this.projectiles.splice(i, 1);
          hitCrate = true;
          break;
        }
      }
      if (hitCrate) continue;

      // Player collision
      for (const [playerId, player] of this.players) {
        if (player.isDead || player.hp <= 0) continue;
        const pdist = Math.hypot(player.x - proj.x, player.y - proj.y);
        if (pdist < 12 + proj.radius) { // ~player half-width + projectile radius
          // Hit player
          player.hp = Math.max(0, player.hp - proj.damage);
          this._sendToPlayer(playerId, {
            type: 'tank_player_hit',
            playerId,
            damage: proj.damage,
          });
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // --- Crate and pickup ---

  _destroyCrate(crate) {
    crate.alive = false;
    this._removeCrateWall(crate.id);

    let pickup = null;
    if (Math.random() < TANK.HEALTH_DROP_CHANCE) {
      const pid = `hp-${nextPickupId++}`;
      const hp = { id: pid, x: crate.x, y: crate.y };
      this.healthPickups.push(hp);
      pickup = hp;
    }

    this._broadcastToZone({
      type: 'tank_crate_destroyed',
      crateId: crate.id,
      x: crate.x,
      y: crate.y,
      pickup: pickup ? { id: pickup.id, x: pickup.x, y: pickup.y } : null,
    });
  }

  _checkPickupCollection() {
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const hp = this.healthPickups[i];
      for (const [playerId, player] of this.players) {
        if (player.isDead || player.hp <= 0) continue;
        const dist = Math.hypot(player.x - hp.x, player.y - hp.y);
        if (dist < TANK.PICKUP_RANGE) {
          player.hp = Math.min(100, player.hp + TANK.HEALTH_DROP_AMOUNT);
          this._broadcastToZone({
            type: 'tank_pickup_collected',
            pickupId: hp.id,
            playerId,
            healAmount: TANK.HEALTH_DROP_AMOUNT,
          });
          this.healthPickups.splice(i, 1);
          break;
        }
      }
    }
  }

  // --- Tank death ---

  _killTank(tank, killerUsername, killerWs) {
    tank.alive = false;

    this._broadcastToZone({
      type: 'tank_killed',
      tankId: tank.id,
      x: tank.x,
      y: tank.y,
    });

    // Award coins (boss gets higher reward)
    if (this.deps.onEnemyDeath) {
      const reward = tank.type === 'boss' ? TANK.BOSS_KILL_REWARD : TANK.KILL_REWARD;
      this.deps.onEnemyDeath(this.roomId, this.zoneId, tank.id, killerUsername, killerWs, reward);
    }
  }

  // --- Helpers ---

  _getNearestAlivePlayer() {
    let nearest = null;
    let minDist = Infinity;
    for (const [, player] of this.players) {
      if (player.isDead || player.hp <= 0) continue;
      // Use distance from arena center as tiebreaker (any alive player works)
      const dist = Math.hypot(player.x - 480, player.y - 480);
      if (!nearest || dist < minDist) {
        minDist = dist;
        nearest = player;
      }
    }
    return nearest;
  }

  _broadcastTankSync() {
    this._broadcastToZone({
      type: 'tank_sync',
      tanks: this.tanks.filter(t => t.alive).map(t => ({
        id: t.id, x: t.x, y: t.y, type: t.type,
        hp: t.hp, maxHp: t.maxHp,
        angle: t.angle, turretAngle: t.turretAngle,
        flashTimer: t.flashTimer,
        knockbackVX: t.knockbackVX, knockbackVY: t.knockbackVY,
        width: t.width, height: t.height,
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, x: p.x, y: p.y,
        vx: p.vx, vy: p.vy, angle: p.angle,
        bounces: p.bounces,
      })),
      crates: this.crates.map(c => ({
        id: c.id, hp: c.hp, alive: c.alive,
      })),
      healthPickups: this.healthPickups.map(h => ({
        id: h.id, x: h.x, y: h.y,
      })),
      wave: this.currentWave,
      waveActive: this.waveActive,
      waveDelay: this.waveDelay,
      victory: this.victory,
    });
  }

  _broadcastToZone(message) {
    const payload = JSON.stringify(message);
    for (const [, player] of this.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        try { player.ws.send(payload); } catch (_) { /* ignore */ }
      }
    }
  }

  _sendToPlayer(playerId, message) {
    const player = this.players.get(playerId);
    if (!player || !player.ws || player.ws.readyState !== WebSocket.OPEN) return;
    try { player.ws.send(JSON.stringify(message)); } catch (_) { /* ignore */ }
  }
}

module.exports = { TankZoneSession };
