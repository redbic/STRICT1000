# STRICT1000 — Quick Reference: Next Steps

> **TL;DR for the Fullstack Lead**  
> See `GAME_DESIGN_PLAN.md` for full details. This is the executive summary.  
> **Last updated:** 2026-02-12

---

## What We Have ✅
- Solid multiplayer infrastructure (WebSocket, real-time sync)
- Working combat system (melee, enemy AI, kill rewards)
- Zone transitions (hub ↔ combat rooms via portals)
- Server-side currency (persisted in PostgreSQL)
- Basic NPC system ("The Receptionist" exists)
- **NEW: Atmospheric hotel lobby** — 1920s redesign with burgundy carpet, clock, chandelier, portraits, elevator, enhanced portals
- **NEW: The Gallery experimental room** — Darkness ruleset with limited visibility (150px), co-op glow indicators
- **NEW: Room ruleset system** — Extensible architecture for room-specific gameplay mechanics
- **NEW: Performance optimization** — All decorative elements cached for 60fps

## What We Need 🎯
**The game has atmosphere and one innovative room, but needs more content.**

We need to add:
1. **More experimental rooms** — Validate the "rule instability" concept with 3-4 more rooms
2. **Projectile combat** — Wii Play Tanks-style for The Ballroom
3. **Tension** — Currency shop to give spending decisions weight
4. **Juice** — Screen shake, particles, sound effects

---

## ✅ What Just Got Completed (2026-02-12)

### Planning & Assessment
- [x] **Technical Feasibility Assessment** — 15-page analysis covering all 5 phases
- [x] **Starting point decision** — Selected Option C (Lobby + Gallery)
- [x] **Timeline validation** — 9-12 weeks to v1.0 confirmed achievable

### Phase 1: The Hotel Wakes Up (Weeks 1-3) — 40% Complete
- [x] Redesign lobby layout (reception desk, clock, elevator, chandelier, portraits)
- [ ] Add Receptionist dialogue system (unreliable narrator)
- [ ] Implement lobby evolution (server-tracked state changes)

### Phase 2: Rule Instability (Weeks 4-6) — 15% Complete
- [x] The Gallery (darkness, limited visibility) — **VALIDATED concept works!**
- [ ] Implement projectile system
- [ ] The Ballroom (ranged combat, ricocheting projectiles)
- [ ] The Kitchen (reversed controls)
- [ ] The Library (permadeath zone, high rewards)

---

## Immediate Priorities (Next 1-2 Weeks)

### ✅ COMPLETED: Lobby Redesign (Visual Impact)
**Status:** ✅ Done (2026-02-12)  
**Time taken:** 1 day  
**Files:** `public/js/track.js`

**What was added:**
- Reception desk (visual landmark)
- Grandfather clock (real-time display)
- Elevator doors (locked, ominous)
- Burgundy carpet pattern
- Chandelier glow lighting
- Wall portraits
- Brass-framed portals with room plaques

**Result:** Lobby now feels like a 1920s hotel. First impressions significantly improved.

---

### ✅ COMPLETED: One Experimental Room (Gameplay Innovation)
**Status:** ✅ Done (2026-02-12)  
**Time taken:** 1 day  
**Files:** `public/js/track.js`, `public/js/game.js`

**Room: The Gallery (Darkness + Co-op)**
- Limited visibility (150px radius around player)
- Co-op partner visible as glowing dot
- Communication becomes essential
- Implementation: Cached canvas shader overlay

**Result:** "Rule instability" concept validated. Players will experience surprise and tension.

---

### 🔄 NEXT: Projectile Combat System
**Time estimate:** 3-4 days  
**Files:** `public/js/game.js`, new `public/js/projectile.js`

**Goal:** Add Wii Play Tanks-style projectile system for ranged combat rooms.

**What to Add:**
- `Projectile` class (position, velocity, owner, damage)
- Collision detection (walls, entities)
- Bounce physics for mirrors
- Visual: glowing projectile sprites with trails

**Why Next:** Required for The Ballroom (next experimental room).

---

### 📋 AFTER THAT: The Ballroom (Ranged Combat Room)
**Time estimate:** 2 days  
**Files:** `public/js/track.js`

**Goal:** Second experimental room to expand "rule instability" concept.

**What to Add:**
- Disable melee attacks, enable projectile firing
- Mirror walls that reflect projectiles
- Friendly fire enabled
- Challenging but fun chaos

**Why Next:** Tests projectile system, adds variety to room experiences.

---

## Phase-by-Phase Roadmap

### Phase 1: The Hotel Wakes Up (Weeks 1-3) — ✅ 40% Complete
**Goal:** Make the lobby feel like a living space.

- [x] Redesign lobby layout (reception desk, clock, elevator) — ✅ **DONE 2026-02-12**
- [ ] Add Receptionist dialogue system (unreliable narrator)
- [ ] Implement lobby evolution (server-tracked state changes)

