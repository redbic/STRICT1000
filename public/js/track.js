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
        this.portals = zoneData.portals || [];
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

        // Draw portals
        this.portals.forEach(portal => {
            if (this.isVisible(portal, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                ctx.strokeStyle = 'rgba(120, 200, 255, 0.8)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(
                    portal.x + portal.width / 2 - cameraX,
                    portal.y + portal.height / 2 - cameraY,
                    Math.min(portal.width, portal.height) / 2,
                    0,
                    Math.PI * 2
                );
                ctx.stroke();
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

    getPortalAt(x, y) {
        for (const portal of this.portals) {
            if (
                x > portal.x &&
                x < portal.x + portal.width &&
                y > portal.y &&
                y < portal.y + portal.height
            ) {
                return portal;
            }
        }
        return null;
    }
}

// Zone definitions
const ZONES = {
    hub: {
        name: 'The Archive Hub',
        width: 1800,
        height: 1400,
        startX: 900,
        startY: 700,
        isHub: true,
        wallColor: '#3a2f2a',
        floorColor: '#1f1a18',
        totalLevels: 1,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1800, height: 50 },
            { x: 0, y: 0, width: 50, height: 1400 },
            { x: 0, y: 1350, width: 1800, height: 50 },
            { x: 1750, y: 0, width: 50, height: 1400 },

            // Central plaza structures
            { x: 820, y: 560, width: 160, height: 40 },
            { x: 820, y: 800, width: 160, height: 40 },
            { x: 740, y: 640, width: 40, height: 120 },
            { x: 1020, y: 640, width: 40, height: 120 },

            // Market stalls
            { x: 320, y: 420, width: 120, height: 60 },
            { x: 320, y: 520, width: 120, height: 60 },
            { x: 1360, y: 420, width: 120, height: 60 },
            { x: 1360, y: 520, width: 120, height: 60 }
        ],
        nodes: [
            { x: 860, y: 660, width: 80, height: 80 }
        ],
        portals: [
            { id: 'archive_entry', x: 870, y: 610, width: 60, height: 60, label: 'Archive Entry' }
        ],
        pickups: []
    },
    archive_entry: {
        name: 'Archive Entry',
        width: 1600,
        height: 1200,
        startX: 800,
        startY: 1050,
        wallColor: '#2f2b38',
        floorColor: '#17151c',
        totalLevels: 2,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1600, height: 40 },
            { x: 0, y: 0, width: 40, height: 1200 },
            { x: 0, y: 1160, width: 1600, height: 40 },
            { x: 1560, y: 0, width: 40, height: 1200 },

            // Room pillars
            { x: 360, y: 300, width: 80, height: 120 },
            { x: 1160, y: 300, width: 80, height: 120 },
            { x: 360, y: 720, width: 80, height: 120 },
            { x: 1160, y: 720, width: 80, height: 120 }
        ],
        nodes: [
            { x: 760, y: 120, width: 80, height: 80 },
            { x: 200, y: 520, width: 80, height: 80 },
            { x: 1320, y: 520, width: 80, height: 80 }
        ],
        portals: [
            { id: 'hub', x: 770, y: 1080, width: 60, height: 60, label: 'Return to Hub' }
        ],
        pickups: [
            { x: 520, y: 520, collected: false, respawnTime: 0 },
            { x: 1080, y: 520, collected: false, respawnTime: 0 }
        ]
    }
};
