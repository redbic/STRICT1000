# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci          # Install dependencies (use this, not npm install)
npm run dev     # Start dev server with nodemon (auto-reload)
npm start       # Start production server
```

Server runs at `http://localhost:3000`. Requires `APP_PASSWORD` env var (see `.env.example`). No test suite, linter, or build step exists.

## Project Overview

**Browser-based multiplayer top-down adventure game** ("strict-adventure") using vanilla JS + HTML5 Canvas frontend, Node.js/Express + WebSocket backend, PostgreSQL persistence. Includes mini-games (tank battle, card game). Deployed to Render.com.

## Architecture

### Server (`server.js` + `server/`)

- **Entry point**: `server.js` (~960 lines) - HTTP server, WebSocket server, all API routes, all WS message handlers, zone session lifecycle
- **Authentication**: `server/auth.js` - Session-based auth with login page, timing-safe password comparison, per-IP login rate limiting (10/min)
- **Room management**: `server/rooms.js` - `RoomManager` class handles player tracking, host assignment, broadcasting. Max party size: 6
- **Currency**: `server/currency.js` - Server-authoritative balance system with DB transactions + wallet ledger. In-memory fallback with simple lock mechanism when no DB. Starting balance: 1000
- **Validation**: `server/validation.js` - Input sanitization, allowed zone IDs, player state validation, inventory sanitization, chat message validation
- **Zone sessions**: `server/zone-session.js` - `ZoneSession` class: server-authoritative enemy AI simulation at 20Hz. Handles enemy spawning, movement, aggro, attack, knockback, death/respawn
- **Tank sessions**: `server/tank-zone-session.js` - `TankZoneSession` class: server-authoritative tank mini-game with wave spawning, projectile physics, wall bouncing, crate destruction, health pickups
- **Collision**: `server/simulation/collision.js` - `ServerCollision` class: AABB collision detection against walls and physical tile objects (mirrors client-side `Zone.checkCollision()`)
- **Constants**: `server/simulation/constants.js` + `tank-constants.js` - Server-side game constants (must stay in sync with `public/js/config/constants.js`)
- **Broadcasting**: `server/websocket/broadcast.js` - `broadcastToZone()`, `broadcastToRoom()`, `safeSend()` utilities
- **Database**: `server/db/pool.js` - PostgreSQL connection pool factory

### Client (`public/js/`)

~9,500 lines of vanilla JavaScript (no bundler, no framework, ES modules + globals).

- **main.js**: UI/screen management, network event handlers, game initialization
- **game.js**: Game class (~1,470 lines) - canvas rendering, game loop, camera, portal transitions, enemy management
- **player.js**: Player class - movement, acceleration-based physics, combat, gun system, state sync
- **enemy.js**: Enemy class - client-side rendering/interpolation of server-authoritative enemy state
- **track.js**: Zone class + ZONES object defining all game areas (walls, portals, nodes). Also `zone-loader.js` for JSON loading
- **network.js**: `NetworkManager` class - WebSocket client, all room/zone/tank messaging
- **card-game.js**: Card game mini-game implementation (~1,230 lines) - lane-based card battler
- **tank-game.js**: Tank game client-side rendering and input (~514 lines)
- **pixi-renderer.js**: Optional Pixi.js-based renderer (~901 lines)
- **audio.js**: Audio system - spatial sound, music fading, SFX with pitch variation
- **particles.js**: Particle effects system (death particles, dust, ground marks)
- **projectile.js**: Client-side projectile rendering and physics
- **config/constants.js**: `CONFIG` object with all game constants (shared via `window.CONFIG`)
- **config/tilesets.js**: Tileset configuration
- **combat/gun.js**: Gun combat system
- **core/game-state.js**, **core/effects.js**, **core/input.js**: Game state, visual effects, input handling
- **entities/entity.js**: Base entity class
- **network/callbacks.js**: Network event callback wiring
- **rendering/entity-renderer.js**: Entity rendering utilities
- **character-sprites.js**, **sprites.js**, **tileset.js**, **colors.js**, **npc.js**, **tts.js**: Supporting modules

### Directory Structure

```
server.js                          # Main entry point
server/
  auth.js                          # Authentication
  currency.js                      # Balance/ledger system
  rooms.js                         # Room management
  validation.js                    # Input validation + ALLOWED_ZONE_IDS
  zone-session.js                  # Server-authoritative enemy simulation
  tank-zone-session.js             # Server-authoritative tank mini-game
  db/pool.js                       # PostgreSQL connection pool
  simulation/collision.js          # AABB collision detection
  simulation/constants.js          # Enemy/knockback/tick constants
  simulation/tank-constants.js     # Tank game constants
  websocket/broadcast.js           # Message broadcasting utilities
public/
  index.html                       # Main game page
  login.html                       # Login page
  css/style.css                    # Stylesheet
  js/                              # Client JavaScript (see above)
  data/zones/*.json                # Zone data files (hub, training, hallway, elevator, elevator2, tanks, cards)
  assets/characters/*.png          # 20 character sprite sheets
  assets/tiles/*.png               # 26+ tileset images
  sounds/music/                    # Background music (combat_theme.ogg)
  sounds/sfx/                      # Sound effects (footsteps, gun, impact, enemy sounds, portal)
  tools/                           # Dev tools: environment-builder.html, character-viewer.html, tile-picker.html
```

