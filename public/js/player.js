// Player class for adventure character

// Constants (time-based, units per second)
const PLAYER_MAX_SPEED = 132;           // pixels per second (was 2.2 per frame * 60)
const PLAYER_ACCELERATION = 800;        // pixels per second squared
const PLAYER_FRICTION = 8;              // friction factor (higher = more friction)
const PLAYER_DEFAULT_HP = 100;
const PLAYER_SIZE = 20;
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
     * Update player physics and state
     * @param {Object} keys - Current keyboard state
     * @param {Zone} zone - Current zone for collision detection
     * @param {number} dt - Delta time in seconds
     */
    update(keys, zone, dt = 1/60) {
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

        // Update gun cooldowns
        this.updateGun(dt);

        // Update damage flash timer
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
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
     * Draw player on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} cameraX - Camera x offset
     * @param {number} cameraY - Camera y offset
     */
    draw(ctx, cameraX, cameraY) {
        ctx.save();
        
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;
        
        const now = performance.now() / 1000;
        const moveIntensity = Math.min(1, this.speed / this.maxSpeed);
        const bob = Math.sin(now * 10) * moveIntensity * 1.4;
        const bodyY = screenY + bob;

        // Body shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 11, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso - flash red when taking damage
        const bodyColor = this.damageFlashTimer > 0 ? '#ff4444' : (this.stunned ? '#666' : this.color);
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(screenX, bodyY + 1, 9, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Head
        ctx.fillStyle = this.stunned ? '#888' : '#f8d6c3';
        ctx.beginPath();
        ctx.arc(screenX, bodyY - 8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#1f2d3d';
        ctx.beginPath();
        ctx.arc(screenX - 2, bodyY - 8, 0.8, 0, Math.PI * 2);
        ctx.arc(screenX + 2, bodyY - 8, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Facing indicator/nose
        const dirX = screenX + Math.cos(this.angle) * 6;
        const dirY = bodyY - 8 + Math.sin(this.angle) * 3;
        ctx.fillStyle = '#f0bca0';
        ctx.beginPath();
        ctx.arc(dirX, dirY, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Feet (simple walk cycle)
        const stride = Math.sin(now * 16) * moveIntensity * 2.4;
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(screenX - 3, bodyY + 6);
        ctx.lineTo(screenX - 3 + stride, bodyY + 10);
        ctx.moveTo(screenX + 3, bodyY + 6);
        ctx.lineTo(screenX + 3 - stride, bodyY + 10);
        ctx.stroke();

        // Gun rendering
        const gunAngle = this.angle;
        const gripOffset = 7;
        const handX = screenX + Math.cos(gunAngle) * gripOffset;
        const handY = bodyY + Math.sin(gunAngle) * gripOffset;

        // Off-hand for stability
        const offHandAngle = gunAngle + Math.PI * 0.5;
        ctx.fillStyle = '#ffd9c3';
        ctx.beginPath();
        ctx.arc(screenX + Math.cos(offHandAngle) * 4, bodyY + Math.sin(offHandAngle) * 3, 2, 0, Math.PI * 2);
        ctx.fill();

        // Gun body (rectangle along angle)
        const gunLength = 22;
        const gunWidth = 5;
        const barrelTipX = handX + Math.cos(gunAngle) * gunLength;
        const barrelTipY = handY + Math.sin(gunAngle) * gunLength;

        // Gun body
        ctx.strokeStyle = this.gun.reloading ? '#666' : '#444';
        ctx.lineWidth = gunWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Gun barrel highlight
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(handX + Math.cos(gunAngle) * 8, handY + Math.sin(gunAngle) * 8);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Hand on grip
        ctx.fillStyle = '#ffe3d2';
        ctx.beginPath();
        ctx.arc(handX, handY, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Muzzle flash effect
        if (this.muzzleFlash.active && this.muzzleFlash.timer > 0) {
            const flashX = barrelTipX + Math.cos(gunAngle) * 5;
            const flashY = barrelTipY + Math.sin(gunAngle) * 5;
            const flashProgress = this.muzzleFlash.timer / this.muzzleFlash.duration;
            const flashSize = 8 * flashProgress;

            ctx.fillStyle = `rgba(255, 220, 100, ${flashProgress})`;
            ctx.beginPath();
            ctx.arc(flashX, flashY, flashSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 255, 200, ${flashProgress * 0.8})`;
            ctx.beginPath();
            ctx.arc(flashX, flashY, flashSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ammo indicator (small dots above player when low)
        if (this.gun.ammo <= 2 && !this.gun.reloading) {
            const indicatorY = screenY - 40;
            for (let i = 0; i < this.gun.ammo; i++) {
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.arc(screenX - 4 + i * 6, indicatorY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Reload indicator
        if (this.gun.reloading) {
            const reloadProgress = 1 - (this.gun.reloadTimer / this.gun.reloadTime);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('RELOADING', screenX, screenY - 40);

            // Progress bar
            const barWidth = 30;
            const barHeight = 3;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(screenX - barWidth / 2, screenY - 36, barWidth, barHeight);
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(screenX - barWidth / 2, screenY - 36, barWidth * reloadProgress, barHeight);
        }

        ctx.restore();
        
        // Draw avatar + username above character
        const labelY = screenY - 26;
        if (this.avatarImg && this.avatarImg.complete) {
            const size = 20;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.avatarImg, screenX - size / 2, labelY - size, size, size);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👽', screenX, labelY - 6);
        }

        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, screenX, labelY + 12);
        
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
