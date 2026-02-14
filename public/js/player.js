// Player class for adventure character
// Uses centralized CONFIG from config/constants.js

// Local aliases for frequently accessed config values
const PLAYER_MAX_SPEED = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_MAX_SPEED : 350;
const PLAYER_ACCELERATION = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_ACCELERATION : 2200;
const PLAYER_FRICTION = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_FRICTION : 8;
const PLAYER_DEFAULT_HP = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_DEFAULT_HP : 100;
const PLAYER_SIZE = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_SIZE : 30;
const PLAYER_STUN_FRICTION = typeof CONFIG !== 'undefined' ? CONFIG.PLAYER_STUN_FRICTION : 12;

// Gun constants (aliased from CONFIG)
const PLAYER_GUN_FIRE_RATE = typeof CONFIG !== 'undefined' ? CONFIG.GUN_FIRE_RATE : 0.75;
const PLAYER_GUN_DAMAGE = typeof CONFIG !== 'undefined' ? CONFIG.GUN_DAMAGE : 25;
const PLAYER_GUN_MAGAZINE_SIZE = typeof CONFIG !== 'undefined' ? CONFIG.GUN_MAGAZINE_SIZE : 5;
const PLAYER_GUN_RELOAD_TIME = typeof CONFIG !== 'undefined' ? CONFIG.GUN_RELOAD_TIME : 1.75;
const PLAYER_GUN_BARREL_LENGTH = typeof CONFIG !== 'undefined' ? CONFIG.GUN_BARREL_LENGTH : 20;

class Player {
    /**
     * Create a new player
     * @param {number} x - Initial x position
     * @param {number} y - Initial y position
     * @param {string} color - Hex color code for player
     * @param {string} id - Unique player identifier
     * @param {string} username - Display name for player
     * @param {number} characterNum - Character sprite number (1-7 for players)
     */
    constructor(x, y, color, id, username, characterNum = null) {
        this.x = x;
        this.y = y;
        this.width = PLAYER_SIZE;
        this.height = PLAYER_SIZE;
        this.color = color || '#3498db';
        this.id = id;
        this.username = username || 'Player';
        this.avatarUrl = '';
        this.avatarImg = null;
        // Character sprite number (1-7 for players, 8-20 reserved for NPCs)
        this.characterNum = (characterNum && characterNum >= 1 && characterNum <= 7) ? characterNum : null;
        
        // Physics
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = PLAYER_MAX_SPEED;
        this.acceleration = PLAYER_ACCELERATION;
        this.friction = PLAYER_FRICTION;
        
        // Game stats
        this.zoneLevel = 1;
        this.nodesVisited = [];

        // Combat
        this.maxHp = PLAYER_DEFAULT_HP;
        this.hp = PLAYER_DEFAULT_HP;

        // Gun weapon system
        this.gun = {
            fireRate: PLAYER_GUN_FIRE_RATE,
            fireCooldown: 0,
            barrelLength: PLAYER_GUN_BARREL_LENGTH,
            magazineSize: PLAYER_GUN_MAGAZINE_SIZE,
            ammo: PLAYER_GUN_MAGAZINE_SIZE,
            reloadTime: PLAYER_GUN_RELOAD_TIME,
            reloading: false,
            reloadTimer: 0
        };

        // Muzzle flash effect
        this.muzzleFlash = {
            active: false,
            timer: 0,
            duration: 0.08  // seconds
        };
        
        // Status
        this.stunned = false;
        this.stunnedTime = 0;
        this.isDead = false;
        this.damageFlashTimer = 0;

        // Speech bubble for chat
        this.speech = {
            text: '',
            createdAt: 0,
            duration: 4000  // 4 seconds in milliseconds
        };

        // Interpolation targets (used by remote players)
        this.targetX = undefined;
        this.targetY = undefined;
    }
    
