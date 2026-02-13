// Player class for adventure character

// Constants (time-based, units per second)
const PLAYER_MAX_SPEED = 350;           // pixels per second
const PLAYER_ACCELERATION = 2200;       // pixels per second squared
const PLAYER_FRICTION = 8;              // friction factor (higher = more friction)
const PLAYER_DEFAULT_HP = 100;
const PLAYER_SIZE = 30;                 // 50% larger (was 20)
const PLAYER_STUN_FRICTION = 12;        // higher friction when stunned

// Gun constants
const PLAYER_GUN_FIRE_RATE = 0.75;      // shots per second (slow, tactical)
const PLAYER_GUN_DAMAGE = 25;           // damage per shot (4 shots kills 100hp enemy)
const PLAYER_GUN_MAGAZINE_SIZE = 5;     // shots before reload
const PLAYER_GUN_RELOAD_TIME = 3.5;     // seconds to reload (punishing)
const PLAYER_GUN_BARREL_LENGTH = 20;    // visual barrel offset

class Player {
    /**
     * Create a new player
     * @param {number} x - Initial x position
     * @param {number} y - Initial y position  
     * @param {string} color - Hex color code for player
     * @param {string} id - Unique player identifier
     * @param {string} username - Display name for player
     */
    constructor(x, y, color, id, username) {
        this.x = x;
        this.y = y;
        this.width = PLAYER_SIZE;
        this.height = PLAYER_SIZE;
        this.color = color || '#3498db';
        this.id = id;
        this.username = username || 'Player';
        this.avatarUrl = '';
        this.avatarImg = null;
        
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
        this.speed = Math.hypot(this.velocityX, this.velocityY) / 60;

        // Store old position
        const oldX = this.x;
        const oldY = this.y;

        // Update position (time-based)
        this.x += this.velocityX * dt;
        this.y += this.velocityY * dt;

        // Clamp to zone bounds
        if (zone) {
            const halfW = this.width / 2;
            const halfH = this.height / 2;
            this.x = Math.max(halfW, Math.min(zone.width - halfW, this.x));
            this.y = Math.max(halfH, Math.min(zone.height - halfH, this.y));
        }

        // Check area collision
        if (zone && zone.checkCollision(this)) {
            this.x = oldX;
            this.y = oldY;
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

        // Check if sprite is available
        if (typeof spriteManager !== 'undefined' && spriteManager.has('player')) {
            this.drawWithSprite(ctx, screenX, screenY);
        } else {
            this.drawFallback(ctx, screenX, screenY);
        }

        ctx.restore();

        // Draw avatar + username above character
        const labelY = screenY - 36;
        if (this.avatarImg && this.avatarImg.complete) {
            const size = 20;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.avatarImg, screenX - size / 2, labelY - size, size, size);
        } else {
            ctx.fillStyle = '#cc0000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👽', screenX, labelY - 6);
        }

        ctx.fillStyle = '#999999';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, screenX, labelY + 12);
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
     * Draw player using canvas primitives (noir style fallback)
     */
    drawFallback(ctx, screenX, screenY) {
        const now = performance.now() / 1000;
        const moveIntensity = Math.min(1, this.speed / this.maxSpeed);
        const bob = Math.sin(now * 10) * moveIntensity * 2;
        const bodyY = screenY + bob;

        // Noir color palette
        const primaryColor = typeof COLORS !== 'undefined' ? COLORS.PLAYER_BODY : '#1a1a2e';
        const accentColor = typeof COLORS !== 'undefined' ? COLORS.BLOOD_RED : '#8b0000';
        const shadowColor = typeof COLORS !== 'undefined' ? COLORS.SHADOW : 'rgba(0, 0, 0, 0.8)';

        // Body shadow (larger for bigger player)
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 16, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso - flash red when taking damage, noir colors
        let bodyColor = primaryColor;
        if (this.damageFlashTimer > 0) {
            bodyColor = '#ff0000';
        } else if (this.stunned) {
            bodyColor = '#333333';
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(screenX, bodyY + 2, 14, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // Red accent stripe on torso
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX, bodyY - 8);
        ctx.lineTo(screenX, bodyY + 10);
        ctx.stroke();

        // Subtle outline
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(screenX, bodyY + 2, 14, 11, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Head (dark/shadowed)
        ctx.fillStyle = this.stunned ? '#444' : '#2a2a2a';
        ctx.beginPath();
        ctx.arc(screenX, bodyY - 12, 8, 0, Math.PI * 2);
        ctx.fill();

        // Red glowing eyes
        ctx.fillStyle = accentColor;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(screenX - 3, bodyY - 12, 1.5, 0, Math.PI * 2);
        ctx.arc(screenX + 3, bodyY - 12, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Facing indicator (subtle red glow direction)
        const dirX = screenX + Math.cos(this.angle) * 10;
        const dirY = bodyY - 12 + Math.sin(this.angle) * 5;
        ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(dirX, dirY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Feet (simple walk cycle)
        const stride = Math.sin(now * 16) * moveIntensity * 3.5;
        ctx.strokeStyle = '#1a1a1a';
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

        // Gun body - dark with red accents
        ctx.strokeStyle = this.gun.reloading ? '#333' : '#1a1a1a';
        ctx.lineWidth = gunWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Gun barrel highlight (red)
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(handX + Math.cos(gunAngle) * 10, handY + Math.sin(gunAngle) * 10);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Hand on grip (dark)
        ctx.fillStyle = '#2a2a2a';
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
}
