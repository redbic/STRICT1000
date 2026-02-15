// Server-side game constants
// Mirrors client CONFIG values from public/js/config/constants.js

const SIM_CONSTANTS = {
  // Enemy defaults
  ENEMY_DEFAULT_SPEED: 108,
  ENEMY_DEFAULT_HP: 50,
  ENEMY_DEFAULT_DAMAGE: 8,
  ENEMY_ATTACK_RANGE: 28,
  ENEMY_AGGRO_RANGE: 320,
  ENEMY_ATTACK_COOLDOWN: 0.75,
  ENEMY_SIZE: 22,
  ENEMY_STUN_DURATION: 0.3,

  // Knockback
  KNOCKBACK_FORCE: 300,
  KNOCKBACK_DECAY: 0.85,

  // Simulation
  TICK_RATE: 20,
  TICK_DT: 1 / 20,

  // Respawn
  ENEMY_RESPAWN_DELAY_MS: 10000,
  ENEMY_KILL_REWARD: 5,
};

module.exports = SIM_CONSTANTS;
