// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        this.players = [];
        this.localPlayer = null;
        this.zone = null;
        
        this.keys = {};
        this.running = false;
        this.gameStarted = false;
        
        this.cameraX = 0;
        this.cameraY = 0;
        
        this.enemies = [];
        
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

        window.addEventListener('keydown', (e) => {
            const key = normalizeKey(e);
            this.keys[key] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
                e.preventDefault();
            }
            
            // Melee attack with Space
            if (key === ' ' && this.localPlayer) {
                this.localPlayer.tryAttack(this.enemies);
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const key = normalizeKey(e);
            this.keys[key] = false;
        });

        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    init(zoneName, playerName, isMultiplayer = false) {
        // Load zone
        const zoneData = ZONES[zoneName];
        if (!zoneData) {
            console.error('Zone not found:', zoneName);
            return;
        }
        
        this.zone = new Zone(zoneData);
        this.players = [];
        this.enemies = [];
        this.lastPortalId = null;
        this.portalCooldown = 0;
        this.keys = {};
        
        // Create local player
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
        this.localPlayer = new Player(
            this.zone.startX,
            this.zone.startY,
            colors[0],
            'player1',
            playerName
        );
        this.players.push(this.localPlayer);
        
        // Add enemies for single player
        if (!isMultiplayer && this.zone.allowEnemies !== false) {
            const enemyCount = this.zone.enemyCount || 3;
            for (let i = 1; i <= enemyCount; i++) {
                const enemy = new Enemy(
                    this.zone.startX + (i * 120) - 180,
                    this.zone.startY + 200,
                    'enemy-' + i
                );
                this.enemies.push(enemy);
            }
        }
        
        this.gameStarted = true;
    }
    
    update() {
        if (!this.gameStarted) return;

        if (this.keys[' '] && this.localPlayer) {
            this.localPlayer.tryAttack(this.enemies);
        }
        
        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(this.keys, this.zone);
        }
        
        // Update enemies
        this.enemies.forEach(enemy => {
            enemy.update(this.zone, this.localPlayer);
        });
        
        // No abilities or pickups for now
        
        // Check enemy defeats
        this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
        
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

        if (this.onPortalEnter) {
            this.onPortalEnter(portal.id);
        } else {
            this.transitionZone(portal.id, false);
        }

        this.lastPortalId = portal.id;
        this.portalCooldown = 30;
    }

    transitionZone(zoneName, isMultiplayer, roster = [], localId = '') {
        this.init(zoneName, this.localPlayer ? this.localPlayer.username : 'Player', isMultiplayer);
        if (isMultiplayer) {
            this.syncMultiplayerPlayers(roster, localId);
        }
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
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw zone
        if (this.zone) {
            this.zone.draw(this.ctx, this.cameraX, this.cameraY);
        }
        
        // Draw players and enemies
        this.players.forEach(player => {
            player.draw(this.ctx, this.cameraX, this.cameraY);
        });

        this.enemies.forEach(enemy => {
            enemy.draw(this.ctx, this.cameraX, this.cameraY);
        });
    }
    
    gameLoop() {
        if (this.running) {
            this.update();
            this.draw();
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
}