**Deliverable:** Players return to the lobby and say *"Something feels different…"*  
**Status:** Visual identity complete. Dialogue and evolution systems remain.

---

### Phase 2: Rule Instability (Weeks 4-6) — ✅ 15% Complete
**Goal:** Every room is a unique experience.

- [x] Implement room-specific rulesets (`track.js` → `ruleset` field) — ✅ **DONE 2026-02-12**
- [ ] Create 3-4 experimental rooms:
  - [x] **The Gallery** (darkness, limited visibility) — ✅ **DONE 2026-02-12**
  - [ ] **The Ballroom** (ranged combat, ricocheting projectiles)
  - [ ] **The Kitchen** (reversed controls)
  - [ ] **The Library** (permadeath zone, high rewards)
- [ ] Add projectile combat system (Wii Play Tanks homage)

**Deliverable:** Players say *"No way, this room is completely different!"*  
**Status:** Concept validated with Gallery. Projectile system and 3 more rooms needed.

---

### Phase 3: Co-op Tension (Weeks 7-9)
**Goal:** Make currency feel consequential.

- [ ] Visible coin drops (in-world pickups, race to loot)
- [ ] Currency-gated doors (require X coins to enter)
- [ ] Currency shop (abilities, cosmetics, consumables)
  - Dash, Shield Block, Fireball abilities
  - Visual cosmetics (trails, glows)

**Deliverable:** Players debate *"Should I help my partner or save for myself?"*

---

### Phase 4: Meta-Narrative (Weeks 10-12)
**Goal:** Inscryption-style reveal. The game has been lying.

- [ ] Room 237 unlocks after X rooms cleared (silent, no fanfare)
- [ ] Single-player experience (co-op kicked out)
- [ ] Environmental storytelling (documents, portraits, mirror)
- [ ] The Reveal: Hotel is a time loop, Receptionist is a trapped player

**Deliverable:** Players post on Reddit: *"Holy shit, Room 237…"*

---

### Phase 5: Polish & Juice (Ongoing)
**Goal:** Make every action feel satisfying.

- [ ] Screen shake on hit
- [ ] Damage numbers (floating text)
- [ ] Combat sounds (sword swings, projectile whooshes)
- [ ] Ambient hotel audio (clock ticking, elevator dings)
- [ ] Death animations (fade, explosion)
- [ ] Sprite-based characters (replace circles)
- [ ] Tile-based floors (patterned carpets)

**Deliverable:** Combat feels **good**, not just functional.

---

## Room Ruleset Ideas (For Phase 2)

| Room | Rule Twist | Challenge |
|------|------------|-----------|
| **The Archive** | Standard combat | Baseline for comparison |
| **The Ballroom** | Ranged only, mirrors reflect shots | Dodging ricochets, friendly fire |
| **The Kitchen** | Reversed controls (W = down) | Spatial disorientation |
| **The Gallery** | Limited visibility (darkness) | Co-op communication essential |
| **The Library** | Permadeath (lose all currency on death) | Risk vs. reward, trust |
| **The Basement** | 60-second speed trial | Infinite enemies, pure sprint |
| **The Elevator** | Procedural floors, rules change per floor | Adaptability |

**Pick 2-3 to prototype first.** Not all need to ship at once.

---

## Technical Debt to Fix

### Must Fix Before Launch
- [ ] Update README.md (remove singleplayer references)
- [ ] Room code joining UI (players can't join friends yet)

### Nice to Have
- [ ] Automated tests (at least API integration tests)
- [ ] Mobile touch controls
- [ ] WebSocket reconnection logic

---

## Success Metrics

We'll know it's working when:
1. **Retention** — Players return after first session
2. **Word-of-mouth** — Players share room codes with friends
3. **Stories** — "You won't believe what happened in the Ballroom…"
4. **Secret hunting** — Reddit threads about Room 237 lore
5. **Moral debates** — "Should I have helped my partner or kept the coins?"

---

## My Recommendation

**Start with Phase 1.1 (Lobby Redesign)** + **one experimental room from Phase 2** (I vote **The Gallery**).

**Why:**
- Lobby redesign = immediate visual impact
- The Gallery = tests core "rule instability" concept
- Both are achievable in 2-3 weeks
- Gives us something **tangible to playtest**

**After that:**
- Add 2 more rooms (The Ballroom for projectiles, The Library for drama)
- Implement currency shop (gives players goals)
- Polish combat feel (screen shake, sounds)
- Save Room 237 for "wow moment" reveal

---

## Let's Talk

This plan is ambitious but achievable. I'm open to:
- Scope reduction (what can wait?)
- Priority shifts (disagree with my ordering?)
- Technical constraints (is projectile physics too complex?)

**Next step:** Pick a starting point. Let's prototype something **surprising**.

*— The Game Designer*
