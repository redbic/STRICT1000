const {
  normalizeSafeString,
  isValidRoomId,
  isValidPlayerId,
  isValidUsername,
  isValidPlayerState,
  isValidZoneId,
  isValidChatMessage,
} = require('../validation');
const { broadcastToZone, safeSend } = require('./broadcast');
const { createZoneSession } = require('../zone-session-factory');
const { MAX_PARTY_SIZE } = require('../rooms');

// Debug logging helper - only logs in development mode
const DEBUG = process.env.NODE_ENV !== 'production';
function debugLog(handler, message, data = null) {
  if (!DEBUG) return;
  if (data) {
    console.debug(`[WS:${handler}]`, message, data);
  } else {
    console.debug(`[WS:${handler}]`, message);
  }
}

const ENEMY_KILL_REWARD = 5;
const DEATH_PENALTY_COINS = 20;

/**
 * Create all WebSocket message handlers.
 * @param {Object} deps - Shared dependencies
 * @param {import('../rooms').RoomManager} deps.rooms
 * @param {import('pg').Pool|null} deps.pool
 * @param {Object} deps.currency
 * @param {Function} deps.loadZoneData
 * @param {Function} deps.broadcastRoomList
 * @returns {Object} Map of handler functions keyed by message type
 */
function createHandlers({ rooms, pool, currency, loadZoneData, broadcastRoomList }) {

  // --- Helper utilities ---

  /**
   * Get room and player context for a WebSocket connection.
   * @returns {{ room: Object, player: Object } | null}
   */
  function getPlayerContext(ws) {
    if (!ws.roomId) return null;
    const room = rooms.getRoom(ws.roomId);
    if (!room) return null;
    const player = room.players.find(p => p.id === ws.playerId);
    if (!player) return null;
    return { room, player };
  }

  /**
   * Remove a player from their zone session
   */
  function removePlayerFromZoneSession(roomId, playerId) {
    const room = rooms.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player && player.zone && room.zoneSessions) {
      const session = room.zoneSessions.get(player.zone);
      if (session) {
        const isEmpty = session.removePlayer(playerId);
        if (isEmpty) {
          room.zoneSessions.delete(player.zone);
        }
      }
    }
  }

  /**
   * Remove a player from a room (shared logic for leave and disconnect).
   * @param {WebSocket} ws
   * @param {'leave'|'disconnect'} reason
   */
  function removeFromRoom(ws, reason) {
    if (!ws.roomId) return;
    const roomId = ws.roomId;

    removePlayerFromZoneSession(roomId, ws.playerId);

    const result = reason === 'disconnect'
      ? rooms.removePlayerByWs(roomId, ws)
      : rooms.removePlayer(roomId, ws.playerId);

    if (result) {
      const { newHostId } = result;
      if (newHostId) {
        rooms.broadcastToRoom(roomId, { type: 'host_assigned', hostId: newHostId });
      }
      if (reason === 'disconnect') {
        rooms.broadcastToRoom(roomId, { type: 'player_left', playerId: ws.playerId });
      } else {
        rooms.broadcastToRoom(roomId, {
          type: 'room_update',
          players: rooms.getPlayerRoster(result.room),
          hostId: result.room.hostId,
        });
      }
    }

    broadcastRoomList();
    ws.roomId = null;
    ws.playerId = null;
  }

  /**
   * Handle enemy death from ZoneSession/TankZoneSession - awards coins to killer
   */
  async function handleZoneEnemyDeath(roomId, zoneId, enemyId, killerUsername, killerWs, reward) {
    const amount = typeof reward === 'number' ? reward : ENEMY_KILL_REWARD;
    const newBalance = await currency.addBalance(
      pool, killerUsername, amount, 'enemy_kill',
      { game: 'strict1000', enemy: enemyId, zone: zoneId }
    );
    if (newBalance !== null && killerWs) {
      safeSend(killerWs, { type: 'balance_update', balance: newBalance });
    }
  }

  // --- Message handlers ---

  function handleJoinRoom(ws, data) {
    const { roomId, playerId, username, character } = data;

    if (!isValidRoomId(roomId) || !isValidPlayerId(playerId) || !isValidUsername(username)) {
      debugLog('join_room', 'invalid input', { roomId, playerId, username });
      return;
    }

    const nRoomId = normalizeSafeString(roomId);
    const nPlayerId = normalizeSafeString(playerId);
    const nUsername = normalizeSafeString(username);
    const nCharacter = (typeof character === 'number' && character >= 1 && character <= 7)
      ? character
      : 1;

    if (!rooms.hasRoom(nRoomId)) {
      rooms.createRoom(nRoomId);
    }

    const room = rooms.getRoom(nRoomId);
    if (room.players.some(p => p.id === nPlayerId)) return;

    if (room.players.length >= MAX_PARTY_SIZE) {
      safeSend(ws, { type: 'room_full', maxPlayers: MAX_PARTY_SIZE });
      return;
    }

    const player = {
      id: nPlayerId,
      username: nUsername,
      ws,
      zone: 'hub',
      character: nCharacter,
    };

    rooms.addPlayer(nRoomId, player);
    ws.roomId = nRoomId;
    ws.playerId = nPlayerId;
    ws.username = nUsername;
    ws.character = nCharacter;

    rooms.broadcastToRoom(nRoomId, {
      type: 'room_update',
      players: rooms.getPlayerRoster(room),
      roomId: nRoomId,
      hostId: room.hostId,
    });

    if (room.started) {
      safeSend(ws, { type: 'game_start', timestamp: Date.now() });
    }

    broadcastRoomList();
  }

  function handleLeaveRoom(ws) {
    removeFromRoom(ws, 'leave');
  }

  function handlePlayerUpdate(ws, data) {
    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    if (!isValidPlayerState(data.state)) {
      debugLog('player_update', 'invalid state');
      return;
    }

    broadcastToZone(ctx.room, ctx.player.zone, {
      type: 'player_state',
      playerId: ws.playerId,
      state: data.state,
    }, ws);

    // Forward player position to zone session for enemy AI targeting
    const session = ctx.room.zoneSessions && ctx.room.zoneSessions.get(ctx.player.zone);
    if (session && data.state) {
      session.updatePlayerPosition(
        ws.playerId,
        data.state.x,
        data.state.y,
        data.state.hp,
        data.state.isDead
      );
    }
  }

  function handleGameStart(ws) {
    if (!ws.roomId) return;
    const room = rooms.getRoom(ws.roomId);
    if (!room) return;
    if (room.hostId !== ws.playerId) return;

    room.started = true;
    rooms.broadcastToRoom(ws.roomId, { type: 'game_start', timestamp: Date.now() });
    broadcastRoomList();
  }

  async function handleZoneEnter(ws, data) {
    if (!ws.roomId || !data.zoneId) {
      debugLog('zone_enter', 'missing roomId or zoneId');
      return;
    }
    const zoneId = normalizeSafeString(data.zoneId);
    if (!isValidZoneId(zoneId)) {
      debugLog('zone_enter', 'invalid zoneId', { zoneId });
      return;
    }

    const room = rooms.getRoom(ws.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === ws.playerId);
    if (!player) return;

    // Remove player from previous zone session
    const prevZone = player.zone;
    if (prevZone && prevZone !== zoneId && room.zoneSessions) {
      const prevSession = room.zoneSessions.get(prevZone);
      if (prevSession) {
        const isEmpty = prevSession.removePlayer(ws.playerId);
        if (isEmpty) {
          room.zoneSessions.delete(prevZone);
        }
      }
    }

    player.zone = zoneId;

    // Get or create zone session for this room+zone
    if (!room.zoneSessions) room.zoneSessions = new Map();
    let session = room.zoneSessions.get(zoneId);

    if (!session) {
      const zoneData = await loadZoneData(zoneId);
      const sessionDeps = { onEnemyDeath: handleZoneEnemyDeath };
      session = createZoneSession(ws.roomId, zoneId, zoneData, sessionDeps);
      debugLog('zone_enter', `created zone session for ${zoneId} (ruleset: ${zoneData?.ruleset || 'default'})`);
      room.zoneSessions.set(zoneId, session);
    }

    // Add player to zone session
    session.addPlayer(ws.playerId, ws, ws.username);

    // Get current alive enemies from the session
    const aliveEnemies = session.getAliveEnemies();

    rooms.broadcastToRoom(ws.roomId, {
      type: 'player_zone',
      playerId: ws.playerId,
      zoneId,
    }, ws);

    const zoneMates = room.players
      .filter(p => p.zone === zoneId && p.id !== ws.playerId)
      .map(p => ({ id: p.id, username: p.username, zone: p.zone }));

    const zoneEnterMsg = {
      type: 'zone_enter',
      zoneId,
      playerId: ws.playerId,
      zonePlayers: zoneMates,
      enemies: aliveEnemies,
    };

    // Include tank-specific state for tank zones
    if (session.getTankState) {
      zoneEnterMsg.tankState = session.getTankState();
    }

    safeSend(ws, zoneEnterMsg);
  }

  function handleEnemyDamage(ws, data) {
    if (!data.enemyId || typeof data.damage !== 'number') return;
    if (data.damage < 0 || data.damage > 100) return;

    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    const session = ctx.room.zoneSessions && ctx.room.zoneSessions.get(ctx.player.zone);
    if (!session) return;

    const fromX = Number.isFinite(data.fromX) ? data.fromX : undefined;
    const fromY = Number.isFinite(data.fromY) ? data.fromY : undefined;

    session.applyDamage(data.enemyId, data.damage, fromX, fromY, ws.username, ws);
  }

  function handleTankRestart(ws) {
    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    const session = ctx.room.zoneSessions && ctx.room.zoneSessions.get(ctx.player.zone);
    if (!session || !session.restart) return;

    session.restart();
  }

  function handleTankCrateDamage(ws, data) {
    if (!data.crateId || typeof data.damage !== 'number') return;
    if (data.damage < 0 || data.damage > 10) return;

    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    const session = ctx.room.zoneSessions && ctx.room.zoneSessions.get(ctx.player.zone);
    if (!session || !session.applyCrateDamage) return;

    session.applyCrateDamage(data.crateId, data.damage);
  }

  function handlePlayerFire(ws, data) {
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.angle !== 'number') return;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.angle)) return;

    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    broadcastToZone(ctx.room, ctx.player.zone, {
      type: 'player_fire',
      playerId: ws.playerId,
      x: data.x,
      y: data.y,
      angle: data.angle
    }, ws);
  }

  function handleDisconnect(ws) {
    removeFromRoom(ws, 'disconnect');
  }

  function handleListRooms(ws) {
    safeSend(ws, { type: 'room_list', rooms: rooms.getAvailableRooms() });
  }

  async function handlePlayerDeath(ws, data) {
    if (!ws.username) return;

    const zoneKey = (typeof data.zone === 'string' ? data.zone.trim().toLowerCase() : '') || 'unknown';

    let newBalance = await currency.deductBalance(
      pool, ws.username, DEATH_PENALTY_COINS, 'death_penalty',
      { game: 'strict1000', zone: zoneKey }
    );

    if (newBalance === null) {
      newBalance = await currency.getBalance(pool, ws.username);
    }

    // Clear inventory in database
    if (pool) {
      try {
        await pool.query(
          'UPDATE players SET inventory_data = $1::jsonb WHERE name = $2',
          ['[]', ws.username]
        );
      } catch (error) {
        console.error('Failed to clear inventory on death:', error);
      }
    }

    safeSend(ws, { type: 'balance_update', balance: newBalance !== null ? newBalance : 0 });
  }

  function handlePlayerChat(ws, data) {
    if (!ws.username) return;

    const text = normalizeSafeString(data.text || '');
    if (!isValidChatMessage(text)) return;

    const ctx = getPlayerContext(ws);
    if (!ctx) return;

    broadcastToZone(ctx.room, ctx.player.zone, {
      type: 'chat_message',
      playerId: ws.playerId,
      username: ws.username,
      text: text,
    });

    debugLog('player_chat', `${ws.username}: ${text}`);
  }

  return {
    handleJoinRoom,
    handleLeaveRoom,
    handlePlayerUpdate,
    handleGameStart,
    handleZoneEnter,
    handleEnemyDamage,
    handleTankRestart,
    handleTankCrateDamage,
    handlePlayerFire,
    handleDisconnect,
    handleListRooms,
    handlePlayerDeath,
    handlePlayerChat,
  };
}

module.exports = { createHandlers };
