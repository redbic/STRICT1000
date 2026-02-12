const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const currency = require('./server/currency');
const { RoomManager, MAX_PARTY_SIZE } = require('./server/rooms');
const { createAuthRouter, authMiddleware, isSessionAuthenticated } = require('./server/auth');
const {
  normalizeSafeString,
  isValidRoomId,
  isValidPlayerId,
  isValidUsername,
  isValidPlayerState,
  isValidZoneId,
  sanitizeInventory,
} = require('./server/validation');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  noServer: true, // We handle upgrades manually for session auth
  maxPayload: 64 * 1024, // 64 KB max message size
});

const PORT = process.env.PORT || 3000;
const ENEMY_KILL_REWARD = 5;
const DEATH_PENALTY_COINS = 20;
// Inbound WebSocket message types (client -> server)
const WS_MESSAGE_TYPES = new Set([
  'join_room',
  'leave_room',
  'player_update',
  'game_start',
  'zone_enter',
  'enemy_killed',
  'enemy_sync',
  'enemy_damage',
  'list_rooms',
  'player_death',
]);
// Outbound message types (server -> client):
// room_update, player_state, game_start, zone_enter, player_zone,
// balance_update, enemy_sync, enemy_respawn, host_assigned, player_left, room_list, room_full
const HTTP_BODY_SIZE_LIMIT = '16kb';
const WS_MAX_ENEMY_SYNC_COUNT = 64;
const WS_MAX_CONNECTIONS_PER_IP = 5;

// WebSocket rate limiting
const WS_RATE_LIMIT_WINDOW_MS = 10000;
const WS_RATE_LIMIT_MAX_MESSAGES = 100;
const wsConnectionsByIp = new Map();
const WS_IP_CLEANUP_INTERVAL_MS = 60000; // Clean up stale IP entries every 60s

validateEnvironment();

// PostgreSQL connection pool
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

// Room manager
const rooms = new RoomManager();

// Trust proxy (for deployments behind reverse proxy like Render, Railway, etc.)
app.set('trust proxy', 1);

// Session middleware
const isProduction = process.env.NODE_ENV === 'production';
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'strict1000-dev-secret-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' // 'strict' can cause issues with redirects
  }
});

// Body parser for login (must come before auth routes)
app.use(express.json({ limit: HTTP_BODY_SIZE_LIMIT }));

// Session middleware
app.use(sessionMiddleware);

// Auth routes (login must be before auth middleware)
app.use(createAuthRouter());
app.use(authMiddleware);

// Static files (after auth)
app.use(express.static(path.join(__dirname, 'public')));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- API Routes ---

app.post('/api/player', async (req, res) => {
  const username = normalizeSafeString(req.body.username);
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  if (!pool) {
    return res.json({ success: true, player: { name: username, inventory_data: [] } });
  }

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
  const name = normalizeSafeString(req.query.name);
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }

  if (!pool) {
    return res.json({ name, balance: null, character: null, inventory: [] });
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
      inventory: sanitizeInventory(row.inventory_data),
    });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/inventory', async (req, res) => {
  const username = normalizeSafeString(req.body.username);
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const sanitized = sanitizeInventory(req.body.inventory);

  if (!pool) {
    return res.json({ success: true, inventory: sanitized });
  }

  try {
    const result = await pool.query(
      `UPDATE players
       SET inventory_data = $2::jsonb
       WHERE name = $1
       RETURNING inventory_data`,
      [username, JSON.stringify(sanitized)]
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

// --- Database schema migration ---

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

// --- WebSocket handlers ---

/**
 * Safely send data to a WebSocket client with error handling
 * @param {WebSocket} ws - WebSocket connection
 * @param {object} data - Data to send (will be JSON stringified)
 */
function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (_) {
      /* ignore send errors - connection may be closing */
    }
  }
}

function broadcastRoomList() {
  const available = rooms.getAvailableRooms();
  const message = JSON.stringify({ type: 'room_list', rooms: available });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && !client.roomId) {
      try { client.send(message); } catch (_) { /* ignore */ }
    }
  });
}

function getAllowedOrigins() {
  const configuredOrigin = normalizeSafeString(process.env.APP_ORIGIN || '');
  const origins = new Set();
  if (configuredOrigin) origins.add(configuredOrigin);
  return origins;
}

function isAllowedWsOrigin(origin, request) {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.size > 0) {
    return allowedOrigins.has(origin);
  }

  const requestHost = normalizeSafeString(request?.headers?.host || '');
  if (!requestHost) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === requestHost;
  } catch (_error) {
    return false;
  }
}

function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!normalizeSafeString(process.env.APP_PASSWORD || '')) {
    throw new Error('APP_PASSWORD is required to password protect STRICT1000');
  }

  if (nodeEnv === 'production') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production');
    }
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET is required in production');
    }
  }
}

