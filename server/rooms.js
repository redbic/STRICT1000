// Room management module (CommonJS)
// Manages game rooms, player tracking, and broadcasting

const WebSocket = require('ws');

/**
 * @typedef {Object} Player
 * @property {string} id - Unique player identifier
 * @property {string} username - Display name
 * @property {WebSocket} ws - WebSocket connection
 * @property {string} zone - Current zone ID (e.g., 'hub', 'training')
 * @property {number} character - Character sprite number (1-7)
 */

/**
 * @typedef {Object} EnemyState
 * @property {string} id - Enemy ID (e.g., "training-enemy-0")
 * @property {number} x - X position
 * @property {number} y - Y position
 * @property {number} hp - Current HP
 * @property {number} maxHp - Maximum HP
 * @property {boolean} [stationary] - Whether enemy is stationary
 * @property {boolean} [passive] - Whether enemy is passive
 */

/**
 * @typedef {Object} Room
 * @property {Player[]} players - Players currently in the room
 * @property {boolean} started - Whether the game has started
 * @property {Set<string>} killedEnemies - Set of "zone-enemyId" keys for killed enemies
 * @property {Map<string, NodeJS.Timeout>} respawnTimers - Timers for enemy respawns
 * @property {string|null} hostId - Player ID of the room host (authoritative for enemies)
 * @property {Map<string, EnemyState[]>} zoneEnemies - Enemy state per zone (legacy, used for initial load)
 * @property {Map<string, import('./zone-session').ZoneSession>} zoneSessions - Active zone simulation sessions
 */

const MAX_PARTY_SIZE = 6;

/**
 * Manages game rooms, player tracking, host assignment, and broadcasting
 */
class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * Get a room by ID
   * @param {string} roomId
   * @returns {Room|undefined}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Check if a room exists
   * @param {string} roomId
   * @returns {boolean}
   */
  hasRoom(roomId) {
    return this.rooms.has(roomId);
  }

  /**
   * Create a new room
   * @param {string} roomId
   * @returns {Room}
   */
  createRoom(roomId) {
    const room = {
      players: [],
      started: false,
      killedEnemies: new Set(),
      respawnTimers: new Map(),
      hostId: null,
      zoneEnemies: new Map(), // Legacy enemy state per zone (used for initial load)
      zoneSessions: new Map(), // Active zone simulation sessions
    };
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Delete a room and clean up timers
   * @param {string} roomId
   */
  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.respawnTimers) {
        room.respawnTimers.forEach(timer => clearTimeout(timer));
      }
      // Shut down all active zone sessions
      if (room.zoneSessions) {
        room.zoneSessions.forEach(session => session.shutdown());
        room.zoneSessions.clear();
      }
    }
    this.rooms.delete(roomId);
  }

  /**
   * Add a player to a room
   * @param {string} roomId
   * @param {Player} player
   * @returns {boolean} - Whether the player was added
   */
  addPlayer(roomId, player) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.length >= MAX_PARTY_SIZE) return false;
    if (room.players.some(p => p.id === player.id)) return false;

    room.players.push(player);

    if (!room.hostId) {
      room.hostId = player.id;
    }

    return true;
  }

  /**
   * Remove a player from a room
   * @param {string} roomId
   * @param {string} playerId
   * @returns {{room: Room, newHostId: string|null}|null} - Room and new host if reassigned
   */
  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
      this.deleteRoom(roomId);
      return null;
    }

    // Reassign host if needed
    let newHostId = null;
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      newHostId = room.hostId;
    }

    return { room, newHostId };
  }

  /**
   * Remove a player by WebSocket reference
   * @param {string} roomId
   * @param {WebSocket} ws
   * @returns {{room: Room, newHostId: string|null}|null}
   */
  removePlayerByWs(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.ws === ws);
    if (!player) return null;

    return this.removePlayer(roomId, player.id);
  }

  /**
   * Get a serializable player roster for a room
   * @param {Room} room
   * @returns {{id: string, username: string, zone: string, character: number}[]}
   */
  getPlayerRoster(room) {
    return room.players.map(p => ({
      id: p.id,
      username: p.username,
      zone: p.zone,
      character: p.character || 1,
    }));
  }

  /**
   * Get list of rooms available for joining
   * @returns {{roomId: string, playerCount: number, maxPlayers: number, players: string[], started: boolean}[]}
   */
  getAvailableRooms() {
    const rooms = [];
    for (const [roomId, room] of this.rooms) {
      if (room.players.length < MAX_PARTY_SIZE) {
        rooms.push({
          roomId,
          playerCount: room.players.length,
          maxPlayers: MAX_PARTY_SIZE,
          players: room.players.map(p => p.username),
          started: room.started,
        });
      }
    }
    return rooms;
  }

  /**
   * Broadcast a message to all players in a room
   * @param {string} roomId
   * @param {Object} message - Message object to JSON.stringify
   * @param {WebSocket} [excludeWs] - Optional WebSocket to exclude
   */
  broadcastToRoom(roomId, message, excludeWs = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(message);
    room.players.forEach(player => {
      if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(payload);
      }
    });
  }

  /**
   * Get enemy state for a zone, or null if not initialized
   * @param {string} roomId
   * @param {string} zoneId
   * @returns {EnemyState[]|null}
   */
  getZoneEnemies(roomId, zoneId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.zoneEnemies) return null;
    return room.zoneEnemies.get(zoneId) || null;
  }

  /**
   * Set enemy state for a zone
   * @param {string} roomId
   * @param {string} zoneId
   * @param {EnemyState[]} enemies
   */
  setZoneEnemies(roomId, zoneId, enemies) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.zoneEnemies) room.zoneEnemies = new Map();
    room.zoneEnemies.set(zoneId, enemies);
  }

  /**
   * Update a single enemy's state in a zone
   * @param {string} roomId
   * @param {string} zoneId
   * @param {string} enemyId
   * @param {Partial<EnemyState>} updates
   * @returns {EnemyState|null} - Updated enemy state or null if not found
   */
  updateEnemy(roomId, zoneId, enemyId, updates) {
    const room = this.rooms.get(roomId);
    if (!room || !room.zoneEnemies) return null;

    const enemies = room.zoneEnemies.get(zoneId);
    if (!enemies) return null;

    const enemy = enemies.find(e => e.id === enemyId);
    if (!enemy) return null;

    Object.assign(enemy, updates);
    return enemy;
  }

  /**
   * Remove an enemy from a zone (when killed)
   * @param {string} roomId
   * @param {string} zoneId
   * @param {string} enemyId
   * @returns {EnemyState|null} - Removed enemy or null if not found
   */
  removeEnemy(roomId, zoneId, enemyId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.zoneEnemies) return null;

    const enemies = room.zoneEnemies.get(zoneId);
    if (!enemies) return null;

    const index = enemies.findIndex(e => e.id === enemyId);
    if (index === -1) return null;

    const [removed] = enemies.splice(index, 1);
    return removed;
  }

  /**
   * Add an enemy back to a zone (for respawning)
   * @param {string} roomId
   * @param {string} zoneId
   * @param {EnemyState} enemy
   */
  addEnemy(roomId, zoneId, enemy) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.zoneEnemies) room.zoneEnemies = new Map();

    let enemies = room.zoneEnemies.get(zoneId);
    if (!enemies) {
      enemies = [];
      room.zoneEnemies.set(zoneId, enemies);
    }

    // Don't add duplicates
    if (!enemies.some(e => e.id === enemy.id)) {
      enemies.push(enemy);
    }
  }
}

module.exports = { RoomManager, MAX_PARTY_SIZE };
