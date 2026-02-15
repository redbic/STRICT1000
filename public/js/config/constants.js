// Centralized game constants
// These values are used across multiple game systems

const CONFIG = {
  // ===================
  // Debug
  // ===================
  DEBUG: typeof window !== 'undefined' && window.location.hostname === 'localhost',

  // ===================
  // Validation (sync with server/validation.js)
  // ===================
  MAX_USERNAME_LENGTH: 32,
  USERNAME_PATTERN: /^[A-Za-z0-9]([A-Za-z0-9 _-]*[A-Za-z0-9])?$/,

  // ===================
  // Player
  // ===================
  PLAYER_MAX_SPEED: 350,           // pixels per second
  PLAYER_ACCELERATION: 2200,       // pixels per second squared
  PLAYER_FRICTION: 8,              // friction factor (higher = more friction)
  PLAYER_DEFAULT_HP: 100,
  PLAYER_SIZE: 30,                 // player collision box size
  PLAYER_STUN_FRICTION: 12,        // higher friction when stunned

  // ===================
  // Gun / Combat
  // ===================
  GUN_FIRE_RATE: 0.75,             // shots per second (slow, tactical)
  GUN_DAMAGE: 25,                  // damage per shot (4 shots kills 100hp enemy)
  GUN_MAGAZINE_SIZE: 5,            // shots before reload
  GUN_RELOAD_TIME: 1.75,           // seconds to reload
  GUN_BARREL_LENGTH: 20,           // visual barrel offset

  // ===================
  // Enemy
  // ===================
  ENEMY_DEFAULT_SPEED: 108,        // pixels per second (was 1.8 * 60)
  ENEMY_DEFAULT_HP: 50,
  ENEMY_DEFAULT_DAMAGE: 8,
  ENEMY_ATTACK_RANGE: 28,
  ENEMY_AGGRO_RANGE: 320,
  ENEMY_ATTACK_COOLDOWN: 0.75,     // seconds (was 45 frames / 60)
  ENEMY_SIZE: 22,
  ENEMY_STUN_DURATION: 0.3,        // seconds

  // ===================
  // Network
  // ===================
  PLAYER_UPDATE_INTERVAL: 100,     // ms between player state updates
  ENEMY_SYNC_INTERVAL: 100,        // ms between enemy sync broadcasts

  // ===================
  // Projectile
  // ===================
  PROJECTILE_SPEED: 850,           // pixels per second
  PROJECTILE_LIFETIME: 2.0,        // seconds before despawn
  PROJECTILE_SIZE: 6,              // collision radius

  // ===================
  // Effects
  // ===================
  DAMAGE_FLASH_DURATION: 0.15,     // seconds
  MUZZLE_FLASH_DURATION: 0.08,     // seconds

  // ===================
  // UI / Health Bars
  // ===================
  HEALTH_BAR_WIDTH: 36,
  HEALTH_BAR_HEIGHT: 5,

  // ===================
  // Zone Transitions
  // ===================
  ZONE_TRANSITION_GRACE_MS: 500,   // Grace period for enemy sync handoff

  // ===================
  // Speed Normalization
  // ===================
  SPEED_NORMALIZATION_FACTOR: 60,  // Divide velocity by this for network sync

  // ===================
  // Game Feel / Juice
  // ===================
  CAMERA_LERP_SPEED: 0.05,           // Lower = smoother (exponential decay base)
  SCREEN_SHAKE_DAMAGE_TAKEN: 6,      // Shake intensity when player takes damage
  SCREEN_SHAKE_DAMAGE_DEALT: 3,      // Shake intensity when hitting an enemy
  SCREEN_SHAKE_ENEMY_KILL: 4,        // Shake intensity on enemy kill
  HIT_STOP_DURATION: 0.04,           // Freeze frame duration in seconds
  KNOCKBACK_FORCE: 300,              // Knockback impulse strength (pixels/sec)
  KNOCKBACK_DECAY: 0.85,             // Knockback velocity multiplier per frame
  DAMAGE_NUMBER_LIFETIME: 0.8,       // How long damage numbers last (seconds)
  DAMAGE_NUMBER_SPEED: 60,           // Upward float speed (pixels/sec)
  DEATH_PARTICLE_COUNT: 12,          // Particles spawned on enemy death
  DEATH_PARTICLE_LIFETIME: 0.6,      // Particle lifetime (seconds)

  // ===================
  // Audio System
  // ===================
  AUDIO_MASTER_VOLUME: 0.4,           // Master volume (0-1)
  AUDIO_SFX_VOLUME: 0.5,              // SFX volume multiplier on master
  AUDIO_MUSIC_VOLUME: 0.2,            // Music volume (lower than SFX)
  AUDIO_GUN_FIRE_VOLUME: 0.35,        // Gun fire sound volume
  AUDIO_IMPACT_VOLUME: 0.3,           // Projectile impact volume
  AUDIO_ENEMY_HURT_VOLUME: 0.25,      // Enemy damage grunt volume
  AUDIO_ENEMY_DEATH_VOLUME: 0.35,     // Enemy death sound volume
  AUDIO_PITCH_VARIATION: 0.1,         // ±10% pitch randomization
  AUDIO_SPATIAL_PAN_RANGE: 600,       // Distance for full L/R stereo pan
  MUSIC_FADE_DURATION: 2.0,           // Music fade in/out time (seconds)

  // ===================
  // Combat Feel (Enhanced)
  // ===================
  HIT_STOP_KILL_DURATION: 0.1,        // Frame freeze on kill (100ms)
  WEAPON_TRAIL_LIFETIME: 0.15,        // Weapon trail fade time
  WEAPON_TRAIL_PARTICLE_COUNT: 5,     // Particles per shot trail
  WEAPON_TRAIL_SPACING: 4,            // Pixels between trail particles

  // ===================
  // Tank Game (Room 1)
  // ===================
  TANK_ENEMY_SPEED: 60,              // Tank enemy patrol speed (px/s)
  TANK_ENEMY_HP: 50,                 // Standard tank HP
  TANK_ENEMY_FIRE_COOLDOWN: 2.5,     // Seconds between shots
  TANK_ENEMY_PROJECTILE_SPEED: 250,  // Enemy bullet speed (px/s)
  TANK_ENEMY_PROJECTILE_BOUNCES: 2,  // Ricochet count for enemy bullets
  TANK_ENEMY_PROJECTILE_DAMAGE: 25,  // Damage per enemy bullet
  TANK_WAVE_DELAY: 3.0,              // Seconds between waves
  TANK_BODY_WIDTH: 28,               // Tank body width (px)
  TANK_BODY_HEIGHT: 22,              // Tank body height (px)
  TANK_BOSS_HP: 200,                 // Boss tank hit points
  TANK_BOSS_FIRE_COOLDOWN: 1.5,      // Boss fires faster
  TANK_BOSS_SPREAD_ANGLE: 0.4,       // Triple-shot spread (radians)
  TANK_CRATE_HP: 3,                  // Hits to destroy a crate
  TANK_HEALTH_DROP_CHANCE: 0.3,      // 30% chance crate drops health
  TANK_HEALTH_DROP_AMOUNT: 25,       // HP restored by health pickup

  // ===================
  // Card Game (Room 2)
  // ===================
  CARD_BOARD_LANES: 4,               // Number of board lanes
  CARD_HAND_SIZE: 4,                 // Cards drawn per turn
  CARD_STARTING_HP: 20,              // Starting HP for both sides
  CARD_ANIMATION_SPEED: 0.3,         // Card animation duration (s)
  CARD_LOSS_COIN_PENALTY: 10,        // Coins lost on defeat
  CARD_WIN_COIN_REWARD: 50,          // Coins earned on victory
};

// Make CONFIG available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// ES module export for module scripts
export { CONFIG };
