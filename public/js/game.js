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
        this.attackFx = { active: false, timer: 0, angle: 0 };
        this.lastMouse = { x: 0, y: 0 };
        this.onEnemyKilled = null; // Callback for when an enemy is killed
        this.isHost = false; // Whether this client is the host (authoritative for enemies)
        this.onEnemyDamage = null; // Callback for sending enemy damage to host (non-host players)
        
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
                this.attackEnemiesRemote();
                didAttack = true; // Assume success for visual feedback
            }
            
            // Show attack effect only if attack was attempted
            if (didAttack) {
                this.attackFx.active = true;
                this.attackFx.timer = 8;
                this.attackFx.angle = angle;
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
        if (!this.localPlayer || this.localPlayer.attackCooldown > 0) return;
        this.localPlayer.attackCooldown = 25;
        
        this.enemies.forEach(enemy => {
            const dist = Math.hypot(enemy.x - this.localPlayer.x, enemy.y - this.localPlayer.y);
            if (dist <= this.localPlayer.attackRange && this.onEnemyDamage) {
                this.onEnemyDamage(enemy.id, this.localPlayer.attackDamage);
            }
        });
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
    }

    drawAttackFx() {
        if (!this.attackFx.active || !this.localPlayer) return;
        if (this.attackFx.timer <= 0) {
            this.attackFx.active = false;
            return;
        }

        const centerX = this.localPlayer.x - this.cameraX;
        const centerY = this.localPlayer.y - this.cameraY;
        const radius = 36;
        const spread = Math.PI / 3;
        const start = this.attackFx.angle - spread / 2;
        const end = this.attackFx.angle + spread / 2;

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 220, 180, 0.9)';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, start, end);
        this.ctx.stroke();
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
