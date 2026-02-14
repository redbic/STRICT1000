# STRICT1000 - Combined Technology & Feature Plan

## Current State Summary

- **24 JS files**, all loaded via `<script>` tags (no bundler, no ES modules)
- **PixiJS v8.0.0** loaded from CDN, full renderer written (~900 lines), but **hardcoded off** (`this.usePixi = false` — "temporarily disabled while debugging")
- **No touch/mobile support**, no gamepad, no particles, no screen shake, no damage numbers, no minimap
- **EffectsManager** exists but only does screen flash, vignette, and darkness overlay
- **InputManager** is keyboard+mouse only
- **No Service Worker**, no PWA manifest, no client-side storage beyond server sessions
- **No WebSocket compression** (permessage-deflate not enabled)
- **Enemy AI** is basic aggro-range chase — no behavior trees or state machines
- 5 zones (hub, hallway, elevator, elevator2, training)

---

## TIER 1 — High Impact, Low Risk (Do Now)

### 1. Game Feel / Juice System
**Why:** The single biggest bang-for-buck improvement. Combat exists but has zero feedback beyond a red screen flash. This is the difference between "feels like a prototype" and "feels like a game."

**What to add:**
- **Screen shake** — camera offset on hit taken/dealt (5-10px, decaying over 100-200ms)
- **Hit stop** — 30-50ms game pause on landing a hit (freeze attacker + target)
- **Damage numbers** — floating text that drifts up and fades, color-coded (white=normal, yellow=crit)
- **Knockback** — push enemies back 10-20px on hit, with easing
- **Death particles** — 8-12 small colored squares that fly outward when an enemy dies
- **Camera lerp** — smooth camera follow instead of snapping (lerp factor ~0.1)

**Complexity:** Low-Medium. Hooks into existing `EffectsManager` and `Game.draw()` loop. No libraries needed.

**Implementation notes:**
- Screen shake: add `cameraShakeX/Y` offset to existing camera in `game.js`, decay each frame
- Damage numbers: array of `{x, y, text, color, age}` objects, drawn after entities, removed after 0.8s
- Death particles: simple object pool, 8-12 rects with velocity + gravity + alpha decay
- Hit stop: set `this.hitStopTimer` in game loop, skip entity updates while > 0

### 2. WebSocket Compression (permessage-deflate)
**Why:** The `ws` library supports it natively. One config change, 40-70% bandwidth reduction for `enemy_sync` and `player_update` messages which are JSON text.

**What to add:**
```js
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 1 },  // Fast compression
    threshold: 128  // Only compress messages > 128 bytes
  }
});
```

**Complexity:** Trivial. 5 lines in `server.js`.

**Gotcha:** Adds ~300KB memory per connection. Fine for <100 players. Monitor with `process.memoryUsage()` if scaling.

### 3. Screen Wake Lock API
**Why:** Players on laptops/tablets lose their game when the screen dims. 3 lines of code prevents this.

**What to add:**
```js
if ('wakeLock' in navigator) {
  navigator.wakeLock.request('screen');
}
```
Re-request on `visibilitychange` when document becomes visible again.

**Complexity:** Trivial. Supported in all major browsers since March 2025.

### 4. Service Worker + PWA Manifest
**Why:** Cache 24 JS files + zone JSON + PixiJS CDN. After first load, game starts near-instantly from cache. Enables "Add to Home Screen" on mobile.

**What to add:**
- `public/sw.js` — cache-first for static assets (JS, CSS, images, zone JSONs), network-first for API routes
- `public/manifest.json` — app name, icons, display: fullscreen, theme color
- Register SW in `main.js`
- **Exclude WebSocket connections** from SW fetch handler (check `request.url` for `ws://`)

**Complexity:** Low-Medium. ~150-200 lines for the service worker. Use a versioned cache name for busting.

**Gotcha:** Service workers intercept fetch requests — make sure `/api/*` and session auth routes use network-first strategy. Login flow must not be cached.

---

## TIER 2 — Medium Impact, Medium Effort (Next Sprint)

### 5. Mobile Touch Controls (nippleJS)
**Why:** Opens the game to phone/tablet players. InputManager currently has zero touch handling.

**What to add:**
- nippleJS virtual joystick for movement (left side of screen)
- Tap-to-shoot on right side, or a second nipple for aim direction
- Auto-detect touch device: `'ontouchstart' in window`
- Scale UI elements larger for touch (buttons, inventory slots)

**Complexity:** Medium. nippleJS is zero-dependency, ~10KB. Wire its output into existing `InputManager.getMovementDirection()`. The hard part is making the UI usable on small screens.