function getClientIp(request) {
  const forwarded = normalizeSafeString(request.headers['x-forwarded-for'] || '');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return request.socket?.remoteAddress || 'unknown';
}

function registerWsConnection(ip) {
  const count = wsConnectionsByIp.get(ip) || 0;
  if (count >= WS_MAX_CONNECTIONS_PER_IP) {
    return false;
  }

  wsConnectionsByIp.set(ip, count + 1);
  return true;
}

function unregisterWsConnection(ip) {
  const count = wsConnectionsByIp.get(ip) || 0;
  if (count <= 1) {
    wsConnectionsByIp.delete(ip);
    return;
  }

  wsConnectionsByIp.set(ip, count - 1);
}

function parseWsPayload(message) {
  if (typeof message !== 'string') return null;

  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!WS_MESSAGE_TYPES.has(data.type)) return null;

  return data;
}

wss.on('connection', (ws, request) => {
  // Check session-based authentication
  // The session was already validated in the upgrade handler
  if (!request.session || !isSessionAuthenticated(request.session)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const clientIp = getClientIp(request);
  if (!registerWsConnection(clientIp)) {
    ws.close(1008, 'Too many connections');
    return;
  }

  ws.clientIp = clientIp;
  ws.messageCount = 0;
  ws.lastReset = Date.now();

  ws.on('message', (message) => {
    // Rate limiting
    const now = Date.now();
    if (now - ws.lastReset > WS_RATE_LIMIT_WINDOW_MS) {
      ws.messageCount = 0;
      ws.lastReset = now;
    }
    ws.messageCount++;
    if (ws.messageCount > WS_RATE_LIMIT_MAX_MESSAGES) {
      console.warn('Rate limit exceeded for connection, closing');
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    const data = parseWsPayload(message.toString());
    if (!data) return;

    switch (data.type) {
      case 'join_room':    handleJoinRoom(ws, data); break;
      case 'leave_room':   handleLeaveRoom(ws); break;
      case 'player_update': handlePlayerUpdate(ws, data); break;
      case 'game_start':   handleGameStart(ws); break;
      case 'zone_enter':   handleZoneEnter(ws, data); break;
      case 'enemy_killed': handleEnemyKilled(ws, data); break;
      case 'enemy_sync':   handleEnemySync(ws, data); break;
      case 'enemy_damage': handleEnemyDamage(ws, data); break;
      case 'list_rooms':   handleListRooms(ws); break;
      case 'player_death': handlePlayerDeath(ws, data); break;
      default: break;
    }
  });

  ws.on('close', () => {
    unregisterWsConnection(ws.clientIp || 'unknown');
    handleDisconnect(ws);
  });
});

function handleJoinRoom(ws, data) {
  const { roomId, playerId, username } = data;

  if (!isValidRoomId(roomId) || !isValidPlayerId(playerId) || !isValidUsername(username)) {
    return;
  }

  const nRoomId = normalizeSafeString(roomId);
  const nPlayerId = normalizeSafeString(playerId);
  const nUsername = normalizeSafeString(username);

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
  };

  rooms.addPlayer(nRoomId, player);
  ws.roomId = nRoomId;
  ws.playerId = nPlayerId;
  ws.username = nUsername;

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
  if (!ws.roomId) return;

  const result = rooms.removePlayer(ws.roomId, ws.playerId);
  if (result) {
    const { room, newHostId } = result;
    if (newHostId) {
      rooms.broadcastToRoom(ws.roomId, { type: 'host_assigned', hostId: newHostId });
    }
    rooms.broadcastToRoom(ws.roomId, {
      type: 'room_update',
      players: rooms.getPlayerRoster(room),
      hostId: room.hostId,
    });
  }

  broadcastRoomList();
  ws.roomId = null;
  ws.playerId = null;
}

function handlePlayerUpdate(ws, data) {
  if (!ws.roomId) return;
  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  if (!isValidPlayerState(data.state)) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  // Pre-serialize once for all recipients
  const payload = JSON.stringify({
    type: 'player_state',
    playerId: ws.playerId,
    state: data.state,
  });

  room.players.forEach(player => {
    if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN && player.zone === sender.zone) {
      player.ws.send(payload);
    }
  });
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

function handleZoneEnter(ws, data) {
  if (!ws.roomId || !data.zoneId) return;
  const zoneId = normalizeSafeString(data.zoneId);
  if (!isValidZoneId(zoneId)) return;

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const player = room.players.find(p => p.id === ws.playerId);
  if (player) player.zone = zoneId;

  rooms.broadcastToRoom(ws.roomId, {
    type: 'player_zone',
    playerId: ws.playerId,
    zoneId,
  }, ws);

  const zoneMates = room.players
    .filter(p => p.zone === zoneId && p.id !== ws.playerId)
    .map(p => ({ id: p.id, username: p.username, zone: p.zone }));

  safeSend(ws, {
    type: 'zone_enter',
    zoneId,
    playerId: ws.playerId,
    zonePlayers: zoneMates,
  });
}

async function handleEnemyKilled(ws, data) {
  const { enemyId, zone } = data;
  const zoneKey = (typeof zone === 'string' ? zone.trim().toLowerCase() : '') || 'unknown';

  if (!ws.roomId || !ws.username || !enemyId || typeof enemyId !== 'string') return;

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const enemyKey = `${zoneKey}-${enemyId}`;
  if (room.killedEnemies.has(enemyKey)) return;

  room.killedEnemies.add(enemyKey);

  const newBalance = await currency.addBalance(
    pool, ws.username, ENEMY_KILL_REWARD, 'enemy_kill',
    { game: 'strict1000', enemy: enemyId, zone: zoneKey }
  );

  if (newBalance !== null) {
    safeSend(ws, { type: 'balance_update', balance: newBalance });
  }

  // Respawn timer for all zones
  const respawnDelay = 10000;
  if (room.respawnTimers.has(enemyKey)) {
    clearTimeout(room.respawnTimers.get(enemyKey));
  }

  const roomId = ws.roomId;
  const timerId = setTimeout(() => {
    const currentRoom = rooms.getRoom(roomId);
    if (!currentRoom) return;

    currentRoom.killedEnemies.delete(enemyKey);
    rooms.broadcastToRoom(roomId, {
      type: 'enemy_respawn',
      enemyId,
      zone: zoneKey,
    });
    currentRoom.respawnTimers.delete(enemyKey);
  }, respawnDelay);

  room.respawnTimers.set(enemyKey, timerId);
}

function handleEnemySync(ws, data) {
  if (!ws.roomId || !Array.isArray(data.enemies)) return;
  if (data.enemies.length > WS_MAX_ENEMY_SYNC_COUNT) return;

  const room = rooms.getRoom(ws.roomId);
  if (!room || ws.playerId !== room.hostId) return;

  const host = room.players.find(p => p.id === room.hostId);
  const hostZone = host ? host.zone : null;

  // Pre-serialize once
  const payload = JSON.stringify({ type: 'enemy_sync', enemies: data.enemies });

  room.players.forEach(player => {
    if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN && player.zone === hostZone) {
      player.ws.send(payload);
    }
  });
}

