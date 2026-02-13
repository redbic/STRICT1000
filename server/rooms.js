// Room management module (CommonJS)
// Manages game rooms, player tracking, and broadcasting

const WebSocket = require('ws');

const MAX_PARTY_SIZE = 6;

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  hasRoom(roomId) {
    return this.rooms.has(roomId);
  }

  createRoom(roomId) {
    const room = {
      players: [],
      started: false,
      killedEnemies: new Set(),
      respawnTimers: new Map(),
      hostId: null,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room && room.respawnTimers) {
      room.respawnTimers.forEach(timer => clearTimeout(timer));
    }
    this.rooms.delete(roomId);
  }

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

  removePlayerByWs(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.ws === ws);
    if (!player) return null;

    return this.removePlayer(roomId, player.id);
  }

  getPlayerRoster(room) {
    return room.players.map(p => ({
      id: p.id,
      username: p.username,
      zone: p.zone,
      character: p.character || 1,
    }));
  }

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
}

module.exports = { RoomManager, MAX_PARTY_SIZE };
