const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const MAX_PARTY_SIZE = 6;

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
    return res.json({ success: true, player: { name: req.body.username } });
  }
  
  const { username } = req.body;
  
  try {
    const result = await pool.query(`
      INSERT INTO players (name) 
      VALUES ($1) 
      ON CONFLICT (name) 
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, balance, character_data
    `, [username]);
    
    res.json({ success: true, player: result.rows[0] });
  } catch (error) {
    console.error('Player creation error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/profile', async (req, res) => {
  if (!pool) {
    return res.json({ name: req.query.name || '', balance: null, character: null });
  }

  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }

  try {
    const result = await pool.query(
      'SELECT name, balance, character_data FROM players WHERE name = $1 LIMIT 1',
      [name]
    );
    if (result.rows.length === 0) {
      return res.json({ name, balance: null, character: null });
    }
    const row = result.rows[0];
    res.json({
      name: row.name,
      balance: row.balance !== null ? Number(row.balance) : null,
      character: row.character_data || null
    });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// WebSocket game rooms
const gameRooms = new Map();

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
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
  
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, {
      players: [],
      started: false
    });
  }
  
  const room = gameRooms.get(roomId);
  if (room.players.length >= MAX_PARTY_SIZE) {
    ws.send(JSON.stringify({ type: 'room_full', maxPlayers: MAX_PARTY_SIZE }));
    return;
  }
  
  // Add player to room
  const player = {
    id: playerId,
    username: username,
    ws: ws,
    ready: false
  };
  
  room.players.push(player);
  ws.roomId = roomId;
  ws.playerId = playerId;
  
  // Notify all players in room
  broadcastToRoom(roomId, {
    type: 'room_update',
    players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready })),
    roomId: roomId
  });
}

function handleLeaveRoom(ws, data) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.players = room.players.filter(p => p.id !== ws.playerId);
      
      if (room.players.length === 0) {
        gameRooms.delete(ws.roomId);
      } else {
        broadcastToRoom(ws.roomId, {
          type: 'room_update',
          players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready }))
        });
      }
    }
  }
}

function handlePlayerUpdate(ws, data) {
  if (ws.roomId) {
    broadcastToRoom(ws.roomId, {
      type: 'player_state',
      playerId: ws.playerId,
      state: data.state
    }, ws);
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
    }
  }
}

function handleZoneEnter(ws, data) {
  if (ws.roomId && data.zoneId) {
    broadcastToRoom(ws.roomId, {
      type: 'zone_enter',
      zoneId: data.zoneId,
      playerId: ws.playerId
    });
  }
}

function handleDisconnect(ws) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.players = room.players.filter(p => p.ws !== ws);
      
      if (room.players.length === 0) {
        gameRooms.delete(ws.roomId);
      } else {
        broadcastToRoom(ws.roomId, {
          type: 'player_left',
          playerId: ws.playerId
        });
      }
    }
  }
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
  console.log(`Server running on port ${PORT}`);
});
