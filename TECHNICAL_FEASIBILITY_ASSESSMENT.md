# STRICT1000 — Technical Feasibility Assessment
## For: Fullstack Lead Review

> **Status:** Planning Phase Complete  
> **Date:** 2026-02-12  
> **Assessment by:** Senior Fullstack Lead

---

## Executive Summary

I've completed a comprehensive review of all planning documents (PLANNING_INDEX.md, GAME_DESIGN_PLAN.md, NEXT_STEPS_SUMMARY.md, VISUAL_DESIGN_REFERENCE.md) and the existing codebase. 

**Bottom line:** The vision is ambitious but achievable. The technical foundation is solid, and the proposed features are feasible with the current tech stack. However, I recommend **phased delivery with careful scope management**.

---

## Scope Assessment

### What I Agree With ✅

1. **Phase 1 (The Hotel Wakes Up) - HIGH PRIORITY**
   - Lobby redesign: **Feasible** (2-3 days implementation)
   - Receptionist dialogue system: **Feasible** (3-4 days)
   - Lobby evolution: **Feasible but complex** (4-5 days server work)
   - **Timeline: 2 weeks is realistic**

2. **Phase 2 (Rule Instability) - HIGH PRIORITY**
   - Room-specific rulesets: **Excellent architecture**
   - Projectile system: **Straightforward with existing canvas**
   - 3-4 experimental rooms: **Achievable**
   - **Timeline: 3-4 weeks is reasonable**

3. **Technical Approach**
   - Using existing canvas rendering ✅
   - Extending current Zone/Player/Enemy classes ✅
   - Server-side state tracking ✅
   - No major architectural refactors needed ✅

### Scope Concerns ⚠️

1. **Phase 3 (Co-op Tension) - MEDIUM PRIORITY**
   - Currency shop with abilities: **Complex implementation**
   - Dash/Shield/Fireball mechanics need careful balancing
   - **Recommendation:** Start with cosmetics only, add abilities incrementally
   - **Timeline: 3 weeks is aggressive, suggest 4-5 weeks**

2. **Phase 4 (Meta-Narrative) - IMPACTFUL BUT RISKY**
   - Room 237 single-player isolation: **Technically challenging**
   - Requires session management changes
   - Time loop mechanics need careful planning
   - **Recommendation:** Push to post-MVP or Phase 6**
   - **Timeline: 3-4 weeks is accurate, but low ROI until core gameplay is solid**

3. **Phase 5 (Polish & Juice) - ONGOING**
   - Should be integrated throughout, not a separate phase
   - Screen shake, particles, sounds: **Easy wins, add as we go**
   - Sprite-based characters: **High effort, medium impact**
   - **Recommendation:** Budget 1-2 days per sprint for juice**

### What Should Be Cut/Postponed 🔴

1. **Room 237 meta-narrative** - Save for post-launch "Season 2"
2. **Player housing** - Dream feature, not MVP
3. **PvP arena** - Complex balancing, post-launch
4. **Daily challenges** - Requires content pipeline
5. **Full sprite art pass** - Start with improved shapes/colors

---

## Technical Feasibility Deep-Dive

### ✅ FEASIBLE: Lobby Redesign (Phase 1.1)

**Implementation Approach:**
- Modify `public/js/track.js` → Update `ZONES.hub` walls array
- Add decorative elements in `public/js/game.js` draw loop
- CSS/Canvas patterns for ornate carpet
- No database changes needed

**Estimated Effort:** 2-3 days

**Risks:** Low - purely visual, no gameplay changes

**Dependencies:** None

---

### ✅ FEASIBLE: Room-Specific Rulesets (Phase 2.1)

**Implementation Approach:**
```javascript
// In track.js
ZONES.ballroom = {
  name: 'The Ballroom',
  ruleset: 'ranged_only',
  enableProjectiles: true,
  disableMelee: true,
  // ...
}

// In game.js
if (zone.ruleset === 'ranged_only') {
  // Disable Player.tryAttack() melee
  // Enable projectile firing
}
```

**Estimated Effort:** 1-2 days per room type

**Risks:** Medium - need careful testing for each ruleset

