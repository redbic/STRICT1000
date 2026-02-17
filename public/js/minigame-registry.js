// Minigame Registry - extensible pattern for zone rulesets
// Register minigame classes by ruleset name so game.js doesn't need
// hardcoded if-else chains for each minigame type.

const MINIGAME_REGISTRY = {};

/**
 * Register a minigame class for a given ruleset.
 * @param {string} ruleset - The ruleset identifier (matches zone JSON "ruleset" field)
 * @param {Function} MinigameClass - Constructor that accepts (game) parameter
 */
function registerMinigame(ruleset, MinigameClass) {
  MINIGAME_REGISTRY[ruleset] = MinigameClass;
}

/**
 * Create a minigame instance for the given ruleset.
 * @param {string} ruleset - The ruleset identifier
 * @param {Game} game - The Game instance
 * @returns {Object|null} Minigame instance or null if no match
 */
function createMinigame(ruleset, game) {
  const MinigameClass = MINIGAME_REGISTRY[ruleset];
  if (!MinigameClass) return null;
  return new MinigameClass(game);
}

// Make available globally (non-module scripts)
if (typeof window !== 'undefined') {
  window.registerMinigame = registerMinigame;
  window.createMinigame = createMinigame;
}
