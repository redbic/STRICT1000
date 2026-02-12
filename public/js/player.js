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
        this.attackAnimTimer = 0;
        
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

        if (this.attackAnimTimer > 0) {
            this.attackAnimTimer--;
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
        
        const now = performance.now() / 1000;
        const moveIntensity = Math.min(1, this.speed / this.maxSpeed);
        const bob = Math.sin(now * 10) * moveIntensity * 1.4;
        const bodyY = screenY + bob;

        // Body shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 11, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso
        ctx.fillStyle = this.stunned ? '#666' : this.color;
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

        // Weapon hand poke during attack
        if (this.attackAnimTimer > 0) {
            const attackProgress = 1 - (this.attackAnimTimer / 10);
            const handReach = 6 + Math.sin(attackProgress * Math.PI) * 6;
            const handX = screenX + Math.cos(this.angle) * handReach;
            const handY = bodyY + Math.sin(this.angle) * handReach;
            ctx.fillStyle = '#ffe3d2';
            ctx.beginPath();
            ctx.arc(handX, handY, 2, 0, Math.PI * 2);
            ctx.fill();
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
     * Attempt to attack enemies in range
     * @param {Array<Enemy>} enemies - Array of enemies to check
     * @returns {boolean} True if an enemy was hit
     */
    tryAttack(enemies) {
        if (this.attackCooldown > 0) return false;
        this.attackCooldown = PLAYER_ATTACK_COOLDOWN_FRAMES;
        this.attackAnimTimer = 10;

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
