// Player class for kart racing
class Player {
    constructor(x, y, color, id, username) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 30;
        this.color = color || '#ff0000';
        this.id = id;
        this.username = username || 'Player';
        
        // Physics
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 8;
        this.acceleration = 0.3;
        this.friction = 0.95;
        this.turnSpeed = 0.08;
        
        // Race stats
        this.lap = 1;
        this.checkpoints = [];
        this.position = 1;
        this.finishTime = null;
        
        // Items
        this.currentItem = null;
        this.itemCooldown = 0;
        this.invincible = false;
        this.invincibleTime = 0;
        this.stunned = false;
        this.stunnedTime = 0;
        this.speedBoost = false;
        this.speedBoostTime = 0;
    }
    
    update(keys, track) {
        // Handle stun effect
        if (this.stunned) {
            this.stunnedTime--;
            if (this.stunnedTime <= 0) {
                this.stunned = false;
            }
            this.speed *= 0.9;
        } else {
            // Handle controls
            if (keys['ArrowUp'] || keys['w']) {
                this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            } else if (keys['ArrowDown'] || keys['s']) {
                this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed / 2);
            } else {
                this.speed *= this.friction;
            }
            
            if ((keys['ArrowLeft'] || keys['a']) && Math.abs(this.speed) > 0.5) {
                this.angle -= this.turnSpeed;
            }
            if ((keys['ArrowRight'] || keys['d']) && Math.abs(this.speed) > 0.5) {
                this.angle += this.turnSpeed;
            }
        }
        
        // Speed boost effect
        if (this.speedBoost) {
            this.speedBoostTime--;
            if (this.speedBoostTime <= 0) {
                this.speedBoost = false;
            } else {
                this.speed = Math.min(this.speed * 1.5, this.maxSpeed * 1.5);
            }
        }
        
        // Invincibility timer
        if (this.invincible) {
            this.invincibleTime--;
            if (this.invincibleTime <= 0) {
                this.invincible = false;
            }
        }
        
        // Item cooldown
        if (this.itemCooldown > 0) {
            this.itemCooldown--;
        }
        
        // Calculate velocity
        this.velocityX = Math.cos(this.angle) * this.speed;
        this.velocityY = Math.sin(this.angle) * this.speed;
        
        // Store old position
        const oldX = this.x;
        const oldY = this.y;
        
        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        // Check track collision
        if (track && track.checkCollision(this)) {
            // Revert position and slow down
            this.x = oldX;
            this.y = oldY;
            this.speed *= 0.5;
        }
        
        // Check checkpoints
        if (track) {
            track.checkPlayerCheckpoint(this);
        }
    }
    
    draw(ctx, cameraX, cameraY) {
        ctx.save();
        
        // Translate to player position
        ctx.translate(this.x - cameraX, this.y - cameraY);
        ctx.rotate(this.angle);
        
        // Draw kart body
        if (this.invincible) {
            ctx.fillStyle = 'gold';
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'yellow';
        } else if (this.stunned) {
            ctx.fillStyle = '#666';
        } else {
            ctx.fillStyle = this.color;
        }
        
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Draw kart front (direction indicator)
        ctx.fillStyle = '#333';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, 10);
        
        ctx.restore();
        
        // Draw username above kart
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, this.x - cameraX, this.y - cameraY - 25);
        
        // Draw speed boost trail
        if (this.speedBoost) {
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            for (let i = 1; i <= 3; i++) {
                const trailX = this.x - Math.cos(this.angle) * 15 * i;
                const trailY = this.y - Math.sin(this.angle) * 15 * i;
                ctx.fillRect(trailX - cameraX - 5, trailY - cameraY - 5, 10, 10);
            }
        }
    }
    
    useItem(targetPlayers) {
        if (!this.currentItem || this.itemCooldown > 0) return false;
        
        const item = this.currentItem;
        this.currentItem = null;
        this.itemCooldown = 60;
        
        switch (item.type) {
            case 'boost':
                this.speedBoost = true;
                this.speedBoostTime = 120;
                break;
                
            case 'shell':
                // Find nearest player in front
                let nearest = null;
                let minDist = Infinity;
                
                targetPlayers.forEach(p => {
                    if (p.id !== this.id) {
                        const dist = Math.hypot(p.x - this.x, p.y - this.y);
                        if (dist < minDist && dist < 300) {
                            minDist = dist;
                            nearest = p;
                        }
                    }
                });
                
                if (nearest && !nearest.invincible) {
                    nearest.stunned = true;
                    nearest.stunnedTime = 90;
                }
                break;
                
            case 'star':
                this.invincible = true;
                this.invincibleTime = 180;
                break;
                
            case 'banana':
                // Create banana hazard at current position
                return {
                    type: 'banana',
                    x: this.x,
                    y: this.y
                };
        }
        
        return true;
    }
    
    getState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            angle: this.angle,
            speed: this.speed,
            lap: this.lap,
            position: this.position,
            username: this.username,
            currentItem: this.currentItem,
            invincible: this.invincible,
            stunned: this.stunned,
            speedBoost: this.speedBoost
        };
    }
    
    setState(state) {
        this.x = state.x;
        this.y = state.y;
        this.angle = state.angle;
        this.speed = state.speed;
        this.lap = state.lap;
        this.position = state.position;
        this.currentItem = state.currentItem;
        this.invincible = state.invincible;
        this.stunned = state.stunned;
        this.speedBoost = state.speedBoost;
    }
}
