// Track class for racing circuits
class Track {
    constructor(trackData) {
        this.name = trackData.name;
        this.width = trackData.width;
        this.height = trackData.height;
        this.trackColor = trackData.trackColor || '#666';
        this.grassColor = trackData.grassColor || '#2a5a2a';
        this.startX = trackData.startX;
        this.startY = trackData.startY;
        this.checkpoints = trackData.checkpoints || [];
        this.walls = trackData.walls || [];
        this.itemBoxes = trackData.itemBoxes || [];
        this.totalLaps = 3;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Draw grass background
        ctx.fillStyle = this.grassColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw track (simplified)
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
        
        // Draw checkpoints (debug)
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = 3;
        this.checkpoints.forEach((cp, index) => {
            if (this.isVisible(cp, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                ctx.strokeRect(
                    cp.x - cameraX,
                    cp.y - cameraY,
                    cp.width,
                    cp.height
                );
            }
        });
        
        // Draw start/finish line
        const startLine = { x: this.startX - 50, y: this.startY - 20, width: 100, height: 40 };
        if (this.isVisible(startLine, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
            // Checkered pattern
            const squareSize = 10;
            for (let i = 0; i < 10; i++) {
                for (let j = 0; j < 4; j++) {
                    ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#000';
                    ctx.fillRect(
                        startLine.x + i * squareSize - cameraX,
                        startLine.y + j * squareSize - cameraY,
                        squareSize,
                        squareSize
                    );
                }
            }
        }
        
        // Draw item boxes
        ctx.fillStyle = '#FFD700';
        ctx.font = '20px Arial';
        this.itemBoxes.forEach(box => {
            if (this.isVisible(box, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                if (!box.collected || box.respawnTime <= 0) {
                    ctx.fillRect(
                        box.x - cameraX - 15,
                        box.y - cameraY - 15,
                        30,
                        30
                    );
                    ctx.fillText('?', box.x - cameraX - 7, box.y - cameraY + 7);
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
                // Check if this is the next checkpoint
                if (!player.checkpoints.includes(i)) {
                    player.checkpoints.push(i);
                    
                    // If all checkpoints collected, increment lap
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
                box.respawnTime = 300; // 5 seconds at 60fps
                
                // Give random item
                const itemTypes = ['boost', 'shell', 'star', 'banana'];
                const randomItem = itemTypes[Math.floor(Math.random() * itemTypes.length)];
                player.currentItem = { type: randomItem };
                
                return true;
            }
        }
        return false;
    }
}

// Track definitions
const TRACKS = {
    circuit: {
        name: 'Speed Circuit',
        width: 2000,
        height: 1500,
        startX: 300,
        startY: 300,
        trackColor: '#555',
        grassColor: '#2a5a2a',
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 2000, height: 50 },
            { x: 0, y: 0, width: 50, height: 1500 },
            { x: 0, y: 1450, width: 2000, height: 50 },
            { x: 1950, y: 0, width: 50, height: 1500 },
            
            // Inner oval
            { x: 300, y: 300, width: 1400, height: 100 },
            { x: 300, y: 300, width: 100, height: 900 },
            { x: 300, y: 1100, width: 1400, height: 100 },
            { x: 1600, y: 300, width: 100, height: 900 }
        ],
        checkpoints: [
            { x: 200, y: 250, width: 100, height: 200 },
            { x: 700, y: 150, width: 200, height: 100 },
            { x: 1400, y: 150, width: 200, height: 100 },
            { x: 1700, y: 600, width: 100, height: 200 },
            { x: 1400, y: 1250, width: 200, height: 100 },
            { x: 700, y: 1250, width: 200, height: 100 }
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
    
    forest: {
        name: 'Forest Path',
        width: 2500,
        height: 2000,
        startX: 400,
        startY: 400,
        trackColor: '#8B4513',
        grassColor: '#1a4a1a',
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 2500, height: 50 },
            { x: 0, y: 0, width: 50, height: 2000 },
            { x: 0, y: 1950, width: 2500, height: 50 },
            { x: 2450, y: 0, width: 50, height: 2000 },
            
            // Winding path obstacles
            { x: 400, y: 400, width: 100, height: 600 },
            { x: 800, y: 200, width: 100, height: 800 },
            { x: 1200, y: 500, width: 100, height: 700 },
            { x: 1600, y: 300, width: 100, height: 600 },
            { x: 2000, y: 600, width: 100, height: 800 }
        ],
        checkpoints: [
            { x: 300, y: 350, width: 150, height: 150 },
            { x: 600, y: 250, width: 150, height: 150 },
            { x: 1000, y: 450, width: 150, height: 150 },
            { x: 1400, y: 350, width: 150, height: 150 },
            { x: 1800, y: 550, width: 150, height: 150 },
            { x: 2100, y: 700, width: 150, height: 150 },
            { x: 1800, y: 1200, width: 150, height: 150 },
            { x: 1000, y: 1400, width: 150, height: 150 }
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
