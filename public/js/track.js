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
        this.isHub = zoneData.isHub || false;
        
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

        // Create gradient centered in the canvas - red tinted for noir
        const gradient = ctx.createRadialGradient(300, 300, 0, 300, 300, 300);
        gradient.addColorStop(0, 'rgba(180, 80, 60, 0.25)');
        gradient.addColorStop(0.5, 'rgba(139, 0, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 600);

        return canvas;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Get noir colors
        const floorCol = typeof COLORS !== 'undefined' ? COLORS.FLOOR_COLOR : this.floorColor;
        const wallCol = typeof COLORS !== 'undefined' ? COLORS.WALL_COLOR : this.wallColor;

        // Draw ground with tiled texture effect
        if (typeof spriteManager !== 'undefined' && spriteManager.has('floorTile')) {
            this.drawTiledFloor(ctx, cameraX, cameraY);
        } else {
            // Fallback - noir solid color with subtle grid
            ctx.fillStyle = floorCol;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // Subtle floor tile grid
            ctx.strokeStyle = 'rgba(30, 10, 10, 0.3)';
            ctx.lineWidth = 1;
            const tileSize = 64;
            const startX = -(cameraX % tileSize);
            const startY = -(cameraY % tileSize);
            for (let x = startX; x < ctx.canvas.width; x += tileSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, ctx.canvas.height);
                ctx.stroke();
            }
            for (let y = startY; y < ctx.canvas.height; y += tileSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(ctx.canvas.width, y);
                ctx.stroke();
            }
        }

        // Draw chandelier glow if decorations exist (before walls for lighting effect)
        if (this.decorations && this.decorations.chandelier) {
            this.drawChandelier(ctx, cameraX, cameraY);
        }

        // Draw walls/obstacles with noir styling
        this.walls.forEach(wall => {
            if (this.isVisible(wall, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                if (wall.isPillar) {
                    this.drawPillar(ctx, wall, cameraX, cameraY);
                } else {
                    // Draw wall with noir style
                    const wx = wall.x - cameraX;
                    const wy = wall.y - cameraY;

                    // Main wall body
                    ctx.fillStyle = wallCol;
                    ctx.fillRect(wx, wy, wall.width, wall.height);

                    // Red accent line on top edge
                    ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
                    ctx.fillRect(wx, wy, wall.width, 2);

                    // Inner shadow
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.fillRect(wx + 2, wy + 2, wall.width - 4, wall.height - 4);
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

        // Draw exploration nodes (subtle red glow)
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.4)';
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

        // Draw spawn point (red instead of white)
        const spawnArea = { x: this.startX - 30, y: this.startY - 30, width: 60, height: 60 };
        if (this.isVisible(spawnArea, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
            ctx.strokeStyle = 'rgba(139, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.startX - cameraX, this.startY - cameraY, 25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(139, 0, 0, 0.1)';
            ctx.fill();
        }

        // Draw portals as noir-style doors
        this.portals.forEach(portal => {
            if (this.isVisible(portal, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                this.drawNoirDoor(ctx, portal, cameraX, cameraY);
            }
        });

        // Draw pickup items with red glow
        this.items.forEach(item => {
            if (!this.isVisible({ x: item.x - 12, y: item.y - 12, width: 24, height: 24 }, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                return;
            }

            const itemX = item.x - cameraX;
            const itemY = item.y - cameraY;

            // Red glow under item
            ctx.fillStyle = 'rgba(139, 0, 0, 0.3)';
            ctx.shadowColor = '#8b0000';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(itemX, itemY, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#fff';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.icon || '📦', itemX, itemY + 6);
        });
    }

    /**
     * Draw tiled floor using sprites
     */
    drawTiledFloor(ctx, cameraX, cameraY) {
        const tile = spriteManager.get('floorTile');
        const tileSize = 64;
        const startX = Math.floor(cameraX / tileSize) * tileSize - cameraX;
        const startY = Math.floor(cameraY / tileSize) * tileSize - cameraY;

        for (let x = startX; x < ctx.canvas.width + tileSize; x += tileSize) {
            for (let y = startY; y < ctx.canvas.height + tileSize; y += tileSize) {
                ctx.drawImage(tile, x, y, tileSize, tileSize);
            }
        }
    }

    /**
     * Draw a noir-style door portal
     */
    drawNoirDoor(ctx, portal, cameraX, cameraY) {
        const px = portal.x - cameraX;
        const py = portal.y - cameraY;
        const pw = portal.width;
        const ph = portal.height;

        // Use sprite if available
        if (typeof spriteManager !== 'undefined' && spriteManager.has('doorClosed')) {
            const sprite = spriteManager.get('doorClosed');
            ctx.drawImage(sprite, px, py, pw, ph);
        } else {
            // Fallback - draw noir door
            // Door frame (dark wood)
            ctx.fillStyle = '#1a0a0a';
            ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);

            // Door body
            ctx.fillStyle = '#0d0505';
            ctx.fillRect(px, py, pw, ph);

            // Door panels (vertical lines)
            ctx.strokeStyle = '#2a0a0a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + pw * 0.33, py + 5);
            ctx.lineTo(px + pw * 0.33, py + ph - 5);
            ctx.moveTo(px + pw * 0.66, py + 5);
            ctx.lineTo(px + pw * 0.66, py + ph - 5);
            ctx.stroke();

            // Door handle (brass/gold)
            ctx.fillStyle = '#8b6f47';
            ctx.beginPath();
            ctx.arc(px + pw - 12, py + ph/2, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Red glow seeping from under door
        ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
        ctx.shadowColor = '#8b0000';
        ctx.shadowBlur = 15;
        ctx.fillRect(px, py + ph - 3, pw, 6);
        ctx.shadowBlur = 0;

        // Label plaque (above door)
        if (portal.label) {
            ctx.fillStyle = '#1a0a0a';
            ctx.fillRect(px + pw/2 - 45, py - 30, 90, 22);

            // Red border
            ctx.strokeStyle = '#4a0000';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + pw/2 - 45, py - 30, 90, 22);

            ctx.fillStyle = '#8b0000';
            ctx.font = 'bold 11px serif';
            ctx.textAlign = 'center';
            ctx.fillText(portal.label.toUpperCase(), px + pw/2, py - 14);
        }

        // Locked indicator
        if (portal.locked) {
            ctx.fillStyle = 'rgba(139, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + ph/2, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('🔒', px + pw/2, py + ph/2 + 6);
        }
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
    
    // Decorative drawing methods for lobby (noir style)
    drawPillar(ctx, wall, cameraX, cameraY) {
        const px = wall.x - cameraX;
        const py = wall.y - cameraY;

        // Draw pillar with dark marble shading
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(px, py, wall.width, wall.height);

        // Red accent stripe
        ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
        ctx.fillRect(px + wall.width/2 - 1, py, 2, wall.height);

        // Darker edges
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(px, py, 3, wall.height);
        ctx.fillRect(px + wall.width - 3, py, 3, wall.height);
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
            this.cachedClockAngles.hour = (hours + minutes / 60) * (Math.PI / 6);
            this.cachedClockAngles.minute = minutes * (Math.PI / 30);
            this.lastClockUpdate = now;
        }

        // Clock body (tall rectangle) - dark wood
        ctx.fillStyle = '#0d0505';
        ctx.fillRect(clockX - 22, clockY, 44, 155);

        // Red trim
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(clockX - 22, clockY, 44, 155);

        // Clock face (dark with red accents)
        ctx.fillStyle = '#1a0a0a';
        ctx.beginPath();
        ctx.arc(clockX, clockY + 32, 26, 0, Math.PI * 2);
        ctx.fill();

        // Red glow ring
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(clockX, clockY + 32, 26, 0, Math.PI * 2);
        ctx.stroke();

        // Clock hands (red)
        ctx.strokeStyle = '#8b0000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        // Hour hand
        ctx.beginPath();
        ctx.moveTo(clockX, clockY + 32);
        ctx.lineTo(
            clockX + Math.sin(this.cachedClockAngles.hour) * 12,
            clockY + 32 - Math.cos(this.cachedClockAngles.hour) * 12
        );
        ctx.stroke();
        // Minute hand
        ctx.beginPath();
        ctx.moveTo(clockX, clockY + 32);
        ctx.lineTo(
            clockX + Math.sin(this.cachedClockAngles.minute) * 18,
            clockY + 32 - Math.cos(this.cachedClockAngles.minute) * 18
        );
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.arc(clockX, clockY + 32, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawChandelier(ctx, cameraX, cameraY) {
        const chandelier = this.decorations.chandelier;
        const chandelierX = chandelier.x - cameraX;
        const chandelierY = chandelier.y - cameraY;

        // Use pre-rendered glow canvas (performance optimization)
        if (this.chandelierCanvas) {
            ctx.drawImage(this.chandelierCanvas, chandelierX - 300, chandelierY - 300);
        }

        // Dark chandelier body
        ctx.fillStyle = '#1a0a0a';
        ctx.beginPath();
        ctx.arc(chandelierX, chandelierY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Red glowing crystals
        ctx.fillStyle = '#8b0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = chandelierX + Math.cos(angle) * 24;
            const y = chandelierY + 18;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    drawPortraits(ctx, cameraX, cameraY) {
        this.decorations.portraits.forEach(p => {
            const screenX = p.x - cameraX;
            const screenY = p.y - cameraY;

            // Dark frame with red trim
            ctx.fillStyle = '#0d0505';
            ctx.fillRect(screenX - 42, screenY - 62, 84, 104);

            ctx.strokeStyle = '#4a0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX - 42, screenY - 62, 84, 104);

            // Inner dark content
            ctx.fillStyle = '#050505';
            ctx.fillRect(screenX - 36, screenY - 56, 72, 92);

            // Mysterious shadowy figure
            ctx.fillStyle = '#1a0a0a';
            ctx.beginPath();
            ctx.arc(screenX, screenY - 22, 16, 0, Math.PI * 2); // Head
            ctx.fill();
            ctx.fillRect(screenX - 22, screenY - 2, 44, 34); // Body

            // Red glowing eyes on portrait
            ctx.fillStyle = '#8b0000';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(screenX - 5, screenY - 24, 2, 0, Math.PI * 2);
            ctx.arc(screenX + 5, screenY - 24, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }

    drawElevator(ctx, cameraX, cameraY) {
        const elevator = this.decorations.elevator;
        const elevatorX = elevator.x + 60 - cameraX;
        const elevatorY = elevator.y - 20 - cameraY;

        // "OUT OF SERVICE" light (pulsing red)
        if (elevator.locked) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
            ctx.fillStyle = `rgba(139, 0, 0, ${0.5 + pulse * 0.5})`;
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 10 * pulse;
            ctx.beginPath();
            ctx.arc(elevatorX, elevatorY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Art deco triangle pattern (dark red)
            ctx.strokeStyle = '#4a0000';
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
        wallColor: '#0d0d0d',    // Near black
        floorColor: '#080505',    // Dark with red tint
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
            { id: 'training', x: 400, y: 900, width: 60, height: 60, label: 'Training' }
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
        wallColor: '#0a0a0a',      // Near black
        floorColor: '#050505',     // Almost pure black
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
    }
};
