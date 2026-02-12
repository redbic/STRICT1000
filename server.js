const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const currency = require('./server/currency');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const MAX_PARTY_SIZE = 6;
const ENEMY_KILL_REWARD = 5; // coins per enemy killed

// PostgreSQL connection pool for Neon.tech
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// API Routes
app.post('/api/player', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, player: { name: req.body.username, inventory_data: [] } });
  }
  
  const { username } = req.body;
  
  try {
    const result = await pool.query(`
      INSERT INTO players (name) 
      VALUES ($1) 
      ON CONFLICT (name) 
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, balance, character_data, inventory_data
    `, [username]);
    
    res.json({ success: true, player: result.rows[0] });
  } catch (error) {
    console.error('Player creation error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/profile', async (req, res) => {
  if (!pool) {
    return res.json({ name: req.query.name || '', balance: null, character: null, inventory: [] });
  }

  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }

  try {
    const result = await pool.query(
      'SELECT name, balance, character_data, inventory_data FROM players WHERE name = $1 LIMIT 1',
      [name]
    );
    if (result.rows.length === 0) {
      return res.json({ name, balance: null, character: null, inventory: [] });
    }
    const row = result.rows[0];
    res.json({
      name: row.name,
      balance: row.balance !== null ? Number(row.balance) : null,
      character: row.character_data || null,
      inventory: sanitizeInventory(row.inventory_data)
    });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint for balance operations
app.post('/api/balance/add', async (req, res) => {
  const { username, amount, reason, metadata } = req.body;
  
  if (!username || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  
  const newBalance = await currency.addBalance(pool, username, amount, reason || 'manual', metadata || {});
  
  if (newBalance === null) {
    return res.status(500).json({ error: 'Failed to update balance' });
  }
  
  res.json({ success: true, balance: newBalance });
});

app.post('/api/inventory', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, inventory: sanitizeInventory(req.body.inventory) });
  }

  const username = normalizeSafeString(req.body.username);
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const sanitizedInventory = sanitizeInventory(req.body.inventory);

  try {
    const result = await pool.query(
      `UPDATE players
       SET inventory_data = $2::jsonb
       WHERE name = $1
       RETURNING inventory_data`,
      [username, JSON.stringify(sanitizedInventory)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ success: true, inventory: sanitizeInventory(result.rows[0].inventory_data) });
  } catch (error) {
    console.error('Inventory save error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// WebSocket game rooms
const gameRooms = new Map();

// Rate limiting constants for WebSocket
const WS_RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const WS_RATE_LIMIT_MAX_MESSAGES = 100; // Max messages per window
const MAX_ROOM_ID_LENGTH = 64;
const MAX_PLAYER_ID_LENGTH = 64;
const MAX_USERNAME_LENGTH = 32;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
const ALLOWED_ZONE_IDS = new Set(['hub', 'training', 'gallery']);
const PLAYER_STATE_KEYS = new Set(['id', 'x', 'y', 'angle', 'speed', 'zoneLevel', 'position', 'username', 'stunned']);
const INVENTORY_MAX_ITEMS = 16;

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

async function ensurePlayerSchema() {
  if (!pool) return;

  try {
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS inventory_data JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  } catch (error) {
    console.error('Failed ensuring players inventory schema:', error);
  }
}

function warnInvalidInput(type, reason) {
  console.warn(`Rejected ${type}: ${reason}`);
}

function normalizeSafeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSafeString(value, { minLength = 1, maxLength = 64, pattern = null } = {}) {
  const normalized = normalizeSafeString(value);
  if (normalized.length < minLength || normalized.length > maxLength) return false;
  return pattern ? pattern.test(normalized) : true;
}

function isValidRoomId(roomId) {
  return isSafeString(roomId, {
    maxLength: MAX_ROOM_ID_LENGTH,
    pattern: ROOM_ID_PATTERN
  });
}

function isValidPlayerId(playerId) {
  return isSafeString(playerId, {
    maxLength: MAX_PLAYER_ID_LENGTH,
    pattern: PLAYER_ID_PATTERN
  });
}

function isValidUsername(username) {
  return isSafeString(username, {
    maxLength: MAX_USERNAME_LENGTH,
    pattern: USERNAME_PATTERN
  });
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
    isFiniteNumberInRange(state.speed, 0, 100) &&
    Number.isInteger(state.zoneLevel) && state.zoneLevel >= 1 && state.zoneLevel <= 100;

  if (!validCoreFields) return false;
  if (typeof state.stunned !== 'boolean') return false;
  if (!Number.isInteger(state.position) || state.position < 0 || state.position > 16) return false;

  if (state.id !== undefined && !isValidPlayerId(state.id)) return false;
  if (state.username !== undefined && !isValidUsername(state.username)) return false;

  return true;
}

function isValidZoneId(zoneId) {
  return isSafeString(zoneId, { maxLength: 32, pattern: ROOM_ID_PATTERN }) && ALLOWED_ZONE_IDS.has(zoneId);
}

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Initialize rate limiting for this connection
  ws.messageCount = 0;
  ws.lastReset = Date.now();
  
  ws.on('message', (message) => {
    try {
      // Rate limiting check
      const now = Date.now();
      if (now - ws.lastReset > WS_RATE_LIMIT_WINDOW_MS) {
        ws.messageCount = 0;
        ws.lastReset = now;
      }
      
      ws.messageCount++;
      if (ws.messageCount > WS_RATE_LIMIT_MAX_MESSAGES) {
        console.warn(`Rate limit exceeded for connection, closing`);
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_room':
          handleJoinRoom(ws, data);
          break;
        case 'leave_room':
          handleLeaveRoom(ws, data);
          break;
        case 'player_update':
          handlePlayerUpdate(ws, data);
          break;
        case 'game_start':
          handleGameStart(ws, data);
          break;
        case 'zone_enter':
          handleZoneEnter(ws, data);
          break;
        case 'enemy_killed':
          handleEnemyKilled(ws, data);
          break;
        case 'enemy_sync':
          handleEnemySync(ws, data);
          break;
        case 'enemy_damage':
          handleEnemyDamage(ws, data);
          break;
        case 'list_rooms':
          handleListRooms(ws);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleJoinRoom(ws, data) {
  const { roomId, playerId, username } = data;

  if (!isValidRoomId(roomId)) {
    warnInvalidInput('join_room', 'invalid roomId');
    return;
  }
  if (!isValidPlayerId(playerId)) {
    warnInvalidInput('join_room', 'invalid playerId');
    return;
  }
  if (!isValidUsername(username)) {
    warnInvalidInput('join_room', 'invalid username');
    return;
  }

  const normalizedRoomId = normalizeSafeString(roomId);
  const normalizedPlayerId = normalizeSafeString(playerId);
  const normalizedUsername = normalizeSafeString(username);
  
  if (!gameRooms.has(normalizedRoomId)) {
    gameRooms.set(normalizedRoomId, {
      players: [],
      started: false,
      killedEnemies: new Set(), // Track killed enemies to prevent double-rewards
      respawnTimers: new Map(), // Track respawn timers for enemies
      hostId: null // Track the host player for enemy sync
    });
  }
  
  const room = gameRooms.get(normalizedRoomId);
  if (room.players.some(player => player.id === normalizedPlayerId)) {
    warnInvalidInput('join_room', 'duplicate playerId in room');
    return;
  }

  if (room.players.length >= MAX_PARTY_SIZE) {
    ws.send(JSON.stringify({ type: 'room_full', maxPlayers: MAX_PARTY_SIZE }));
    return;
  }
  
  // Add player to room
  const player = {
    id: normalizedPlayerId,
    username: normalizedUsername,
    ws: ws,
    ready: false,
    zone: 'hub' // Track which zone each player is in
  };
  
  room.players.push(player);
  ws.roomId = normalizedRoomId;
  ws.playerId = normalizedPlayerId;
  ws.username = normalizedUsername; // Store username on WebSocket object
  
  // Assign host if none exists (first player becomes host)
  if (!room.hostId) {
    room.hostId = normalizedPlayerId;
  }
  
  // Notify all players in room
  broadcastToRoom(normalizedRoomId, {
    type: 'room_update',
    players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready, zone: p.zone })),
    roomId: normalizedRoomId,
    hostId: room.hostId
  });
  
  // If game already started, tell the new player to start immediately
  if (room.started) {
    ws.send(JSON.stringify({
      type: 'game_start',
      timestamp: Date.now()
    }));
  }
  
  // Notify unjoined clients about updated room list
  broadcastRoomList();
}

function handleLeaveRoom(ws, data) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.players = room.players.filter(p => p.id !== ws.playerId);
      
      if (room.players.length === 0) {
        // Clear all respawn timers before deleting the room
        if (room.respawnTimers) {
          room.respawnTimers.forEach(timer => clearTimeout(timer));
        }
        gameRooms.delete(ws.roomId);
      } else {
        // Reassign host if the leaving player was the host
        if (room.hostId === ws.playerId) {
          room.hostId = room.players[0].id;
          broadcastToRoom(ws.roomId, {
            type: 'host_assigned',
            hostId: room.hostId
          });
        }
        
        broadcastToRoom(ws.roomId, {
          type: 'room_update',
          players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready, zone: p.zone })),
          hostId: room.hostId
        });
      }
    }
    
    // Notify unjoined clients about updated room list
    broadcastRoomList();
    
    ws.roomId = null;
    ws.playerId = null;
  }
}

