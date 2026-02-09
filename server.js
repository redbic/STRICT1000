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

// PostgreSQL connection pool for Neon.tech
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

// Initialize database tables
async function initDatabase() {
  if (!pool) return;
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        total_races INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        best_time INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS race_results (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id),
        track_name VARCHAR(100),
        race_time INTEGER,
        position INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
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
app.get('/api/leaderboard', async (req, res) => {
  if (!pool) {
    return res.json([]);
  }
  
  try {
    const result = await pool.query(`
      SELECT username, total_races, wins, best_time
      FROM players
      ORDER BY wins DESC, best_time ASC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/player', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, player: { username: req.body.username } });
  }
  
  const { username } = req.body;
  
  try {
    const result = await pool.query(`
      INSERT INTO players (username) 
      VALUES ($1) 
      ON CONFLICT (username) 
      DO UPDATE SET username = EXCLUDED.username
      RETURNING *
    `, [username]);
    
    res.json({ success: true, player: result.rows[0] });
  } catch (error) {
    console.error('Player creation error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/race-result', async (req, res) => {
  if (!pool) {
    return res.json({ success: true });
  }
  
  const { username, trackName, raceTime, position } = req.body;
  
  try {
    const playerResult = await pool.query(
      'SELECT id, best_time FROM players WHERE username = $1',
      [username]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const player = playerResult.rows[0];
    
    // Build dynamic update query
    const isWinner = position === 1;
    const winsIncrement = isWinner ? ', wins = wins + 1' : '';
    const updateQuery = `
      UPDATE players 
      SET total_races = total_races + 1${winsIncrement},
          best_time = CASE WHEN best_time IS NULL OR $2 < best_time THEN $2 ELSE best_time END 
      WHERE id = $1
    `;
    
    await pool.query(updateQuery, [player.id, raceTime]);
    
    // Insert race result
    await pool.query(
      'INSERT INTO race_results (player_id, track_name, race_time, position) VALUES ($1, $2, $3, $4)',
      [player.id, trackName, raceTime, position]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Race result error:', error);
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
        case 'race_start':
          handleRaceStart(ws, data);
          break;
        case 'item_use':
          handleItemUse(ws, data);
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

function handleRaceStart(ws, data) {
  if (ws.roomId) {
    const room = gameRooms.get(ws.roomId);
    if (room) {
      room.started = true;
      broadcastToRoom(ws.roomId, {
        type: 'race_start',
        timestamp: Date.now()
      });
    }
  }
}

function handleItemUse(ws, data) {
  if (ws.roomId) {
    broadcastToRoom(ws.roomId, {
      type: 'item_used',
      playerId: ws.playerId,
      itemType: data.itemType,
      target: data.target
    }, ws);
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
  await initDatabase();
});
