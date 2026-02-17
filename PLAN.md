# Refactoring Plan: Modularity for Dungeon Feature

## Code Review Summary

The codebase has 4 monolithic files that need refactoring before adding the infinite dungeon system:

| File | Lines | Core Problem |
|------|-------|-------------|
| `server.js` | 960 | 6 responsibilities in one file: HTTP routes, WS dispatch, game handlers, connection mgmt, zone lifecycle, config |
| `game.js` | 1,470 | God class: rendering, input, physics, camera, particles, projectiles, minigames, portals all mixed |
| `main.js` | 1,077 | God object: network callbacks, UI screens, chat, character select, profiles, room browsing |
| `zone-loader.js` | 105 | Only loads static JSON files — cannot support procedural generation |

### What Blocks the Dungeon Feature

1. **zone-loader.js** only fetches `/data/zones/{id}.json` — no way to receive server-generated zone data
2. **server.js** `handleZoneEnter` hardcodes `ZoneSession` vs `TankZoneSession` — no extensible session factory
3. **game.js** minigame activation is an if-else chain on `zone.ruleset` — no registry pattern
4. **server.js** has all WS handlers inline — adding dungeon handlers would bloat it further
5. **main.js** network callbacks directly reference `activeMinigame.tankEnemies` — not extensible

---

## Refactoring Steps

### Phase 1: Extract server.js into modules

**Goal**: Split 960-line server.js into focused modules. This is the highest-impact change — every future feature touches server.js.

#### 1a. Extract API routes → `server/api/`

Move HTTP route handlers out of server.js:

- `server/api/players.js` — `POST /api/player`, `GET /api/profile`, `POST /api/inventory`
- `server/api/zones.js` — `GET /api/zones`, `GET /api/zones/:zoneId`, `POST /api/zones/:zoneId`, `loadZoneData()`, zone cache

server.js becomes:
```js
app.use('/api', require('./server/api/players')(pool));
app.use('/api', require('./server/api/zones'));
```

#### 1b. Extract WS handlers → `server/websocket/handlers.js`

Move all `handle*` functions (15 handlers, ~400 lines) into a single handlers module. They share context (rooms, pool, currency), so pass dependencies via a context object:

```js
// server/websocket/handlers.js
module.exports = function createHandlers({ rooms, pool, currency, loadZoneData }) {
  return {
    handleJoinRoom(ws, data) { ... },
    handleZoneEnter(ws, data) { ... },
    // ...
  };
};
```

#### 1c. Extract zone session factory → `server/zone-session-factory.js`

Currently `handleZoneEnter` (lines 709-721) does:
```js
if (zoneData && zoneData.ruleset === 'tanks') {
  session = new TankZoneSession(...);
} else {
  session = new ZoneSession(...);
}
```

Extract to factory that's extensible for dungeon sessions:
```js
// server/zone-session-factory.js
const SESSION_TYPES = {
  tanks: TankZoneSession,
  default: ZoneSession,
};

function createZoneSession(roomId, zoneId, zoneData, deps) {
  const SessionClass = SESSION_TYPES[zoneData?.ruleset] || SESSION_TYPES.default;
  return new SessionClass(roomId, zoneId, zoneData, deps);
}

function registerSessionType(ruleset, SessionClass) {
  SESSION_TYPES[ruleset] = SessionClass;
}
```

#### 1d. Extract helper utilities

- `getPlayerContext(ws)` and `getZoneSession(ctx)` → `server/websocket/context.js`
- `removePlayerFromZoneSession()` and `removeFromRoom()` → consolidate into `server/websocket/cleanup.js`
- `broadcastRoomList()` → `server/websocket/broadcast.js` (already exists, extend it)

**Result**: server.js shrinks to ~200 lines: Express setup, middleware, WS connection handler, and startup.

---

### Phase 2: Extract main.js network callbacks

**Goal**: Make network event handling extensible so dungeon events don't bloat main.js.

#### 2a. Delete unused `public/js/network/callbacks.js`

This file has an unused `setupNetworkCallbacks()` function that was never wired up. Remove it to avoid confusion.

#### 2b. Extract tank callbacks → `public/js/network/tank-callbacks.js`

Lines 554-628 of main.js are 8 tank-specific callbacks. Move them to a module:

```js
// public/js/network/tank-callbacks.js
export function setupTankCallbacks(networkManager, gameState) {
  networkManager.onTankSync = (data) => { ... };
  networkManager.onTankWaveStart = (data) => { ... };
  // ...
}
```

#### 2c. Extract core game callbacks → `public/js/network/game-callbacks.js`

Move the remaining callbacks (room updates, player state, enemy sync, etc.) into a separate module. main.js calls:

```js
import { setupGameCallbacks } from './network/game-callbacks.js';
import { setupTankCallbacks } from './network/tank-callbacks.js';
setupGameCallbacks(networkManager, gameState);
setupTankCallbacks(networkManager, gameState);
```

