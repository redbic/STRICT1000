// Player class for adventure character
class Player {
    constructor(x, y, color, id, username) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
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
        this.maxSpeed = 2.2;
        this.acceleration = 0.2;
        this.friction = 0.85;
        
        // Game stats
        this.zoneLevel = 1;
        this.nodesVisited = [];
        this.position = 1;

        // Combat
        this.maxHp = 100;
        this.hp = 100;
        this.attackDamage = 20;
        this.attackRange = 40;
        this.attackCooldown = 0;
        
        // Status
        this.stunned = false;
        this.stunnedTime = 0;
    }
    
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
            
            // Update facing angle
            if (moveX !== 0 || moveY !== 0) {
                this.angle = Math.atan2(moveY, moveX);
            }
            
            this.velocityX = moveX * this.maxSpeed;
            this.velocityY = moveY * this.maxSpeed;
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

    setAvatar(url) {
        if (!url || this.avatarUrl === url) return;
        this.avatarUrl = url;
        this.avatarImg = new Image();
        this.avatarImg.src = url;
    }

    tryAttack(enemies) {
        if (this.attackCooldown > 0) return false;
        this.attackCooldown = 25;

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
