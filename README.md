# STRICT Adventure ⚔️

A browser-based multiplayer top-down adventure game set in a mysterious hotel, inspired by Realm of the Mad God, Inscryption, and Wii Play Tanks. Features real-time co-op combat, a shared currency system, and a narrative-driven hotel hub.

## Features

- **Top-down 2D Exploration**: Fullscreen canvas with camera following the local player
- **Hotel Hub**: 1920s-styled lobby with clock, chandelier, portraits, and elevator
- **Zone System**: Multiple rooms with unique rulesets (darkness in The Gallery)
- **Click-to-Attack Combat**: Mouse-aimed melee with attack animations and hit sparks
- **Enemy AI**: Aggro, chase, and attack with host-authoritative sync
- **Server-side Currency**: Earn coins from enemy kills, persisted across sessions
- **Persistent Inventory**: 16-slot (4x4) grid saved per player
- **Multiplayer**: Real-time WebSocket co-op with interpolated remote players
- **Responsive Controls**: WASD/Arrow movement, mouse attack, `I` for inventory

## Tech Stack

- **Frontend**: Vanilla JavaScript + HTML5 Canvas
- **Backend**: Node.js + Express
- **Real-time**: WebSocket (ws library)
- **Database**: PostgreSQL (Neon.tech)
- **Hosting**: Render.com

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL (optional — game works without DB, but profiles/currency won't persist)

### Setup

```bash
git clone https://github.com/redbic/STRICT1000.git
cd STRICT1000
npm ci
cp .env.example .env   # Edit .env to set DATABASE_URL if needed
npm run dev
```

Open `http://localhost:3000` in your browser.

## How to Play

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move |
| Mouse Click | Attack toward cursor |
| I | Toggle inventory |

1. Enter your name and click **Confirm**
2. Create or join a multiplayer lobby
3. Click **Start Adventure** to enter the hotel hub
4. Walk into portals to transition between zones
5. Kill enemies to earn coins
6. Use **Recall** to return to the hub

## Project Structure

```
STRICT1000/
├── public/
│   ├── css/style.css          # Game styling
│   ├── js/
│   │   ├── main.js            # App logic, screens, profile, network setup
│   │   ├── game.js            # Game loop, canvas, camera, combat FX
│   │   ├── player.js          # Player movement, collision, melee, interpolation
│   │   ├── enemy.js           # Enemy AI: aggro, chase, attack
│   │   ├── track.js           # Zone class + ZONES data (walls, portals, rulesets)
│   │   ├── npc.js             # NPC rendering
│   │   └── network.js         # WebSocket client wrapper
│   └── index.html             # Screens (menu, lobby, game), HUD
├── server/
│   ├── currency.js            # Balance transactions with DB or in-memory fallback
│   ├── rooms.js               # Room lifecycle and player management
│   └── validation.js          # Input validation and sanitization utilities
├── server.js                  # Express + WebSocket server, API routes
├── render.yaml                # Render.com deployment config
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/player` | Register or update a player |
| `GET` | `/api/profile?name=` | Fetch player profile |
| `POST` | `/api/inventory` | Save player inventory (max 16 items) |
| `WS` | `/` | Multiplayer sync (rooms, state, kills) |

## Architecture

**Multiplayer sync** uses a host-authoritative model:
- The first player in a room is the **host** and runs enemy AI
- Non-host players send damage to the host via WebSocket
- Enemy state is synced from host to all players in the same zone
- Player state uses **interpolation** for smooth remote movement

**Server modules** are separated for maintainability:
- `server/validation.js` — reusable input validation
- `server/rooms.js` — room lifecycle, broadcast helpers
- `server/currency.js` — transactional balance operations

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Render.com + Neon.tech setup.

## Design Vision

See [GAME_DESIGN_PLAN.md](./GAME_DESIGN_PLAN.md) for the full 5-phase design strategy.

## License

MIT