function handlePlayerUpdate(ws, data) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (!room) return;

    if (!isValidPlayerState(data.state)) {
      warnInvalidInput('player_update', 'invalid player state');
      return;
    }

    // Find the sending player to determine their zone
    const sender = room.players.find(p => p.id === ws.playerId);
    if (!sender) return;
    const senderZone = sender.zone;

    // Only send player state to other players in the same zone
    room.players.forEach(player => {
      if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN && player.zone === senderZone) {
        player.ws.send(JSON.stringify({
          type: 'player_state',
          playerId: ws.playerId,
          state: data.state
        }));
      }
    });
  }
}

function handleGameStart(ws, data) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.started = true;
      broadcastToRoom(ws.roomId, {
        type: 'game_start',
        timestamp: Date.now()
      });
      
      // Update room list to reflect started status
      broadcastRoomList();
    }
  }
}

function handleZoneEnter(ws, data) {
  if (ws.roomId && data.zoneId) {
    const normalizedZoneId = normalizeSafeString(data.zoneId);

    if (!isValidZoneId(normalizedZoneId)) {
      warnInvalidInput('zone_enter', 'invalid zoneId');
      return;
    }

    const room = gameRooms.get(ws.roomId);
    if (room) {
      // Update this player's zone on the server
      const player = room.players.find(p => p.id === ws.playerId);
      if (player) {
        player.zone = normalizedZoneId;
      }

      // Collect players already in the target zone (excluding the transitioning player)
      const zoneMates = room.players
        .filter(p => p.zone === normalizedZoneId && p.id !== ws.playerId)
        .map(p => ({ id: p.id, username: p.username, zone: p.zone }));

      // Only send the zone transition back to the player who entered the portal
      ws.send(JSON.stringify({
        type: 'zone_enter',
        zoneId: normalizedZoneId,
        playerId: ws.playerId,
        zonePlayers: zoneMates
      }));
    }
  }
}

