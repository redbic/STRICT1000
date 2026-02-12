// Enemy class for adventure combat

// Constants
const ENEMY_DEFAULT_SPEED = 1.8;  // Slower than player max speed for tactical gameplay
const ENEMY_DEFAULT_HP = 50;
const ENEMY_DEFAULT_DAMAGE = 8;
const ENEMY_ATTACK_RANGE = 28;
const ENEMY_AGGRO_RANGE = 320;
const ENEMY_ATTACK_COOLDOWN_FRAMES = 45;
const ENEMY_SIZE = 22;

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
     */
    update(zone, target) {
        if (!target) return;
        
        // Stationary enemies don't move
        if (this.stationary) return;

        if (this.stunned) {
            this.stunnedTime--;
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
                const nextX = this.x + nx * this.speed;
                const nextY = this.y + ny * this.speed;

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
                this.attackCooldown = ENEMY_ATTACK_COOLDOWN_FRAMES;
            }
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown--;
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
        ctx.fillStyle = this.stunned ? '#5c5c5c' : '#c0392b';
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // HP bar
        const barWidth = 30;
        const barHeight = 4;
        const hpRatio = this.hp / this.maxHp;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(screenX - barWidth / 2, screenY - 20, barWidth, barHeight);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(screenX - barWidth / 2, screenY - 20, barWidth * hpRatio, barHeight);

        ctx.restore();
    }
}