function handleEnemyDamage(ws, data) {
  if (!ws.roomId || !data.enemyId || typeof data.damage !== 'number') return;
  if (data.damage < 0 || data.damage > 100) return;

  const room = rooms.getRoom(ws.roomId);
  if (!room || !room.hostId) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  const host = room.players.find(p => p.id === room.hostId);
  if (!sender || !host || sender.zone !== host.zone) return;

  safeSend(host.ws, {
    type: 'enemy_damage',
    enemyId: data.enemyId,
    damage: data.damage,
    attackerId: ws.playerId,
  });
}

function handleDisconnect(ws) {
  if (!ws.roomId) return;

  const roomId = ws.roomId;
  const result = rooms.removePlayerByWs(roomId, ws);

  if (result) {
    const { newHostId } = result;
    if (newHostId) {
      rooms.broadcastToRoom(roomId, { type: 'host_assigned', hostId: newHostId });
    }
    rooms.broadcastToRoom(roomId, { type: 'player_left', playerId: ws.playerId });
  }

  broadcastRoomList();
  ws.roomId = null;
  ws.playerId = null;
}

function handleListRooms(ws) {
  safeSend(ws, { type: 'room_list', rooms: rooms.getAvailableRooms() });
}

async function handlePlayerDeath(ws, data) {
  if (!ws.username) return;

  const zoneKey = (typeof data.zone === 'string' ? data.zone.trim().toLowerCase() : '') || 'unknown';

  // Try to deduct coins (death penalty) - may return null if insufficient funds
  let newBalance = await currency.deductBalance(
    pool, ws.username, DEATH_PENALTY_COINS, 'death_penalty',
    { game: 'strict1000', zone: zoneKey }
  );

  // If deduction failed (insufficient funds), get current balance
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

  // Send updated balance
  safeSend(ws, { type: 'balance_update', balance: newBalance !== null ? newBalance : 0 });
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    if (pool) {
      pool.end()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      return;
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Periodic cleanup of stale IP connection counts
setInterval(() => {
  for (const [ip, count] of wsConnectionsByIp) {
    if (count <= 0) {
      wsConnectionsByIp.delete(ip);
    }
  }
}, WS_IP_CLEANUP_INTERVAL_MS);

// Handle WebSocket upgrade with session authentication
server.on('upgrade', (request, socket, head) => {
  // Check origin
  const origin = request.headers.origin;
  if (origin && !isAllowedWsOrigin(origin, request)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Parse session from cookies
  sessionMiddleware(request, {}, () => {
    if (!request.session || !isSessionAuthenticated(request.session)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

// Start server
server.listen(PORT, async () => {
  await ensurePlayerSchema();
  console.log(`Server running on port ${PORT}`);
});
