// Main application logic
const USERNAME_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9 _-]*[A-Za-z0-9])?$/;
const MAX_USERNAME_LENGTH = 32;

let game = null;
let networkManager = null;
let currentUsername = '';
let currentRoomPlayers = [];
let currentProfile = null;
let playerUpdateInterval = null; // Track interval to prevent leaks
let enemySyncInterval = null; // Track enemy sync interval
let currentHostId = null; // Track the current host ID across game creation
let browseManager = null; // Separate connection for browsing room list
let inventorySaveTimeout = null;

// Helper function to update balance display
function updateBalanceDisplay(balance) {
    const balanceEl = document.getElementById('profileBalanceAmount');
    const hudBalanceEl = document.getElementById('hudBalanceAmount');
    if (balanceEl) balanceEl.textContent = Number(balance).toFixed(2);
    if (hudBalanceEl) hudBalanceEl.textContent = Number(balance).toFixed(2);
}

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
        if (username.length > MAX_USERNAME_LENGTH) {
            alert(`Username must be ${MAX_USERNAME_LENGTH} characters or less`);
            return;
        }
        if (!USERNAME_PATTERN.test(username)) {
            alert('Username must start and end with alphanumeric characters and can only contain letters, numbers, spaces, underscores, and hyphens');
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
        
        // Start browsing for available rooms
        startRoomBrowsing();
    });

    // Main menu - Create new lobby
    document.getElementById('multiPlayerBtn').addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }
        currentUsername = username;
        
        // Stop browsing before joining
        stopRoomBrowsing();
        
        // Initialize network
        if (!networkManager) {
            networkManager = new NetworkManager();
            try {
                await networkManager.connect();
                
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
    
    document.getElementById('recallBtn').addEventListener('click', () => {
        recallToHub();
    });

    // Lobby
    document.getElementById('startAdventureBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.startGame();
        }
        startGame('hub');
    });
    
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
        if (networkManager) {
            networkManager.leaveRoom();
            networkManager.disconnect();
            networkManager = null;
        }
        if (playerUpdateInterval) {
            clearInterval(playerUpdateInterval);
            playerUpdateInterval = null;
        }
        stopEnemySyncInterval();
        // Clean up game instance to prevent memory leaks from event listeners
        if (game) {
            game.destroy();
            game = null;
        }
        currentHostId = null;
        showScreen('menu');

        // Resume room browsing
        startRoomBrowsing();
    });
    
}