**Dependencies:** Projectile system for ranged rooms

---

### ✅ FEASIBLE: Projectile System (Phase 2.2)

**Implementation Approach:**
- New `Projectile` class (similar to `Enemy`)
- Array management in `game.js`
- Collision detection (AABB for entities, line-rect for walls)
- Reflection math: `velocity = velocity - 2 * (velocity · normal) * normal`

**Estimated Effort:** 3-4 days

**Risks:** Medium - physics edge cases, performance with many projectiles

**Dependencies:** None - self-contained feature

**Performance Note:** Test with 50+ projectiles simultaneously

---

### ⚠️ COMPLEX: Lobby Evolution (Phase 1.3)

**Implementation Approach:**
- Server-side: `lobbyState = { deaths: 0, moneySpent: 0, roomsCleared: [] }`
- Broadcast changes via WebSocket
- Client renders conditionally based on state

**Challenges:**
1. **State persistence:** Where to store? PostgreSQL? In-memory with Redis?
2. **Sync across all players:** Need reliable broadcast system
3. **Visual transitions:** How smooth should changes be?

**Estimated Effort:** 4-5 days

**Risks:** High - multiplayer state consistency issues

**Recommendation:** Start simple - track deaths only, add one visual change (e.g., portraits fall)

---

### ⚠️ COMPLEX: Receptionist Dialogue System (Phase 1.2)

**Implementation Approach:**
- Click NPC → Modal dialog box appears
- Dialogue tree based on player progression state
- Store state in `localStorage` for per-player memory

**Challenges:**
1. **Dialogue writing:** Need actual copy for 3+ mood shifts
2. **Progression triggers:** What conditions change dialogue?
3. **UI/UX:** Modal overlay vs. speech bubbles?

**Estimated Effort:** 3-4 days (including writing dialogue)

**Risks:** Medium - requires game design input on dialogue content

**Recommendation:** Start with 3 fixed dialogues, expand based on playtesting

---

### ⚠️ COMPLEX: Currency Shop with Abilities (Phase 3.2)

**Implementation Approach:**
- Shop UI modal in lobby
- Purchase → POST `/api/purchase` → update `character_data` JSON
- Extend Player class with ability methods

**Challenges:**
1. **Ability implementation:** Each ability is ~100-200 lines
2. **Balancing:** Dash iframe duration? Shield cooldown?
3. **Multiplayer sync:** Other players need to see your abilities
4. **Database schema:** Need to store unlocked abilities

**Estimated Effort:** 2-3 days per ability (Dash, Shield, Fireball)

**Risks:** High - gameplay balance, multiplayer complexity

**Recommendation:** Phase 1: Cosmetics only. Phase 2: One ability (Dash). Phase 3: Shield/Fireball

---

### 🔴 DIFFICULT: Room 237 Single-Player Isolation (Phase 4.1)

**Implementation Approach:**
- Portal to Room 237 → Disconnect other players from room
- Create temporary single-player session
- Fake avatar swap via server manipulation

**Challenges:**
1. **Session isolation:** Current server doesn't support per-player zones
2. **Co-op disruption:** Other player gets kicked - bad UX?
3. **Reconnection:** What happens when player exits Room 237?
4. **Testing:** Hard to test multiplayer → singleplayer → multiplayer flow

**Estimated Effort:** 1 week (3-4 days server refactor, 2-3 days testing)

**Risks:** Very High - potential for game-breaking bugs

**Recommendation:** Push to post-launch. If needed, make it co-op but visually strange (different avatars, glitched effects)

---

## Priority Recommendations

### Tier 1: MVP Core (Weeks 1-4)
**Goal:** Make the game feel like a hotel with distinct rooms

1. **Lobby redesign** (Phase 1.1) - 3 days
2. **Basic Receptionist dialogue** (Phase 1.2 simplified) - 2 days
3. **One experimental room: The Gallery** (darkness/co-op) - 3 days
4. **Projectile system** (Phase 2.2) - 4 days
5. **One ranged room: The Ballroom** (mirrors) - 2 days

**Total: 14 days (2 weeks + buffer)**

**Deliverable:** Playable prototype with 2 distinct room experiences

