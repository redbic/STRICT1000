# STRICT1000 Game Design Plan
## For the Fullstack Lead

> **From:** Game Designer  
> **Date:** 2026-02-12  
> **Status:** Strategic Development Roadmap

---

## Executive Summary

Strict1000 has a **solid technical foundation** — multiplayer works, combat feels good, zones transition smoothly, and the server-side currency system is robust. The game is **functional but not yet memorable**.

**What's missing is the *soul*.**

This document outlines how to transform our working prototype into the **unsettling, surprising, co-op-driven hotel adventure** we set out to create. Every feature below is designed to amplify our three core inspirations:

- **Realm of the Mad God** → chaotic real-time co-op, loot tension, permadeath stakes
- **Inscryption** → meta-narrative, fourth-wall breaks, the feeling of being watched
- **Wii Play Tanks** → satisfying projectile combat, ricochets, environmental puzzles

---

## Current State Assessment

### What's Working ✅
- **Multiplayer sync**: WebSocket-based co-op with smooth player rendering
- **Movement & combat**: Responsive WASD controls, click-to-attack feels tactile
- **Zone system**: Hub → combat rooms, portal transitions work reliably
- **Currency foundation**: Server-side balance tracking, kill rewards, shared DB
- **NPC infrastructure**: Basic NPC class exists, "The Receptionist" is in the hub

### What's Missing 🎯
- **Player investment**: Why should I care about this hotel? About my co-op partner?
- **Surprise factor**: Nothing breaks expectations or subverts the formula yet
- **Tension**: Combat has stakes, but death feels cheap — no meaningful loss
- **Hotel as character**: The lobby is just a hallway with a receptionist NPC
- **Rule instability**: Every room plays the same way (melee combat only)
- **Meta-layer**: No sense that the game is watching, no fourth-wall moments

---

## Design Pillars (Reminder)

Every feature below serves one or more of these:

1. **Uneasy Intimacy** — The hotel knows you're here. It reacts.
2. **Tactile Strategy** — Movement and combat feel physical and consequential.
3. **Rule Instability** — Different rooms = different rulesets. Trust nothing.
4. **Meta-Layer Mystery** — There's always a hidden game behind the visible one.

---

## Phase 1: The Hotel Wakes Up
*Priority: HIGH | Timeline: 2-3 weeks*

**Goal:** Transform the lobby from a hallway into a living, breathing hotel that *feels* like it's watching you.

### 1.1 Visual Identity: The Lobby Redesign
**Player Experience:**  
*"I walk into a 1920s hotel lobby. There's a reception desk, a grandfather clock that ticks too slowly, doors with brass plaques, and a staircase leading up to darkness. It doesn't feel like a game hub — it feels like I'm trespassing."*

**Implementation:**
- Redesign hub layout to feel like a **hotel lobby entrance hall**:
  - Reception desk with bell (interactable?)
  - Grandfather clock (visual anchor, could track real-world time)
  - Elegant rug patterns on floor (contrast with current blank hallway)
  - Chandelier lighting (subtle glow effect)
  - Potted plants, luggage carts (environmental storytelling)
  - **Elevator doors** (closed, mysterious — Room 237 reference)
- Wall colors: deep burgundy accents, brass trim, wood paneling
- Floor pattern: checkered or ornate carpet design (CSS background or canvas patterns)
- Add ambient particles: dust motes, flickering lights

**Technical Notes:**
- Keep zones as data in `track.js`, add new wall decorations
- CSS overlays for UI elements (clock, portraits)
- Canvas particle system for atmosphere (low-cost, high-impact)

**Why This Matters:**  
First impressions. Players need to feel like they're in *a place*, not just a waiting room.

---

### 1.2 The Receptionist: Unreliable Narrator
**Player Experience:**  
*"The Receptionist greets me warmly, but her dialogue shifts every time I return. First she's helpful, then cryptic, then she pretends not to recognize me. She keeps mentioning Room 237, but when I ask about it, she changes the subject."*

