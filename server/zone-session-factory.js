const { ZoneSession } = require('./zone-session');
const { TankZoneSession } = require('./tank-zone-session');

/**
 * Registry of zone session types by ruleset name.
 * Add new session types here to support new minigames/zone modes.
 */
const SESSION_TYPES = {
  tanks: TankZoneSession,
};

/**
 * Create a zone session for the given ruleset.
 * Falls back to ZoneSession for unknown/default rulesets.
 *
 * @param {string} roomId
 * @param {string} zoneId
 * @param {Object} zoneData - Zone JSON data (may contain .ruleset)
 * @param {Object} deps - Dependencies (e.g. { onEnemyDeath })
 * @returns {ZoneSession|TankZoneSession}
 */
function createZoneSession(roomId, zoneId, zoneData, deps) {
  const ruleset = zoneData && zoneData.ruleset;
  const SessionClass = SESSION_TYPES[ruleset] || ZoneSession;
  return new SessionClass(roomId, zoneId, zoneData || {}, deps);
}

/**
 * Register a new session type for a ruleset.
 * Use this to add support for new zone modes (e.g. dungeon, pvp arena).
 *
 * @param {string} ruleset - The ruleset identifier (matches zone JSON "ruleset" field)
 * @param {Function} SessionClass - Constructor for the session (must match ZoneSession interface)
 */
function registerSessionType(ruleset, SessionClass) {
  SESSION_TYPES[ruleset] = SessionClass;
}

module.exports = { createZoneSession, registerSessionType };
