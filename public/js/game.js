// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 1200;
        this.canvas.height = 800;
        
        this.players = [];
        this.localPlayer = null;
        this.zone = null;
        this.abilityManager = new ItemManager();
        
        this.keys = {};
        this.running = false;
        this.gameStarted = false;
        this.gameStartTime = null;
        this.countdown = 3;
        this.countdownTimer = null;
        this.score = 0;
        
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
            
            // Use ability with Space
            if (key === ' ') {
                if (this.localPlayer && this.localPlayer.currentItem) {
                    const result = this.localPlayer.useItem(this.enemies);
                    if (result && result.type === 'fireball') {
                        this.abilityManager.addHazard(result);
                    }
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const key = normalizeKey(e);
            this.keys[key] = false;
        });
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
        this.keys = {};
        this.score = 0;
        
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
        if (!isMultiplayer) {
            for (let i = 1; i < 4; i++) {
                const enemy = new Player(
                    this.zone.startX + (i * 120) - 180,
                    this.zone.startY + 200,
                    colors[i],
                    'enemy' + i,
                    'Enemy ' + i
                );
                enemy.isAI = true;
                this.players.push(enemy);
                this.enemies.push(enemy);
            }
        }
        
        this.gameStarted = false;
        this.countdown = 3;
        
        // Start countdown
        this.startCountdown();
    }
    
    startCountdown() {
        const countdownEl = document.getElementById('countdown');
        let count = 3;
        
        countdownEl.textContent = count;
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.textContent = count;
            } else if (count === 0) {
                countdownEl.textContent = 'GO!';
                this.gameStarted = true;
                this.gameStartTime = Date.now();
                setTimeout(() => {
                    countdownEl.textContent = '';
                }, 1000);
                clearInterval(interval);
            }
        }, 1000);
    }
    
    update() {
        if (!this.gameStarted) return;
        
        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(this.keys, this.zone);
            this.zone.checkPickup(this.localPlayer, this.abilityManager);
        }
        
        // Update enemies
        this.enemies.forEach(enemy => {
            this.updateEnemy(enemy);
            enemy.update({}, this.zone);
            this.zone.checkPickup(enemy, this.abilityManager);
        });
        
        // Update abilities/hazards
        this.abilityManager.update(this.players);
        
        // Check enemy defeats and update score
        this.checkEnemyDefeats();
        
        // Update camera (follow local player)
        if (this.localPlayer) {
            this.cameraX = this.localPlayer.x - this.canvas.width / 2;
            this.cameraY = this.localPlayer.y - this.canvas.height / 2;
        }
        
        // Update UI
        this.updateUI();
        
        // Check game over
        this.checkGameOver();
    }
    
    updateEnemy(enemy) {
        // Simple AI: patrol and chase player
        if (!this.localPlayer) return;
        
        const dx = this.localPlayer.x - enemy.x;
        const dy = this.localPlayer.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        
        // Chase player if within range
        if (dist < 400) {
            const targetAngle = Math.atan2(dy, dx);
            
            let angleDiff = targetAngle - enemy.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            const aiKeys = {
                'ArrowUp': true,
                'ArrowLeft': angleDiff < -0.1,
                'ArrowRight': angleDiff > 0.1
            };
            
            enemy.update(aiKeys, this.zone);
        } else {
            // Wander randomly
            if (Math.random() < 0.02) {
                enemy.angle += (Math.random() - 0.5) * 0.5;
            }
            const aiKeys = { 'ArrowUp': Math.random() > 0.3 };
            enemy.update(aiKeys, this.zone);
        }
        
        // Enemy uses abilities randomly
        if (enemy.currentItem && Math.random() < 0.02) {
            const result = enemy.useItem(this.players);
            if (result && result.type === 'fireball') {
                this.abilityManager.addHazard(result);
            }
        }
    }
    
    checkEnemyDefeats() {
        this.enemies = this.enemies.filter(enemy => {
            if (enemy.stunned && enemy.stunnedTime <= 0) {
                this.score += 100;
                return false;
            }
            return true;
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
        if (currentHPEl) currentHPEl.textContent = Math.max(0, 100 - (this.localPlayer.stunned ? 20 : 0));
        if (maxHPEl) maxHPEl.textContent = '100';
        
        // Update score
        if (this.gameStartTime) {
            const elapsed = Date.now() - this.gameStartTime;
            this.score = Math.floor(elapsed / 100) + (this.localPlayer.nodesVisited.length * 50);
            const scoreEl = document.getElementById('gameScore');
            if (scoreEl) scoreEl.textContent = this.score;
        }
        
        // Update ability display
        const itemEl = document.getElementById('currentItem');
        if (this.localPlayer.currentItem) {
            const itemType = this.localPlayer.currentItem.type;
            itemEl.textContent = ITEM_TYPES[itemType].icon;
        } else {
            itemEl.textContent = '';
        }
    }
    
    checkGameOver() {
        // Check if player has explored all nodes and completed the zone
        if (this.localPlayer && this.localPlayer.zoneLevel > this.zone.totalLevels && !this.localPlayer.finishTime) {
            this.localPlayer.finishTime = Date.now() - this.gameStartTime;
            this.endGame();
        }
    }
    
    endGame() {
        this.running = false;
        
        // Show results
        const resultsEl = document.getElementById('resultsContent');
        let html = '<div class="results-list">';
        
        html += `
            <div class="result-item">
                <span class="result-name">${this.localPlayer.username}</span>
                <span class="result-score">Score: ${this.score}</span>
            </div>
            <div class="result-item">
                <span class="result-name">Areas Explored</span>
                <span class="result-score">${this.localPlayer.zoneLevel - 1}</span>
            </div>
            <div class="result-item">
                <span class="result-name">Time</span>
                <span class="result-score">${Math.floor(this.localPlayer.finishTime / 60000)}:${String(((this.localPlayer.finishTime % 60000) / 1000).toFixed(1)).padStart(5, '0')}</span>
            </div>
        `;
        
        html += '</div>';
        resultsEl.innerHTML = html;
        
        document.getElementById('gameResults').classList.remove('hidden');
        
        // Save result to server
        if (this.localPlayer && this.localPlayer.finishTime) {
            fetch('/api/game-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.localPlayer.username,
                    areaName: this.zone.name,
                    score: this.score,
                    levelReached: this.localPlayer.zoneLevel - 1
                })
            }).catch(err => console.error('Failed to save game result:', err));
        }
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw zone
        if (this.zone) {
            this.zone.draw(this.ctx, this.cameraX, this.cameraY);
        }
        
        // Draw abilities/effects
        this.abilityManager.draw(this.ctx, this.cameraX, this.cameraY);
        
        // Draw players and enemies
        this.players.forEach(player => {
            player.draw(this.ctx, this.cameraX, this.cameraY);
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
