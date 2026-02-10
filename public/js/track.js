// Zone class for adventure areas
class Zone {
    constructor(zoneData) {
        this.name = zoneData.name;
        this.width = zoneData.width;
        this.height = zoneData.height;
        this.wallColor = zoneData.wallColor || '#555';
        this.floorColor = zoneData.floorColor || '#2a5a2a';
        this.startX = zoneData.startX;
        this.startY = zoneData.startY;
        this.nodes = zoneData.nodes || [];
        this.walls = zoneData.walls || [];
        this.pickups = zoneData.pickups || [];
        this.totalLevels = zoneData.totalLevels || 3;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Draw ground
        ctx.fillStyle = this.floorColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw walls/obstacles
        ctx.fillStyle = this.wallColor;
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
        
        // Draw exploration nodes
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 2;
        this.nodes.forEach((node) => {
            if (this.isVisible(node, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                ctx.beginPath();
                ctx.arc(
                    node.x + node.width / 2 - cameraX,
                    node.y + node.height / 2 - cameraY,
                    Math.min(node.width, node.height) / 2,
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
        this.pickups.forEach(box => {
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
    
    checkPlayerNode(player) {
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            
            if (
                player.x > node.x &&
                player.x < node.x + node.width &&
                player.y > node.y &&
                player.y < node.y + node.height
            ) {
                if (!player.nodesVisited.includes(i)) {
                    player.nodesVisited.push(i);
                    
                    // If all nodes explored, advance depth
                    if (player.nodesVisited.length === this.nodes.length) {
                        player.zoneLevel++;
                        player.nodesVisited = [];
                    }
                }
            }
        }
    }
    
    checkPickup(player, items) {
        for (const box of this.pickups) {
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

// Zone definitions
const ZONES = {
    forest: {
        name: 'Dark Forest',
        width: 2000,
        height: 1500,
        startX: 300,
        startY: 300,
        wallColor: '#2d5a1e',
        floorColor: '#1a3a12',
        totalLevels: 3,
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
        nodes: [
            { x: 200, y: 250, width: 100, height: 100 },
            { x: 700, y: 150, width: 100, height: 100 },
            { x: 1400, y: 150, width: 100, height: 100 },
            { x: 1700, y: 600, width: 100, height: 100 },
            { x: 1400, y: 1250, width: 100, height: 100 },
            { x: 700, y: 1250, width: 100, height: 100 }
        ],
        pickups: [
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
        wallColor: '#4a3728',
        floorColor: '#2a2018',
        totalLevels: 3,
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
        nodes: [
            { x: 300, y: 350, width: 100, height: 100 },
            { x: 600, y: 250, width: 100, height: 100 },
            { x: 1000, y: 450, width: 100, height: 100 },
            { x: 1400, y: 350, width: 100, height: 100 },
            { x: 1800, y: 550, width: 100, height: 100 },
            { x: 2100, y: 700, width: 100, height: 100 },
            { x: 1800, y: 1200, width: 100, height: 100 },
            { x: 1000, y: 1400, width: 100, height: 100 }
        ],
        pickups: [
            { x: 650, y: 300, collected: false, respawnTime: 0 },
            { x: 1050, y: 500, collected: false, respawnTime: 0 },
            { x: 1450, y: 400, collected: false, respawnTime: 0 },
            { x: 1850, y: 600, collected: false, respawnTime: 0 },
            { x: 1850, y: 1250, collected: false, respawnTime: 0 },
            { x: 1050, y: 1450, collected: false, respawnTime: 0 }
        ]
    }
};
