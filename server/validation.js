// Input validation and sanitization utilities (CommonJS)

const MAX_ROOM_ID_LENGTH = 64;
const MAX_PLAYER_ID_LENGTH = 64;
const MAX_USERNAME_LENGTH = 32;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9 _-]*[A-Za-z0-9])?$/;
const ALLOWED_ZONE_IDS = new Set(['hub', 'training']);
const PLAYER_STATE_KEYS = new Set(['id', 'x', 'y', 'angle', 'speed', 'zoneLevel', 'username', 'stunned', 'hp', 'isDead']);
const INVENTORY_MAX_ITEMS = 16;

function normalizeSafeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s{2,}/g, ' ');
}

function isSafeString(value, { minLength = 1, maxLength = 64, pattern = null } = {}) {
  const normalized = normalizeSafeString(value);
  if (normalized.length < minLength || normalized.length > maxLength) return false;
  return pattern ? pattern.test(normalized) : true;
}

function isValidRoomId(roomId) {
  return isSafeString(roomId, { maxLength: MAX_ROOM_ID_LENGTH, pattern: ROOM_ID_PATTERN });
}

function isValidPlayerId(playerId) {
  return isSafeString(playerId, { maxLength: MAX_PLAYER_ID_LENGTH, pattern: PLAYER_ID_PATTERN });
}

function isValidUsername(username) {
  return isSafeString(username, { maxLength: MAX_USERNAME_LENGTH, pattern: USERNAME_PATTERN });
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidPlayerState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;

  const stateKeys = Object.keys(state);
  if (stateKeys.some(key => !PLAYER_STATE_KEYS.has(key))) return false;

  const validCoreFields =
    isFiniteNumberInRange(state.x, -10000, 10000) &&
    isFiniteNumberInRange(state.y, -10000, 10000) &&
    isFiniteNumberInRange(state.angle, -Math.PI * 4, Math.PI * 4) &&
    isFiniteNumberInRange(state.speed, 0, 10) &&
    Number.isInteger(state.zoneLevel) && state.zoneLevel >= 1 && state.zoneLevel <= 10000;

  if (!validCoreFields) return false;
  if (typeof state.stunned !== 'boolean') return false;

  if (state.id !== undefined && !isValidPlayerId(state.id)) return false;
  if (state.username !== undefined && !isValidUsername(state.username)) return false;

  // Validate optional hp and isDead fields
  if (state.hp !== undefined && !isFiniteNumberInRange(state.hp, 0, 10000)) return false;
  if (state.isDead !== undefined && typeof state.isDead !== 'boolean') return false;

  return true;
}

function isValidZoneId(zoneId) {
  return isSafeString(zoneId, { maxLength: 32, pattern: ROOM_ID_PATTERN }) && ALLOWED_ZONE_IDS.has(zoneId);
}

function sanitizeInventory(rawInventory) {
  if (!Array.isArray(rawInventory)) return [];

  const sanitized = [];
  for (const rawItem of rawInventory) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;

    const id = normalizeSafeString(rawItem.id).slice(0, 64);
    const name = normalizeSafeString(rawItem.name).slice(0, 48);
    const icon = normalizeSafeString(rawItem.icon || '📦').slice(0, 8);
    if (!id || !name) continue;

    sanitized.push({ id, name, icon: icon || '📦' });
    if (sanitized.length >= INVENTORY_MAX_ITEMS) break;
  }

  return sanitized;
}

module.exports = {
  normalizeSafeString,
  isSafeString,
  isValidRoomId,
  isValidPlayerId,
  isValidUsername,
  isFiniteNumberInRange,
  isValidPlayerState,
  isValidZoneId,
  sanitizeInventory,
  ALLOWED_ZONE_IDS,
  INVENTORY_MAX_ITEMS,
  MAX_ROOM_ID_LENGTH,
  MAX_PLAYER_ID_LENGTH,
  MAX_USERNAME_LENGTH,
};