**Implementation notes:**
- Create joystick only when touch detected, destroy on desktop
- Map nipple angle + force to `{x, y}` direction vector, same format as keyboard input
- Add a visible "attack" button for mobile since there's no mouse click

### 6. PixiJS v8 Investigation & Re-enable
**Why:** 900 lines of PixiJS renderer code sitting disabled. Comment says "temporarily disabled while debugging" — tech debt.

**What to do:**
1. Set `this.usePixi = true` locally
2. Test each zone — check for visual mismatches vs Canvas 2D renderer
3. Check browser console for errors (likely the reason it was disabled)
4. Profile both renderers with DevTools Performance tab
5. If PixiJS works: leave it on. If broken: document exactly what's wrong

**Complexity:** Low effort to test, unknown effort to fix depending on what's broken.

**Real numbers:** PixiJS v8 renders 200K sprites at 60fps with regular containers, 1M with ParticleContainer. Game has <50 entities per zone — won't hit rendering bottlenecks either way. The value is in the WebGL effects (glow, blend modes) the PixiJS renderer already uses.

### 7. Particle System
**Why:** Ties directly into game feel (#1). Death effects, ambient zone particles (dust, sparks), portal shimmer, projectile trails.

**What to add:**
- Lightweight object-pool particle emitter (~100 lines, no library needed)
- Particle types: burst (death), continuous (ambient), trail (projectiles)
- Each particle: `{x, y, vx, vy, life, maxLife, size, color, alpha}`
- Draw as filled rects (fast on Canvas 2D) or use PixiJS ParticleContainer if renderer is enabled

**Complexity:** Low-Medium. Blix (github.com/voormann/blix) is a good reference for Canvas 2D performance patterns (object pooling, batch rendering, shape simplification as particles shrink).

### 8. IndexedDB for Client Settings & UI State
**Why:** Store cosmetic preferences, UI layout, audio settings, last-used character. Currently everything resets on refresh.

**What to use:** Raw IndexedDB with a thin wrapper, or Dexie.js (~45KB) for cleaner API.

**What to store:**
- TTS mute state, voice preferences
- Keybind customization (if added)
- Character cosmetic selections
- UI state (inventory open/closed, chat position)

**What NOT to store:** Currency, inventory items, player stats — server stays authoritative.

**Complexity:** Low. ~50-100 lines with Dexie.

---

## TIER 3 — High Impact, High Effort (Plan Carefully)

### 9. Minimap with Fog of War
**Why:** Players need spatial awareness, especially in larger/darker zones. The darkness overlay system already proves visibility masking works.

**What to add:**
- Small canvas overlay (150x150px) in corner showing current zone layout
- Player dot (green), enemy dots (red), other player dots (blue)
- Fog of war: track visited tiles in a 2D boolean array, draw unvisited as black
- Store fog state in IndexedDB (#8) so exploration persists

**Complexity:** Medium. Render at 1/10th scale of zone dimensions. Use `drawImage` to scale down the zone floor, overlay entity dots, mask with fog array.

**Implementation notes:** Zones already have wall/floor data in JSON — use that directly for minimap geometry. The darkness zones (`effects.js` line 60-77) already have the compositing pattern to reuse.

### 10. Enemy AI Upgrade (Behavior Trees)
**Why:** Current enemies just chase when in aggro range. Adding patrol, flee-when-low-HP, group-aggro, and ranged-attack patterns makes combat more interesting.

**What to use:** Yuka (mugen87.github.io/yuka/) is a standalone JS game AI library with steering behaviors, state machines, and pathfinding. Or roll a lightweight behavior tree (~200 lines) with Selector/Sequence/Action nodes.

**Behavior patterns to add:**
- **Patrol** — walk between waypoints when no target
- **Flee** — run away when HP < 20%
- **Ranged** — stop at distance, shoot projectiles
- **Pack aggro** — when one enemy aggros, nearby same-type enemies also aggro

**Complexity:** Medium-High. The behavior tree itself is simple, but testing AI across multiplayer where the host simulates enemies needs care.

### 11. Vite Migration
**Why:** 24 separate `<script>` tags. No tree-shaking, no minification, no code-splitting. Vite gives ES modules, hot reload, and a production bundle.

**Reality check from codebase:** All JS uses global classes (`window.EffectsManager`, `window.InputManager`, etc.) and `typeof CONFIG !== 'undefined'` guards. Converting to ES modules means:
- Every file gets `export`/`import` statements
- Remove all `window.X = X` patterns
- Remove all `typeof X !== 'undefined'` guards
- Update `index.html` to a single `<script type="module" src="/js/main.js">`
- PixiJS CDN import becomes `import * as PIXI from 'pixi.js'` (npm package)

**Complexity:** High. Estimated 1-2 full days. Every file is affected. But once done: HMR dev server, 15-25% smaller production bundle, proper dependency graph.

**Note:** Vite 8 (using Rolldown) is in beta, expected stable mid-2026. Start with Vite 6 now, upgrade later.

### 12. Procedural Zone Generation
**Why:** 5 hand-crafted zones are finite content. Procedural generation enables infinite replayability — randomized dungeon layouts, enemy placement, loot distribution.

**Approach:** Wave Function Collapse (WFC) is the proven algorithm for tile-based procedural generation in top-down games. Zone JSON format already defines walls/floors/portals as tile data — WFC can generate new layouts that respect the same schema.

**What to build:**
- Template tiles from existing zones (wall corners, hallway segments, room shapes)
- WFC solver that outputs valid zone JSON matching existing schema
- Seeded RNG so all players in a multiplayer room see the same layout
- Entry/exit portals placed deterministically

**Complexity:** High. WFC implementation is ~300-500 lines. The harder part is making generated zones feel good (not just valid). Start with one "procedural dungeon" zone type, keep hand-crafted zones for story areas.

---

## TIER 4 — Future / Speculative (Not Yet)

### 13. WebGPU (Monitor Only)
All major browsers now ship WebGPU as of late 2025. PixiJS v8 already has a WebGPU backend. But for <50-entity game, WebGL via PixiJS is more than sufficient. **Revisit only if adding complex shaders or 1000+ entities.**

### 14. WebTransport (Not Ready)
35% latency reduction vs WebSocket in testing, but Firefox/Safari support is incomplete, and server-side requires HTTP/3 + QUIC infrastructure. **Wait until 2027 for production readiness.** Current WebSocket setup works well.

### 15. OffscreenCanvas (Profile First)
Move rendering to a Web Worker for zero main-thread jank. Supported in all browsers since 2023. **Only worth it if profiling shows rendering loop blocks input handling** — unlikely at current entity count.

### 16. Accessibility
Colorblind mode (pattern overlays on colored elements), reduced motion toggle (disable shake/particles), high-contrast mode. **Prioritize after core gameplay is solid.** Use `prefers-reduced-motion` media query as a starting point.

### 17. Leaderboards & Achievements
Server-side tracking of kills, zones explored, currency earned. Display on a simple UI panel. **Requires DB schema additions** — add after gameplay features stabilize.

---

## Recommended Implementation Order

| Phase | Items | Estimated Effort |
|-------|-------|-----------------|
| **Week 1-2** | Game Feel (#1), WS Compression (#2), Wake Lock (#3) | Small-Medium |
| **Week 3-4** | Service Worker/PWA (#4), PixiJS Investigation (#6) | Medium |
| **Week 5-6** | Mobile Touch (#5), Particles (#7), IndexedDB (#8) | Medium |
| **Week 7-8** | Minimap (#9), Enemy AI (#10) | Medium-High |
| **Month 3** | Vite Migration (#11) | High |
| **Month 4+** | Procedural Gen (#12), then Tier 4 items as needed | High |

---

## Key Principle

**Profile before optimizing, gameplay before infrastructure.** Items #1-3 improve what players actually feel. Items #4-8 improve the platform. Items #9-12 add depth. Items #13-17 are for when the foundation is solid.

---

## References

- WebGPU browser support: https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/
- PixiJS v8 ParticleContainer: https://pixijs.com/blog/particlecontainer-v8
- WebTransport vs WebSocket: https://markaicode.com/webtransport-multiplayer-games-2025/
- OffscreenCanvas: https://web.dev/articles/offscreen-canvas
- Screen Wake Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- nippleJS: https://github.com/yoannmoinet/nipplejs
- Blix particle system: https://github.com/voormann/blix
- Yuka game AI: https://mugen87.github.io/yuka/
- Service Worker caching: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
- OPFS vs IndexedDB: https://web.dev/articles/origin-private-file-system
- Vite: https://vite.dev/
- Wave Function Collapse: https://medium.com/@ShaanCoding/implementing-wave-function-collapse-binary-space-partitioning-for-procedural-dungeon-generation-2f1a6cc376db
- Game accessibility 2025: https://access-ability.uk/2025/12/05/2025-video-game-accessibility-recap/