async function handleEnemyKilled(ws, data) {
  const { enemyId, zone } = data;
  const normalizedZone = typeof zone === 'string' ? zone.trim().toLowerCase() : '';
  const zoneKey = normalizedZone || 'unknown'; // Zone values are canonical zone keys, not display names.
  
  if (!ws.roomId || !ws.username || !enemyId) {
    return;
  }
  
  const room = gameRooms.get(ws.roomId);
  if (!room) {
    return;
  }
  
  // Check if this enemy has already been rewarded
  const enemyKey = `${zoneKey}-${enemyId}`;
  if (room.killedEnemies.has(enemyKey)) {
    console.log(`Enemy ${enemyKey} already rewarded, skipping`);
    return;
  }
  
  // Mark enemy as killed
  room.killedEnemies.add(enemyKey);
  
  // Award coins
  const newBalance = await currency.addBalance(
    pool, 
    ws.username, 
    ENEMY_KILL_REWARD, 
    'enemy_kill',
    { game: 'strict1000', enemy: enemyId, zone: zoneKey }
  );
  
  if (newBalance !== null) {
    // Send balance update to the player
    ws.send(JSON.stringify({
      type: 'balance_update',
      balance: newBalance
    }));
  }
  
  // Schedule enemy respawn for training dummies (10 second timer)
  if (zoneKey === 'training') {
    const respawnDelay = 10000; // 10 seconds
    
    // Clear any existing timer for this enemy
    if (room.respawnTimers.has(enemyKey)) {
      clearTimeout(room.respawnTimers.get(enemyKey));
    }
    
    // Schedule respawn
    const timerId = setTimeout(() => {
      // Check if room still exists
      const currentRoom = gameRooms.get(ws.roomId);
      if (!currentRoom) return;
      
      // Remove from killed enemies so it can be killed again
      currentRoom.killedEnemies.delete(enemyKey);
      
      // Broadcast respawn to all players in room
      broadcastToRoom(ws.roomId, {
        type: 'enemy_respawn',
        enemyId: enemyId,
        zone: zoneKey
      });
      
      // Clean up timer reference
      currentRoom.respawnTimers.delete(enemyKey);
    }, respawnDelay);
    
    room.respawnTimers.set(enemyKey, timerId);
  }
}

