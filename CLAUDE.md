# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci          # Install dependencies
npm run dev     # Start dev server with nodemon (auto-reload)
npm start       # Start production server
```

Server runs at `http://localhost:3000`. Requires `APP_PASSWORD` env var (see `.env.example`).

## Architecture

**Browser-based multiplayer top-down adventure game** using vanilla JS + HTML5 Canvas frontend, Node.js/Express + WebSocket backend, PostgreSQL persistence.

### Server (`server.js` + `server/`)

- **Entry point**: `server.js` - HTTP server, WebSocket server, API routes, message handlers
- **Authentication**: `server/auth.js` - Session-based auth with login page, rate limiting
- **Room management**: `server/rooms.js` - RoomManager class handles player tracking, host assignment, broadcasting
- **Currency**: `server/currency.js` - Server-authoritative balance system with ledger (in-memory fallback when no DB)
- **Validation**: `server/validation.js` - Input sanitization, allowed zone IDs, player state validation

### Client (`public/js/`)

- **main.js**: UI/screen management, network event handlers, game initialization
- **game.js**: Game class - canvas rendering, game loop, camera, portal transitions, enemy management
- **player.js**: Player class - movement, combat, state sync
- **enemy.js**: Enemy class - AI behavior, aggro, damage
- **track.js**: Zone class + ZONES object defining all game areas (walls, portals, nodes)
- **network.js**: NetworkManager class - WebSocket client, room/zone messaging
- **npc.js**: NPC definitions

### Multiplayer Model

- **Room host** is authoritative for enemy simulation (broadcasts `enemy_sync`)
- **Server** is authoritative for room membership, zone filtering, currency
- Player updates are filtered by zone - only players in same zone receive state updates
- Enemy kills are debounced per room+zone+enemy key to prevent double-crediting

### WebSocket Message Types

`join_room`, `leave_room`, `player_update`, `game_start`, `zone_enter`, `enemy_killed`, `enemy_sync`, `enemy_damage`, `list_rooms`

## Key Patterns

- All user input validated via `server/validation.js` - use `normalizeSafeString()`, `isValidUsername()`, etc.
- Player state synced at 20 updates/second in multiplayer
- Portals define zone transitions - `portal.id` matches target zone name
- Session-based authentication with login page (`/login.html`) - password checked against `APP_PASSWORD` env var
- Authentication managed by `server/auth.js` - login rate limiting, session middleware

## Adding New Zones

When creating a new zone:
1. Create `public/data/zones/{zonename}.json` (use environment builder)
2. **Add zone ID to `server/validation.js` → `ALLOWED_ZONE_IDS`** (portals won't work otherwise!)
3. Add portals in other zones that connect to the new zone

## Environment Variables

- `APP_PASSWORD` (required) - Site password for login
- `SESSION_SECRET` (required in production) - Secret for signing session cookies
- `DATABASE_URL` (required in production) - PostgreSQL connection string
- `APP_ORIGIN` (production) - Allowed WebSocket origin
- `PORT` (default 3000)
- `NODE_ENV` (`development` or `production`)

## Database

PostgreSQL with tables: `players` (name, balance, character_data, inventory_data), `wallet_ledger`. Schema auto-migrates on startup. Works without DB in dev (in-memory fallback).
