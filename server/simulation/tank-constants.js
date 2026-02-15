// Server-side tank minigame constants
// Mirrors client CONFIG.TANK_* values from public/js/config/constants.js

const TANK = {
  // Standard tank
  BODY_WIDTH: 28,
  BODY_HEIGHT: 22,
  ENEMY_HP: 50,
  ENEMY_SPEED: 60,
  FIRE_COOLDOWN: 2.5,
  PROJECTILE_SPEED: 250,
  PROJECTILE_BOUNCES: 2,
  PROJECTILE_DAMAGE: 25,
  PROJECTILE_RADIUS: 5,
  PROJECTILE_LIFETIME: 4.0,

  // Type overrides
  BASIC_SPEED: 45,
  RED_SPEED: 80,
  RED_FIRE_COOLDOWN: 2.0,
  RED_BOUNCES: 3,
  BOSS_HP: 200,
  BOSS_WIDTH: 42,
  BOSS_HEIGHT: 33,
  BOSS_SPEED: 35,
  BOSS_FIRE_COOLDOWN: 1.5,
  BOSS_BOUNCES: 3,
  BOSS_SPREAD_ANGLE: 0.4,

  // Crates
  CRATE_HP: 3,
  CRATE_WIDTH: 40,
  CRATE_HEIGHT: 40,
  HEALTH_DROP_CHANCE: 0.3,
  HEALTH_DROP_AMOUNT: 25,

  // Waves
  WAVE_DELAY: 3.0,

  // Arena
  ARENA_SIZE: 960,
  ARENA_MARGIN: 20,
  PATROL_MIN: 60,
  PATROL_MAX: 900,

  // Knockback (reuse from SIM_CONSTANTS)
  KNOCKBACK_FORCE: 300,
  KNOCKBACK_DECAY: 0.85,
  STUN_DURATION: 0.3,

  // Rewards
  KILL_REWARD: 10,
  BOSS_KILL_REWARD: 50,

  // Simulation
  TICK_RATE: 20,
  TICK_DT: 1 / 20,

  // Pickup collection range
  PICKUP_RANGE: 24,
};

module.exports = TANK;