function setupNetworkHandlers() {
    networkManager.onRoomUpdate = (data) => {
        updatePlayersList(data.players);
        currentRoomPlayers = data.players || [];
        if (game && networkManager) {
            // Only sync players that are in the same zone as the local player
            const localZoneId = game.zoneId || 'hub';
            const zonePlayers = currentRoomPlayers.filter(p => p.zone === localZoneId);
            game.syncMultiplayerPlayers(zonePlayers, networkManager.playerId);
            hydrateRoomAvatars(zonePlayers);
        }
        // Update host status from room_update
        if (data.hostId && networkManager) {
            updateHostStatus(data.hostId);
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
        startGame('hub');
    };

    networkManager.onZoneEnter = (data) => {
        // This is for the LOCAL player entering a zone
        if (game && data.zoneId && data.playerId === networkManager.playerId) {
            const zonePlayers = data.zonePlayers || [];
            game.transitionZone(data.zoneId, zonePlayers, networkManager.playerId);
        }
    };

    networkManager.onPlayerZoneChange = (data) => {
        // Another player changed zones - update tracking, don't transition local player
        if (!game || !data.playerId || !data.zoneId) return;

        // Update the player's zone in currentRoomPlayers
        const playerInfo = currentRoomPlayers.find(p => p.id === data.playerId);
        if (playerInfo) {
            playerInfo.zone = data.zoneId;
        }

        // If they left our zone, remove them from game.players
        const localZoneId = game.zoneId || 'hub';
        if (data.zoneId !== localZoneId) {
            game.players = game.players.filter(p => p.id !== data.playerId);
        }
    };
    
    networkManager.onBalanceUpdate = (data) => {
        updateBalanceDisplay(data.balance);
    };
    
    networkManager.onEnemyRespawn = (data) => {
        if (game && data.enemyId && data.zone) {
            // Re-add the enemy to the game
            // Note: Zone IDs are lowercase keys (e.g., 'hub', 'training')
            const zoneData = ZONES[data.zone];
            if (zoneData && zoneData.enemies) {
                // Find the enemy config - enemyId format: "zonename-enemy-index"
                const enemyIndex = parseInt(data.enemyId.split('-').pop());
                if (!isNaN(enemyIndex) && enemyIndex >= 0 && enemyIndex < zoneData.enemies.length) {
                    const enemyConfig = zoneData.enemies[enemyIndex];
                    const enemy = new Enemy(enemyConfig.x, enemyConfig.y, data.enemyId, {
                        stationary: enemyConfig.stationary,
                        passive: enemyConfig.passive,
                        hp: enemyConfig.hp,
                        maxHp: enemyConfig.maxHp
                    });
                    game.enemies.push(enemy);
                }
            }
        }
    };
    
    networkManager.onEnemySync = (data) => {
        if (game && !game.isHost) {
            game.applyEnemySync(data.enemies);
        }
    };
    
    networkManager.onHostAssigned = (data) => {
        if (data.hostId && networkManager) {
            updateHostStatus(data.hostId);
        }
    };
    
    networkManager.onEnemyDamage = (data) => {
        // Host receives damage reports from other players
        if (game && game.isHost && data.enemyId && typeof data.damage === 'number') {
            const enemy = game.enemies.find(e => e.id === data.enemyId);
            if (enemy) {
                enemy.takeDamage(data.damage);
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

function updateHostStatus(hostId) {
    currentHostId = hostId;
    if (!game || !networkManager) return;
    const wasHost = game.isHost;
    game.isHost = (networkManager.playerId === hostId);
    
    if (game.isHost && !wasHost) {
        // Start enemy sync interval when becoming host
        startEnemySyncInterval();
    } else if (!game.isHost && wasHost) {
        // Stop enemy sync interval when losing host status
        stopEnemySyncInterval();
    }
}

function startEnemySyncInterval() {
    stopEnemySyncInterval();
    enemySyncInterval = setInterval(() => {
        if (game && game.running && game.isHost && networkManager && networkManager.connected) {
            if (game.enemies.length > 0) {
                networkManager.sendEnemySync(game.enemies.map(e => ({
                    id: e.id,
                    x: e.x,
                    y: e.y,
                    hp: e.hp,
                    maxHp: e.maxHp,
                    stunned: e.stunned,
                    stunnedTime: e.stunnedTime,
                    attackCooldown: e.attackCooldown
                })));
            }
        }
    }, 100); // 10 sync updates per second for enemies
}

function stopEnemySyncInterval() {
    if (enemySyncInterval) {
        clearInterval(enemySyncInterval);
        enemySyncInterval = null;
    }
}

async function startRoomBrowsing() {
    stopRoomBrowsing();
    
    const browserEl = document.getElementById('roomBrowser');
    if (browserEl) browserEl.style.display = 'block';
    
    browseManager = new NetworkManager();
    try {
        await browseManager.connect();
        browseManager.onRoomList = (data) => {
            renderRoomList(data.rooms || []);
        };
        browseManager.requestRoomList();
    } catch (error) {
        console.error('Failed to connect for room browsing:', error);
        renderRoomList([]);
    }
}

function stopRoomBrowsing() {
    if (browseManager) {
        browseManager.disconnect();
        browseManager = null;
    }
    const browserEl = document.getElementById('roomBrowser');
    if (browserEl) browserEl.style.display = 'none';
}

function renderRoomList(rooms) {
    const listEl = document.getElementById('roomList');
    if (!listEl) return;
    
    if (!rooms || rooms.length === 0) {
        listEl.innerHTML = '<p class="room-list-empty">No lobbies available</p>';
        return;
    }
    
    listEl.innerHTML = '';
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-list-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'room-info';

        const nameDiv = document.createElement('div');
        nameDiv.textContent = room.players.join(', ');
        if (room.started) {
            const statusSpan = document.createElement('span');
            statusSpan.className = 'room-status';
            statusSpan.textContent = ' (In Progress)';
            nameDiv.appendChild(statusSpan);
        }
        infoDiv.appendChild(nameDiv);

        const countDiv = document.createElement('div');
        countDiv.className = 'room-players';
        countDiv.textContent = `${room.playerCount}/${room.maxPlayers} players`;
        infoDiv.appendChild(countDiv);

        const joinLabel = document.createElement('span');
        joinLabel.className = 'join-label';
        joinLabel.textContent = 'Join ▸';

        item.appendChild(infoDiv);
        item.appendChild(joinLabel);
        item.addEventListener('click', () => joinExistingRoom(room.roomId));
        listEl.appendChild(item);
    });
}

async function joinExistingRoom(roomId) {
    if (!currentUsername) {
        alert('Please enter your name first');
        return;
    }
    
    // Stop browsing before joining
    stopRoomBrowsing();
    
    if (!networkManager) {
        networkManager = new NetworkManager();
        try {
            await networkManager.connect();
            
            const playerId = 'player-' + Math.random().toString(36).substring(2, 11);
            
            networkManager.joinRoom(roomId, playerId, currentUsername);
            
            document.getElementById('roomCode').textContent = roomId;
            
            setupNetworkHandlers();
            showScreen('lobby');
        } catch (error) {
            alert('Failed to connect to server.');
            showScreen('menu');
        }
    }
}

async function loadProfile(username) {
    try {
        const res = await fetch(`/api/profile?name=${encodeURIComponent(username)}`);
        if (!res.ok) {
            console.error('Profile load failed:', res.status);
            return;
        }
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
        if (game) {
            game.setInventory(data.inventory || []);
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

function scheduleInventorySave(inventory) {
    if (!currentUsername) return;
    if (inventorySaveTimeout) {
        clearTimeout(inventorySaveTimeout);
    }

    inventorySaveTimeout = setTimeout(async () => {
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUsername,
                    inventory
                })
            });
            if (response.ok) {
                const data = await response.json();
                if (currentProfile) {
                    currentProfile.inventory = Array.isArray(data.inventory) ? data.inventory : inventory;
                }
            }
        } catch (error) {
            console.error('Failed to save inventory:', error);
        }
    }, 300);
}

async function hydrateRoomAvatars(players) {
    if (!game || !players) return;
    const targets = players.filter(p => {
        if (!p || !p.username) return false;
        const playerObj = game.players.find(player => player.username === p.username);
        return playerObj && !playerObj.avatarUrl;
    });
    if (targets.length === 0) return;

    // Fetch all needed avatars in parallel
    const fetches = targets.map(p =>
        fetch(`/api/profile?name=${encodeURIComponent(p.username)}`)
            .then(res => res.json())
            .catch(() => null)
    );
    const results = await Promise.all(fetches);
    results.forEach((data, i) => {
        if (!data || !data.character || !data.character.dataURL) return;
        const targetUsername = targets[i].username;
        const playerObj = game.players.find(player => player.username === targetUsername);
        if (playerObj) playerObj.setAvatar(data.character.dataURL);
    });
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

function startGame(zoneName) {
    if (!game) {
        game = new Game();
    }
    
    const playerId = networkManager ? networkManager.playerId : 'player1';
    game.init(zoneName, currentUsername, playerId);
    game.onPortalEnter = (targetZoneId) => {
        if (networkManager) {
            networkManager.enterZone(targetZoneId);
        } else {
            console.error('No network connection for portal transition');
        }
    };
    
    // Wire up enemy kill callback
    game.onEnemyKilled = (enemyId, zone) => {
        if (networkManager && networkManager.connected) {
            networkManager.sendEnemyKilled(enemyId, zone);
        }
    };
    
    // Wire up enemy damage callback for non-host players
    game.onEnemyDamage = (enemyId, damage) => {
        if (networkManager && networkManager.connected) {
            networkManager.sendEnemyDamage(enemyId, damage);
        }
    };
    game.onInventoryChanged = (inventory) => {
        scheduleInventorySave(inventory);
    };

    if (currentProfile && Array.isArray(currentProfile.inventory)) {
        game.setInventory(currentProfile.inventory);
    }
    
    showScreen('game');
    game.start();
    
    // Send updates to server
    if (networkManager) {
        // Apply stored host status (room_update may have arrived before game was created)
        if (currentHostId) {
            updateHostStatus(currentHostId);
        }
        
        // Only sync players in the same zone (hub for initial game start)
        const localZoneId = game.zoneId || 'hub';
        const zonePlayers = currentRoomPlayers.filter(p => p.zone === localZoneId);
        game.syncMultiplayerPlayers(zonePlayers, networkManager.playerId);
        
        // Clear previous interval to prevent leaks
        if (playerUpdateInterval) {
            clearInterval(playerUpdateInterval);
            playerUpdateInterval = null;
        }

        // Track last sent state to avoid redundant updates
        let lastSentState = null;
        
        playerUpdateInterval = setInterval(() => {
            if (game.localPlayer && game.running) {
                const currentState = game.localPlayer.getState();
                
                // Only send if state has changed significantly
                if (!lastSentState || hasSignificantChange(lastSentState, currentState)) {
                    networkManager.sendPlayerUpdate(currentState);
                    lastSentState = currentState;
                }
            }
        }, 100); // 10 updates per second (reduced from 20)
    }
}

// Helper function to check if player state has changed significantly
function hasSignificantChange(oldState, newState) {
    const positionThreshold = 2; // pixels
    const angleThreshold = 0.1; // radians (~5.7 degrees)
    const dx = Math.abs(newState.x - oldState.x);
    const dy = Math.abs(newState.y - oldState.y);
    const dAngle = Math.abs(newState.angle - oldState.angle);
    return dx > positionThreshold ||
           dy > positionThreshold ||
           dAngle > angleThreshold ||
           oldState.stunned !== newState.stunned ||
           oldState.zoneLevel !== newState.zoneLevel;
}

function recallToHub() {
    if (!game) return;
    if (game.zone && game.zone.isHub) return;

    if (networkManager) {
        networkManager.enterZone('hub');
    } else {
        console.error('No network connection for recall');
    }
}
