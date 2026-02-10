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
                
                // Draw portal label if it exists
                if (portal.label) {
                    const centerX = portal.x + portal.width / 2 - cameraX;
                    const centerY = portal.y + portal.height / 2 - cameraY;
                    
                    ctx.font = '12px monospace';
                    ctx.textAlign = 'center';
                    
                    if (portal.locked) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.fillText('🔒 ' + portal.label, centerX, centerY + 30);
                    } else {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                        ctx.fillText(portal.label, centerX, centerY + 30);
                    }
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
        name: 'Hotel Lobby',
        width: 1800,
        height: 1400,
        startX: 900,
        startY: 700,
        isHub: true,
        enemyCount: 0,
        wallColor: '#2e2420',
        floorColor: '#1a1510',
        totalLevels: 1,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1800, height: 50 },
            { x: 0, y: 0, width: 50, height: 1400 },
            { x: 0, y: 1350, width: 1800, height: 50 },
            { x: 1750, y: 0, width: 50, height: 1400 },
            // Reception desk (horizontal wall near top-center)
            { x: 750, y: 300, width: 300, height: 20 },
            // Pillars/columns (decorative)
            { x: 300, y: 400, width: 30, height: 30 },
            { x: 1470, y: 400, width: 30, height: 30 },
            { x: 300, y: 900, width: 30, height: 30 },
            { x: 1470, y: 900, width: 30, height: 30 },
            // Corridor partitions
            { x: 600, y: 1100, width: 100, height: 15 },
            { x: 1100, y: 1100, width: 100, height: 15 }
        ],
        nodes: [
            { x: 860, y: 660, width: 80, height: 80 }
        ],
        portals: [
            { id: 'archive_entry', x: 870, y: 610, width: 60, height: 60, label: 'The Archive' },
            { id: 'archive_entry', x: 400, y: 350, width: 60, height: 60, label: 'Room 102' },
            { id: 'locked_room', x: 1340, y: 350, width: 60, height: 60, label: 'Room 237 (Locked)', locked: true }
        ],
        npcs: [
            { x: 900, y: 400, name: 'The Curator', color: '#d4a745' }
        ]
    },
    archive_entry: {
        name: 'The Archive',
        width: 1600,
        height: 1200,
        startX: 800,
        startY: 1050,
        wallColor: '#2f2b38',
        floorColor: '#17151c',
        totalLevels: 2,
        enemyCount: 1,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1600, height: 40 },
            { x: 0, y: 0, width: 40, height: 1200 },
            { x: 0, y: 1160, width: 1600, height: 40 },
            { x: 1560, y: 0, width: 40, height: 1200 }
        ],
        nodes: [
            { x: 760, y: 120, width: 80, height: 80 },
            { x: 200, y: 520, width: 80, height: 80 },
            { x: 1320, y: 520, width: 80, height: 80 }
        ],
        portals: [
            { id: 'hub', x: 770, y: 1080, width: 60, height: 60, label: 'Return to Lobby' }
        ],
    }
};
