// Enemy class for adventure combat

// Constants (time-based, units per second)
const ENEMY_DEFAULT_SPEED = 108;  // pixels per second (was 1.8 * 60)
const ENEMY_DEFAULT_HP = 50;
const ENEMY_DEFAULT_DAMAGE = 8;
const ENEMY_ATTACK_RANGE = 28;
const ENEMY_AGGRO_RANGE = 320;
const ENEMY_ATTACK_COOLDOWN = 0.75;  // seconds (was 45 frames / 60)
const ENEMY_SIZE = 22;
const ENEMY_STUN_DURATION = 0.3;     // seconds

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
        this.maxHp = options.maxHp !== undefined ? options.maxHp : ENEMY_DEFAULT_HP;
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
    }
    /**
     * Update enemy AI - chase and attack target
     * @param {Zone} zone - Current zone for collision detection
     * @param {Player} target - Player to chase and attack
     * @param {number} dt - Delta time in seconds
     */
    update(zone, target, dt = 1/60) {
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
     * Draw enemy on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} cameraX - Camera x offset
     * @param {number} cameraY - Camera y offset
     */
    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;

        ctx.save();

        // Check if sprite is available
        if (typeof spriteManager !== 'undefined' && spriteManager.has('enemy')) {
            const sprite = spriteManager.get('enemy');
            const size = this.width * 1.5;
            ctx.drawImage(sprite, screenX - size/2, screenY - size/2, size, size);
        } else {
            // Noir style fallback - shadowy creature with red eyes
            const bodyColor = typeof COLORS !== 'undefined' ? COLORS.ENEMY_BODY : '#2d0a0a';
            const eyeColor = typeof COLORS !== 'undefined' ? COLORS.ENEMY_EYES : '#ff0000';

            // Shadow beneath
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + this.width/2 + 4, this.width/2, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // Body - dark menacing shape
            ctx.fillStyle = this.stunned ? '#1a1a1a' : bodyColor;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();

            // Darker inner shadow
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, this.width/2);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();

            // Red outline glow
            ctx.strokeStyle = 'rgba(139, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
            ctx.stroke();

            // Glowing red eyes
            ctx.fillStyle = eyeColor;
            ctx.shadowColor = eyeColor;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(screenX - 4, screenY - 2, 2.5, 0, Math.PI * 2);
            ctx.arc(screenX + 4, screenY - 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // HP bar (red theme)
        const barWidth = 36;
        const barHeight = 5;
        const hpRatio = this.hp / this.maxHp;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(screenX - barWidth / 2, screenY - 24, barWidth, barHeight);
        ctx.fillStyle = '#8b0000';
        ctx.fillRect(screenX - barWidth / 2, screenY - 24, barWidth * hpRatio, barHeight);

        ctx.restore();
    }
}