    /**
     * Update player movement physics only (for fixed timestep)
     * @param {Object} keys - Current keyboard state
     * @param {Zone} zone - Current zone for collision detection
     * @param {number} dt - Delta time in seconds
     */
    updateMovement(keys, zone, dt = 1/60) {
        // Handle stun effect
        if (this.stunned) {
            this.stunnedTime -= dt;
            if (this.stunnedTime <= 0) {
                this.stunned = false;
            }
            // Apply heavy friction when stunned (frame-rate independent)
            const stunFriction = Math.exp(-PLAYER_STUN_FRICTION * dt);
            this.velocityX *= stunFriction;
            this.velocityY *= stunFriction;
        } else {
            // Handle movement (4-directional top-down)
            let moveX = 0;
            let moveY = 0;

            if (keys['ArrowUp'] || keys['w']) {
                moveY = -1;
            }
            if (keys['ArrowDown'] || keys['s']) {
                moveY = 1;
            }
            if (keys['ArrowLeft'] || keys['a']) {
                moveX = -1;
            }
            if (keys['ArrowRight'] || keys['d']) {
                moveX = 1;
            }

            // Normalize diagonal movement
            if (moveX !== 0 && moveY !== 0) {
                moveX *= 0.707;
                moveY *= 0.707;
            }

            // Update facing angle and apply physics
            if (moveX !== 0 || moveY !== 0) {
                this.angle = Math.atan2(moveY, moveX);
                // Apply acceleration (time-based)
                this.velocityX += moveX * this.acceleration * dt;
                this.velocityY += moveY * this.acceleration * dt;
            }

            // Apply friction (frame-rate independent exponential decay)
            const frictionFactor = Math.exp(-this.friction * dt);
            this.velocityX *= frictionFactor;
            this.velocityY *= frictionFactor;

            // Cap velocity at maxSpeed
            const currentSpeed = Math.hypot(this.velocityX, this.velocityY);
            if (currentSpeed > this.maxSpeed) {
                this.velocityX = (this.velocityX / currentSpeed) * this.maxSpeed;
                this.velocityY = (this.velocityY / currentSpeed) * this.maxSpeed;
            }
        }

        // Update speed for network sync (normalized to ~0-3 range for compatibility)
        const normFactor = (typeof CONFIG !== 'undefined' && CONFIG.SPEED_NORMALIZATION_FACTOR)
            ? CONFIG.SPEED_NORMALIZATION_FACTOR
            : 60;
        this.speed = Math.hypot(this.velocityX, this.velocityY) / normFactor;

        // Store old position
        const oldX = this.x;
        const oldY = this.y;

        // Update X position first, check collision separately for wall sliding
        this.x += this.velocityX * dt;
        if (zone) {
            const halfW = this.width / 2;
            this.x = Math.max(halfW, Math.min(zone.width - halfW, this.x));
            if (zone.checkCollision(this)) {
                this.x = oldX;
                this.velocityX = 0;
            }
        }

        // Update Y position, check collision separately
        this.y += this.velocityY * dt;
        if (zone) {
            const halfH = this.height / 2;
            this.y = Math.max(halfH, Math.min(zone.height - halfH, this.y));
            if (zone.checkCollision(this)) {
                this.y = oldY;
                this.velocityY = 0;
            }
        }

        // Check area nodes
        if (zone) {
            zone.checkPlayerNode(this);
        }
    }

