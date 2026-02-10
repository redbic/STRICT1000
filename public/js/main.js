// Main application logic
let game = null;
let networkManager = null;
let currentUsername = '';

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // Check for saved username
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
        document.getElementById('username').value = savedUsername;
    }
});

function setupEventListeners() {
    // Main menu
    document.getElementById('singlePlayerBtn').addEventListener('click', () => {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }
        currentUsername = username;
        localStorage.setItem('username', username);
        
        // Register player
        fetch('/api/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        }).catch(err => console.error('Failed to register player:', err));
        
        showScreen('areaSelect');
    });
    
    document.getElementById('multiPlayerBtn').addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }
        currentUsername = username;
        localStorage.setItem('username', username);
        
        // Initialize network
        if (!networkManager) {
            networkManager = new NetworkManager();
            try {
                await networkManager.connect();
                
                // Generate room ID
                const roomId = 'room-' + Math.random().toString(36).substring(2, 11);
                const playerId = 'player-' + Math.random().toString(36).substring(2, 11);
                
                networkManager.joinRoom(roomId, playerId, username);
                
                document.getElementById('roomCode').textContent = roomId;
                
                setupNetworkHandlers();
                showScreen('lobby');
            } catch (error) {
                alert('Failed to connect to server. Playing single player instead.');
                showScreen('areaSelect');
            }
        }
    });
    
    document.getElementById('leaderboardBtn').addEventListener('click', async () => {
        showScreen('leaderboard');
        await loadLeaderboard();
    });
    
    // Track selection
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', () => {
            const zoneName = card.dataset.zone;
            startGame(zoneName);
        });
    });
    
    document.getElementById('backToMenuBtn').addEventListener('click', () => {
        showScreen('menu');
    });
    
    // Lobby
    document.getElementById('startAdventureBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.startGame();
        }
        startGame('forest', true);
    });
    
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.leaveRoom();
        }
        showScreen('menu');
    });
    
    // Leaderboard
    document.getElementById('backFromLeaderboardBtn').addEventListener('click', () => {
        showScreen('menu');
    });
    
    // Game results
    document.getElementById('returnToMenuBtn').addEventListener('click', () => {
        if (game) {
            game.stop();
        }
        showScreen('menu');
    });
}

function setupNetworkHandlers() {
    networkManager.onRoomUpdate = (data) => {
        updatePlayersList(data.players);
    };
    
    networkManager.onPlayerState = (data) => {
        if (game) {
            const player = game.players.find(p => p.id === data.playerId);
            if (player && player !== game.localPlayer) {
                player.setState(data.state);
            }
        }
    };
    
    networkManager.onGameStart = (data) => {
        startGame('forest', true);
    };
    
    networkManager.onAbilityUsed = (data) => {
        if (game) {
            const player = game.players.find(p => p.id === data.playerId);
            if (player) {
                const result = player.useItem(game.players);
                if (result && result.type === 'fireball') {
                    game.abilityManager.addHazard(result);
                }
            }
        }
    };
    
    networkManager.onPlayerLeft = (data) => {
        if (game) {
            game.players = game.players.filter(p => p.id !== data.playerId);
        }
    };

    networkManager.onRoomFull = (data) => {
        alert(`Room is full. Max party size is ${data.maxPlayers}.`);
        networkManager.disconnect();
        networkManager = null;
        showScreen('menu');
    };
}

function updatePlayersList(players) {
    const listEl = document.getElementById('playersList');
    listEl.innerHTML = '<h3>Players:</h3>';
    
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        playerDiv.textContent = player.username;
        listEl.appendChild(playerDiv);
    });
}

function startGame(trackName, isMultiplayer = false) {
    if (!game) {
        game = new Game();
    }
    
    game.init(trackName, currentUsername, isMultiplayer);
    showScreen('game');
    game.start();
    
    // Send updates to server if multiplayer
    if (isMultiplayer && networkManager) {
        setInterval(() => {
            if (game.localPlayer && game.running) {
                networkManager.sendPlayerUpdate(game.localPlayer.getState());
            }
        }, 50); // 20 updates per second
    }
}

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        
        const listEl = document.getElementById('leaderboardList');
        
        if (data.length === 0) {
            listEl.innerHTML = '<p>No records yet. Be the first!</p>';
            return;
        }
        
        listEl.innerHTML = '';
        
        data.forEach((player, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'leaderboard-item';
            
            const rankSpan = document.createElement('span');
            rankSpan.className = 'leaderboard-rank';
            rankSpan.textContent = index + 1;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'leaderboard-name';
            nameSpan.textContent = player.username;
            
            const statsSpan = document.createElement('span');
            statsSpan.className = 'leaderboard-stats';
            statsSpan.innerHTML = `High Score: ${player.high_score} | Best: ${player.best_score || 'N/A'}`;
            
            itemDiv.appendChild(rankSpan);
            itemDiv.appendChild(nameSpan);
            itemDiv.appendChild(statsSpan);
            
            listEl.appendChild(itemDiv);
        });
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
        document.getElementById('leaderboardList').innerHTML = '<p>Failed to load leaderboard</p>';
    }
}
