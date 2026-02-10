// Area class for adventure zones
class Track {
    constructor(trackData) {
        this.name = trackData.name;
        this.width = trackData.width;
        this.height = trackData.height;
        this.trackColor = trackData.trackColor || '#555';
        this.grassColor = trackData.grassColor || '#2a5a2a';
        this.startX = trackData.startX;
        this.startY = trackData.startY;
        this.checkpoints = trackData.checkpoints || [];
        this.walls = trackData.walls || [];
        this.itemBoxes = trackData.itemBoxes || [];
        this.totalLaps = 3;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Draw ground
        ctx.fillStyle = this.grassColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw walls/obstacles
        ctx.fillStyle = this.trackColor;
        this.walls.forEach(wall => {
            if (this.isVisible(wall, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                ctx.fillRect(
                    wall.x - cameraX,
                    wall.y - cameraY,
                    wall.width,
                    wall.height
                );
            }
        });
        
        // Draw exploration waypoints
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 2;
        this.checkpoints.forEach((cp, index) => {
            if (this.isVisible(cp, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                ctx.beginPath();
                ctx.arc(
                    cp.x + cp.width / 2 - cameraX,
                    cp.y + cp.height / 2 - cameraY,
                    Math.min(cp.width, cp.height) / 2,
                    0,
                    Math.PI * 2
                );
                ctx.stroke();
            }
        });
        
        // Draw spawn point
        const spawnArea = { x: this.startX - 30, y: this.startY - 30, width: 60, height: 60 };
        if (this.isVisible(spawnArea, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.startX - cameraX, this.startY - cameraY, 25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fill();
        }
        
        // Draw ability pickups
        ctx.font = '20px Arial';
        this.itemBoxes.forEach(box => {
            if (this.isVisible(box, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                if (!box.collected || box.respawnTime <= 0) {
                    // Draw glowing orb
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                    ctx.beginPath();
                    ctx.arc(box.x - cameraX, box.y - cameraY, 18, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#FFD700';
                    ctx.fillText('✦', box.x - cameraX - 7, box.y - cameraY + 7);
                }
            }
            
            if (box.respawnTime > 0) {
                box.respawnTime--;
                if (box.respawnTime <= 0) {
                    box.collected = false;
                }
            }
        });
    }
    
    isVisible(rect, cameraX, cameraY, viewWidth, viewHeight) {
        return (
            rect.x - cameraX + (rect.width || 0) > 0 &&
            rect.x - cameraX < viewWidth &&
            rect.y - cameraY + (rect.height || 0) > 0 &&
            rect.y - cameraY < viewHeight
        );
    }
    
    checkCollision(player) {
        // Simple AABB collision with walls
        for (const wall of this.walls) {
            if (
                player.x - player.width/2 < wall.x + wall.width &&
                player.x + player.width/2 > wall.x &&
                player.y - player.height/2 < wall.y + wall.height &&
                player.y + player.height/2 > wall.y
            ) {
                return true;
            }
        }
        return false;
    }
    
    checkPlayerCheckpoint(player) {
        for (let i = 0; i < this.checkpoints.length; i++) {
            const cp = this.checkpoints[i];
            
            if (
                player.x > cp.x &&
                player.x < cp.x + cp.width &&
                player.y > cp.y &&
                player.y < cp.y + cp.height
            ) {
                if (!player.checkpoints.includes(i)) {
                    player.checkpoints.push(i);
                    
                    // If all waypoints explored, advance level
                    if (player.checkpoints.length === this.checkpoints.length) {
                        player.lap++;
                        player.checkpoints = [];
                    }
                }
            }
        }
    }
    
    checkItemBox(player, items) {
        for (const box of this.itemBoxes) {
            if (box.collected || box.respawnTime > 0) continue;
            
            const dist = Math.hypot(player.x - box.x, player.y - box.y);
            if (dist < 30 && !player.currentItem) {
                box.collected = true;
                box.respawnTime = 300;
                
                // Give random ability
                const abilityTypes = ['dash', 'sword', 'shield', 'fireball'];
                const randomAbility = abilityTypes[Math.floor(Math.random() * abilityTypes.length)];
                player.currentItem = { type: randomAbility };
                
                return true;
            }
        }
        return false;
    }
}

// Area definitions
const TRACKS = {
    forest: {
        name: 'Dark Forest',
        width: 2000,
        height: 1500,
        startX: 300,
        startY: 300,
        trackColor: '#2d5a1e',
        grassColor: '#1a3a12',
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 2000, height: 50 },
            { x: 0, y: 0, width: 50, height: 1500 },
            { x: 0, y: 1450, width: 2000, height: 50 },
            { x: 1950, y: 0, width: 50, height: 1500 },
            
            // Trees and obstacles
            { x: 400, y: 400, width: 80, height: 80 },
            { x: 700, y: 200, width: 60, height: 120 },
            { x: 1000, y: 500, width: 100, height: 100 },
            { x: 1300, y: 300, width: 70, height: 70 },
            { x: 600, y: 800, width: 90, height: 90 },
            { x: 1500, y: 700, width: 80, height: 120 },
            { x: 900, y: 1000, width: 120, height: 60 },
            { x: 1700, y: 1100, width: 80, height: 80 }
        ],
        checkpoints: [
            { x: 200, y: 250, width: 100, height: 100 },
            { x: 700, y: 150, width: 100, height: 100 },
            { x: 1400, y: 150, width: 100, height: 100 },
            { x: 1700, y: 600, width: 100, height: 100 },
            { x: 1400, y: 1250, width: 100, height: 100 },
            { x: 700, y: 1250, width: 100, height: 100 }
        ],
        itemBoxes: [
            { x: 500, y: 200, collected: false, respawnTime: 0 },
            { x: 1000, y: 200, collected: false, respawnTime: 0 },
            { x: 1500, y: 200, collected: false, respawnTime: 0 },
            { x: 500, y: 1300, collected: false, respawnTime: 0 },
            { x: 1000, y: 1300, collected: false, respawnTime: 0 },
            { x: 1500, y: 1300, collected: false, respawnTime: 0 }
        ]
    },
    
    dungeon: {
        name: 'Ancient Dungeon',
        width: 2500,
        height: 2000,
        startX: 400,
        startY: 400,
        trackColor: '#4a3728',
        grassColor: '#2a2018',
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 2500, height: 50 },
            { x: 0, y: 0, width: 50, height: 2000 },
            { x: 0, y: 1950, width: 2500, height: 50 },
            { x: 2450, y: 0, width: 50, height: 2000 },
            
            // Dungeon walls and corridors
            { x: 400, y: 400, width: 100, height: 600 },
            { x: 800, y: 200, width: 100, height: 800 },
            { x: 1200, y: 500, width: 100, height: 700 },
            { x: 1600, y: 300, width: 100, height: 600 },
            { x: 2000, y: 600, width: 100, height: 800 }
        ],
        checkpoints: [
            { x: 300, y: 350, width: 100, height: 100 },
            { x: 600, y: 250, width: 100, height: 100 },
            { x: 1000, y: 450, width: 100, height: 100 },
            { x: 1400, y: 350, width: 100, height: 100 },
            { x: 1800, y: 550, width: 100, height: 100 },
            { x: 2100, y: 700, width: 100, height: 100 },
            { x: 1800, y: 1200, width: 100, height: 100 },
            { x: 1000, y: 1400, width: 100, height: 100 }
        ],
        itemBoxes: [
            { x: 650, y: 300, collected: false, respawnTime: 0 },
            { x: 1050, y: 500, collected: false, respawnTime: 0 },
            { x: 1450, y: 400, collected: false, respawnTime: 0 },
            { x: 1850, y: 600, collected: false, respawnTime: 0 },
            { x: 1850, y: 1250, collected: false, respawnTime: 0 },
            { x: 1050, y: 1450, collected: false, respawnTime: 0 }
        ]
    }
};
