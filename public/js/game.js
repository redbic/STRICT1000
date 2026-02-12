// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameContainer = document.getElementById('game');
        this.resizeCanvas();
        
        this.players = [];
        this.localPlayer = null;
        this.zone = null;
        this.zoneId = null;
        this.npcs = [];
        this.inventory = [];
        this.inventoryOpen = false;
        this.inventoryMaxSlots = 16;
        
        this.keys = {};
        this.running = false;
        this.gameStarted = false;
        this.lastFrameTime = 0;
        this.deltaTime = 1/60; // Initialize to 60fps equivalent to prevent undefined on first frame
        
        this.cameraX = 0;
        this.cameraY = 0;
        
        this.enemies = [];
        this.projectiles = []; // Projectile weapon system
        this.hitSparks = []; // Visual effects for projectile hits
        this.lastMouse = { x: 0, y: 0 };
        this.onEnemyKilled = null; // Callback for when an enemy is killed
        this.isHost = false; // Whether this client is the host (authoritative for enemies)
        this.onEnemyDamage = null; // Callback for sending enemy damage to host (non-host players)
        
        // Performance optimization: cache darkness overlay canvas
        this.darknessCanvas = null;
        this.lastVisibilityRadius = 0;
        this.playerGlowCanvas = null; // Cache player glow effect
        
        // Bind keyboard events
        const normalizeKey = (event) => {
            if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
                return ' ';
            }
            if (event.key.length === 1) {
                return event.key.toLowerCase();
            }
            return event.key;
        };

        // Store bound event handlers for cleanup
        this.handleKeyDown = (e) => {
            const key = normalizeKey(e);
            this.keys[key] = true;
            if (key === 'i') {
                this.toggleInventory();
                e.preventDefault();
            }
            if (key === 'r' && this.localPlayer) {
                this.localPlayer.reload();
                e.preventDefault();
            }
            // Debug: Press F3 to log player stats
            if (e.code === 'F3' && this.localPlayer) {
                const p = this.localPlayer;
                console.log('Player Debug:', {
                    maxSpeed: p.maxSpeed,
                    acceleration: p.acceleration,
                    friction: p.friction,
                    velocityX: p.velocityX,
                    velocityY: p.velocityY,
                    stunned: p.stunned,
                    deltaTime: this.deltaTime,
                    fps: Math.round(1 / this.deltaTime)
                });
                e.preventDefault();
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
                e.preventDefault();
            }
        };
        
        this.handleKeyUp = (e) => {
            const key = normalizeKey(e);
            this.keys[key] = false;
        };

        this.handleBlur = () => {
            this.keys = {};
        };

        this.handleVisibilityChange = () => {
            if (document.hidden) {
                this.keys = {};
            }
        };

        this.handleMouseMove = (e) => {
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
        };

        this.handleMouseDown = (e) => {
            if (e.button === 2) {
                e.preventDefault();
                return;
            }
            if (e.button !== 0 || !this.localPlayer) return;

            const worldX = this.lastMouse.x + this.cameraX;
            const worldY = this.lastMouse.y + this.cameraY;
            const angle = Math.atan2(worldY - this.localPlayer.y, worldX - this.localPlayer.x);

            // Fire projectile
            const proj = this.localPlayer.fireProjectile(angle);
            if (proj) {
                this.projectiles.push(proj);
            }
        };

        this.handleResize = () => {
            this.resizeCanvas();
        };

        this.handleContextMenu = (e) => {
            e.preventDefault();
        };

        // Attach event listeners
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleBlur);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('resize', this.handleResize);
        // Prevent context menu on game container to avoid accidental triggers during intense gameplay
        this.gameContainer.addEventListener('contextmenu', this.handleContextMenu);
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    init(zoneName, playerName, playerId) {
        // Load zone
        const zoneData = ZONES[zoneName];
        if (!zoneData) {
            console.error('Zone not found:', zoneName);
            return;
        }
        
        this.zone = new Zone(zoneData);
        this.zoneId = zoneName; // Store the zone key for network matching
        this.players = [];
        this.enemies = [];
        this.projectiles = []; // Clear projectiles on zone change
        this.hitSparks = []; // Clear hit sparks
        this.npcs = (zoneData.npcs || []).map(n => new NPC(n.x, n.y, n.name, n.color));
        this.lastPortalId = null;
        this.portalCooldown = 0;
        this.keys = {};
        
        // Spawn enemies from zone data
        if (zoneData.enemies && Array.isArray(zoneData.enemies)) {
            zoneData.enemies.forEach((enemyData, index) => {
                const enemyId = `${zoneName}-enemy-${index}`;
                const enemy = new Enemy(enemyData.x, enemyData.y, enemyId, {
                    stationary: enemyData.stationary,
                    passive: enemyData.passive,
                    hp: enemyData.hp,
                    maxHp: enemyData.maxHp
                });
                this.enemies.push(enemy);
            });
        }
        
        // Create local player with network-assigned ID
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
        this.localPlayer = new Player(
            this.zone.startX,
            this.zone.startY,
            colors[0],
            playerId || 'player1',
            playerName
        );
        this.players.push(this.localPlayer);
        this.renderInventoryUI();
        
        this.gameStarted = true;
    }
    
    update() {
        if (!this.gameStarted) return;

        const dt = this.deltaTime || 1/60;

        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(this.keys, this.zone, dt);
            this.handlePickupCollision();
        }

        // Interpolate remote players toward their latest server state
        this.players.forEach(player => {
            if (player !== this.localPlayer) {
                player.interpolateRemote(dt);
            }
        });

        // Update projectiles
        this.updateProjectiles(dt);

        // Update hit sparks
        this.updateHitSparks(dt);

        // Only the host runs enemy AI; non-host clients receive synced state
        if (this.isHost) {
            // Find the nearest player for each enemy to chase (all players, not just local)
            this.enemies.forEach(enemy => {
                const nearestPlayer = this.getNearestPlayer(enemy);
                enemy.update(this.zone, nearestPlayer, dt);
            });
        }

        // Check enemy defeats
        const newlyDead = this.enemies.filter(enemy => enemy.hp <= 0);
        this.enemies = this.enemies.filter(enemy => enemy.hp > 0);

        // Notify about kills (only host reports kills to prevent double rewards)
        if (this.isHost) {
            newlyDead.forEach(enemy => {
                if (this.onEnemyKilled) {
                    this.onEnemyKilled(enemy.id, this.zoneId || 'unknown');
                }
            });
        }
        
        // Update camera (follow local player)
        if (this.localPlayer) {
            this.cameraX = this.localPlayer.x - this.canvas.width / 2;
            this.cameraY = this.localPlayer.y - this.canvas.height / 2;
        }
        
        // Update UI
        this.updateUI();
        
        // Handle portals
        this.handlePortalTransitions();

        // No end screen during exploration
    }

    handlePickupCollision() {
        if (!this.zone || !this.localPlayer || !Array.isArray(this.zone.items) || this.zone.items.length === 0) return;
        if (this.inventory.length >= this.inventoryMaxSlots) return;

        const pickedItem = this.zone.popPickupAt(this.localPlayer.x, this.localPlayer.y, 18);
        if (!pickedItem) return;

        this.addInventoryItem({
            id: pickedItem.id || `item-${Date.now()}`,
            name: pickedItem.name || 'Unknown Item',
            icon: pickedItem.icon || '📦'
        });
    }

    setInventory(items) {
        if (!Array.isArray(items)) {
            this.inventory = [];
            this.renderInventoryUI();
            return;
        }
        this.inventory = items.slice(0, this.inventoryMaxSlots).map(item => ({
            id: item.id,
            name: item.name,
            icon: item.icon || '📦'
        }));
        this.renderInventoryUI();
    }

    addInventoryItem(item) {
        if (!item || this.inventory.length >= this.inventoryMaxSlots) return false;
        this.inventory.push(item);
        this.renderInventoryUI();
        if (this.onInventoryChanged) {
            this.onInventoryChanged(this.inventory.slice());
        }
        return true;
    }

    toggleInventory() {
        this.inventoryOpen = !this.inventoryOpen;
        const panel = document.getElementById('inventoryPanel');
        if (panel) {
            panel.classList.toggle('open', this.inventoryOpen);
        }
    }

    renderInventoryUI() {
        const grid = document.getElementById('inventoryGrid');
        const hotbar = document.getElementById('hotbarSlots');
        if (!grid || !hotbar) return;

        grid.innerHTML = '';
        hotbar.innerHTML = '';
        for (let i = 0; i < this.inventoryMaxSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            const item = this.inventory[i];
            if (item) {
                slot.textContent = item.icon || '📦';
                slot.title = item.name || 'Item';
            }
            grid.appendChild(slot);

            if (i < 4) {
                const hotbarSlot = document.createElement('div');
                hotbarSlot.className = 'hotbar-slot';
                if (item) {
                    hotbarSlot.textContent = item.icon || '📦';
                    hotbarSlot.title = item.name || 'Item';
                }
                hotbar.appendChild(hotbarSlot);
            }
        }
    }

    getNearestPlayer(enemy) {
        let nearest = null;
        let minDist = Infinity;
        this.players.forEach(player => {
            if (player.hp <= 0) return;
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = player;
            }
        });
        return nearest;
    }

    applyEnemySync(enemyStates) {
        if (!Array.isArray(enemyStates)) return;
        enemyStates.forEach(state => {
            const enemy = this.enemies.find(e => e.id === state.id);
            if (enemy) {
                enemy.x = state.x;
                enemy.y = state.y;
                enemy.hp = state.hp;
                enemy.maxHp = state.maxHp;
                enemy.stunned = state.stunned;
                enemy.stunnedTime = state.stunnedTime;
                enemy.attackCooldown = state.attackCooldown;
            }
        });
        // Remove enemies that are dead according to host
        this.enemies = this.enemies.filter(e => e.hp > 0);
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.update(dt, this.zone);

            // Check enemy collisions
            if (proj.alive) {
                for (const enemy of this.enemies) {
                    if (this.checkProjectileHit(proj, enemy)) {
                        // Create hit spark effect
                        this.createHitSpark(proj.x, proj.y);

                        if (this.isHost) {
                            // Host applies damage directly
                            enemy.takeDamage(proj.damage);
                        } else if (this.onEnemyDamage) {
                            // Non-host sends damage to host via network
                            this.onEnemyDamage(enemy.id, proj.damage);
                        }
                        proj.alive = false;
                        break;
                    }
                }
            }

            if (!proj.alive) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    checkProjectileHit(proj, enemy) {
        const dx = enemy.x - proj.x;
        const dy = enemy.y - proj.y;
        const dist = Math.hypot(dx, dy);
        const enemyRadius = (enemy.width || 20) / 2;
        return dist < proj.radius + enemyRadius;
    }

    createHitSpark(x, y) {
        const sparkCount = 6;
        for (let i = 0; i < sparkCount; i++) {
            const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5;
            const speed = 50 + Math.random() * 80;
            this.hitSparks.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.2
            });
        }
    }

    updateHitSparks(dt) {
        for (let i = this.hitSparks.length - 1; i >= 0; i--) {
            const spark = this.hitSparks[i];
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            spark.vx *= 0.95;
            spark.vy *= 0.95;
            spark.life -= dt;
            if (spark.life <= 0) {
                this.hitSparks.splice(i, 1);
            }
        }
    }

    drawProjectiles() {
        for (const proj of this.projectiles) {
            proj.draw(this.ctx, this.cameraX, this.cameraY);
        }
    }

    drawHitSparks() {
        for (const spark of this.hitSparks) {
            const screenX = spark.x - this.cameraX;
            const screenY = spark.y - this.cameraY;
            const alpha = Math.min(1, spark.life * 3);

            this.ctx.fillStyle = `rgba(255, 220, 100, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    handlePortalTransitions() {
        if (!this.zone || !this.localPlayer) return;
        if (this.portalCooldown > 0) {
            this.portalCooldown--;
            return;
        }

        const portal = this.zone.getPortalAt(this.localPlayer.x, this.localPlayer.y);
        if (!portal) {
            this.lastPortalId = null;
            return;
        }
        if (this.lastPortalId === portal.id) return;
        
        // Check if portal is locked
        if (portal.locked) {
            this.lastPortalId = portal.id;
            this.portalCooldown = 30;
            return;
        }

        if (this.onPortalEnter) {
            this.onPortalEnter(portal.id);
        } else {
            this.transitionZone(portal.id, false);
        }

        this.lastPortalId = portal.id;
        this.portalCooldown = 30;
    }

    transitionZone(zoneName, roster = [], localId = '') {
        const playerId = localId || (this.localPlayer ? this.localPlayer.id : '');
        this.init(zoneName, this.localPlayer ? this.localPlayer.username : 'Player', playerId);
        this.syncMultiplayerPlayers(roster, localId);
    }

    syncMultiplayerPlayers(roster, localId) {
        if (!Array.isArray(roster)) return;

        const existing = new Map(this.players.map(p => [p.id, p]));
        roster.forEach(playerInfo => {
            if (playerInfo.id === localId) return;
            if (existing.has(playerInfo.id)) return;

            const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
            const color = colors[existing.size % colors.length];
            const remotePlayer = new Player(
                this.zone.startX + (existing.size * 30) - 60,
                this.zone.startY + 40,
                color,
                playerInfo.id,
                playerInfo.username
            );
            this.players.push(remotePlayer);
        });
    }
    
    updateUI() {
        if (!this.localPlayer) return;
        
        const levelEl = document.getElementById('currentDepth');
        const totalLevelsEl = document.getElementById('totalDepth');
        const currentHPEl = document.getElementById('currentHP');
        const maxHPEl = document.getElementById('maxHP');
        
        if (levelEl) levelEl.textContent = Math.min(this.localPlayer.zoneLevel, this.zone.totalLevels);
        if (totalLevelsEl) totalLevelsEl.textContent = this.zone.totalLevels;
        if (currentHPEl) currentHPEl.textContent = Math.max(0, this.localPlayer.hp);
        if (maxHPEl) maxHPEl.textContent = this.localPlayer.maxHp;
        
        // Ability display disabled for now
    }
    
    
    draw() {
        // Clear canvas (defensive programming in case zone doesn't fill entire canvas)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw zone
        if (this.zone) {
            this.zone.draw(this.ctx, this.cameraX, this.cameraY);
        }
        
        // Draw players and enemies with visibility culling
        this.players.forEach(player => {
            const playerRect = {
                x: player.x - player.width/2,
                y: player.y - player.height/2,
                width: player.width,
                height: player.height
            };
            if (!this.zone || this.zone.isVisible(playerRect, this.cameraX, this.cameraY, 
                                                   this.canvas.width, this.canvas.height)) {
                player.draw(this.ctx, this.cameraX, this.cameraY);
            }
        });

        this.enemies.forEach(enemy => {
            const enemyRect = {
                x: enemy.x - enemy.width/2,
                y: enemy.y - enemy.height/2,
                width: enemy.width,
                height: enemy.height
            };
            if (!this.zone || this.zone.isVisible(enemyRect, this.cameraX, this.cameraY,
                                                   this.canvas.width, this.canvas.height)) {
                enemy.draw(this.ctx, this.cameraX, this.cameraY);
            }
        });

        // Draw NPCs with visibility culling
        this.npcs.forEach(npc => {
            const npcRect = {
                x: npc.x - npc.width/2,
                y: npc.y - npc.height/2,
                width: npc.width,
                height: npc.height
            };
            if (!this.zone || this.zone.isVisible(npcRect, this.cameraX, this.cameraY,
                                                    this.canvas.width, this.canvas.height)) {
                npc.draw(this.ctx, this.cameraX, this.cameraY);
            }
        });

        // Draw projectiles and effects
        this.drawProjectiles();
        this.drawHitSparks();
        
        // Apply darkness overlay for The Gallery (ruleset: darkness)
        if (this.zone && this.zone.ruleset === 'darkness' && this.localPlayer) {
            this.drawDarknessOverlay();
        }
    }
    
    
    createDarknessCanvas(radius) {
        const canvas = document.createElement('canvas');
        const size = radius * 2 + 100; // Add margin for gradient
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const center = size / 2;
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        return canvas;
    }
    
    createPlayerGlowCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');
        
        const center = 40;
        
        // Draw glowing dot
        ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(center, center, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw glow effect
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, 30);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(center, center, 30, 0, Math.PI * 2);
        ctx.fill();
        
        return canvas;
    }
    
    drawDarknessOverlay() {
        if (!this.zone.visibilityRadius) return;
        
        // Create or update darkness canvas if visibility radius changed
        if (!this.darknessCanvas || this.lastVisibilityRadius !== this.zone.visibilityRadius) {
            this.darknessCanvas = this.createDarknessCanvas(this.zone.visibilityRadius);
            this.lastVisibilityRadius = this.zone.visibilityRadius;
        }
        
        // Create player glow canvas if not exists
        if (!this.playerGlowCanvas) {
            this.playerGlowCanvas = this.createPlayerGlowCanvas();
        }
        
        const playerScreenX = this.localPlayer.x - this.cameraX;
        const playerScreenY = this.localPlayer.y - this.cameraY;
        
        // Save context
        this.ctx.save();
        
        // Draw darkness over everything
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Cut out the visibility circle using pre-rendered canvas
        this.ctx.globalCompositeOperation = 'destination-out';
        const halfSize = this.darknessCanvas.width / 2;
        this.ctx.drawImage(
            this.darknessCanvas,
            playerScreenX - halfSize,
            playerScreenY - halfSize
        );
        
        // Restore context
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Draw glowing dots for other players using cached canvas
        this.players.forEach(player => {
            if (player.id === this.localPlayer.id) return; // Skip local player
            
            const otherScreenX = player.x - this.cameraX;
            const otherScreenY = player.y - this.cameraY;
            
            // Draw pre-rendered player glow
            this.ctx.drawImage(
                this.playerGlowCanvas,
                otherScreenX - 40,
                otherScreenY - 40
            );
        });
        
        this.ctx.restore();
    }



    gameLoop(timestamp) {
        if (this.running) {
            const dt = this.lastFrameTime ? (timestamp - this.lastFrameTime) / 1000 : 1/60;
            this.lastFrameTime = timestamp;
            this.deltaTime = Math.min(dt, 0.1); // Cap at 100ms to prevent spiral

            try {
                this.update();
                this.draw();
            } catch (error) {
                console.error('Game loop error:', error);
            }
            requestAnimationFrame((ts) => this.gameLoop(ts));
        }
    }
    
    start() {
        this.running = true;
        this.lastFrameTime = 0;
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    stop() {
        this.running = false;
    }
    
    destroy() {
        // Stop game loop
        this.stop();
        
        // Remove all event listeners
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('blur', this.handleBlur);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('resize', this.handleResize);
        this.gameContainer.removeEventListener('contextmenu', this.handleContextMenu);
    }
}
