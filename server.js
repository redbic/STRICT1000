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
const { ZoneSession } = require('./server/zone-session');
const { TankZoneSession } = require('./server/tank-zone-session');
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
  'enemy_damage',
  'list_rooms',
  'player_death',
  'player_fire',
  'player_chat',
  'tank_restart',
  'tank_crate_damage',
]);
// Outbound message types (server -> client):
// room_update, player_state, game_start, zone_enter, player_zone,
// balance_update, enemy_sync, enemy_state_update, enemy_killed_sync, enemy_respawn,
// enemy_attack, host_assigned, player_left, room_list, room_full, player_fire, chat_message
// tank_sync, tank_wave_start, tank_killed, tank_crate_destroyed, tank_player_hit,
// tank_pickup_collected, tank_game_over, tank_state_reset
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

// Security headers (must be before static files so they apply to all responses)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Static files (after auth and security headers)
app.use(express.static(path.join(__dirname, 'public')));

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

// Save zone data (restricted to development mode only — zone editor is a dev tool)
app.post('/api/zones/:zoneId', async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ error: 'Zone editing is disabled in production' });
  }

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
      case 'enemy_damage': handleEnemyDamage(ws, data); break;
      case 'list_rooms':   handleListRooms(ws); break;
      case 'player_death': handlePlayerDeath(ws, data); break;
      case 'player_fire':  handlePlayerFire(ws, data); break;
      case 'player_chat':  handlePlayerChat(ws, data); break;
      case 'tank_restart':     handleTankRestart(ws); break;
      case 'tank_crate_damage': handleTankCrateDamage(ws, data); break;
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
 * Remove a player from their zone session (shared by handleLeaveRoom and handleDisconnect)
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

// Zone Transition Pattern:
// Client initiates zone_enter, server validates and broadcasts player_zone to room,
// then sends zone_enter back to the client with list of players in that zone.
// Server runs authoritative enemy simulation per zone via ZoneSession.
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

  // Remove player from previous zone session (if they were in a different zone)
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

    if (zoneData && zoneData.ruleset === 'tanks') {
      session = new TankZoneSession(ws.roomId, zoneId, zoneData, sessionDeps);
      debugLog('zone_enter', `created tank zone session for ${zoneId}`);
    } else {
      session = new ZoneSession(ws.roomId, zoneId, zoneData || {}, sessionDeps);
      debugLog('zone_enter', `created zone session for ${zoneId} with ${session.enemies.length} enemies`);
    }
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

  // Send zone enter with current enemy state from zone session
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

/**
 * Handle enemy death from ZoneSession/TankZoneSession - awards coins to killer
 * Called by session.deps.onEnemyDeath
 * @param {string} roomId
 * @param {string} zoneId
 * @param {string} enemyId
 * @param {string} killerUsername
 * @param {WebSocket} killerWs
 * @param {number} [reward] - Optional custom reward amount (defaults to ENEMY_KILL_REWARD)
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

// --- Tank minigame handlers ---

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

// Periodic cleanup of stale IP connection counts — reconcile with actual connections
setInterval(() => {
  // Count actual open connections per IP
  const actualCounts = new Map();
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientIp) {
      actualCounts.set(client.clientIp, (actualCounts.get(client.clientIp) || 0) + 1);
    }
  });

  // Reconcile: remove stale entries, correct drifted counts
  for (const [ip] of wsConnectionsByIp) {
    const actual = actualCounts.get(ip) || 0;
    if (actual === 0) {
      wsConnectionsByIp.delete(ip);
    } else {
      wsConnectionsByIp.set(ip, actual);
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
