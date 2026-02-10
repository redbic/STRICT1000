// Main application logic
let game = null;
let networkManager = null;
let currentUsername = '';
let currentRoomPlayers = [];
let currentProfile = null;

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
    const multiBtn = document.getElementById('multiPlayerBtn');
    multiBtn.disabled = true;

    document.getElementById('confirmNameBtn').addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }
        currentUsername = username;
        localStorage.setItem('username', username);

        await loadProfile(username);

        // Register player
        fetch('/api/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        }).catch(err => console.error('Failed to register player:', err));

        multiBtn.disabled = false;
        multiBtn.click();
    });

    // Main menu
    document.getElementById('multiPlayerBtn').addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }
        currentUsername = username;
        
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
                alert('Failed to connect to server.');
                showScreen('menu');
            }
        }
    });
    
    
    document.getElementById('enterHubBtn').addEventListener('click', () => {
        startGame('hub');
    });

    document.getElementById('backToMenuBtn').addEventListener('click', () => {
        showScreen('menu');
    });

    document.getElementById('recallBtn').addEventListener('click', () => {
        recallToHub();
    });

    // Lobby
    document.getElementById('startAdventureBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.startGame();
        }
        startGame('hub', true);
    });
    
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.leaveRoom();
        }
        showScreen('menu');
    });
    
}

function setupNetworkHandlers() {
    networkManager.onRoomUpdate = (data) => {
        updatePlayersList(data.players);
        currentRoomPlayers = data.players || [];
        if (game && networkManager) {
            game.syncMultiplayerPlayers(currentRoomPlayers, networkManager.playerId);
            hydrateRoomAvatars(currentRoomPlayers);
        }
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
        startGame('hub', true);
    };

    networkManager.onZoneEnter = (data) => {
        if (game && data.zoneId) {
            game.transitionZone(data.zoneId, true, currentRoomPlayers, networkManager.playerId);
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

async function loadProfile(username) {
    try {
        const res = await fetch(`/api/profile?name=${encodeURIComponent(username)}`);
        const data = await res.json();
        currentProfile = data;

        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = data.name || username;

        const balance = typeof data.balance === 'number' ? data.balance : null;
        const balanceEl = document.getElementById('profileBalanceAmount');
        const hudBalanceEl = document.getElementById('hudBalanceAmount');
        if (balanceEl) balanceEl.textContent = balance !== null ? balance.toFixed(2) : '—';
        if (hudBalanceEl) hudBalanceEl.textContent = balance !== null ? balance.toFixed(2) : '—';

        const avatarUrl = data.character && data.character.dataURL ? data.character.dataURL : '';
        updateAvatar('profileAvatarImg', 'profileAvatarPlaceholder', avatarUrl);
        updateAvatar('hudAvatarImg', 'hudAvatarPlaceholder', avatarUrl);
        if (game && game.localPlayer) {
            game.localPlayer.setAvatar(avatarUrl);
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function hydrateRoomAvatars(players) {
    if (!game || !players) return;
    const targets = players.filter(p => p && p.username);
    for (const p of targets) {
        const playerObj = game.players.find(player => player.username === p.username);
        if (!playerObj) continue;
        if (playerObj.avatarUrl) continue;
        try {
            const res = await fetch(`/api/profile?name=${encodeURIComponent(p.username)}`);
            const data = await res.json();
            if (data && data.character && data.character.dataURL) {
                playerObj.setAvatar(data.character.dataURL);
            }
        } catch (err) {
            console.error('Failed to hydrate avatar:', err);
        }
    }
}

function updateAvatar(imgId, placeholderId, avatarUrl) {
    const img = document.getElementById(imgId);
    const placeholder = document.getElementById(placeholderId);
    if (!img || !placeholder) return;

    if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
    }
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

function startGame(zoneName, isMultiplayer = false) {
    if (!game) {
        game = new Game();
    }
    
    game.init(zoneName, currentUsername, isMultiplayer);
    game.onPortalEnter = (targetZoneId) => {
        if (isMultiplayer && networkManager) {
            networkManager.enterZone(targetZoneId);
        } else {
            game.transitionZone(targetZoneId, false);
        }
    };
    showScreen('game');
    game.start();
    
    // Send updates to server if multiplayer
    if (isMultiplayer && networkManager) {
        game.syncMultiplayerPlayers(currentRoomPlayers, networkManager.playerId);
        setInterval(() => {
            if (game.localPlayer && game.running) {
                networkManager.sendPlayerUpdate(game.localPlayer.getState());
            }
        }, 50); // 20 updates per second
    }
}

function recallToHub() {
    if (!game) return;
    if (game.zone && game.zone.isHub) return;

    if (networkManager) {
        networkManager.enterZone('hub');
    } else {
        game.transitionZone('hub', false);
    }
}

