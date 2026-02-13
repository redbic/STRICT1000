// Character sprite manager for LimeZu character sprites

class CharacterSpriteManager {
    constructor() {
        this.sprites = new Map();
        this.frameSize = 16; // Each frame is 16x16
        this.scale = 3; // Scale up to 48px
        this.loaded = false;

        // Animation definitions based on LimeZu sprite sheet layout
        // Row indices for different animations
        this.animations = {
            idle_down: { row: 0, frames: 4, speed: 0.15 },
            walk_down: { row: 1, frames: 8, speed: 0.12 },
            walk_right: { row: 2, frames: 8, speed: 0.12 },
            walk_up: { row: 3, frames: 8, speed: 0.12 },
            walk_left: { row: 4, frames: 8, speed: 0.12 },
            idle_right: { row: 5, frames: 4, speed: 0.15 },
            idle_up: { row: 6, frames: 4, speed: 0.15 },
            idle_left: { row: 7, frames: 4, speed: 0.15 },
        };
    }

    async loadCharacter(name, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.sprites.set(name, {
                    image: img,
                    width: img.width,
                    height: img.height
                });
                console.log(`Loaded character: ${name}`);
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load character: ${name}`);
                resolve();
            };
            img.src = path;
        });
    }

    async loadAllPremade() {
        const promises = [];
        for (let i = 1; i <= 20; i++) {
            const num = i.toString().padStart(2, '0');
            promises.push(
                this.loadCharacter(`character_${num}`, `/assets/characters/Premade_Character_${num}.png`)
            );
        }
        await Promise.all(promises);
        this.loaded = true;
        console.log('All characters loaded');
    }

    // Get animation state based on velocity
    getAnimationState(vx, vy, speed) {
        const moving = speed > 10; // Threshold for movement

        if (!moving) {
            // Idle - use last direction
            return 'idle_down'; // Default, could track last direction
        }

        // Determine direction based on velocity
        const angle = Math.atan2(vy, vx);
        const deg = (angle * 180 / Math.PI + 360) % 360;

        if (deg >= 315 || deg < 45) return 'walk_right';
        if (deg >= 45 && deg < 135) return 'walk_down';
        if (deg >= 135 && deg < 225) return 'walk_left';
        return 'walk_up';
    }

    // Draw a character
    draw(ctx, characterName, x, y, animState, frameTime) {
        const sprite = this.sprites.get(characterName);
        if (!sprite) {
            // Fallback if character not loaded
            return false;
        }

        const anim = this.animations[animState] || this.animations.idle_down;
        const frameIndex = Math.floor(frameTime / anim.speed) % anim.frames;

        const srcX = frameIndex * this.frameSize;
        const srcY = anim.row * this.frameSize;
        const destSize = this.frameSize * this.scale;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            sprite.image,
            srcX, srcY, this.frameSize, this.frameSize,
            x - destSize / 2, y - destSize / 2, destSize, destSize
        );

        return true;
    }

    // Get scaled size
    getScaledSize() {
        return this.frameSize * this.scale;
    }
}

// Global character sprite manager
let characterSprites = null;

async function initCharacterSprites() {
    characterSprites = new CharacterSpriteManager();
    await characterSprites.loadAllPremade();
    return characterSprites;
}