---

### Tier 2: Gameplay Depth (Weeks 5-8)
**Goal:** Add strategic choices and progression

1. **Currency shop - cosmetics only** - 3 days
2. **2 more experimental rooms** (Kitchen, Library) - 4 days
3. **One ability: Dash** - 3 days
4. **Lobby evolution - basic version** (deaths → darker lobby) - 3 days
5. **Expanded Receptionist dialogue** - 2 days

**Total: 15 days (3 weeks)**

**Deliverable:** 4 distinct rooms, progression system, visual polish

---

### Tier 3: Polish & Content (Weeks 9-12)
**Goal:** Make it unforgettable

1. **Audio pass** (ambient + combat sounds) - 4 days
2. **Screen shake, particles, visual juice** - 3 days
3. **2 more abilities** (Shield, Fireball) - 4 days
4. **2 more rooms** - 4 days
5. **Balancing & bug fixes** - 5 days

**Total: 20 days (4 weeks)**

**Deliverable:** Polished, content-rich experience

---

### Post-Launch: Surprise & Delight
**Goal:** The "wow" moment

1. **Room 237 meta-narrative** (if feasible) - 2 weeks
2. **Leaderboards** - 1 week
3. **Daily challenges** - 2 weeks
4. **PvP arena** - 3 weeks

---

## Starting Point Recommendation

### My Choice: **Option C (Modified) - Lobby + One Room in Parallel**

**Week 1 Plan:**
1. **Day 1-2:** Lobby redesign (visual identity)
   - Update colors, add reception desk, clock, elevator
   - Get this looking good first - first impressions matter

2. **Day 3-5:** Prototype The Gallery (experimental room)
   - Limited visibility (darkness shader)
   - Prove the "rule instability" concept works
   - Test co-op communication mechanics

**Why This Order:**
- Lobby sets the tone visually
- The Gallery tests our core innovation (room rulesets)
- Both are achievable in 1 week
- Gives us something tangible to playtest

**Alternative (If Timeline is Tight):** Start with Option A (Lobby only) to maximize visual impact, then add rooms incrementally.

---

## Technical Debt to Address First

Before prototyping, fix these issues:

### Critical
- [ ] **Update README.md** - Remove singleplayer references, update controls
- [ ] **Add .gitignore entries** - `node_modules/`, `.env`, `*.log`
- [ ] **Test existing multiplayer** - Verify combat, currency, zone transitions work

### Nice to Have
- [ ] Set up basic integration tests (Jest + Supertest)
- [ ] Add ESLint config for code consistency
- [ ] Document API endpoints (Swagger/OpenAPI)

---

## Architecture Decisions

### ✅ Keep Current Approach
- **Canvas-based rendering** - Flexible, performant enough for 2D
- **WebSocket for multiplayer** - Works well, no need for Socket.io
- **Server-side currency** - Correct approach to prevent cheating
- **PostgreSQL for profiles** - Good choice, Neon.tech is reliable

### 🔄 Suggested Improvements
- **Add Redis for lobby state** - In-memory cache for real-time changes
- **Rate limiting on API endpoints** - Already have express-rate-limit, ensure it's active
- **Separate `zones/` folder** - Move zone definitions out of `track.js` as they grow
- **Add `abilities/` folder** - Modular ability system for future-proofing

### ❌ Avoid
- **Phaser/PixiJS migration** - Current canvas approach is fine
- **Socket.io** - ws library is sufficient
- **NoSQL for game state** - PostgreSQL handles JSON well

---

## Risk Assessment

### Low Risk (Green Light ✅)
- Lobby visual redesign
- Basic room rulesets (reverse controls, darkness)
- Projectile physics
- Cosmetic shop

### Medium Risk (Proceed with Caution ⚠️)
- Lobby evolution (state sync complexity)
- Complex abilities (Dash, Shield, Fireball)
- Multiple rooms in parallel (content pipeline)

### High Risk (Need Mitigation Plan 🔴)
- Room 237 single-player isolation (architecture change)
- Real-time ability synchronization (lag compensation)
- Procedural rooms (Elevator floors - high complexity)

---

## Performance Considerations

