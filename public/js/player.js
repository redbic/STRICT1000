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
        
        // Physics
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 4;
        this.acceleration = 0.2;
        this.friction = 0.85;
        
        // Game stats
        this.zoneLevel = 1;
        this.nodesVisited = [];
        this.position = 1;
        
        // Abilities
        this.currentItem = null;
        this.itemCooldown = 0;
        this.invincible = false;
        this.invincibleTime = 0;
        this.stunned = false;
        this.stunnedTime = 0;
        this.speedBoost = false;
        this.speedBoostTime = 0;
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
        
        // Speed boost (dash) effect
        if (this.speedBoost) {
            this.speedBoostTime--;
            if (this.speedBoostTime <= 0) {
                this.speedBoost = false;
            } else {
                this.velocityX *= 1.8;
                this.velocityY *= 1.8;
            }
        }
        
        // Invincibility (shield) timer
        if (this.invincible) {
            this.invincibleTime--;
            if (this.invincibleTime <= 0) {
                this.invincible = false;
            }
        }
        
        // Ability cooldown
        if (this.itemCooldown > 0) {
            this.itemCooldown--;
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
        
        if (this.invincible) {
            ctx.fillStyle = 'gold';
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'yellow';
        } else if (this.stunned) {
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
        
        // Draw username above character
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, screenX, screenY - 20);
        
        // Draw dash trail
        if (this.speedBoost) {
            ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
            for (let i = 1; i <= 3; i++) {
                const trailX = this.x - Math.cos(this.angle) * 12 * i;
                const trailY = this.y - Math.sin(this.angle) * 12 * i;
                ctx.beginPath();
                ctx.arc(trailX - cameraX, trailY - cameraY, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    useItem(targetPlayers) {
        if (!this.currentItem || this.itemCooldown > 0) return false;
        
        const item = this.currentItem;
        this.currentItem = null;
        this.itemCooldown = 60;
        
        switch (item.type) {
            case 'dash':
                this.speedBoost = true;
                this.speedBoostTime = 60;
                break;
                
            case 'sword':
                // Strike nearest enemy
                let nearest = null;
                let minDist = Infinity;
                
                targetPlayers.forEach(p => {
                    if (p.id !== this.id) {
                        const dist = Math.hypot(p.x - this.x, p.y - this.y);
                        if (dist < minDist && dist < 200) {
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
                
            case 'shield':
                this.invincible = true;
                this.invincibleTime = 180;
                break;
                
            case 'fireball':
                // Create fireball at current position
                return {
                    type: 'fireball',
                    x: this.x + Math.cos(this.angle) * 30,
                    y: this.y + Math.sin(this.angle) * 30
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
            zoneLevel: this.zoneLevel,
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
        this.zoneLevel = state.zoneLevel;
        this.position = state.position;
        this.currentItem = state.currentItem;
        this.invincible = state.invincible;
        this.stunned = state.stunned;
        this.speedBoost = state.speedBoost;
    }
}
