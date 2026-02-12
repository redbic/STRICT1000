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
        this.items = (zoneData.items || []).map(item => ({ ...item }));
        this.totalLevels = zoneData.totalLevels || 3;
        this.decorations = zoneData.decorations || null;
        this.ruleset = zoneData.ruleset || 'standard';
        this.visibilityRadius = zoneData.visibilityRadius || null;
        
        // Performance optimization: cache time-based values
        this.lastClockUpdate = 0;
        this.cachedClockAngles = { hour: 0, minute: 0 };
        
        // Performance optimization: pre-render chandelier glow
        this.chandelierCanvas = null;
        if (this.decorations && this.decorations.chandelier) {
            this.chandelierCanvas = this.createChandelierGlow();
        }
    }
    
    createChandelierGlow() {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        
        // Create gradient centered in the canvas
        const gradient = ctx.createRadialGradient(300, 300, 0, 300, 300, 300);
        gradient.addColorStop(0, 'rgba(255, 230, 150, 0.3)');
        gradient.addColorStop(0.5, 'rgba(255, 230, 150, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 230, 150, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 600);
        
        return canvas;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Draw ground
        ctx.fillStyle = this.floorColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw chandelier glow if decorations exist (before walls for lighting effect)
        if (this.decorations && this.decorations.chandelier) {
            this.drawChandelier(ctx, cameraX, cameraY);
        }
        
        // Draw walls/obstacles
        this.walls.forEach(wall => {
            if (this.isVisible(wall, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                if (wall.isPillar) {
                    // Draw pillars with special styling
                    this.drawPillar(ctx, wall, cameraX, cameraY);
                } else {
                    // Normal wall
                    ctx.fillStyle = this.wallColor;
                    ctx.fillRect(
                        wall.x - cameraX,
                        wall.y - cameraY,
                        wall.width,
                        wall.height
                    );
                }
            }
        });
        
        // Draw decorative elements if they exist
        if (this.decorations) {
            if (this.decorations.clock) {
                this.drawClock(ctx, cameraX, cameraY);
            }
            if (this.decorations.portraits) {
                this.drawPortraits(ctx, cameraX, cameraY);
            }
            if (this.decorations.elevator) {
                this.drawElevator(ctx, cameraX, cameraY);
            }
        }
        
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
        
        // Draw portals with enhanced styling
        this.portals.forEach(portal => {
            if (this.isVisible(portal, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                const centerX = portal.x + portal.width / 2 - cameraX;
                const centerY = portal.y + portal.height / 2 - cameraY;
                const radius = Math.min(portal.width, portal.height) / 2;
                
                // Door frame (arch) - brass trim
                ctx.strokeStyle = '#d4a745'; // Brass
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(centerX, centerY - radius, radius, Math.PI, 0);
                ctx.stroke();
                ctx.strokeRect(
                    centerX - radius,
                    centerY - radius,
                    radius * 2,
                    radius * 2
                );
                
                // Portal swirl effect
                ctx.strokeStyle = portal.locked ? 'rgba(255, 0, 0, 0.5)' : 'rgba(120, 200, 255, 0.8)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius - 5, 0, Math.PI * 2);
                ctx.stroke();
                
                // Draw portal label if it exists
                if (portal.label) {
                    // Room plaque (above door)
                    ctx.fillStyle = '#8b6f47'; // Gold plaque
                    ctx.fillRect(centerX - 40, centerY - radius - 35, 80, 25);
                    
                    ctx.fillStyle = '#000'; // Engraved text
                    ctx.font = 'bold 10px serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(portal.label, centerX, centerY - radius - 17);
                    
                    // Locked icon (if locked)
                    if (portal.locked) {
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 16px monospace';
                        ctx.fillText('🔒', centerX, centerY + 5);
                    }
                }
            }
        });

        // Draw pickup items
        this.items.forEach(item => {
            if (!this.isVisible({ x: item.x - 12, y: item.y - 12, width: 24, height: 24 }, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                return;
            }

            const itemX = item.x - cameraX;
            const itemY = item.y - cameraY;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(itemX, itemY, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.icon || '📦', itemX, itemY + 5);
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

    popPickupAt(x, y, radius = 18) {
        const idx = this.items.findIndex(item => Math.hypot(item.x - x, item.y - y) <= radius);
        if (idx < 0) return null;
        return this.items.splice(idx, 1)[0];
    }
    
    // Decorative drawing methods for lobby
    drawPillar(ctx, wall, cameraX, cameraY) {
        // Draw pillar with marble shading
        ctx.fillStyle = '#6b6560'; // Marble gray
        ctx.fillRect(wall.x - cameraX, wall.y - cameraY, wall.width, wall.height);
        
        // Lighter top edge (fake 3D)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(wall.x - cameraX, wall.y - cameraY, wall.width, 5);
    }
    
    drawClock(ctx, cameraX, cameraY) {
        const clock = this.decorations.clock;
        const clockX = clock.x - cameraX;
        const clockY = clock.y - cameraY;
        
        // Update clock angles only once per second (performance optimization)
        const now = Date.now();
        if (now - this.lastClockUpdate > 1000) {
            const time = new Date();
            const hours = time.getHours() % 12;
            const minutes = time.getMinutes();
            // Hour hand accounts for minutes for smooth movement
            this.cachedClockAngles.hour = (hours + minutes / 60) * (Math.PI / 6);
            this.cachedClockAngles.minute = minutes * (Math.PI / 30);
            this.lastClockUpdate = now;
        }
        
        // Clock body (tall rectangle)
        ctx.fillStyle = '#6b4e3d'; // Dark wood
        ctx.fillRect(clockX - 20, clockY, 40, 150);
        
        // Clock face (circle at top)
        ctx.fillStyle = '#d4a745'; // Brass
        ctx.beginPath();
        ctx.arc(clockX, clockY + 30, 25, 0, Math.PI * 2);
        ctx.fill();
        
        // Clock hands (simple lines) - uses cached angles
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        // Hour hand
        ctx.beginPath();
        ctx.moveTo(clockX, clockY + 30);
        ctx.lineTo(
            clockX + Math.sin(this.cachedClockAngles.hour) * 12,
            clockY + 30 - Math.cos(this.cachedClockAngles.hour) * 12
        );
        ctx.stroke();
        // Minute hand
        ctx.beginPath();
        ctx.moveTo(clockX, clockY + 30);
        ctx.lineTo(
            clockX + Math.sin(this.cachedClockAngles.minute) * 18,
            clockY + 30 - Math.cos(this.cachedClockAngles.minute) * 18
        );
        ctx.stroke();
    }
    
    drawChandelier(ctx, cameraX, cameraY) {
        const chandelier = this.decorations.chandelier;
        const chandelierX = chandelier.x - cameraX;
        const chandelierY = chandelier.y - cameraY;
        
        // Use pre-rendered glow canvas (performance optimization)
        if (this.chandelierCanvas) {
            ctx.drawImage(this.chandelierCanvas, chandelierX - 300, chandelierY - 300);
        }
        
        // Simple chandelier sprite (circles + lines)
        ctx.fillStyle = '#d4a745';
        ctx.beginPath();
        ctx.arc(chandelierX, chandelierY, 10, 0, Math.PI * 2);
        ctx.fill();
        // Hanging crystals (small circles below)
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const x = chandelierX + Math.cos(angle) * 20;
            const y = chandelierY + 15;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawPortraits(ctx, cameraX, cameraY) {
        this.decorations.portraits.forEach(p => {
            const screenX = p.x - cameraX;
            const screenY = p.y - cameraY;
            
            // Frame
            ctx.fillStyle = '#8b6f47';
            ctx.fillRect(screenX - 40, screenY - 60, 80, 100);
            
            // Inner shadow (portrait content)
            ctx.fillStyle = '#2a2420';
            ctx.fillRect(screenX - 35, screenY - 55, 70, 90);
            
            // Mysterious silhouette (simple shape)
            ctx.fillStyle = 'rgba(100, 80, 60, 0.5)';
            ctx.beginPath();
            ctx.arc(screenX, screenY - 20, 15, 0, Math.PI * 2); // Head
            ctx.fill();
            ctx.fillRect(screenX - 20, screenY, 40, 30); // Body
        });
    }
    
    drawElevator(ctx, cameraX, cameraY) {
        const elevator = this.decorations.elevator;
        const elevatorX = elevator.x + 60 - cameraX; // Center between two doors
        const elevatorY = elevator.y - 20 - cameraY; // Above doors
        
        // "OUT OF SERVICE" light (red circle)
        if (elevator.locked) {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(elevatorX, elevatorY, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Art deco triangle pattern above doors
            ctx.strokeStyle = '#d4a745';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(elevatorX - 30 + i * 15, elevatorY - 20);
                ctx.lineTo(elevatorX - 30 + i * 15 + 7, elevatorY - 35);
                ctx.lineTo(elevatorX - 30 + i * 15 + 15, elevatorY - 20);
                ctx.stroke();
            }
        }
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
        wallColor: '#2e2420',
        floorColor: '#4a1c1c', // Burgundy carpet
        totalLevels: 1,
        decorations: {
            clock: { x: 200, y: 200 },
            chandelier: { x: 900, y: 200 },
            portraits: [
                { x: 150, y: 100 },
                { x: 1650, y: 100 }
            ],
            elevator: { x: 1500, y: 1000, locked: true }
        },
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1800, height: 50 },
            { x: 0, y: 0, width: 50, height: 1400 },
            { x: 0, y: 1350, width: 1800, height: 50 },
            { x: 1750, y: 0, width: 50, height: 1400 },
            // Reception desk (horizontal wall near top-center)
            { x: 750, y: 300, width: 300, height: 20 },
            // Pillars/columns (decorative) - marked for special rendering
            { x: 300, y: 400, width: 30, height: 30, isPillar: true },
            { x: 1470, y: 400, width: 30, height: 30, isPillar: true },
            { x: 300, y: 900, width: 30, height: 30, isPillar: true },
            { x: 1470, y: 900, width: 30, height: 30, isPillar: true },
            // Elevator doors (collision boxes)
            { x: 1500, y: 1000, width: 60, height: 100 }, // Left door
            { x: 1560, y: 1000, width: 60, height: 100 }, // Right door
            // Corridor partitions
            { x: 600, y: 1100, width: 100, height: 15 },
            { x: 1100, y: 1100, width: 100, height: 15 }
        ],
        nodes: [
            { x: 860, y: 660, width: 80, height: 80 }
        ],
        portals: [
            // Training room portal
            { id: 'training', x: 400, y: 900, width: 60, height: 60, label: 'Training' },
            // The Gallery - new experimental room
            { id: 'gallery', x: 900, y: 1150, width: 60, height: 60, label: 'The Gallery' }
        ],
        npcs: [
            { x: 900, y: 400, name: 'The Receptionist', color: '#d4a745' }
        ],
        items: [
            { id: 'old-key', name: 'Old Key', icon: '🗝️', x: 820, y: 760 },
            { id: 'energy-tonic', name: 'Energy Tonic', icon: '🧪', x: 1010, y: 760 }
        ]
    },
    training: {
        name: 'Training',
        width: 1000,
        height: 800,
        startX: 500,
        startY: 700,
        wallColor: '#3a3a3a',
        floorColor: '#2a2a2a',
        totalLevels: 1,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1000, height: 40 },
            { x: 0, y: 0, width: 40, height: 800 },
            { x: 0, y: 760, width: 1000, height: 40 },
            { x: 960, y: 0, width: 40, height: 800 }
        ],
        portals: [
            { id: 'hub', x: 470, y: 720, width: 60, height: 60, label: 'Return to Lobby' }
        ],
        enemies: [
            { x: 500, y: 400, stationary: true, passive: true, hp: 100, maxHp: 100 }
        ],
        items: [
            { id: 'practice-blade', name: 'Practice Blade', icon: '🗡️', x: 530, y: 520 },
            { id: 'iron-ore', name: 'Iron Ore', icon: '⛓️', x: 420, y: 320 }
        ]
    },
    gallery: {
        name: 'The Gallery',
        width: 1200,
        height: 1000,
        startX: 600,
        startY: 900,
        wallColor: '#1a1a1a',
        floorColor: '#0d0d0d',
        totalLevels: 1,
        ruleset: 'darkness', // Experimental: limited visibility
        visibilityRadius: 150, // Player can only see 150px around them
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1200, height: 40 },
            { x: 0, y: 0, width: 40, height: 1000 },
            { x: 0, y: 960, width: 1200, height: 40 },
            { x: 1160, y: 0, width: 40, height: 1000 },
            // Internal maze-like walls for navigation challenge
            { x: 200, y: 200, width: 400, height: 20 },
            { x: 600, y: 400, width: 400, height: 20 },
            { x: 200, y: 600, width: 400, height: 20 }
        ],
        portals: [
            { id: 'hub', x: 570, y: 920, width: 60, height: 60, label: 'Return to Lobby' }
        ],
        enemies: [
            { x: 400, y: 300, stationary: false, passive: false, hp: 40, maxHp: 40 },
            { x: 800, y: 500, stationary: false, passive: false, hp: 40, maxHp: 40 },
            { x: 300, y: 700, stationary: false, passive: false, hp: 40, maxHp: 40 }
        ],
        items: [
            { id: 'gallery-shard', name: 'Gallery Shard', icon: '💠', x: 680, y: 260 },
            { id: 'dim-lantern', name: 'Dim Lantern', icon: '🏮', x: 940, y: 760 }
        ]
    }
};