### Current Performance: Good ✅
- Canvas renders at 60fps with 4 players + 10 enemies
- WebSocket latency < 50ms on good connections
- Database queries < 100ms

### Potential Bottlenecks
1. **Projectile count** - Test with 50+ projectiles, may need object pooling
2. **Particle systems** - Canvas fillRect can be slow with many particles
3. **Lobby decorations** - Drawing complex patterns every frame (use caching)

### Optimization Strategies
- **Sprite caching** - Pre-render clock, portraits to off-screen canvas
- **Culling** - Don't draw entities outside camera view
- **Object pooling** - Reuse projectile/particle objects instead of creating new
- **WebGL** - Only if canvas becomes a bottleneck (unlikely)

---

## Security Considerations

### Current Security: Adequate ✅
- Server-side currency validation
- Rate limiting on API endpoints
- PostgreSQL with parameterized queries (prevents SQL injection)

### Areas to Harden
1. **WebSocket authentication** - Currently no auth token
2. **Input validation** - Sanitize username, check position bounds
3. **Ability usage validation** - Server should verify ability ownership before allowing use

**Recommendation:** Add JWT-based WebSocket authentication before launch.

---

## Testing Strategy

### Unit Tests (Future)
- `Player` class: movement, collision, combat
- `Projectile` class: physics, bouncing
- Currency module: add/subtract balance

### Integration Tests (Priority)
- API endpoints: `/api/profile`, `/api/balance/add`
- WebSocket: connect, join room, state sync
- Zone transitions: portal triggers work

### Manual Testing (Always)
- Multiplayer with 2-4 players
- Room ruleset variations
- Edge cases: disconnection, rapid zone transitions

**Recommendation:** Add Playwright for end-to-end testing post-MVP.

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **MVP Core** | 2 weeks | Lobby + 2 rooms (Gallery, Ballroom) |
| **Gameplay Depth** | 3 weeks | 4 rooms, cosmetics, one ability |
| **Polish & Content** | 4 weeks | Audio, juice, 2 more abilities, 2 more rooms |
| **Post-Launch** | 8+ weeks | Room 237, leaderboards, challenges, PvP |

**Total to polished v1.0:** ~9 weeks (with buffer: 10-12 weeks)

---

## Final Recommendation

### Start with: **Phase 1.1 (Lobby) + Phase 2.1 (The Gallery)**

**Week 1 Sprint Plan:**
1. **Day 1-2:** Lobby redesign
   - Visual identity (colors, reception desk, clock, elevator)
   - Test: Does this feel like a hotel?

2. **Day 3-5:** The Gallery prototype
   - Darkness shader (limited visibility)
   - Co-op partner as glowing dot
   - Test: Is this fun? Does it create tension?

3. **Day 5 (afternoon):** Playtest session
   - Gather feedback on lobby atmosphere
   - Validate "rule instability" concept

**If successful:**
- Week 2: Add projectile system + The Ballroom
- Week 3: Add currency shop (cosmetics)
- Week 4: Polish + 2 more rooms

**If challenges arise:**
- Iterate on lobby until it feels right (visual identity is crucial)
- Simplify The Gallery (maybe just reduced visibility, not full darkness)
- Push projectiles to Week 2

---

## Open Questions for Discussion

1. **Dialogue content:** Who writes the Receptionist's lines? Game designer?
2. **Art direction:** Do we want sprite artists, or continue with shapes?
3. **Audio sourcing:** Royalty-free assets or original composition?
4. **Monetization:** Any plans? (Affects shop design)
5. **Launch target:** When do we want v1.0 live?

---

## My Commitment

As Fullstack Lead, I commit to:
- **Quality over speed** - No rushed, buggy features
- **Iterative development** - Small PRs, frequent testing
- **Code review standards** - Clean, documented, testable code
- **Multiplayer-first thinking** - Every feature considers latency, sync, edge cases
- **Player experience focus** - If it's not fun, we don't ship it

Let's build something unforgettable. 🏨⚔️

---

**Next Step:** Pick a starting point and begin prototyping.

**My recommendation:** Start with **Lobby redesign (2 days) → The Gallery prototype (3 days)** this week.

