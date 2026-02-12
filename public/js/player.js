// Player class for adventure character

// Constants
const PLAYER_MAX_SPEED = 2.2;
const PLAYER_ACCELERATION = 0.2;
const PLAYER_FRICTION = 0.85;
const PLAYER_DEFAULT_HP = 100;
const PLAYER_ATTACK_DAMAGE = 20;
const PLAYER_ATTACK_RANGE = 40;
const PLAYER_ATTACK_COOLDOWN_FRAMES = 25;
const PLAYER_SIZE = 20;

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
        this.position = 1;

        // Combat
        this.maxHp = PLAYER_DEFAULT_HP;
        this.hp = PLAYER_DEFAULT_HP;
        this.attackDamage = PLAYER_ATTACK_DAMAGE;
        this.attackRange = PLAYER_ATTACK_RANGE;
        this.attackCooldown = 0;
        
        // Status
        this.stunned = false;
        this.stunnedTime = 0;
    }
    
    /**
     * Update player physics and state
     * @param {Object} keys - Current keyboard state
     * @param {Zone} zone - Current zone for collision detection
     */
    update(keys, zone) {
        // Handle stun effect
        if (this.stunned) {
            this.stunnedTime--;
            if (this.stunnedTime <= 0) {
                this.stunned = false;
            }
            this.velocityX *= 0.9;
            this.velocityY *= 0.9;
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
                // Apply acceleration in movement direction
                this.velocityX += moveX * this.acceleration;
                this.velocityY += moveY * this.acceleration;
            } else {
                // Apply friction when not moving
                this.velocityX *= this.friction;
                this.velocityY *= this.friction;
            }
            
            // Cap velocity at maxSpeed
            const currentSpeed = Math.hypot(this.velocityX, this.velocityY);
            if (currentSpeed > this.maxSpeed) {
                this.velocityX = (this.velocityX / currentSpeed) * this.maxSpeed;
                this.velocityY = (this.velocityY / currentSpeed) * this.maxSpeed;
            }
        }
        
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }
        
        // Update speed for compatibility
        this.speed = Math.hypot(this.velocityX, this.velocityY);
        
        // Store old position
        const oldX = this.x;
        const oldY = this.y;
        
        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        
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
        
        // Draw character body (circle)
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
        
        if (this.stunned) {
            ctx.fillStyle = '#666';
        } else {
            ctx.fillStyle = this.color;
        }
        
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw direction indicator (small triangle)
        const dirX = screenX + Math.cos(this.angle) * 14;
        const dirY = screenY + Math.sin(this.angle) * 14;
        ctx.beginPath();
        ctx.arc(dirX, dirY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
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
     * Attempt to attack enemies in range
     * @param {Array<Enemy>} enemies - Array of enemies to check
     * @returns {boolean} True if an enemy was hit
     */
    tryAttack(enemies) {
        if (this.attackCooldown > 0) return false;
        this.attackCooldown = PLAYER_ATTACK_COOLDOWN_FRAMES;

        let hit = false;
        enemies.forEach(enemy => {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist <= this.attackRange) {
                enemy.takeDamage(this.attackDamage);
                hit = true;
            }
        });
        return hit;
    }
    /**
     * Apply damage to player
     * @param {number} amount - Damage amount
     */
    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
    }
    
    getState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            angle: this.angle,
            speed: this.speed,
            zoneLevel: this.zoneLevel,
            position: this.position,
            username: this.username,
            stunned: this.stunned
        };
    }
    
    setState(state) {
        this.x = state.x;
        this.y = state.y;
        this.angle = state.angle;
        this.speed = state.speed;
        this.zoneLevel = state.zoneLevel;
        this.position = state.position;
        this.stunned = state.stunned;
    }
}
