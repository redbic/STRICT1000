# Combat & Player Model Improvement Brainstorm

## What we changed immediately

### 1) Attack animation (in-game)
- Replaced the single static attack arc with a **progressive slash** that sweeps forward over multiple frames.
- Added **motion blur trail layers** so swings feel faster and stronger.
- Added **hit sparks** when attacks connect to provide impact confirmation.
- Kept animation visible even on misses (lighter visual), so input still feels responsive.

### 2) Player model (in-game)
- Upgraded the player from a plain circle into a simple stylized model:
  - shadow
  - torso
  - head + eyes
  - directional nose indicator
  - feet with a lightweight walk cycle
- Added idle/run bobbing so movement has more life.
- Added small attack hand extension during the strike window.

## Online research notes / references

I looked for combat "game feel" references and used widely cited principles from:
- GDC talk: **"Juice it or lose it"** (animation layering, impact feedback).
  - https://www.gdcvault.com/play/1023559/Juice-It-or-Lose
- Hitstop concept summary (impact pause used in many action games).
  - https://www.thealmightyguru.com/Wiki/index.php?title=Hitstop
- General game feel practice from design discussions around screenshake, trails, and responsiveness.

> Note: public search engines are increasingly bot-protected in CI/sandbox environments, so direct scraping is inconsistent. I used stable direct references above.

## Next experiments (recommended)

### Combat feel
1. Add tiny **hitstop** (2-4 frames local freeze on hit).
2. Add very small **camera shake** on hit only.
3. Add attack **wind-up -> active -> recovery** timings for readability.
4. Add attack combo chain (light1/light2/heavy) with distinct arcs.
5. Add enemy hit reactions (knockback + flash).

### Player model quality
1. Move from procedural drawing to a small **sprite sheet** (8-direction idle/run/attack).
2. Support equipment layers (weapon/armor recolor).
3. Add directional body twist while aiming.
4. Add hurt/stunned animation variants.
5. Add optional avatar frame to blend UI avatar with in-world model style.

## Quick art direction targets
- Keep silhouette readable at zoomed-out distance.
- Prioritize directionality: player should always face clearly.
- Use color contrast for attack readability against dark zones.
- Keep attack VFX short and sharp (<= 140ms) to avoid visual clutter.
