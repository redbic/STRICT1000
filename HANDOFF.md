# HANDOFF.md — STRICT Adventure ⚔️

> Last updated: 2026-02-12

## Current State

STRICT1000 is a **multiplayer-only** top-down 2D adventure game (browser-based) with a hotel-themed narrative direction inspired by Inscryption, Realm of the Mad God, and Wii Play Tanks.

### What Works

- **Multiplayer**: WebSocket-based real-time co-op. Players confirm a username, auto-connect, join a room, and see each other in-game with avatars rendered above their heads.
- **Movement**: WASD / Arrow keys, fullscreen canvas, camera follows the local player.
- **Combat**: Click-to-attack melee system. Enemies aggro, chase, and deal damage. Players can kill enemies and earn currency.
- **Zones**: 
  - **Hotel Lobby** (hub) — Redesigned with 1920s atmosphere: burgundy carpet, grandfather clock, chandelier glow, portraits, elevator doors, enhanced portals with brass frames
  - **The Gallery** — Experimental darkness room with limited visibility (150px radius), co-op partner glow indicators, validates "rule instability" concept
  - **Archive Entry** — Standard combat room with enemies
  - **Training** — Practice room
  - Portal-based zone transitions between all zones
- **Server-side currency**: Kills award coins (`ENEMY_KILL_REWARD = 5`). Balance is persisted in PostgreSQL (Neon.tech) via `server/currency.js` and the `/api/balance/add` endpoint.
- **Player profiles**: Loaded from shared DB on name confirm — portrait, balance, and character data. Balance displayed in HUD.
- **Input fixes**: Sticky keys cleared on blur/visibility change. Context menu disabled on canvas.
- **Deployment**: Render.com + Neon.tech PostgreSQL. `render.yaml` included.
- **Performance**: All decorative elements pre-rendered to cached canvases (chandelier, darkness overlay, player glows) for 60fps performance.

### What Was Removed

- **Singleplayer mode** — completely stripped (PR #5). The game is multiplayer-only now.
- **Pickups** — removed from hub.
- **Hub enemies** — hub is a safe gathering zone.
- **Space-bar attack** — attack moved to mouse click only.

## Architecture

```
STRICT1000/
├── server.js                         # Express + WebSocket server, API routes, game rooms
├── server/
│   └── currency.js                   # Server-side currency module (add/get balance, transactions)
├── public/
│   ├── index.html                    # Main HTML — screens (menu, lobby, game), HUD
│   ├── css/
│   │   └── style.css                 # Game styling
│   └── js/
│       ├── main.js                   # App logic: screen management, profile loading, network setup, game start
│       ├── game.js                   # Game class: canvas, game loop, camera, enemies, attack FX, zone transitions, darkness overlay
│       ├── player.js                 # Player class: movement, collision, combat (tryAttack, takeDamage), drawing
│       ├── enemy.js                  # Enemy class: aggro AI, chase, melee attack, HP, drawing
│       ├── track.js                  # Zone class + ZONES data: walls, portals, nodes, decorations, rulesets
│       └── network.js                # NetworkManager: WebSocket client, room join/leave, state sync, enemy kill events
├── package.json
├── render.yaml
├── DEPLOYMENT.md
├── README.md
├── PLANNING_INDEX.md                 # Navigation guide for planning documents
├── GAME_DESIGN_PLAN.md               # Complete 5-phase development strategy
├── NEXT_STEPS_SUMMARY.md             # Quick reference for priorities
├── VISUAL_DESIGN_REFERENCE.md        # Mockups and implementation guide
├── TECHNICAL_FEASIBILITY_ASSESSMENT.md  # Technical analysis and timeline
└── IMPLEMENTATION_SUMMARY.md         # Completed work documentation
```

### Key data flow

1. **Name confirm** → `loadProfile(username)` fetches `/api/profile` → shows balance/avatar
2. **Auto-connect** → `NetworkManager.connect()` opens WebSocket → `joinRoom()` → lobby screen
3. **Start Adventure** → `startGame('hub')` → `Game.init('hub', username)` → game loop begins
4. **Zone transition** → player touches portal → `transitionZone(targetZone)` → `networkManager.enterZone()`
5. **Enemy kill** → `onEnemyKilled` callback → `networkManager.sendEnemyKilled()` → server awards coins → `balance_update` event → HUD updates

## Narrative Direction (from PR #7)

The game is shifting toward an **Inscryption-inspired three-act structure** set in a mysterious hotel:

**Four Pillars:**
1. **Uneasy intimacy** — the hotel setting creates closeness between player and game
2. **Tactile strategy** — real-time combat inspired by Wii Play Tanks
3. **Rule instability** — different rooms have different rulesets
4. **Meta-layer mystery** — narrator-driven reveals about the presidential suite

**Structure:** Hotel lobby as hub → room-based encounters with distinct rules → unreliable curator NPC → presidential suite as the meta-narrative payoff.

**Prototype focus:** Real-time combat and room-based rule variation.

## Next Steps (Priority Order)

### ✅ Recently Completed (2026-02-12)
- [x] **Planning review** — Comprehensive technical feasibility assessment completed
- [x] **Hotel lobby redesign** — Transformed into 1920s hotel with burgundy carpet, clock, chandelier, portraits, elevator, enhanced portals
- [x] **The Gallery** — First experimental room with darkness ruleset and limited visibility (validates "rule instability" pillar)
- [x] **Performance optimization** — All decorative elements pre-rendered to cached canvases

### High Priority (Next 1-2 Weeks)
- [ ] **Projectile system** — Implement `Projectile` class for Wii Play Tanks-style combat (3-4 days)
- [ ] **The Ballroom** — Ranged combat room with ricocheting projectiles (2 days)
- [ ] **Receptionist dialogue system** — Click-to-interact with unreliable narrator (3-4 days)

### Medium Priority (Weeks 3-4)
- [ ] **More experimental rooms** — The Kitchen (reversed controls), The Library (permadeath zone)
- [ ] **Currency shop** — Start with cosmetics, add abilities incrementally
- [ ] **Visual juice** — Screen shake, damage numbers, particle effects
- [ ] **Lobby evolution** — Server-tracked state changes (deaths → darker lobby)

### Lower Priority (Post-MVP)
- [ ] **Room 237** — Meta-narrative reveal (high complexity, defer to post-launch)
- [ ] **More zones** — Expand beyond current 4 rooms
- [ ] **Sound / music** — Retro atmosphere audio
- [ ] **Visual polish** — Sprite-based characters, tile maps
- [ ] **Cross-game integration** — Enhanced shared DB with `blusaccount/stricthotel`

### Documentation Updates Needed
- [ ] **Update README.md** — Update roadmap checklist, add references to new docs

## Known Issues

- README.md roadmap section needs updating with completed items
- No automated tests (acceptable for prototype phase)
- Room joining always creates a new random room — no join-by-code UI yet
- Mobile touch controls not implemented

## Related Repositories

- [`blusaccount/stricthotel`](https://github.com/blusaccount/stricthotel) — shared universe: playable website with multiplayer minigames, social interaction, retro atmosphere. Shares the player profile DB.