function handleEnemySync(ws, data) {
  if (!ws.roomId || !Array.isArray(data.enemies)) return;
  
  const room = gameRooms.get(ws.roomId);
  if (!room) return;
  
  // Only accept enemy sync from the host
  if (ws.playerId !== room.hostId) return;

  // Find the host's zone
  const host = room.players.find(p => p.id === room.hostId);
  const hostZone = host ? host.zone : null;
  
  // Broadcast enemy state only to non-host players in the same zone
  room.players.forEach(player => {
    if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN && player.zone === hostZone) {
      player.ws.send(JSON.stringify({
        type: 'enemy_sync',
        enemies: data.enemies
      }));
    }
  });
}

function handleEnemyDamage(ws, data) {
  if (!ws.roomId || !data.enemyId || typeof data.damage !== 'number') return;
  
  // Validate damage is within reasonable bounds (prevent cheating)
  if (data.damage < 0 || data.damage > 100) {
    console.warn(`Invalid damage amount from ${ws.playerId}: ${data.damage}`);
    return;
  }
  
  const room = gameRooms.get(ws.roomId);
  if (!room || !room.hostId) return;

  // Only forward damage if the sender is in the same zone as the host
  const sender = room.players.find(p => p.id === ws.playerId);
  const host = room.players.find(p => p.id === room.hostId);
  if (!sender || !host || sender.zone !== host.zone) return;
  
  // Forward damage to the host player
  if (host.ws.readyState === WebSocket.OPEN) {
    host.ws.send(JSON.stringify({
      type: 'enemy_damage',
      enemyId: data.enemyId,
      damage: data.damage,
      attackerId: ws.playerId
    }));
  }
}

function handleDisconnect(ws) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.players = room.players.filter(p => p.ws !== ws);
      
      if (room.players.length === 0) {
        // Clear all respawn timers before deleting the room
        if (room.respawnTimers) {
          room.respawnTimers.forEach(timer => clearTimeout(timer));
        }
        gameRooms.delete(ws.roomId);
      } else {
        // Reassign host if the disconnected player was the host
        if (room.hostId === ws.playerId) {
          room.hostId = room.players[0].id;
          // Notify all remaining players about new host
          broadcastToRoom(ws.roomId, {
            type: 'host_assigned',
            hostId: room.hostId
          });
        }
        
        broadcastToRoom(ws.roomId, {
          type: 'player_left',
          playerId: ws.playerId
        });
      }
      
      // Notify unjoined clients about updated room list
      broadcastRoomList();
    }
  }
}

function handleListRooms(ws) {
  ws.send(JSON.stringify({
    type: 'room_list',
    rooms: getAvailableRooms()
  }));
}

function getAvailableRooms() {
  const rooms = [];
  for (const [roomId, room] of gameRooms) {
    if (room.players.length < MAX_PARTY_SIZE) {
      rooms.push({
        roomId: roomId,
        playerCount: room.players.length,
        maxPlayers: MAX_PARTY_SIZE,
        players: room.players.map(p => p.username),
        started: room.started
      });
    }
  }
  return rooms;
}

function broadcastRoomList() {
  const rooms = getAvailableRooms();
  const message = JSON.stringify({ type: 'room_list', rooms: rooms });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && !client.roomId) {
      try {
        client.send(message);
      } catch (err) {
        // Ignore individual send failures
      }
    }
  });
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = gameRooms.get(roomId);
  if (!room) return;
  
  room.players.forEach(player => {
    if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  });
}

// Start server
server.listen(PORT, async () => {
  await ensurePlayerSchema();
  console.log(`Server running on port ${PORT}`);
});