### Multiplayer Model

- **Server** runs authoritative enemy/tank simulation per room+zone via `ZoneSession` / `TankZoneSession` at 20Hz
- **Server** is authoritative for room membership, zone filtering, currency, enemy HP/death/respawn
- Player updates are filtered by zone - only players in the same zone receive state updates
- Enemy kills are processed server-side; coin rewards granted via `currency.addBalance()` with ledger tracking
- Zone sessions are created lazily on first player entry and destroyed when empty
- Zones with `"ruleset": "tanks"` in their JSON get a `TankZoneSession` instead of a regular `ZoneSession`

### WebSocket Message Types

**Client -> Server (inbound):**
`join_room`, `leave_room`, `player_update`, `game_start`, `zone_enter`, `enemy_damage`, `list_rooms`, `player_death`, `player_fire`, `player_chat`, `tank_restart`, `tank_crate_damage`

**Server -> Client (outbound):**
`room_update`, `player_state`, `game_start`, `zone_enter`, `player_zone`, `balance_update`, `enemy_sync`, `enemy_state_update`, `enemy_killed_sync`, `enemy_respawn`, `enemy_attack`, `host_assigned`, `player_left`, `room_list`, `room_full`, `player_fire`, `chat_message`, `tank_sync`, `tank_wave_start`, `tank_killed`, `tank_crate_destroyed`, `tank_player_hit`, `tank_pickup_collected`, `tank_game_over`, `tank_state_reset`

### API Routes

- `POST /login` - Authenticate with `APP_PASSWORD`
- `POST /api/player` - Create/upsert player by username
- `GET /api/profile?name=` - Get player profile (balance, character, inventory)
- `POST /api/inventory` - Save player inventory (client-authoritative, sanitized server-side)
- `GET /api/zones` - List all zones
- `GET /api/zones/:zoneId` - Get zone data JSON
- `POST /api/zones/:zoneId` - Save zone data (dev mode only)
- `GET /health` - Health check

## Key Patterns

- All user input validated via `server/validation.js` - use `normalizeSafeString()`, `isValidUsername()`, `isValidZoneId()`, `isValidChatMessage()`, `sanitizeInventory()`, etc.
- Player state synced at ~10 updates/second (`PLAYER_UPDATE_INTERVAL: 100ms`) from client; server ticks enemy simulation at 20Hz
- Portals define zone transitions - `portal.id` matches target zone name
- Session-based authentication with login page (`/login.html`) - password checked against `APP_PASSWORD` env var with timing-safe comparison
- WebSocket connections require authenticated session (checked during HTTP upgrade)
- WebSocket rate limiting: 300 messages per 10 seconds per connection, max 5 connections per IP
- Security headers set on all responses: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Resource-Policy`
- Constants must stay in sync between `public/js/config/constants.js` and `server/simulation/constants.js` + `tank-constants.js`
- Game rewards: enemy kill = 5 coins, tank kill = 10 coins, boss kill = 50 coins, card win = 50 coins. Death penalty = 20 coins + inventory cleared
- In-memory fallback: when `DATABASE_URL` is not set, currency uses in-memory `Map` with starting balance of 1000

## Adding New Zones

When creating a new zone:
1. Create `public/data/zones/{zonename}.json` (use the environment builder at `/tools/environment-builder.html`)
2. **Add zone ID to `server/validation.js` -> `ALLOWED_ZONE_IDS` Set** (zone transitions won't work otherwise!)
3. Add portals in other zones that connect to the new zone
4. If the zone uses a special ruleset (e.g., `"ruleset": "tanks"`), ensure the corresponding session class exists

Current zones: `hub`, `training`, `hallway`, `elevator`, `elevator2`, `tanks`, `cards`

## Environment Variables

- `APP_PASSWORD` (required) - Site password for login
- `SESSION_SECRET` (required in production) - Secret for signing session cookies
- `DATABASE_URL` (required in production) - PostgreSQL connection string
- `APP_ORIGIN` (production) - Allowed WebSocket origin for CORS checks
- `PORT` (default 3000)
- `NODE_ENV` (`development` or `production`)

## Database

PostgreSQL with tables: `players` (name, balance, character_data, inventory_data), `wallet_ledger` (player_id, delta, reason, metadata). Schema auto-migrates on startup via `ensurePlayerSchema()`. Works without DB in dev (in-memory fallback). Default starting balance: 1000.

## Deployment

Deployed to Render.com via `render.yaml`. Build command: `npm ci`. Start command: `npm start`. Health check at `/health`. Zone editing is disabled in production.

## Dev Tools

- `public/tools/environment-builder.html` - Visual zone editor (saves via `POST /api/zones/:zoneId`, dev only)
- `public/tools/character-viewer.html` - Character sprite sheet viewer
- `public/tools/tile-picker.html` - Tileset tile selector

## Tech Stack

- **Runtime**: Node.js >= 18
- **Server**: Express 4, ws (WebSocket), express-session, express-rate-limit
- **Database**: PostgreSQL via pg
- **Frontend**: Vanilla JS (ES modules + globals), HTML5 Canvas, optional Pixi.js renderer
- **Dev**: nodemon for auto-reload
- **No**: TypeScript, bundler, linter, test framework, CI/CD
