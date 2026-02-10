// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 1200;
        this.canvas.height = 800;
        
        this.players = [];
        this.localPlayer = null;
        this.track = null;
        this.itemManager = new ItemManager();
        
        this.keys = {};
        this.running = false;
        this.raceStarted = false;
        this.raceStartTime = null;
        this.countdown = 3;
        this.countdownTimer = null;
        
        this.cameraX = 0;
        this.cameraY = 0;
        
        this.aiPlayers = [];
        
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
            
            // Use item with Space
            if (key === ' ') {
                if (this.localPlayer && this.localPlayer.currentItem) {
                    const result = this.localPlayer.useItem(this.players);
                    if (result && result.type === 'banana') {
                        this.itemManager.addHazard(result);
                    }
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const key = normalizeKey(e);
            this.keys[key] = false;
        });
    }
    
    init(trackName, playerName, isMultiplayer = false) {
        // Load track
        const trackData = TRACKS[trackName];
        if (!trackData) {
            console.error('Track not found:', trackName);
            return;
        }
        
        this.track = new Track(trackData);
        this.players = [];
        this.aiPlayers = [];
        this.keys = {};
        
        // Create local player
        const colors = ['#ff0000', '#0000ff', '#00ff00', '#ffff00', '#ff00ff', '#00ffff'];
        this.localPlayer = new Player(
            this.track.startX,
            this.track.startY,
            colors[0],
            'player1',
            playerName
        );
        this.players.push(this.localPlayer);
        
        // Add AI players for single player
        if (!isMultiplayer) {
            for (let i = 1; i < 4; i++) {
                const aiPlayer = new Player(
                    this.track.startX + (i * 40) - 60,
                    this.track.startY + 50,
                    colors[i],
                    'ai' + i,
                    'CPU ' + i
                );
                aiPlayer.isAI = true;
                this.players.push(aiPlayer);
                this.aiPlayers.push(aiPlayer);
            }
        }
        
        this.raceStarted = false;
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
                this.raceStarted = true;
                this.raceStartTime = Date.now();
                setTimeout(() => {
                    countdownEl.textContent = '';
                }, 1000);
                clearInterval(interval);
            }
        }, 1000);
    }
    
    update() {
        if (!this.raceStarted) return;
        
        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(this.keys, this.track);
            this.track.checkItemBox(this.localPlayer, this.itemManager);
        }
        
        // Update AI players
        this.aiPlayers.forEach(ai => {
            this.updateAI(ai);
            ai.update({}, this.track);
            this.track.checkItemBox(ai, this.itemManager);
        });
        
        // Update items
        this.itemManager.update(this.players);
        
        // Update positions
        this.updatePositions();
        
        // Update camera (follow local player)
        if (this.localPlayer) {
            this.cameraX = this.localPlayer.x - this.canvas.width / 2;
            this.cameraY = this.localPlayer.y - this.canvas.height / 2;
        }
        
        // Update UI
        this.updateUI();
        
        // Check race finish
        this.checkRaceFinish();
    }
    
    updateAI(ai) {
        // Simple AI: follow waypoints
        const checkpoints = this.track.checkpoints;
        const nextCheckpointIndex = ai.checkpoints.length % checkpoints.length;
        const target = checkpoints[nextCheckpointIndex];
        
        const dx = (target.x + target.width/2) - ai.x;
        const dy = (target.y + target.height/2) - ai.y;
        const targetAngle = Math.atan2(dy, dx);
        
        let angleDiff = targetAngle - ai.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Simulate key presses
        const aiKeys = {
            'ArrowUp': true,
            'ArrowLeft': angleDiff < -0.1,
            'ArrowRight': angleDiff > 0.1
        };
        
        ai.update(aiKeys, this.track);
        
        // AI uses items randomly
        if (ai.currentItem && Math.random() < 0.02) {
            const result = ai.useItem(this.players);
            if (result && result.type === 'banana') {
                this.itemManager.addHazard(result);
            }
        }
    }
    
    updatePositions() {
        // Sort players by progress (lap and checkpoints)
        const sortedPlayers = [...this.players].sort((a, b) => {
            if (a.lap !== b.lap) return b.lap - a.lap;
            return b.checkpoints.length - a.checkpoints.length;
        });
        
        sortedPlayers.forEach((player, index) => {
            player.position = index + 1;
        });
    }
    
    updateUI() {
        if (!this.localPlayer) return;
        
        document.getElementById('currentLap').textContent = Math.min(this.localPlayer.lap, this.track.totalLaps);
        document.getElementById('totalLaps').textContent = this.track.totalLaps;
        document.getElementById('position').textContent = this.localPlayer.position;
        document.getElementById('totalPlayers').textContent = this.players.length;
        
        // Update time
        if (this.raceStartTime) {
            const elapsed = Date.now() - this.raceStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            document.getElementById('raceTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Update item display
        const itemEl = document.getElementById('currentItem');
        if (this.localPlayer.currentItem) {
            const itemType = this.localPlayer.currentItem.type;
            itemEl.textContent = ITEM_TYPES[itemType].icon;
        } else {
            itemEl.textContent = '';
        }
    }
    
    checkRaceFinish() {
        this.players.forEach(player => {
            if (player.lap > this.track.totalLaps && !player.finishTime) {
                player.finishTime = Date.now() - this.raceStartTime;
                
                if (player === this.localPlayer) {
                    this.endRace();
                }
            }
        });
    }
    
    endRace() {
        this.running = false;
        
        // Sort by finish time
        const finishedPlayers = this.players
            .filter(p => p.finishTime)
            .sort((a, b) => a.finishTime - b.finishTime);
        
        // Show results
        const resultsEl = document.getElementById('resultsContent');
        let html = '<div class="results-list">';
        
        finishedPlayers.forEach((player, index) => {
            const minutes = Math.floor(player.finishTime / 60000);
            const seconds = String(((player.finishTime % 60000) / 1000).toFixed(3)).padStart(6, '0');
            html += `
                <div class="result-item">
                    <span class="result-position">${index + 1}.</span>
                    <span class="result-name">${player.username}</span>
                    <span class="result-time">${minutes}:${seconds}</span>
                </div>
            `;
        });
        
        html += '</div>';
        resultsEl.innerHTML = html;
        
        document.getElementById('raceResults').classList.remove('hidden');
        
        // Save result to server
        if (this.localPlayer && this.localPlayer.finishTime) {
            fetch('/api/race-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.localPlayer.username,
                    trackName: this.track.name,
                    raceTime: this.localPlayer.finishTime,
                    position: this.localPlayer.position
                })
            }).catch(err => console.error('Failed to save race result:', err));
        }
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw track
        if (this.track) {
            this.track.draw(this.ctx, this.cameraX, this.cameraY);
        }
        
        // Draw items
        this.itemManager.draw(this.ctx, this.cameraX, this.cameraY);
        
        // Draw players
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
