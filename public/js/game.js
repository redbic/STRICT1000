// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        this.players = [];
        this.localPlayer = null;
        this.zone = null;
        this.zoneId = null;
        this.npcs = [];
        
        this.keys = {};
        this.running = false;
        this.gameStarted = false;
        
        this.cameraX = 0;
        this.cameraY = 0;
        
        this.enemies = [];
        this.attackFx = { active: false, timer: 0, angle: 0, hit: false, sparks: [] };
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
            
            // Only show attack visual if not on cooldown
            if (this.localPlayer.attackCooldown > 0) return;

            const worldX = this.lastMouse.x + this.cameraX;
            const worldY = this.lastMouse.y + this.cameraY;
            const angle = Math.atan2(worldY - this.localPlayer.y, worldX - this.localPlayer.x);
            
            let didAttack = false;
            if (this.isHost) {
                // Host applies damage directly
                didAttack = this.localPlayer.tryAttack(this.enemies);
            } else {
                // Non-host sends damage to host via network
                didAttack = this.attackEnemiesRemote();
            }
            
            // Show attack effect for every swing, with stronger effect on hit
            this.attackFx.active = true;
            this.attackFx.timer = 12;
            this.attackFx.angle = angle;
            this.attackFx.hit = didAttack;
            this.attackFx.sparks = didAttack ? this.createAttackSparks(angle) : [];
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
        this.canvas.addEventListener('contextmenu', this.handleContextMenu);
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
        
        this.gameStarted = true;
    }
    
    update() {
        if (!this.gameStarted) return;

        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(this.keys, this.zone);
        }
        
        // Only the host runs enemy AI; non-host clients receive synced state
        if (this.isHost) {
            // Find the nearest player for each enemy to chase (all players, not just local)
            this.enemies.forEach(enemy => {
                const nearestPlayer = this.getNearestPlayer(enemy);
                enemy.update(this.zone, nearestPlayer);
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

    attackEnemiesRemote() {
        if (!this.localPlayer || this.localPlayer.attackCooldown > 0) return false;

        // Keep cooldown semantics aligned with host/local tryAttack: a swing attempt
        // consumes cooldown, but we only surface hit feedback when targets are in range.
        this.localPlayer.attackCooldown = 25;
        this.localPlayer.attackAnimTimer = 10;

        let sentDamage = false;
        this.enemies.forEach(enemy => {
            const dist = Math.hypot(enemy.x - this.localPlayer.x, enemy.y - this.localPlayer.y);
            if (dist <= this.localPlayer.attackRange && this.onEnemyDamage) {
                this.onEnemyDamage(enemy.id, this.localPlayer.attackDamage);
                sentDamage = true;
            }
        });

        return sentDamage;
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

        // Draw NPCs
        this.npcs.forEach(npc => {
            npc.draw(this.ctx, this.cameraX, this.cameraY);
        });

        this.drawAttackFx();
        
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


    createAttackSparks(angle) {
        if (!this.localPlayer) return [];
        const sparks = [];
        const tipDistance = this.localPlayer.attackRange * 0.8;
        const originX = this.localPlayer.x + Math.cos(angle) * tipDistance;
        const originY = this.localPlayer.y + Math.sin(angle) * tipDistance;
        for (let i = 0; i < 7; i++) {
            const variance = (Math.random() - 0.5) * 0.8;
            const speed = 1.8 + Math.random() * 2.4;
            sparks.push({
                x: originX,
                y: originY,
                vx: Math.cos(angle + variance) * speed,
                vy: Math.sin(angle + variance) * speed,
                life: 8 + Math.floor(Math.random() * 6)
            });
        }
        return sparks;
    }

    drawAttackFx() {
        if (!this.attackFx.active || !this.localPlayer) return;
        if (this.attackFx.timer <= 0) {
            this.attackFx.active = false;
            return;
        }

        const centerX = this.localPlayer.x - this.cameraX;
        const centerY = this.localPlayer.y - this.cameraY;
        const progress = 1 - (this.attackFx.timer / 12);
        const baseRadius = 26;
        const slashLength = this.localPlayer.attackRange * 0.9;
        const spread = Math.PI / 2.4;
        const leadAngle = this.attackFx.angle - spread / 2 + spread * progress;

        this.ctx.save();

        // Motion blur trail
        for (let i = 0; i < 4; i++) {
            const t = i / 4;
            const radius = baseRadius + (slashLength - baseRadius) * (progress - t * 0.12);
            const clampedRadius = Math.max(baseRadius, radius);
            this.ctx.strokeStyle = `rgba(255, ${220 - i * 20}, ${150 - i * 10}, ${0.35 - i * 0.07})`;
            this.ctx.lineWidth = 7 - i;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, clampedRadius, leadAngle - 0.35, leadAngle + 0.2);
            this.ctx.stroke();
        }

        // Bright slash edge
        this.ctx.strokeStyle = this.attackFx.hit ? 'rgba(255, 255, 245, 0.95)' : 'rgba(255, 230, 210, 0.9)';
        this.ctx.lineWidth = 2.2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, baseRadius + slashLength * progress, leadAngle - 0.25, leadAngle + 0.12);
        this.ctx.stroke();

        // Hit sparks
        this.attackFx.sparks = (this.attackFx.sparks || []).filter((spark) => spark.life > 0);
        this.attackFx.sparks.forEach((spark) => {
            spark.x += spark.vx;
            spark.y += spark.vy;
            spark.vx *= 0.92;
            spark.vy *= 0.92;
            spark.life--;

            const sx = spark.x - this.cameraX;
            const sy = spark.y - this.cameraY;
            this.ctx.fillStyle = `rgba(255, 245, 200, ${Math.max(0, spark.life / 14)})`;
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.restore();

        this.attackFx.timer--;
    }

    gameLoop() {
        if (this.running) {
            try {
                this.update();
                this.draw();
            } catch (error) {
                console.error('Game loop error:', error);
                // Continue running to prevent total freeze
            }
            requestAnimationFrame(() => this.gameLoop());
        }
    }
    
    start() {
        this.running = true;
        this.gameLoop();
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
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }
}
