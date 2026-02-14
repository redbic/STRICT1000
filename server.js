const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
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
  isValidChatMessage,
} = require('./server/validation');
const { createPool } = require('./server/db/pool');
const { broadcastToZone, safeSend } = require('./server/websocket/broadcast');
const { getZoneHost, getMainHostZone } = require('./server/websocket/zone-host');
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
const ENEMY_RESPAWN_DELAY_MS = 10000; // 10 seconds

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
  'player_fire',
  'player_chat',
]);
// Outbound message types (server -> client):
// room_update, player_state, game_start, zone_enter, player_zone,
// balance_update, enemy_sync, enemy_respawn, host_assigned, player_left, room_list, room_full
const HTTP_BODY_SIZE_LIMIT = '5mb';
const WS_MAX_ENEMY_SYNC_COUNT = 64;
const WS_MAX_CONNECTIONS_PER_IP = 5;

// WebSocket rate limiting
const WS_RATE_LIMIT_WINDOW_MS = 10000;
const WS_RATE_LIMIT_MAX_MESSAGES = 300; // Increased to support player updates + enemy sync
const wsConnectionsByIp = new Map();
const WS_IP_CLEANUP_INTERVAL_MS = 60000; // Clean up stale IP entries every 60s

validateEnvironment();

// PostgreSQL connection pool
const pool = createPool(process.env.DATABASE_URL, process.env.NODE_ENV === 'production');

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

// Inventory Save: Client-authoritative model
// The client sends full inventory state, server trusts it after sanitization.
// This is acceptable for cooperative play. For a competitive game, this would
// need server-side item tracking with item generation/consumption validation.
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

// --- Zone API ---

const fs = require('fs').promises;
const zonesDir = path.join(__dirname, 'public', 'data', 'zones');

// Cache for zone data (to avoid repeated file reads)
const zoneDataCache = new Map();

/**
 * Load zone data from JSON file
 * @param {string} zoneId
 * @returns {Promise<Object|null>}
 */
async function loadZoneData(zoneId) {
  if (zoneDataCache.has(zoneId)) {
    return zoneDataCache.get(zoneId);
  }

  try {
    const filePath = path.join(zonesDir, `${zoneId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    zoneDataCache.set(zoneId, parsed);
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to load zone ${zoneId}:`, error);
    }
    return null;
  }
}

/**
 * Initialize enemy state for a zone from zone data
 * @param {string} zoneId
 * @param {Object} zoneData
 * @returns {Array}
 */
function createEnemyStateFromZone(zoneId, zoneData) {
  if (!zoneData || !Array.isArray(zoneData.enemies)) {
    return [];
  }

  return zoneData.enemies.map((enemyData, index) => ({
    id: `${zoneId}-enemy-${index}`,
    x: enemyData.x,
    y: enemyData.y,
    hp: enemyData.hp || 100,
    maxHp: enemyData.maxHp || enemyData.hp || 100,
    stationary: enemyData.stationary || false,
    passive: enemyData.passive || false,
  }));
}

// Save zone data
app.post('/api/zones/:zoneId', async (req, res) => {
  const zoneId = normalizeSafeString(req.params.zoneId);
  if (!zoneId || !/^[a-z0-9_-]+$/i.test(zoneId)) {
    return res.status(400).json({ error: 'Invalid zone ID' });
  }

  const zoneData = req.body;
  if (!zoneData || typeof zoneData !== 'object') {
    return res.status(400).json({ error: 'Invalid zone data' });
  }

  try {
    // Ensure directory exists
    await fs.mkdir(zonesDir, { recursive: true });

    // Write zone file
    const filePath = path.join(zonesDir, `${zoneId}.json`);
    await fs.writeFile(filePath, JSON.stringify(zoneData, null, 2));

    res.json({ success: true, zoneId });
  } catch (error) {
    console.error('Zone save error:', error);
    res.status(500).json({ error: 'Failed to save zone' });
  }
});

