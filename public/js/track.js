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

        // Floor tiles (from JSON)
        this.floor = zoneData.floor || null;
        this.floorMap = zoneData.floorMap || null;
        if (!this.floorMap && this.floor && this.floor.tiles) {
            this.floorMap = new Map();
            this.floor.tiles.forEach(tile => {
                this.floorMap.set(`${tile.x},${tile.y}`, tile);
            });
        }

        // Objects layer (furniture, decorations with optional collision)
        this.objects = zoneData.objects || null;
        this.objectsMap = null;
        if (this.objects && this.objects.tiles) {
            this.objectsMap = new Map();
            this.objects.tiles.forEach(tile => {
                this.objectsMap.set(`${tile.x},${tile.y}`, tile);
            });
        }

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

        // Fluorescent/warm light glow for liminal aesthetic
        const gradient = ctx.createRadialGradient(300, 300, 0, 300, 300, 300);
        gradient.addColorStop(0, 'rgba(255, 251, 220, 0.3)');
        gradient.addColorStop(0.5, 'rgba(255, 248, 200, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 600);

        return canvas;
    }
    
    draw(ctx, cameraX, cameraY) {
        // Get liminal hotel colors
        const floorCol = typeof COLORS !== 'undefined' ? COLORS.FLOOR_COLOR : this.floorColor;
        const wallCol = typeof COLORS !== 'undefined' ? COLORS.WALL_COLOR : this.wallColor;

        // Try to use LimeZu tileset for floor
        if (typeof tilesetManager !== 'undefined' && tilesetManager && tilesetManager.loaded) {
            this.drawTilesetFloor(ctx, cameraX, cameraY);
        }
        // Fall back to custom sprite if available
        else if (typeof spriteManager !== 'undefined' && spriteManager.has('floorTile')) {
            this.drawTiledFloor(ctx, cameraX, cameraY);
        } else {
            // Fallback - liminal carpet with subtle pattern
            ctx.fillStyle = floorCol;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // Subtle carpet/tile grid pattern
            ctx.strokeStyle = 'rgba(154, 139, 112, 0.25)';
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

        // Draw walls/obstacles with liminal hotel styling
        this.walls.forEach(wall => {
            if (this.isVisible(wall, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                if (wall.isPillar) {
                    this.drawPillar(ctx, wall, cameraX, cameraY);
                } else {
                    // Draw wall with liminal style
                    const wx = wall.x - cameraX;
                    const wy = wall.y - cameraY;

                    // Main wall body (beige/cream)
                    ctx.fillStyle = wallCol;
                    ctx.fillRect(wx, wy, wall.width, wall.height);

                    // Wood baseboard at bottom
                    ctx.fillStyle = '#8b7355';
                    ctx.fillRect(wx, wy + wall.height - 8, wall.width, 8);

                    // Subtle shadow at top
                    ctx.fillStyle = 'rgba(80, 70, 55, 0.2)';
                    ctx.fillRect(wx, wy, wall.width, 3);
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

        // Draw exploration nodes (subtle glow)
        ctx.strokeStyle = 'rgba(139, 115, 85, 0.3)';
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

        // Draw spawn point (subtle)
        const spawnArea = { x: this.startX - 30, y: this.startY - 30, width: 60, height: 60 };
        if (this.isVisible(spawnArea, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
            ctx.strokeStyle = 'rgba(139, 115, 85, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.startX - cameraX, this.startY - cameraY, 25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 251, 230, 0.15)';
            ctx.fill();
        }

        // Draw portals as noir-style doors
        this.portals.forEach(portal => {
            if (this.isVisible(portal, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                this.drawNoirDoor(ctx, portal, cameraX, cameraY);
            }
        });

        // Draw objects layer (furniture, decorations)
        if (this.objectsMap && typeof tilesetManager !== 'undefined' && tilesetManager && tilesetManager.loaded) {
            this.drawObjects(ctx, cameraX, cameraY);
        }

        // Draw pickup items with soft glow
        this.items.forEach(item => {
            if (!this.isVisible({ x: item.x - 12, y: item.y - 12, width: 24, height: 24 }, cameraX, cameraY, ctx.canvas.width, ctx.canvas.height)) {
                return;
            }

            const itemX = item.x - cameraX;
            const itemY = item.y - cameraY;

            // Soft fluorescent glow under item
            ctx.fillStyle = 'rgba(255, 251, 220, 0.4)';
            ctx.shadowColor = '#fffbe6';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(itemX, itemY, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#3a3530';
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
     * Draw floor using LimeZu tileset
     */
    drawTilesetFloor(ctx, cameraX, cameraY) {
        // Other zones use simple carpet
        const otherFloorTile = { tileset: 'floors', tileX: 4, tileY: 4 };

        const scale = tilesetManager.scale;
        const tileSize = tilesetManager.tileSize * scale; // 48px

        const startTileX = Math.floor(cameraX / tileSize);
        const startTileY = Math.floor(cameraY / tileSize);
        const tilesX = Math.ceil(ctx.canvas.width / tileSize) + 2;
        const tilesY = Math.ceil(ctx.canvas.height / tileSize) + 2;

        ctx.imageSmoothingEnabled = false; // Pixel-perfect

        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const worldTileX = startTileX + tx;
                const worldTileY = startTileY + ty;

                // Only draw within zone bounds
                const worldX = worldTileX * tileSize;
                const worldY = worldTileY * tileSize;
                if (worldX < 0 || worldX >= this.width || worldY < 0 || worldY >= this.height) {
                    continue;
                }

                const screenX = worldTileX * tileSize - cameraX;
                const screenY = worldTileY * tileSize - cameraY;

                // Use zone's floor map if available
                const tile = this.floorMap ? this.floorMap.get(`${worldTileX},${worldTileY}`) : null;
                if (tile) {
                    tilesetManager.drawTile(
                        ctx,
                        tile.tileset,
                        tile.tileX,
                        tile.tileY,
                        screenX,
                        screenY,
                        scale,
                        tile.flipH || false,
                        tile.flipV || false
                    );
                } else {
                    // Fallback to default floor tile
                    tilesetManager.drawTile(
                        ctx,
                        otherFloorTile.tileset,
                        otherFloorTile.tileX,
                        otherFloorTile.tileY,
                        screenX,
                        screenY,
                        scale
                    );
                }
            }
        }
    }

    /**
     * Draw objects layer (furniture, decorations)
     */
    drawObjects(ctx, cameraX, cameraY) {
        const scale = tilesetManager.scale;
        const tileSize = tilesetManager.tileSize * scale; // 48px

        const startTileX = Math.floor(cameraX / tileSize);
        const startTileY = Math.floor(cameraY / tileSize);
        const tilesX = Math.ceil(ctx.canvas.width / tileSize) + 2;
        const tilesY = Math.ceil(ctx.canvas.height / tileSize) + 2;

        ctx.imageSmoothingEnabled = false;

        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const worldTileX = startTileX + tx;
                const worldTileY = startTileY + ty;

                const tile = this.objectsMap.get(`${worldTileX},${worldTileY}`);
                if (!tile) continue;

                const screenX = worldTileX * tileSize - cameraX;
                const screenY = worldTileY * tileSize - cameraY;

                tilesetManager.drawTile(
                    ctx,
                    tile.tileset,
                    tile.tileX,
                    tile.tileY,
                    screenX,
                    screenY,
                    scale,
                    tile.flipH || false,
                    tile.flipV || false
                );
            }
        }
    }

    /**
     * Draw a liminal hotel-style door portal
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
            // Door frame (wood)
            ctx.fillStyle = '#6b5344';
            ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);

            // Door body (wood panel)
            ctx.fillStyle = '#a08060';
            ctx.fillRect(px, py, pw, ph);

            // Door panels (inset rectangles)
            ctx.fillStyle = '#8b7355';
            ctx.fillRect(px + 6, py + 6, pw - 12, ph * 0.4 - 8);
            ctx.fillRect(px + 6, py + ph * 0.45, pw - 12, ph * 0.5 - 8);

            // Door handle (brass)
            ctx.fillStyle = '#c9a54a';
            ctx.beginPath();
            ctx.arc(px + pw - 14, py + ph/2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#a08535';
            ctx.beginPath();
            ctx.arc(px + pw - 14, py + ph/2, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Light seeping from under door (fluorescent yellow)
        ctx.fillStyle = 'rgba(255, 251, 220, 0.5)';
        ctx.shadowColor = '#fffbe6';
        ctx.shadowBlur = 12;
        ctx.fillRect(px + 2, py + ph - 2, pw - 4, 4);
        ctx.shadowBlur = 0;

        // Room number plaque (above door)
        if (portal.label) {
            // Plaque background
            ctx.fillStyle = '#c9b896';
            ctx.fillRect(px + pw/2 - 40, py - 28, 80, 20);
            ctx.strokeStyle = '#8b7355';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + pw/2 - 40, py - 28, 80, 20);

            ctx.fillStyle = '#4a4540';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(portal.label.toUpperCase(), px + pw/2, py - 14);
        }

        // Locked indicator
        if (portal.locked) {
            ctx.fillStyle = 'rgba(176, 64, 64, 0.7)';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + ph/2, 16, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#f5f0e6';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🔒', px + pw/2, py + ph/2 + 5);
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

        // Check collision with physical objects
        if (this.objectsMap) {
            const tileSize = typeof tilesetManager !== 'undefined' ? tilesetManager.tileSize * tilesetManager.scale : 48;
            const playerLeft = player.x - player.width / 2;
            const playerRight = player.x + player.width / 2;
            const playerTop = player.y - player.height / 2;
            const playerBottom = player.y + player.height / 2;

            // Check tiles the player overlaps
            const minTileX = Math.floor(playerLeft / tileSize);
            const maxTileX = Math.floor(playerRight / tileSize);
            const minTileY = Math.floor(playerTop / tileSize);
            const maxTileY = Math.floor(playerBottom / tileSize);

            for (let ty = minTileY; ty <= maxTileY; ty++) {
                for (let tx = minTileX; tx <= maxTileX; tx++) {
                    const tile = this.objectsMap.get(`${tx},${ty}`);
                    if (tile && tile.physical) {
                        // AABB check with the tile
                        const tileLeft = tx * tileSize;
                        const tileRight = tileLeft + tileSize;
                        const tileTop = ty * tileSize;
                        const tileBottom = tileTop + tileSize;

                        if (playerRight > tileLeft && playerLeft < tileRight &&
                            playerBottom > tileTop && playerTop < tileBottom) {
                            return true;
                        }
                    }
                }
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
    
    // Decorative drawing methods for lobby (liminal hotel style)
    drawPillar(ctx, wall, cameraX, cameraY) {
        const px = wall.x - cameraX;
        const py = wall.y - cameraY;

        // Draw pillar (cream/beige marble)
        ctx.fillStyle = '#d4c8b0';
        ctx.fillRect(px, py, wall.width, wall.height);

        // Subtle highlight on left
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(px, py, 4, wall.height);

        // Shadow on right
        ctx.fillStyle = 'rgba(80, 70, 55, 0.25)';
        ctx.fillRect(px + wall.width - 4, py, 4, wall.height);

        // Base and top trim
        ctx.fillStyle = '#a08060';
        ctx.fillRect(px - 2, py, wall.width + 4, 6);
        ctx.fillRect(px - 2, py + wall.height - 6, wall.width + 4, 6);
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

        // Clock body (tall rectangle) - wood
        ctx.fillStyle = '#8b7355';
        ctx.fillRect(clockX - 22, clockY, 44, 155);

        // Wood trim
        ctx.strokeStyle = '#6b5344';
        ctx.lineWidth = 2;
        ctx.strokeRect(clockX - 22, clockY, 44, 155);

        // Clock face (cream/white)
        ctx.fillStyle = '#f5f0e6';
        ctx.beginPath();
        ctx.arc(clockX, clockY + 32, 26, 0, Math.PI * 2);
        ctx.fill();

        // Clock rim
        ctx.strokeStyle = '#a08060';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(clockX, clockY + 32, 26, 0, Math.PI * 2);
        ctx.stroke();

        // Clock hands (dark)
        ctx.strokeStyle = '#3a3530';
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
        ctx.fillStyle = '#6b5344';
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

        // Chandelier body (brass/gold)
        ctx.fillStyle = '#a08060';
        ctx.beginPath();
        ctx.arc(chandelierX, chandelierY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Light bulbs (warm fluorescent glow)
        ctx.fillStyle = '#fffbe6';
        ctx.shadowColor = '#fffbe6';
        ctx.shadowBlur = 12;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = chandelierX + Math.cos(angle) * 24;
            const y = chandelierY + 18;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Arms connecting to lights
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(chandelierX, chandelierY);
            ctx.lineTo(chandelierX + Math.cos(angle) * 24, chandelierY + 18);
            ctx.stroke();
        }
    }

    drawPortraits(ctx, cameraX, cameraY) {
        this.decorations.portraits.forEach(p => {
            const screenX = p.x - cameraX;
            const screenY = p.y - cameraY;

            // Ornate frame (gold/brass)
            ctx.fillStyle = '#a08060';
            ctx.fillRect(screenX - 42, screenY - 62, 84, 104);

            ctx.strokeStyle = '#c9a54a';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX - 42, screenY - 62, 84, 104);

            // Inner frame shadow
            ctx.fillStyle = '#8b7355';
            ctx.fillRect(screenX - 38, screenY - 58, 76, 96);

            // Portrait canvas (aged cream)
            ctx.fillStyle = '#d4c8b0';
            ctx.fillRect(screenX - 34, screenY - 54, 68, 88);

            // Faded figure silhouette
            ctx.fillStyle = '#b5a589';
            ctx.beginPath();
            ctx.arc(screenX, screenY - 22, 14, 0, Math.PI * 2); // Head
            ctx.fill();
            ctx.fillRect(screenX - 18, screenY - 4, 36, 30); // Body

            // Subtle face features
            ctx.fillStyle = '#9a8b70';
            ctx.beginPath();
            ctx.arc(screenX - 4, screenY - 24, 2, 0, Math.PI * 2);
            ctx.arc(screenX + 4, screenY - 24, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawElevator(ctx, cameraX, cameraY) {
        const elevator = this.decorations.elevator;
        const elevatorX = elevator.x + 60 - cameraX;
        const elevatorY = elevator.y - 20 - cameraY;

        // Floor indicator display
        ctx.fillStyle = '#3a3530';
        ctx.fillRect(elevatorX - 25, elevatorY - 35, 50, 25);
        ctx.fillStyle = '#fffbe6';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('L', elevatorX, elevatorY - 18);

        // "OUT OF SERVICE" indicator
        if (elevator.locked) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 800);
            ctx.fillStyle = `rgba(176, 64, 64, ${0.4 + pulse * 0.3})`;
            ctx.beginPath();
            ctx.arc(elevatorX, elevatorY + 10, 8, 0, Math.PI * 2);
            ctx.fill();

            // Call button (inactive)
            ctx.fillStyle = '#6a6560';
            ctx.beginPath();
            ctx.arc(elevatorX - 40, elevatorY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(elevatorX - 40, elevatorY + 15, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Hub lobby floor tiles (created with environment builder)
const HUB_FLOOR = {
    width: 21,
    height: 15,
    tiles: [
        { x: 0, y: 14, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 13, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 12, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 11, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 10, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 9, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 8, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 7, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 6, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 5, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 4, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 3, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 2, tileset: 'walls3d', tileX: 1, tileY: 5 },
        { x: 0, y: 1, tileset: 'walls3d', tileX: 3, tileY: 1 },
        { x: 0, y: 0, tileset: 'walls3d', tileX: 2, tileY: 0 },
        { x: 19, y: 14, tileset: 'floors', tileX: 9, tileY: 6, flipV: true },
        { x: 19, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 1, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 2, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 3, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 4, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 5, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 6, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 7, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 8, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 9, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 10, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 11, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 12, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 13, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 14, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 15, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 16, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 17, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 18, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2 },
        { x: 20, y: 0, tileset: 'walls3d', tileX: 6, tileY: 1 },
        { x: 20, y: 14, tileset: 'walls3d', tileX: 6, tileY: 5 },
        { x: 1, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 2, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 3, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 4, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 5, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 6, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 7, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 8, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 9, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 10, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 11, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 12, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 13, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 14, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 15, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 16, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 17, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 18, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 19, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3 },
        { x: 20, y: 1, tileset: 'walls3d', tileX: 6, tileY: 2 },
        { x: 2, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 10, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 20, y: 2, tileset: 'walls3d', tileX: 5, tileY: 2 },
        { x: 18, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 18, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 13, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 10, y: 13, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 9, y: 13, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 8, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 2, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 10, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 11, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 10, y: 11, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 9, y: 11, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 8, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 8, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 10, y: 8, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 9, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 10, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 9, y: 10, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 7, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 10, y: 7, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 12, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 7, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 13, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 10, y: 6, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 11, y: 6, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 12, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 10, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 8, y: 12, tileset: 'floors', tileX: 9, tileY: 7, flipH: true },
        { x: 7, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 6, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 7, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 5, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 10, y: 5, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 11, y: 5, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 4, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 5, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 4, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 3, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 6, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 8, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 9, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 10, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 4, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 8, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 7, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 12, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 13, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 14, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 16, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 12, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 17, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 15, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 12, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 10, y: 12, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 9, y: 12, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 9, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 11, y: 9, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 12, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 11, y: 8, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 19, y: 1, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 2, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 3, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 4, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 5, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 6, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 7, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 11, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 12, tileset: 'floors', tileX: 9, tileY: 7, flipH: true },
        { x: 19, y: 10, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 9, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 8, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 19, y: 13, tileset: 'floors', tileX: 9, tileY: 7 },
        { x: 20, y: 14, tileset: 'floors', tileX: 8, tileY: 6, flipH: true, flipV: true },
        { x: 20, y: 13, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 12, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 11, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 10, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 9, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 8, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 7, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 6, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 5, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 20, y: 4, tileset: 'floors', tileX: 8, tileY: 7, flipH: true },
        { x: 18, y: 14, tileset: 'floors', tileX: 9, tileY: 6, flipV: true },
    ]
};

const HUB_OBJECTS = {
    width: 21,
    height: 15,
    tiles: [
        { x: 10, y: 14, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 13, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 12, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 11, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 10, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 9, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 8, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 10, y: 7, tileset: 't01_generic', tileX: 3, tileY: 28 },
        { x: 9, y: 14, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 13, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 12, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 11, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 10, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 9, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 8, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 9, y: 7, tileset: 't01_generic', tileX: 4, tileY: 28 },
        { x: 11, y: 14, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 13, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 12, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 11, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 10, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 9, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 8, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 11, y: 7, tileset: 't01_generic', tileX: 5, tileY: 28 },
        { x: 9, y: 6, tileset: 't01_generic', tileX: 6, tileY: 27 },
        { x: 11, y: 6, tileset: 't01_generic', tileX: 7, tileY: 27 },
        { x: 10, y: 6, tileset: 't01_generic', tileX: 8, tileY: 27 },
        { x: 9, y: 5, tileset: 't01_generic', tileX: 0, tileY: 3 },
        { x: 10, y: 5, tileset: 't01_generic', tileX: 1, tileY: 3 },
        { x: 11, y: 5, tileset: 't01_generic', tileX: 2, tileY: 3 },
        { x: 9, y: 4, tileset: 't01_generic', tileX: 0, tileY: 2 },
        { x: 9, y: 3, tileset: 't01_generic', tileX: 0, tileY: 1 },
        { x: 9, y: 2, tileset: 't01_generic', tileX: 0, tileY: 0 },
        { x: 10, y: 2, tileset: 't01_generic', tileX: 1, tileY: 0 },
        { x: 11, y: 2, tileset: 't01_generic', tileX: 2, tileY: 0 },
        { x: 10, y: 3, tileset: 't01_generic', tileX: 1, tileY: 1 },
        { x: 11, y: 3, tileset: 't01_generic', tileX: 2, tileY: 1 },
        { x: 11, y: 4, tileset: 't01_generic', tileX: 2, tileY: 2 },
        { x: 1, y: 1, tileset: 't01_generic', tileX: 0, tileY: 22 },
        { x: 1, y: 0, tileset: 't01_generic', tileX: 0, tileY: 21 },
        { x: 2, y: 0, tileset: 't01_generic', tileX: 1, tileY: 21 },
        { x: 3, y: 0, tileset: 't01_generic', tileX: 2, tileY: 21 },
        { x: 3, y: 1, tileset: 't01_generic', tileX: 2, tileY: 22 },
        { x: 2, y: 1, tileset: 't01_generic', tileX: 1, tileY: 22 },
        { x: 4, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 5, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 6, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 7, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 8, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 9, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 10, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 11, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 12, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 13, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 14, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 15, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 16, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 17, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 18, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 19, y: 1, tileset: 'walls3d', tileX: 3, tileY: 3, physical: true },
        { x: 20, y: 2, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 3, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 4, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 5, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 6, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 7, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 8, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 9, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 10, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 11, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 12, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 13, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 20, y: 14, tileset: 'walls3d', tileX: 5, tileY: 2, physical: true },
        { x: 0, y: 2, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 3, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 4, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 5, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 6, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 7, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 8, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 9, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 10, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 11, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 12, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 13, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 14, tileset: 'walls3d', tileX: 2, tileY: 2, physical: true },
        { x: 0, y: 1, tileset: 'walls3d', tileX: 2, tileY: 1, physical: true },
        { x: 0, y: 0, tileset: 'walls3d', tileX: 2, tileY: 0, physical: true },
        { x: 4, y: 0, tileset: 'walls3d', tileX: 3, tileY: 2, physical: true },
    ]
};

// Build a lookup map for faster floor rendering
const HUB_FLOOR_MAP = new Map();
HUB_FLOOR.tiles.forEach(tile => {
    HUB_FLOOR_MAP.set(`${tile.x},${tile.y}`, tile);
});

// Zone definitions - Liminal Hotel
const ZONES = {
    hub: {
        name: 'Lobby',
        width: 1008,   // 21 tiles * 48px
        height: 720,   // 15 tiles * 48px
        startX: 504,
        startY: 360,
        isHub: true,
        wallColor: '#c9b896',     // Beige walls
        floorColor: '#b5a589',    // Carpet beige
        totalLevels: 1,
        walls: [
            // No walls - floor tiles define the boundaries
        ],
        portals: [],
        npcs: [],
        objects: HUB_OBJECTS
    },
    training: {
        name: 'Room 101',
        width: 1000,
        height: 800,
        startX: 500,
        startY: 700,
        wallColor: '#c9b896',     // Beige walls
        floorColor: '#7a8b6e',    // Green carpet (different room, different carpet)
        totalLevels: 1,
        walls: [
            // Outer boundary
            { x: 0, y: 0, width: 1000, height: 40 },
            { x: 0, y: 0, width: 40, height: 800 },
            { x: 0, y: 760, width: 1000, height: 40 },
            { x: 960, y: 0, width: 40, height: 800 }
        ],
        portals: [
            { id: 'hub', x: 470, y: 720, width: 60, height: 80, label: 'Lobby' }
        ],
        enemies: [
            { x: 500, y: 400, stationary: true, passive: true, hp: 100, maxHp: 100 }
        ],
        items: [
            { id: 'flashlight', name: 'Flashlight', icon: '🔦', x: 530, y: 520 },
            { id: 'battery', name: 'Battery', icon: '🔋', x: 420, y: 320 }
        ]
    },
    elevator: {
        name: 'Elevator',
        width: 400,
        height: 400,
        startX: 200,
        startY: 300,
        wallColor: '#8a8078',     // Metal walls
        floorColor: '#5a5550',    // Dark floor
        totalLevels: 1,
        walls: [
            // Outer boundary (small elevator room)
            { x: 0, y: 0, width: 400, height: 40 },
            { x: 0, y: 0, width: 40, height: 400 },
            { x: 0, y: 360, width: 400, height: 40 },
            { x: 360, y: 0, width: 40, height: 400 }
        ],
        portals: [
            { id: 'hub', x: 170, y: 320, width: 60, height: 80, label: 'Lobby' }
        ]
    }
};