This pattern makes it easy to add `setupDungeonCallbacks()` later.

---

### Phase 3: Add minigame registry to game.js

**Goal**: Replace hardcoded if-else minigame activation with a registry pattern.

#### 3a. Create minigame registry

```js
// public/js/minigame-registry.js
const MINIGAME_REGISTRY = {};

export function registerMinigame(ruleset, MinigameClass) {
  MINIGAME_REGISTRY[ruleset] = MinigameClass;
}

export function createMinigame(ruleset, game) {
  const MinigameClass = MINIGAME_REGISTRY[ruleset];
  if (!MinigameClass) return null;
  return new MinigameClass(game);
}
```

#### 3b. Register existing minigames

```js
// public/js/tank-game.js (at bottom)
import { registerMinigame } from './minigame-registry.js';
registerMinigame('tanks', TankGame);

// public/js/card-game.js (at bottom)
import { registerMinigame } from './minigame-registry.js';
registerMinigame('cardgame', CardGame);
```

#### 3c. Update game.js init() to use registry

Replace lines 367-371:
```js
// Before (hardcoded):
if (this.zone.ruleset === 'tanks') { this.activeMinigame = new TankGame(this); }
else if (this.zone.ruleset === 'cardgame') { this.activeMinigame = new CardGame(this); }

// After (registry):
this.activeMinigame = createMinigame(this.zone?.ruleset, this);
```

#### 3d. Extract projectile-to-minigame collision from game.js

Lines 696-732 of `updateProjectiles()` directly access `activeMinigame.tankEnemies` and `activeMinigame.crates`. Move collision checking into a minigame interface method:

```js
// In minigame base interface:
checkProjectileCollision(proj) → { hit: boolean, target?: object }
```

Then game.js just calls:
```js
if (this.activeMinigame) {
  const result = this.activeMinigame.checkProjectileCollision(proj);
  if (result.hit) { /* visual feedback */ }
}
```

---

### Phase 4: Make zone-loader support dynamic zone data

**Goal**: Allow zones to be created from server-sent data, not just static JSON files.

#### 4a. Add `loadFromData()` method to zone-loader

```js
// public/js/zone-loader.js
function loadFromData(zoneId, zoneData) {
  const zone = new Zone(zoneData);
  zoneCache.set(zoneId, zone);
  return zone;
}
```

This is the critical change for the dungeon system. The server will generate dungeon floor data and send it via WebSocket, and the client needs to be able to create a Zone from that data without fetching a JSON file.

#### 4b. Add `clearZone(zoneId)` for disposable zones

Dungeons are temporary — when the player leaves, the zone data should be evictable:

```js
function clearZone(zoneId) {
  zoneCache.delete(zoneId);
}
```

---

## What We're NOT Refactoring (Yet)

These issues exist but don't block the dungeon feature:

- **Player class responsibilities** (movement + combat + rendering + audio) — works fine as-is
- **Enemy behavior system** — current aggro/attack AI is sufficient; dungeon can reuse it
- **Track.js decoration methods** — hardcoded decorations are for the hotel theme; dungeon will have its own rendering
- **Screen state machine in main.js** — current `showScreen()` works
- **game.js camera/particle/effects** — tightly coupled but functional
- **Constants sync** between client/server — annoying but manageable

## File Impact Summary

| File | Change | Lines Removed | Lines Added |
|------|--------|---------------|-------------|
| `server.js` | Extract routes, handlers, factory | ~700 removed | ~200 remain |
| `server/api/players.js` | New file | — | ~100 |
| `server/api/zones.js` | New file | — | ~120 |
| `server/websocket/handlers.js` | New file | — | ~400 |
| `server/websocket/context.js` | New file | — | ~30 |
| `server/websocket/cleanup.js` | New file | — | ~40 |
| `server/zone-session-factory.js` | New file | — | ~25 |
| `public/js/main.js` | Extract callbacks | ~350 removed | ~730 remain |
| `public/js/network/callbacks.js` | Delete (unused) | ~150 deleted | — |
| `public/js/network/game-callbacks.js` | New file | — | ~250 |
| `public/js/network/tank-callbacks.js` | New file | — | ~80 |
| `public/js/minigame-registry.js` | New file | — | ~20 |
| `public/js/game.js` | Use registry, delegate collision | ~40 changed | ~10 |
| `public/js/zone-loader.js` | Add loadFromData, clearZone | — | ~15 |
| `public/js/tank-game.js` | Add checkProjectileCollision, register | — | ~25 |
| `public/js/card-game.js` | Register with registry | — | ~3 |

## Execution Order

1. **Phase 1** (server.js) — highest impact, most isolated, lowest risk of breaking client
2. **Phase 2** (main.js callbacks) — medium impact, needed before dungeon callbacks
3. **Phase 3** (minigame registry) — medium impact, needed before dungeon minigame
4. **Phase 4** (zone-loader) — small change, critical for dungeon