// Get zone data
app.get('/api/zones/:zoneId', async (req, res) => {
  const zoneId = normalizeSafeString(req.params.zoneId);
  if (!zoneId || !/^[a-z0-9_-]+$/i.test(zoneId)) {
    return res.status(400).json({ error: 'Invalid zone ID' });
  }

  try {
    const filePath = path.join(zonesDir, `${zoneId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Zone not found' });
    }
    console.error('Zone load error:', error);
    res.status(500).json({ error: 'Failed to load zone' });
  }
});

// List all zones
app.get('/api/zones', async (req, res) => {
  try {
    await fs.mkdir(zonesDir, { recursive: true });
    const files = await fs.readdir(zonesDir);
    const zones = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    res.json({ zones });
  } catch (error) {
    console.error('Zone list error:', error);
    res.status(500).json({ error: 'Failed to list zones' });
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
      case 'player_fire':  handlePlayerFire(ws, data); break;
      case 'player_chat':  handlePlayerChat(ws, data); break;
      default: break;
    }
  });

  ws.on('close', () => {
    unregisterWsConnection(ws.clientIp || 'unknown');
    handleDisconnect(ws);
  });
});

function handleJoinRoom(ws, data) {
  const { roomId, playerId, username, character } = data;

  if (!isValidRoomId(roomId) || !isValidPlayerId(playerId) || !isValidUsername(username)) {
    debugLog('join_room', 'invalid input', { roomId, playerId, username });
    return;
  }

  const nRoomId = normalizeSafeString(roomId);
  const nPlayerId = normalizeSafeString(playerId);
  const nUsername = normalizeSafeString(username);
  // Validate character number (1-7 for players)
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
  if (!ws.roomId) {
    debugLog('player_update', 'no roomId');
    return;
  }
  const room = rooms.getRoom(ws.roomId);
  if (!room) {
    debugLog('player_update', 'room not found', { roomId: ws.roomId });
    return;
  }

  if (!isValidPlayerState(data.state)) {
    debugLog('player_update', 'invalid state');
    return;
  }

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  broadcastToZone(room, sender.zone, {
    type: 'player_state',
    playerId: ws.playerId,
    state: data.state,
  }, ws);
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

// Zone Transition Pattern:
// Client initiates zone_enter, server validates and broadcasts player_zone to room,
// then sends zone_enter back to the client with list of players in that zone.
// Server is authoritative for enemy state - sends current enemy HP when player enters zone.
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
  if (player) player.zone = zoneId;

  // Initialize enemy state for this zone if not already done
  let enemies = rooms.getZoneEnemies(ws.roomId, zoneId);
  if (!enemies) {
    const zoneData = await loadZoneData(zoneId);
    enemies = createEnemyStateFromZone(zoneId, zoneData);
    rooms.setZoneEnemies(ws.roomId, zoneId, enemies);
    debugLog('zone_enter', `initialized ${enemies.length} enemies for zone ${zoneId}`);
  }

  // Filter out killed enemies that haven't respawned yet
  const aliveEnemies = enemies.filter(e => {
    const enemyKey = `${zoneId}-${e.id}`;
    return !room.killedEnemies.has(enemyKey);
  });

  rooms.broadcastToRoom(ws.roomId, {
    type: 'player_zone',
    playerId: ws.playerId,
    zoneId,
  }, ws);

  const zoneMates = room.players
    .filter(p => p.zone === zoneId && p.id !== ws.playerId)
    .map(p => ({ id: p.id, username: p.username, zone: p.zone }));

  // Send zone enter with current enemy state
  safeSend(ws, {
    type: 'zone_enter',
    zoneId,
    playerId: ws.playerId,
    zonePlayers: zoneMates,
    enemies: aliveEnemies, // Server-authoritative enemy state
  });
}

async function handleEnemyKilled(ws, data) {
  // Legacy handler - enemy kills are now handled server-side when HP reaches 0
  // This is kept for backward compatibility but shouldn't be called in the new system
  const { enemyId, zone } = data;
  const zoneKey = (typeof zone === 'string' ? zone.trim().toLowerCase() : '') || 'unknown';

  if (!ws.roomId || !ws.username || !enemyId || typeof enemyId !== 'string') return;

  // Delegate to the new server-side death handler
  await handleEnemyDeath(ws.roomId, zoneKey, enemyId, ws.username);
}

function handleEnemySync(ws, data) {
  if (!ws.roomId || !Array.isArray(data.enemies)) {
    debugLog('enemy_sync', 'missing roomId or enemies');
    return;
  }
  if (data.enemies.length > WS_MAX_ENEMY_SYNC_COUNT) {
    debugLog('enemy_sync', 'too many enemies', { count: data.enemies.length });
    return;
  }

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  const hostZone = getMainHostZone(room);

  // Allow sync from main host, or from zone hosts (players in zones without the host)
  const isMainHost = ws.playerId === room.hostId;
  const isZoneHostPlayer = sender.zone !== hostZone;

  if (!isMainHost && !isZoneHostPlayer) return;

  broadcastToZone(room, sender.zone, { type: 'enemy_sync', enemies: data.enemies }, ws);
}

function handleEnemyDamage(ws, data) {
  if (!ws.roomId || !data.enemyId || typeof data.damage !== 'number') {
    debugLog('enemy_damage', 'missing required fields');
    return;
  }
  if (data.damage < 0 || data.damage > 100) {
    debugLog('enemy_damage', 'invalid damage value', { damage: data.damage });
    return;
  }

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  const zoneId = sender.zone;

  // Update server-side enemy state
  const enemy = rooms.updateEnemy(ws.roomId, zoneId, data.enemyId, {});
  if (!enemy) {
    debugLog('enemy_damage', 'enemy not found', { enemyId: data.enemyId, zone: zoneId });
    return;
  }

  // Apply damage on server
  enemy.hp = Math.max(0, enemy.hp - data.damage);
  debugLog('enemy_damage', `${data.enemyId} took ${data.damage} damage, hp: ${enemy.hp}`);

  // Broadcast updated enemy state to ALL players in zone
  broadcastToZone(room, zoneId, {
    type: 'enemy_state_update',
    enemyId: data.enemyId,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
  });

  // If enemy died, handle it server-side
  if (enemy.hp <= 0) {
    handleEnemyDeath(ws.roomId, zoneId, data.enemyId, ws.username);
  }
}

/**
 * Handle enemy death server-side
 */
async function handleEnemyDeath(roomId, zoneId, enemyId, killerUsername) {
  const room = rooms.getRoom(roomId);
  if (!room) return;

  const enemyKey = `${zoneId}-${enemyId}`;
  if (room.killedEnemies.has(enemyKey)) return; // Already dead

  room.killedEnemies.add(enemyKey);

  // Remove enemy from active state
  const removedEnemy = rooms.removeEnemy(roomId, zoneId, enemyId);

  // Broadcast enemy death to all players in zone
  broadcastToZone(room, zoneId, {
    type: 'enemy_killed_sync',
    enemyId,
    zone: zoneId,
  });

  // Award coins to killer if we can find their socket
  for (const player of room.players) {
    if (player.username === killerUsername) {
      const newBalance = await currency.addBalance(
        pool, killerUsername, ENEMY_KILL_REWARD, 'enemy_kill',
        { game: 'strict1000', enemy: enemyId, zone: zoneId }
      );
      if (newBalance !== null) {
        safeSend(player.ws, { type: 'balance_update', balance: newBalance });
      }
      break;
    }
  }

  // Set up respawn timer
  if (room.respawnTimers.has(enemyKey)) {
    clearTimeout(room.respawnTimers.get(enemyKey));
  }

  const timerId = setTimeout(() => {
    const currentRoom = rooms.getRoom(roomId);
    if (!currentRoom) return;

    currentRoom.killedEnemies.delete(enemyKey);

    // Re-add enemy with full HP
    if (removedEnemy) {
      removedEnemy.hp = removedEnemy.maxHp;
      rooms.addEnemy(roomId, zoneId, removedEnemy);
    }

    // Broadcast respawn to all players in zone
    broadcastToZone(currentRoom, zoneId, {
      type: 'enemy_respawn',
      enemyId,
      zone: zoneId,
      enemy: removedEnemy, // Send full enemy state
    });

    currentRoom.respawnTimers.delete(enemyKey);
  }, ENEMY_RESPAWN_DELAY_MS);

  room.respawnTimers.set(enemyKey, timerId);
}

function handlePlayerFire(ws, data) {
  if (!ws.roomId) return;
  if (typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.angle !== 'number') return;
  if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.angle)) return;

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  broadcastToZone(room, sender.zone, {
    type: 'player_fire',
    playerId: ws.playerId,
    x: data.x,
    y: data.y,
    angle: data.angle
  }, ws);
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

function handlePlayerChat(ws, data) {
  if (!ws.roomId || !ws.username) {
    debugLog('player_chat', 'missing roomId or username');
    return;
  }

  const text = normalizeSafeString(data.text || '');
  if (!isValidChatMessage(text)) {
    debugLog('player_chat', 'invalid chat message', { text });
    return;
  }

  const room = rooms.getRoom(ws.roomId);
  if (!room) return;

  const sender = room.players.find(p => p.id === ws.playerId);
  if (!sender) return;

  const zoneId = sender.zone;

  // Broadcast to all players in the same zone
  broadcastToZone(room, zoneId, {
    type: 'chat_message',
    playerId: ws.playerId,
    username: ws.username,
    text: text,
  });

  debugLog('player_chat', `${ws.username}: ${text}`);
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
