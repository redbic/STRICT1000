// Enemy class for adventure combat
// Uses centralized CONFIG from config/constants.js

// Local aliases for frequently accessed config values
const ENEMY_DEFAULT_SPEED = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_DEFAULT_SPEED : 108;
const ENEMY_DEFAULT_HP = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_DEFAULT_HP : 50;
const ENEMY_DEFAULT_DAMAGE = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_DEFAULT_DAMAGE : 8;
const ENEMY_ATTACK_RANGE = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_ATTACK_RANGE : 28;
const ENEMY_AGGRO_RANGE = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_AGGRO_RANGE : 320;
const ENEMY_ATTACK_COOLDOWN = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_ATTACK_COOLDOWN : 0.75;
const ENEMY_SIZE = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_SIZE : 22;
const ENEMY_STUN_DURATION = typeof CONFIG !== 'undefined' ? CONFIG.ENEMY_STUN_DURATION : 0.3;

class Enemy {
    /**
     * Create a new enemy
     * @param {number} x - Initial x position
     * @param {number} y - Initial y position
     * @param {string} id - Unique enemy identifier
     * @param {Object} options - Enemy configuration options
     * @param {number} [options.speed] - Movement speed (default: ENEMY_DEFAULT_SPEED)
     * @param {number} [options.hp] - Current hit points (default: ENEMY_DEFAULT_HP)
     * @param {number} [options.maxHp] - Maximum hit points (default: ENEMY_DEFAULT_HP)
     * @param {number} [options.damage] - Attack damage (default: ENEMY_DEFAULT_DAMAGE)
     * @param {boolean} [options.stationary] - Whether enemy cannot move (default: false)
     * @param {boolean} [options.passive] - Whether enemy cannot attack (default: false)
     */
    constructor(x, y, id, options = {}) {
        this.x = x;
        this.y = y;
        this.width = ENEMY_SIZE;
        this.height = ENEMY_SIZE;
        this.id = id;

        this.speed = options.speed !== undefined ? options.speed : ENEMY_DEFAULT_SPEED;
        this.hp = options.hp !== undefined ? options.hp : ENEMY_DEFAULT_HP;
        // Ensure maxHp is at least as large as hp (prevents invisible damage bug)
        const baseMaxHp = options.maxHp !== undefined ? options.maxHp : ENEMY_DEFAULT_HP;
        this.maxHp = Math.max(baseMaxHp, this.hp);
        this.damage = options.damage !== undefined ? options.damage : ENEMY_DEFAULT_DAMAGE;
        this.attackRange = ENEMY_ATTACK_RANGE;
        this.aggroRange = ENEMY_AGGRO_RANGE;
        this.attackCooldown = 0;
        this.stunned = false;
        this.stunnedTime = 0;
        this.invincible = false;
        
        // Training dummy options
        this.stationary = options.stationary || false;
        this.passive = options.passive || false;

        // Knockback state
        this.knockbackVX = 0;
        this.knockbackVY = 0;
    }
    /**
     * Update enemy AI - chase and attack target
     * @param {Zone} zone - Current zone for collision detection
     * @param {Player} target - Player to chase and attack
     * @param {number} dt - Delta time in seconds
     */
    update(zone, target, dt = 1/60) {
        // Apply knockback velocity (decays rapidly)
        const kbDecay = typeof CONFIG !== 'undefined' ? CONFIG.KNOCKBACK_DECAY : 0.85;
        if (Math.abs(this.knockbackVX) > 1 || Math.abs(this.knockbackVY) > 1) {
            const oldX = this.x;
            const oldY = this.y;
            this.x += this.knockbackVX * dt;
            this.y += this.knockbackVY * dt;
            if (zone && zone.checkCollision(this)) {
                this.x = oldX;
                this.y = oldY;
            }
            this.knockbackVX *= kbDecay;
            this.knockbackVY *= kbDecay;
        } else {
            this.knockbackVX = 0;
            this.knockbackVY = 0;
        }

        if (!target) return;

        // Stationary enemies don't move
        if (this.stationary) return;

        if (this.stunned) {
            this.stunnedTime -= dt;
            if (this.stunnedTime <= 0) {
                this.stunned = false;
            }
            return;
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.aggroRange) {
            if (dist > this.attackRange) {
                const nx = dx / dist;
                const ny = dy / dist;
                const nextX = this.x + nx * this.speed * dt;
                const nextY = this.y + ny * this.speed * dt;

                const oldX = this.x;
                const oldY = this.y;
                this.x = nextX;
                this.y = nextY;
                if (zone && zone.checkCollision(this)) {
                    this.x = oldX;
                    this.y = oldY;
                }
            } else if (this.attackCooldown <= 0 && !this.passive) {
                target.takeDamage(this.damage);
                this.attackCooldown = ENEMY_ATTACK_COOLDOWN;
            }
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }
    }
    /**
     * Apply damage to enemy
     * @param {number} amount - Damage amount
     */
    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
    }
    /**
     * Apply knockback impulse away from a point
     * @param {number} fromX - Source x position
     * @param {number} fromY - Source y position
     * @param {number} force - Knockback force in pixels/sec
     */
    applyKnockback(fromX, fromY, force) {
        const dx = this.x - fromX;
        const dy = this.y - fromY;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        this.knockbackVX = (dx / dist) * force;
        this.knockbackVY = (dy / dist) * force;
    }
    /**
     * Draw enemy on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} cameraX - Camera x offset
     * @param {number} cameraY - Camera y offset
     */
    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;
        const radius = this.width / 2;

        ctx.save();

        // Check if sprite is available
        if (typeof spriteManager !== 'undefined' && spriteManager.has('enemy')) {
            const sprite = spriteManager.get('enemy');
            const size = this.width * 1.5;
            ctx.drawImage(sprite, screenX - size/2, screenY - size/2, size, size);
        } else if (typeof EntityRenderer !== 'undefined') {
            // Use shared renderer utilities
            const bodyColor = this.stunned ? '#8a8580' : EntityRenderer.getColor('ENEMY_BODY', '#5c4a4a');
            const eyeColor = EntityRenderer.getColor('ENEMY_EYES', '#2a2a2a');

            EntityRenderer.drawShadow(ctx, screenX, screenY, this.width);
            EntityRenderer.drawBody(ctx, screenX, screenY, radius, bodyColor, false);
            EntityRenderer.drawInnerShadow(ctx, screenX, screenY, radius);

            // Outline with thicker stroke
            ctx.strokeStyle = 'rgba(80, 70, 55, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.stroke();

            EntityRenderer.drawEyes(ctx, screenX, screenY - 2, 4, 2.5, eyeColor);
        } else {
            // Minimal fallback
            ctx.fillStyle = this.stunned ? '#8a8580' : '#5c4a4a';
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // HP bar using shared renderer
        if (typeof EntityRenderer !== 'undefined') {
            EntityRenderer.drawHealthBar(ctx, screenX, screenY - 24, this.hp, this.maxHp);
        } else {
            // Minimal fallback
            const barWidth = 36;
            const hpRatio = this.hp / this.maxHp;
            ctx.fillStyle = 'rgba(60, 50, 40, 0.7)';
            ctx.fillRect(screenX - barWidth / 2, screenY - 24, barWidth, 5);
            ctx.fillStyle = '#b04040';
            ctx.fillRect(screenX - barWidth / 2, screenY - 24, barWidth * hpRatio, 5);
        }

        ctx.restore();
    }
}
