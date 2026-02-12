# HANDOFF.md — STRICT Adventure ⚔️

> Last updated: 2026-02-12

## Current State

STRICT1000 is a **multiplayer-only** top-down 2D adventure game (browser-based) with a hotel-themed narrative direction inspired by Inscryption, Realm of the Mad God, and Wii Play Tanks.

### What Works

- **Multiplayer**: WebSocket-based real-time co-op with host-authoritative enemy sync and player interpolation.
- **Movement**: WASD / Arrow keys, fullscreen canvas, camera follows local player, zone boundary clamping.
- **Combat**: Click-to-attack melee. Enemies aggro, chase, and deal damage. Kills award coins.
- **Zones**: 
  - **Hotel Lobby** (hub) — 1920s atmosphere with clock, chandelier, portraits, elevator
  - **Training** — Practice room with stationary dummy (respawns after 10s)
  - **The Gallery** — Darkness ruleset with 150px visibility radius
  - Portal-based zone transitions
- **Server-side currency**: Kills award coins (5 per kill), persisted in PostgreSQL.
- **Player profiles**: Loaded from shared DB — avatar, balance, inventory.
- **Inventory**: 16-slot (4×4) grid with hotbar, persisted per player.
- **Performance**: Decorative elements pre-rendered to cached canvases for 60fps.

### What Was Removed

- Singleplayer mode (PR #5)
- Hub enemies (hub is safe zone)
- Space-bar attack (mouse click only)
- Exposed `/api/balance/add` endpoint (security)

## Architecture

```
STRICT1000/
├── server.js                  # Express + WebSocket server, API routes
├── server/
│   ├── currency.js            # Balance transactions (DB + in-memory fallback)
│   ├── rooms.js               # Room lifecycle, player management, broadcasting
│   └── validation.js          # Input validation and sanitization
├── public/
│   ├── index.html             # Screens (menu, lobby, game), HUD
│   ├── css/style.css
│   └── js/
│       ├── main.js            # App logic, screens, profile, network setup
│       ├── game.js            # Game loop, canvas, camera, combat FX
│       ├── player.js          # Player movement, collision, melee, interpolation
│       ├── enemy.js           # Enemy AI: aggro, chase, attack
│       ├── track.js           # Zone class + ZONES data (walls, portals, rulesets)
│       ├── npc.js             # NPC rendering
│       └── network.js         # WebSocket client wrapper
├── package.json
├── render.yaml
├── DEPLOYMENT.md
├── GAME_DESIGN_PLAN.md
├── VISUAL_DESIGN_REFERENCE.md
├── TECHNICAL_FEASIBILITY_ASSESSMENT.md
└── README.md
```

### Key Data Flow

1. **Name confirm** → `loadProfile(username)` fetches `/api/profile` → shows balance/avatar
2. **Connect** → `NetworkManager.connect()` opens WebSocket → `joinRoom()` → lobby screen
3. **Start Adventure** → `startGame('hub')` → `Game.init('hub', username)` → game loop
4. **Zone transition** → player touches portal → `networkManager.enterZone()` → server updates zone
5. **Enemy kill** → host detects kill → `sendEnemyKilled()` → server awards coins → HUD updates

### Multiplayer Sync Model

- First player in a room is the **host** (runs enemy AI)
- Non-host players send damage to host; host applies and syncs state
- Player updates sent at 10Hz with significant-change detection
- Enemy sync sent at 10Hz from host to same-zone players
- Remote players use **linear interpolation** for smooth movement

## Next Steps (Priority Order)

### High Priority
- [ ] Projectile system (Wii Play Tanks-style)
- [ ] The Ballroom room (ranged combat, ricocheting projectiles)
- [ ] Receptionist dialogue system (unreliable narrator)

### Medium Priority
- [ ] More experimental rooms (Kitchen, Library)
- [ ] Currency shop
- [ ] Visual juice (screen shake, damage numbers, particles)
- [ ] Lobby evolution system

### Lower Priority
- [ ] Room 237 meta-narrative reveal
- [ ] Sound / music
- [ ] Mobile touch controls

## Known Issues

- No automated tests (acceptable for prototype phase)
- No join-by-code UI (rooms are auto-generated)
- Mobile touch controls not implemented