**Implementation:**
- Expand NPC interaction system:
  - Click NPC → dialogue box appears
  - Dialogue cycles through states based on **player progression** (rooms visited, deaths, currency earned)
  - Introduce **contradictions**:
    - "Welcome back!" (when it's your first visit)
    - "You've been here 47 times." (when you've been here once)
    - "The elevator is permanently out of service." → later: "The elevator? It's always been working."
- Add **mood shifts**:
  - Early game: Polite, corporate hospitality
  - Mid-game: Nervous, evasive, apologetic
  - Late game: Cold, transactional, almost hostile
- Introduce **Room 237 obsession**:
  - Receptionist repeatedly warns against it
  - "The presidential suite is closed for renovations."
  - "You don't have clearance for that floor."

**Technical Notes:**
- Store dialogue state in `localStorage` (per-player memory)
- Use `player.balance` and `player.zoneLevel` as triggers for dialogue shifts
- Simple click-to-interact system (already have mouse event system from combat)

**Why This Matters:**  
This is our **Inscryption narrator moment**. The Receptionist is the game's voice — unreliable, manipulative, and the first sign that something's wrong.

---

### 1.3 Environmental Storytelling: The Lobby Evolves
**Player Experience:**  
*"Every time I return to the lobby, something's different. A new door has appeared. The clock has stopped. There's a bloodstain on the rug that wasn't there before. The hotel is reacting to us."*

**Implementation:**
- **Server-tracked lobby state** (shared across all players):
  - Track total player deaths → lobby gets darker, portraits fall off walls
  - Track total currency spent → lobby gets cleaner, flowers appear
  - Track rooms cleared → new doors unlock
- **Persistent changes**:
  - Door plaques change labels ("Room 102" → "The Archive" → "???")
  - Environmental damage (cracks in walls, broken glass near portals to dangerous rooms)
  - NPC placement shifts (Receptionist moves around, new NPCs appear)
- **Time-based events**:
  - Grandfather clock chimes every real-world hour → brief flicker effect
  - Lighting dims at night (server time check)

**Technical Notes:**
- Add lobby state object to server: `lobbyState = { deaths: 0, moneySpent: 0, roomsCleared: [] }`
- Sync lobby state via WebSocket (send on connect, broadcast on change)
- Client renders lobby differently based on state thresholds

**Why This Matters:**  
The hotel becomes a **character**. Players feel like their actions have weight beyond their own progression.

---

## Phase 2: Rule Instability — Every Room is a New Game
*Priority: HIGH | Timeline: 3-4 weeks*

**Goal:** Break the monotony. Each room should surprise players with a twist on the core mechanics.

### 2.1 Room-Specific Rulesets
**Player Experience:**  
*"I open the door to Room 102. My partner and I step in. Suddenly, our movement controls are reversed. Enemies move backwards. We're laughing and panicking at once. This room is **different**."*

**Proposed Room Types:**

#### 🔴 **The Archive** (Current Combat Room)
- **Rule:** Standard combat — baseline for comparison
- **Twist:** Enemies drop "pages" that hint at hotel lore
- **Challenge:** Increasing waves, higher enemy count

#### 🟡 **The Ballroom** (Ranged Combat)
- **Rule:** Melee attacks disabled, projectile combat only
- **Twist:** Mirrors on walls reflect projectiles (Wii Play Tanks!)
- **Challenge:** Dodging your own ricochets

#### 🟢 **The Kitchen** (Reverse Controls)
- **Rule:** WASD inverted (W = down, S = up, etc.)
- **Twist:** Enemies also move backwards
- **Challenge:** Spatial disorientation, friendly fire risk

#### 🔵 **The Gallery** (Darkness)
- **Rule:** Limited visibility — only see in a small radius
- **Twist:** Co-op partner is only visible as a glowing cursor
- **Challenge:** Communication becomes essential

#### 🟣 **The Library** (Permadeath Zone)
- **Rule:** If you die here, you lose **all your currency**
- **Twist:** Rewards are 5x normal
- **Challenge:** Risk vs. reward, co-op trust (do you help your dying partner?)

#### ⚫ **The Basement** (Speed Trial)
- **Rule:** 60-second timer, must reach exit before time runs out
- **Twist:** Enemies respawn infinitely, movement speed doubled
- **Challenge:** Pure adrenaline sprint, no time to fight

#### 🔴 **The Elevator** (Procedural Floors)
- **Rule:** Each "floor" is a random mini-room (5 floors to descend)
- **Twist:** Rules change every floor
- **Challenge:** Adaptability, unpredictability

**Implementation:**
- Add `ruleset` field to zone definitions in `track.js`:
  ```javascript
  archive_entry: {
    name: 'The Archive',
    ruleset: 'standard',
    // ...
  },
  ballroom: {
    name: 'The Ballroom',
    ruleset: 'ranged_only',
    enableProjectiles: true,
    disableMelee: true,
    // ...
  }
  ```
- In `game.js`, check `zone.ruleset` and modify game logic:
  - Swap input mappings for reverse controls
  - Disable melee attacks for ranged-only rooms
  - Add darkness shader for limited visibility
- Each ruleset = ~100 lines of conditional logic max

**Technical Notes:**
- Use existing `Player.tryAttack()` and `Enemy.update()` as hooks
- Add canvas shaders for visual effects (darkness, mirror reflections)
- Projectile system needs basic physics (angle, velocity, bounce detection)

**Why This Matters:**  
**Rule instability is the core of Strict1000's identity.** Every room should feel like a mini-game. Players never settle into a rhythm.

---

### 2.2 Projectile Combat System (Wii Play Tanks Homage)
**Player Experience:**  
*"I click to shoot. The projectile flies toward the enemy. It misses, bounces off a mirrored wall, and hits my co-op partner. We both laugh. Then we realize friendly fire is on."*

**Implementation:**
- Add `Projectile` class:
  ```javascript
  class Projectile {
    constructor(x, y, angle, speed, owner, damage) {
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.owner = owner; // 'player' or 'enemy'
      this.damage = damage;
      this.bounces = 0;
      this.maxBounces = 2;
    }
    update(zone) {
      // Move
      this.x += this.vx;
      this.y += this.vy;
      
      // Check wall collisions → bounce
      if (this.checkWallCollision(zone)) {
        this.reflectVelocity();
        this.bounces++;
      }
      
      // Destroy after max bounces
      return this.bounces > this.maxBounces;
    }
  }
  ```
- Player fires projectiles in ranged rooms (replaces melee)
- Enemies gain projectile attacks (some rooms only)
- Damage on collision (player, enemy, walls)

**Technical Notes:**
- Projectile array in `game.js` (like enemies array)
- Collision detection: AABB for entities, line-rect intersection for walls
- Visual: glowing circle sprite, trail effect

**Why This Matters:**  
Projectiles add **tactical depth** and **chaos**. Friendly fire creates tension. Bouncing shots feel **satisfying**.

---

## Phase 3: Co-op Tension — The Shared Currency Drama
*Priority: MEDIUM | Timeline: 2-3 weeks*

**Goal:** Make the shared currency system **feel consequential**. Right now, currency is just a score. It should create **drama**.

### 3.1 Currency as Social Currency
**Player Experience:**  
*"My partner just picked up a 50-coin drop. I saw it first, but they were closer. Do I say something? We need 200 coins to unlock the next door. I'm at 150, they're at 80. Should I help them or save for myself?"*

**Implementation:**
- **Make currency visible**: Show coin drops in-world (floating icon)
- **Proximity pickup**: Whoever touches it first gets it (race to loot)
- **Currency-gated doors**: Some portals require X coins to open (per-player check)
- **Co-op pooling option**:
  - Interact with Receptionist → "Pool resources?" button
  - All players in room contribute to a shared pot
  - Unlocks "team doors" that require collective funding

**Technical Notes:**
- Add `CoinDrop` class (similar to `Projectile`)
- Portal interaction checks `player.balance` before allowing transition
- Server tracks pooled currency (new API endpoint: `/api/pool/add`)

**Why This Matters:**  
**Realm of the Mad God** nailed loot tension. We need that. Shared currency makes every kill feel competitive **and** cooperative.

---

### 3.2 The Currency Shop — Abilities & Cosmetics
**Player Experience:**  
*"I saved up 100 coins. The Receptionist offers me three choices: a dash ability, a shield, or a glowing trail cosmetic. I want the dash, but my partner needs the shield to survive the next room. What do I do?"*

**Implementation:**
- Add shop UI (interactable NPC or portal in lobby):
  - **Abilities** (permanent unlocks):
    - Dash (20 coins): Double-tap WASD to dash (iframe dash)
    - Shield Block (30 coins): Right-click to block damage for 2 seconds
    - Fireball (50 coins): Ranged projectile attack (even in melee rooms)
  - **Cosmetics** (visual flair):
    - Colored trails (10 coins each)
    - Player glow effects (15 coins)
    - Avatar frames (20 coins)
  - **Consumables** (one-time use):
    - Health potion (5 coins): Restore 50 HP
    - Bomb (10 coins): Area damage in next room
- Purchases persist in database (`character_data` JSON field)

**Technical Notes:**
- Expand `Player` class to support abilities (new methods: `dash()`, `block()`, `fireball()`)
- Consumables stored in player inventory (array of items)
- Shop UI: simple modal overlay with purchase buttons

**Why This Matters:**  
**Spending currency creates investment.** Players care more about their characters when they've customized them. Abilities add **strategic depth**.

---

## Phase 4: Meta-Narrative Layer — Room 237
*Priority: LOW (but HIGH IMPACT) | Timeline: 3-4 weeks*

**Goal:** Deliver the **Inscryption-style reveal**. The game has been lying to you.

### 4.1 The Presidential Suite Mystery
**Player Experience:**  
*"I've cleared 20 rooms. Earned 500 coins. The Receptionist keeps warning me about Room 237. The elevator is still locked. Then, one day, I return to the lobby — and the elevator doors are open. No fanfare. Just… open. My cursor hovers over it. Do I enter?"*

**Implementation:**
- **Slow-burn unlock**:
  - Elevator appears locked (visual: red light, "OUT OF SERVICE" sign)
  - After X rooms cleared (server-tracked), elevator unlocks
  - No announcement, no tutorial — just silently unlocks
- **Room 237 is different**:
  - Single-player only (co-op partner is kicked out)
  - No enemies, just environmental storytelling
  - Scattered "documents" reveal the hotel's backstory
  - The Receptionist's portrait is on the wall… but younger? Older?
  - A mirror shows a **different player character** (server sends wrong avatar)
- **The Reveal**:
  - The hotel is a **time loop**. All players are the same person.
  - The Receptionist is a trapped previous player.
  - The presidential suite is the "exit" — but leaving means trapping someone else.

**Technical Notes:**
- Elevator portal has conditional unlock (check server state)
- Room 237 disables multiplayer (disconnect other players from room)
- Use `localStorage` to store "loop count" (incrementing each run)
- Fake avatar swap: server sends wrong `avatarUrl` to client in Room 237

**Why This Matters:**  
This is the **wow moment**. The story that players share. The reason they keep playing to see "what happens next."

---

## Phase 5: Polish & Juice
*Priority: LOW | Timeline: Ongoing*

**Goal:** Make every action feel **satisfying**. Juice is the difference between "functional" and "fun."

### 5.1 Combat Feel Enhancements
- **Screen shake** on hit (canvas offset jitter)
- **Damage numbers** (floating text on damage dealt)
- **Hit sounds** (thwack, whoosh, splat)
- **Death animations** (enemies fade/explode, player crumples)
- **Attack trails** (slash effect behind weapon swing)

### 5.2 Audio Layer
- **Ambient hotel sounds**:
  - Lobby: ticking clock, distant elevator dings, muffled voices
  - Rooms: creaking floorboards, wind howling, dripping water
- **Combat sounds**: sword swings, projectile whooshes, enemy grunts
- **Music**: Retro atmospheric tracks (think Silent Hill meets PS1 horror)

### 5.3 Visual Polish
- **Sprite-based characters** (replace circles with pixel art)
- **Tile-based floors** (patterned carpets, wood paneling)
- **Lighting effects** (torch flicker, chandelier glow)
- **Particle systems** (dust, blood splatter, sparkles on coin pickup)

---

## Prioritized Feature Roadmap

### Now (Next 2 Weeks)
1. **Lobby redesign** (visual identity)
2. **Receptionist dialogue system** (unreliable narrator)
3. **Room-specific rulesets** (2-3 experimental rooms)

### Soon (Weeks 3-6)
4. **Projectile combat system** (Wii Play Tanks)
5. **Currency shop** (abilities + cosmetics)
6. **Lobby evolution system** (server-tracked state)

### Later (Weeks 7-10)
7. **Room 237 meta-narrative** (Inscryption reveal)
8. **Audio pass** (ambient + combat sounds)
9. **Visual polish** (sprites, particles, lighting)

### Dream Features (Post-Launch)
- **Daily challenges** (time-limited rooms)
- **Leaderboards** (fastest clears, highest currency)
- **Player housing** (customize your "room" in the hotel)
- **PvP arena** (betrayal mode — last player standing takes all currency)

---

## Technical Debt to Address

### High Priority
- [ ] **README.md is outdated** — remove singleplayer references, update controls
- [ ] **Room codes don't work** — no UI to join a friend's room by code
- [ ] **No automated tests** — at least integration tests for server API

### Medium Priority
- [ ] **Mobile support** — touch controls for movement/attack
- [ ] **Performance optimization** — canvas rendering could be more efficient
- [ ] **Error handling** — no reconnection logic if WebSocket drops

### Low Priority
- [ ] **Accessibility** — colorblind modes, screen reader support
- [ ] **Internationalization** — multi-language support

---

## Success Metrics

We'll know we've succeeded when players:

1. **Come back** — Retention beyond first session
2. **Bring friends** — Organic word-of-mouth (shared room codes)
3. **Tell stories** — "You won't believe what happened in the Ballroom…"
4. **Hunt for secrets** — Reddit threads about Room 237 lore
5. **Debate choices** — "Should I have given my partner the coins?"

---

## Final Thoughts

**Strict1000 is not a game about combat. It's a game about tension, surprise, and co-op drama set in a hotel that hates you.**

The technical foundation is solid. Now we need to:
- Make the **hotel feel alive** (lobby redesign, evolving state)
- Make **every room surprising** (rule instability)
- Make **currency matter** (social tension, shop, gating)
- Make **combat satisfying** (projectiles, juice, audio)
- Make the **story unforgettable** (Room 237)

We're building something weird, ambitious, and unlike anything else. Let's make it **impossible to forget**.

---

**Next Steps for Fullstack Lead:**
1. Review this plan — pushback welcome, especially on scope
2. Pick Phase 1 or Phase 2 to start (I recommend **Phase 1.1: Lobby Redesign** for immediate visual impact)
3. Let's prototype **one experimental room** from Phase 2.1 (I vote **The Gallery** for co-op drama)
4. Schedule a playtest after lobby + one room is done

*— The Game Designer*