    /**
     * Update player physics and state (legacy method, calls updateMovement + updateGun)
     * @param {Object} keys - Current keyboard state
     * @param {Zone} zone - Current zone for collision detection
     * @param {number} dt - Delta time in seconds
     */
    update(keys, zone, dt = 1/60) {
        this.updateMovement(keys, zone, dt);
        this.updateGun(dt);
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
        }
    }
    
    /**
     * Draw player on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} cameraX - Camera x offset
     * @param {number} cameraY - Camera y offset
     */
    draw(ctx, cameraX, cameraY) {
        ctx.save();

        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;

        // Try to use LimeZu character sprites first
        if (typeof characterSprites !== 'undefined' && characterSprites && characterSprites.loaded) {
            this.drawWithTilesetSprite(ctx, screenX, screenY);
        }
        // Fall back to custom sprite if available
        else if (typeof spriteManager !== 'undefined' && spriteManager.has('player')) {
            this.drawWithSprite(ctx, screenX, screenY);
        } else {
            this.drawFallback(ctx, screenX, screenY);
        }

        ctx.restore();

        // Draw speech bubble if active
        if (this.hasSpeech()) {
            this.drawSpeechBubble(ctx, screenX, screenY - 60);
        }

        // Draw username above character
        const labelY = screenY - 32;
        ctx.fillStyle = '#4a4540';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, screenX, labelY);

        ctx.fillStyle = '#999999';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, screenX, labelY + 12);
    }

    /**
     * Draw speech bubble above player
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} centerX - Center X of bubble
     * @param {number} topY - Top Y of bubble
     */
    drawSpeechBubble(ctx, centerX, topY) {
        ctx.save();

        const bubbleWidth = 180;
        const bubbleHeight = 50;
        const cornerRadius = 6;
        const bubbleX = centerX - bubbleWidth / 2;
        const bubbleY = topY;

        // Draw bubble background
        ctx.fillStyle = 'rgba(26, 26, 26, 0.92)';
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.moveTo(bubbleX + cornerRadius, bubbleY);
        ctx.lineTo(bubbleX + bubbleWidth - cornerRadius, bubbleY);
        ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + cornerRadius);
        ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - cornerRadius);
        ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - cornerRadius, bubbleY + bubbleHeight);

        // Tail pointer
        ctx.lineTo(centerX + 8, bubbleY + bubbleHeight);
        ctx.lineTo(centerX - 8, bubbleY + bubbleHeight);

        ctx.lineTo(bubbleX + cornerRadius, bubbleY + bubbleHeight);
        ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - cornerRadius);
        ctx.lineTo(bubbleX, bubbleY + cornerRadius);
        ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + cornerRadius, bubbleY);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap for long messages
        const words = this.speech.text.split(' ');
        let line1 = '';
        let line2 = '';

        for (const word of words) {
            const testLine = line1 + (line1 ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > bubbleWidth - 12) {
                if (line1) {
                    line2 = word;
                } else {
                    line1 = word;
                }
            } else {
                line1 = testLine;
            }
        }

        const textY = bubbleY + bubbleHeight / 2;
        ctx.fillText(line1, centerX, textY - 8);
        if (line2) {
            ctx.fillText(line2, centerX, textY + 8);
        }

        ctx.restore();
    }

    /**
     * Draw player using LimeZu tileset character sprites
     */
    drawWithTilesetSprite(ctx, screenX, screenY) {
        // Track animation time (wrap to prevent floating point issues)
        if (!this.animTime) this.animTime = 0;
        this.animTime += 1/60; // Approximate dt
        if (this.animTime > 100) this.animTime = 0; // Reset periodically

        // Determine animation state based on movement
        const speed = Math.hypot(this.velocityX, this.velocityY);
        let animState = 'idle_down';

        if (speed > 20) {
            // Moving - determine direction from velocity
            const angle = Math.atan2(this.velocityY, this.velocityX);
            const deg = (angle * 180 / Math.PI + 360) % 360;

            if (deg >= 315 || deg < 45) animState = 'walk_right';
            else if (deg >= 45 && deg < 135) animState = 'walk_down';
            else if (deg >= 135 && deg < 225) animState = 'walk_left';
            else animState = 'walk_up';

            // Store last direction for idle
            this.lastDirection = animState.replace('walk_', '');
        } else {
            // Idle - use last direction
            animState = 'idle_' + (this.lastDirection || 'down');
        }

        // Use assigned character (1-7) or fall back to hash for legacy/NPCs
        if (!this.characterNum) {
            let hash = 0;
            for (let i = 0; i < this.id.length; i++) {
                hash = ((hash << 5) - hash) + this.id.charCodeAt(i);
            }
            // Fall back to characters 1-7 for players without explicit selection
            this.characterNum = (Math.abs(hash) % 7) + 1;
        }
        const charName = 'character_' + this.characterNum.toString().padStart(2, '0');

        // Draw the character sprite
        const drawn = characterSprites.draw(ctx, charName, screenX, screenY, animState, this.animTime);

        if (!drawn) {
            // Fallback if character sprite fails
            this.drawFallback(ctx, screenX, screenY);
            return;
        }

        // Draw gun on top (optional - might look odd with pixel art)
        // this.drawGun(ctx, screenX, screenY);

        // Draw UI elements
        this.drawUI(ctx, screenX, screenY);
    }

    /**
     * Draw player using sprite image
     */
    drawWithSprite(ctx, screenX, screenY) {
        const now = performance.now() / 1000;
        const moveIntensity = Math.min(1, this.speed / this.maxSpeed);

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);

        const sprite = spriteManager.get('player');
        const size = PLAYER_SIZE;
        ctx.drawImage(sprite, -size/2, -size/2, size, size);

        ctx.restore();

        // Draw gun and effects on top
        this.drawGun(ctx, screenX, screenY);
        this.drawUI(ctx, screenX, screenY);
    }

    /**
     * Draw player using canvas primitives (liminal hotel style)
     */
    drawFallback(ctx, screenX, screenY) {
        const now = performance.now() / 1000;
        const moveIntensity = Math.min(1, this.speed / this.maxSpeed);
        const bob = Math.sin(now * 10) * moveIntensity * 2;
        const bodyY = screenY + bob;

        // Liminal color palette - muted, institutional
        const primaryColor = typeof COLORS !== 'undefined' ? COLORS.PLAYER_BODY : '#4a5568';
        const accentColor = typeof COLORS !== 'undefined' ? COLORS.PLAYER_ACCENT : '#6b7280';
        const shadowColor = typeof COLORS !== 'undefined' ? COLORS.SHADOW_DEEP : 'rgba(40, 35, 25, 0.5)';

        // Body shadow
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 16, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso - flash when taking damage
        let bodyColor = primaryColor;
        if (this.damageFlashTimer > 0) {
            bodyColor = '#b04040';
        } else if (this.stunned) {
            bodyColor = '#8a8580';
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(screenX, bodyY + 2, 14, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle outline
        ctx.strokeStyle = 'rgba(80, 70, 55, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(screenX, bodyY + 2, 14, 11, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Head
        ctx.fillStyle = this.stunned ? '#9a9590' : '#5a5550';
        ctx.beginPath();
        ctx.arc(screenX, bodyY - 12, 8, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (subtle, not glowing)
        ctx.fillStyle = '#3a3530';
        ctx.beginPath();
        ctx.arc(screenX - 3, bodyY - 12, 1.5, 0, Math.PI * 2);
        ctx.arc(screenX + 3, bodyY - 12, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Facing indicator (subtle)
        const dirX = screenX + Math.cos(this.angle) * 10;
        const dirY = bodyY - 12 + Math.sin(this.angle) * 5;
        ctx.fillStyle = 'rgba(90, 128, 128, 0.4)';
        ctx.beginPath();
        ctx.arc(dirX, dirY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Feet (simple walk cycle)
        const stride = Math.sin(now * 16) * moveIntensity * 3.5;
        ctx.strokeStyle = '#4a4540';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(screenX - 5, bodyY + 10);
        ctx.lineTo(screenX - 5 + stride, bodyY + 16);
        ctx.moveTo(screenX + 5, bodyY + 10);
        ctx.lineTo(screenX + 5 - stride, bodyY + 16);
        ctx.stroke();

        // Draw gun and UI
        this.drawGun(ctx, screenX, bodyY);
        this.drawUI(ctx, screenX, screenY);
    }

    /**
     * Draw gun weapon
     */
    drawGun(ctx, screenX, bodyY) {
        const gunAngle = this.angle;
        const gripOffset = 11;
        const handX = screenX + Math.cos(gunAngle) * gripOffset;
        const handY = bodyY + Math.sin(gunAngle) * gripOffset;

        // Gun body (rectangle along angle)
        const gunLength = 28;
        const gunWidth = 6;
        const barrelTipX = handX + Math.cos(gunAngle) * gunLength;
        const barrelTipY = handY + Math.sin(gunAngle) * gunLength;

        // Gun body - muted colors
        ctx.strokeStyle = this.gun.reloading ? '#8a8580' : '#4a4540';
        ctx.lineWidth = gunWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Gun barrel highlight
        ctx.strokeStyle = '#6b5344';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(handX + Math.cos(gunAngle) * 10, handY + Math.sin(gunAngle) * 10);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Hand on grip
        ctx.fillStyle = '#5a5550';
        ctx.beginPath();
        ctx.arc(handX, handY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Muzzle flash effect (brighter red/orange)
        if (this.muzzleFlash.active && this.muzzleFlash.timer > 0) {
            const flashX = barrelTipX + Math.cos(gunAngle) * 6;
            const flashY = barrelTipY + Math.sin(gunAngle) * 6;
            const flashProgress = this.muzzleFlash.timer / this.muzzleFlash.duration;
            const flashSize = 10 * flashProgress;

            ctx.fillStyle = `rgba(255, 100, 50, ${flashProgress})`;
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(flashX, flashY, flashSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 200, 100, ${flashProgress * 0.8})`;
            ctx.beginPath();
            ctx.arc(flashX, flashY, flashSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    /**
     * Draw player UI elements (ammo, reload)
     */
    drawUI(ctx, screenX, screenY) {
        // Ammo indicator (red dots when low)
        if (this.gun.ammo <= 2 && !this.gun.reloading) {
            const indicatorY = screenY - 55;
            for (let i = 0; i < this.gun.ammo; i++) {
                ctx.fillStyle = '#cc0000';
                ctx.beginPath();
                ctx.arc(screenX - 5 + i * 8, indicatorY, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Reload indicator
        if (this.gun.reloading) {
            const reloadProgress = 1 - (this.gun.reloadTimer / this.gun.reloadTime);
            ctx.fillStyle = 'rgba(139, 0, 0, 0.9)';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('RELOADING', screenX, screenY - 55);

            // Progress bar (red)
            const barWidth = 40;
            const barHeight = 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(screenX - barWidth / 2, screenY - 50, barWidth, barHeight);
            ctx.fillStyle = '#8b0000';
            ctx.fillRect(screenX - barWidth / 2, screenY - 50, barWidth * reloadProgress, barHeight);
        }
    }
    /**
     * Set player avatar image
     * @param {string} url - Avatar image URL
     */
    setAvatar(url) {
        if (!url || this.avatarUrl === url) return;
        this.avatarUrl = url;
        this.avatarImg = new Image();
        this.avatarImg.src = url;
    }
    /**
     * Update gun cooldowns and reload state
     * @param {number} dt - Delta time in seconds
     */
    updateGun(dt) {
        if (this.gun.fireCooldown > 0) {
            this.gun.fireCooldown -= dt;
        }
        if (this.gun.reloading) {
            this.gun.reloadTimer -= dt;
            if (this.gun.reloadTimer <= 0) {
                this.gun.ammo = this.gun.magazineSize;
                this.gun.reloading = false;
            }
        }
        // Update muzzle flash
        if (this.muzzleFlash.active) {
            this.muzzleFlash.timer -= dt;
            if (this.muzzleFlash.timer <= 0) {
                this.muzzleFlash.active = false;
            }
        }
    }

    /**
     * Start reloading the gun
     */
    reload() {
        if (this.gun.reloading || this.gun.ammo === this.gun.magazineSize) return;
        this.gun.reloading = true;
        this.gun.reloadTimer = this.gun.reloadTime;
    }

    /**
     * Attempt to fire a projectile
     * @param {number} angle - Angle to fire at
     * @returns {Projectile|null} The fired projectile or null if cannot fire
     */
    fireProjectile(angle) {
        if (this.gun.fireCooldown > 0 || this.gun.reloading) return null;
        if (this.gun.ammo <= 0) {
            this.reload();
            return null;
        }

        this.gun.ammo--;
        this.gun.fireCooldown = 1 / this.gun.fireRate;
        this.angle = angle;

        // Trigger muzzle flash
        this.muzzleFlash.active = true;
        this.muzzleFlash.timer = this.muzzleFlash.duration;

        // Spawn projectile at barrel tip
        const spawnX = this.x + Math.cos(angle) * this.gun.barrelLength;
        const spawnY = this.y + Math.sin(angle) * this.gun.barrelLength;

        return new Projectile(spawnX, spawnY, angle, this.id, {
            damage: PLAYER_GUN_DAMAGE,
            maxBounces: 0  // Default weapon: no bounces
        });
    }

    /**
     * Check if player can fire
     * @returns {boolean}
     */
    canFire() {
        return this.gun.fireCooldown <= 0 && !this.gun.reloading && this.gun.ammo > 0;
    }
    /**
     * Apply damage to player
     * @param {number} amount - Damage amount
     * @returns {boolean} True if player died from this damage
     */
    takeDamage(amount) {
        if (this.isDead) return false;
        this.hp = Math.max(0, this.hp - amount);
        this.damageFlashTimer = 0.15; // 150ms red flash
        if (this.hp <= 0) {
            this.isDead = true;
            return true;
        }
        return false;
    }

    /**
     * Respawn player with full HP
     */
    respawn() {
        this.hp = this.maxHp;
        this.isDead = false;
        this.damageFlashTimer = 0;
    }
    
    getState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            angle: this.angle,
            speed: this.speed,
            zoneLevel: this.zoneLevel,
            username: this.username,
            stunned: this.stunned,
            hp: this.hp,
            isDead: this.isDead
        };
    }

    setState(state) {
        // Store target state for interpolation
        this.targetX = state.x;
        this.targetY = state.y;
        this.angle = state.angle;
        this.speed = state.speed;
        this.zoneLevel = state.zoneLevel;
        this.stunned = state.stunned;
        if (state.hp !== undefined) this.hp = state.hp;
        if (state.isDead !== undefined) this.isDead = state.isDead;
    }

    interpolateRemote(dt) {
        if (this.targetX === undefined) return;
        // Frame-rate independent interpolation: ~87% per 100ms at 60fps
        const lerpFactor = 1 - Math.pow(0.001, dt);
        this.x += (this.targetX - this.x) * lerpFactor;
        this.y += (this.targetY - this.y) * lerpFactor;
    }

    /**
     * Set speech bubble text that displays above player
     * @param {string} text - Message to display
     */
    setSpeech(text) {
        this.speech.text = text;
        this.speech.createdAt = Date.now();
    }

    /**
     * Check if speech bubble is currently active
     * @returns {boolean}
     */
    hasSpeech() {
        if (!this.speech.text) return false;
        const elapsed = Date.now() - this.speech.createdAt;
        return elapsed < this.speech.duration;
    }
}
