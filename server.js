const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const currency = require('./server/currency');
const { RoomManager } = require('./server/rooms');
const { createAuthRouter, authMiddleware, isSessionAuthenticated } = require('./server/auth');
const { normalizeSafeString } = require('./server/validation');
const { createPool } = require('./server/db/pool');
const { safeSend } = require('./server/websocket/broadcast');
const { createPlayerRouter } = require('./server/api/players');
const { createZoneRouter, loadZoneData } = require('./server/api/zones');
const { createHandlers } = require('./server/websocket/handlers');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  noServer: true, // We handle upgrades manually for session auth
  maxPayload: 64 * 1024, // 64 KB max message size
});

const PORT = process.env.PORT || 3000;

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

const HTTP_BODY_SIZE_LIMIT = '5mb';
const WS_MAX_CONNECTIONS_PER_IP = 5;

// WebSocket rate limiting
const WS_RATE_LIMIT_WINDOW_MS = 10000;
const WS_RATE_LIMIT_MAX_MESSAGES = 300;
const wsConnectionsByIp = new Map();
const WS_IP_CLEANUP_INTERVAL_MS = 60000;

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
    sameSite: 'lax'
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

// --- API Routes (extracted modules) ---
app.use('/api', createPlayerRouter(pool));
app.use('/api', createZoneRouter(isProduction));

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

// --- WebSocket setup ---

function broadcastRoomList() {
  const available = rooms.getAvailableRooms();
  const message = JSON.stringify({ type: 'room_list', rooms: available });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && !client.roomId) {
      try { client.send(message); } catch (_) { /* ignore */ }
    }
  });
}

// Create all message handlers with shared dependencies
const handlers = createHandlers({
  rooms,
  pool,
  currency,
  loadZoneData,
  broadcastRoomList,
});

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
      case 'join_room':    handlers.handleJoinRoom(ws, data); break;
      case 'leave_room':   handlers.handleLeaveRoom(ws); break;
      case 'player_update': handlers.handlePlayerUpdate(ws, data); break;
      case 'game_start':   handlers.handleGameStart(ws); break;
      case 'zone_enter':   handlers.handleZoneEnter(ws, data); break;
      case 'enemy_damage': handlers.handleEnemyDamage(ws, data); break;
      case 'list_rooms':   handlers.handleListRooms(ws); break;
      case 'player_death': handlers.handlePlayerDeath(ws, data); break;
      case 'player_fire':  handlers.handlePlayerFire(ws, data); break;
      case 'player_chat':  handlers.handlePlayerChat(ws, data); break;
      case 'tank_restart':     handlers.handleTankRestart(ws); break;
      case 'tank_crate_damage': handlers.handleTankCrateDamage(ws, data); break;
      default: break;
    }
  });

  ws.on('close', () => {
    unregisterWsConnection(ws.clientIp || 'unknown');
    handlers.handleDisconnect(ws);
  });
});

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
  const actualCounts = new Map();
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientIp) {
      actualCounts.set(client.clientIp, (actualCounts.get(client.clientIp) || 0) + 1);
    }
  });

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
  const origin = request.headers.origin;
  if (origin && !isAllowedWsOrigin(origin, request)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

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
