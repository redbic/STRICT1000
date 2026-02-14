// Main application logic
// Uses centralized CONFIG from config/constants.js
const USERNAME_PATTERN = (typeof CONFIG !== 'undefined' && CONFIG.USERNAME_PATTERN)
  ? CONFIG.USERNAME_PATTERN
  : /^[A-Za-z0-9]([A-Za-z0-9 _-]*[A-Za-z0-9])?$/;
const MAX_USERNAME_LENGTH = (typeof CONFIG !== 'undefined' && CONFIG.MAX_USERNAME_LENGTH)
  ? CONFIG.MAX_USERNAME_LENGTH
  : 32;

// Consolidated game state to reduce global namespace pollution
const gameState = {
    game: null,
    networkManager: null,
    currentUsername: '',
    currentRoomPlayers: [],
    currentProfile: null,
    playerUpdateInterval: null, // Track interval to prevent leaks
    enemySyncInterval: null, // Track enemy sync interval
    currentHostId: null, // Track the current host ID across game creation
    browseManager: null, // Separate connection for browsing room list
    inventorySaveTimeout: null,
    selectedCharacter: 1 // Default to character 1 (range: 1-7 for players)
};

// Helper function to update balance display
function updateBalanceDisplay(balance) {
    const balanceEl = document.getElementById('profileBalanceAmount');
    const hudBalanceEl = document.getElementById('hudBalanceAmount');
    if (balanceEl) balanceEl.textContent = Number(balance).toFixed(2);
    if (hudBalanceEl) hudBalanceEl.textContent = Number(balance).toFixed(2);
}

// Initialize character selection grid
function initCharacterSelector() {
    const grid = document.getElementById('characterGrid');
    if (!grid) return;

    grid.innerHTML = '';

    // Characters 1-7 are for players
    for (let i = 1; i <= 7; i++) {
        const option = document.createElement('div');
        option.className = 'character-option' + (i === gameState.selectedCharacter ? ' selected' : '');
        option.dataset.character = i;

        // Create canvas for character preview
        const canvas = document.createElement('canvas');
        canvas.width = 48;  // 16 * 3 scale
        canvas.height = 64; // 32 * 2 scale (partial height for preview)
        option.appendChild(canvas);

        // Draw character preview
        drawCharacterPreview(canvas, i);

        option.addEventListener('click', () => selectCharacter(i));
        grid.appendChild(option);
    }
}

// Draw a character preview on a canvas
function drawCharacterPreview(canvas, characterNum) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Check if character sprites are loaded
    if (typeof characterSprites === 'undefined' || !characterSprites || !characterSprites.loaded) {
        // Fallback: draw a colored circle
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'];
        ctx.fillStyle = colors[(characterNum - 1) % colors.length];
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(characterNum, canvas.width / 2, canvas.height / 2 + 5);
        return;
    }

    const charName = 'character_' + characterNum.toString().padStart(2, '0');
    const sprite = characterSprites.sprites.get(charName);
    if (!sprite) return;

    // Draw idle_down frame 0
    const frameWidth = 16;
    const frameHeight = 32;
    const srcX = 18 * frameWidth; // idle_down starts at frame 18
    const srcY = 1 * frameHeight; // row 1 is idle

    ctx.drawImage(
        sprite.image,
        srcX, srcY, frameWidth, frameHeight,
        0, 0, canvas.width, canvas.height
    );
}

// Select a character
function selectCharacter(num) {
    gameState.selectedCharacter = num;
    localStorage.setItem('selectedCharacter', num);

    // Update UI
    document.querySelectorAll('.character-option').forEach(opt => {
        opt.classList.toggle('selected', parseInt(opt.dataset.character) === num);
    });
}

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Check for saved username
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
        document.getElementById('username').value = savedUsername;
    }

    // Check for saved character selection
    const savedCharacter = localStorage.getItem('selectedCharacter');
    if (savedCharacter) {
        gameState.selectedCharacter = parseInt(savedCharacter) || 1;
        // Clamp to valid range (1-7 for players)
        if (gameState.selectedCharacter < 1 || gameState.selectedCharacter > 7) {
            gameState.selectedCharacter = 1;
        }
    }

    // Load tilesets and character sprites in the background
    try {
        if (typeof initTilesets === 'function') {
            await initTilesets();
            console.log('Tilesets initialized');
        }
        if (typeof initCharacterSprites === 'function') {
            await initCharacterSprites();
            console.log('Character sprites initialized');
        }
    } catch (err) {
        console.warn('Failed to load tilesets/sprites, will use fallback rendering:', err);
    }

    // Initialize character selection grid after sprites are loaded
    initCharacterSelector();
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
        gameState.currentUsername = username;
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
        gameState.currentUsername = username;

        // Stop browsing before joining
        stopRoomBrowsing();

        // Initialize network
        if (!gameState.networkManager) {
            gameState.networkManager = new NetworkManager();
            try {
                await gameState.networkManager.connect();

                const roomId = 'room-' + Math.random().toString(36).substring(2, 11);
                const playerId = 'player-' + Math.random().toString(36).substring(2, 11);

                gameState.networkManager.joinRoom(roomId, playerId, username, gameState.selectedCharacter);
                
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
        if (gameState.networkManager) {
            gameState.networkManager.startGame();
        }
        startGame('hub');
    });
    
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
        if (gameState.networkManager) {
            gameState.networkManager.leaveRoom();
            gameState.networkManager.disconnect();
            gameState.networkManager = null;
        }
        if (gameState.playerUpdateInterval) {
            clearInterval(gameState.playerUpdateInterval);
            gameState.playerUpdateInterval = null;
        }
        stopEnemySyncInterval();
        // Clean up game instance to prevent memory leaks from event listeners
        if (gameState.game) {
            gameState.game.destroy();
            gameState.game = null;
        }
        gameState.currentHostId = null;
        showScreen('menu');

        // Resume room browsing
        startRoomBrowsing();
    });
    
}

function setupNetworkHandlers() {
    gameState.networkManager.onRoomUpdate = (data) => {
        updatePlayersList(data.players);
        gameState.currentRoomPlayers = data.players || [];
        if (gameState.game && gameState.networkManager) {
            // Only sync players that are in the same zone as the local player
            const localZoneId = gameState.game.zoneId || 'hub';
            const zonePlayers = gameState.currentRoomPlayers.filter(p => p.zone === localZoneId);
            gameState.game.syncMultiplayerPlayers(zonePlayers, gameState.networkManager.playerId);
            hydrateRoomAvatars(zonePlayers);
        }
        // Update host status from room_update
        if (data.hostId && gameState.networkManager) {
            updateHostStatus(data.hostId);
        }
    };

    gameState.networkManager.onPlayerState = (data) => {
        if (gameState.game && gameState.game.localPlayer) {
            // Never apply state to local player (check by ID, not reference)
            if (data.playerId === gameState.game.localPlayer.id) {
                return;
            }
            const player = gameState.game.players.find(p => p.id === data.playerId);
            if (player) {
                player.setState(data.state);
            }
        }
    };

    gameState.networkManager.onGameStart = (data) => {
        startGame('hub');
    };

    gameState.networkManager.onZoneEnter = async (data) => {
        // This is for the LOCAL player entering a zone
        if (gameState.game && data.zoneId && data.playerId === gameState.networkManager.playerId) {
            const zonePlayers = data.zonePlayers || [];
            const serverEnemies = data.enemies || null; // Server-authoritative enemy state

            // If we're already in this zone (initial game start), just sync enemies
            // Otherwise, do a full zone transition
            if (gameState.game.zoneId === data.zoneId && gameState.game.gameStarted) {
                // Already in this zone - just sync enemies from server
                if (serverEnemies && Array.isArray(serverEnemies)) {
                    gameState.game.enemies = serverEnemies.map(enemyData => {
                        return new Enemy(enemyData.x, enemyData.y, enemyData.id, {
                            stationary: enemyData.stationary,
                            passive: enemyData.passive,
                            hp: enemyData.hp,
                            maxHp: enemyData.maxHp
                        });
                    });
                }
                // Sync other players
                gameState.game.syncMultiplayerPlayers(zonePlayers, gameState.networkManager.playerId);
            } else {
                // Different zone - do full transition
                await gameState.game.transitionZone(data.zoneId, zonePlayers, gameState.networkManager.playerId, serverEnemies);
            }

            // Update our own zone in currentRoomPlayers BEFORE checking zone host status
            const selfInRoster = gameState.currentRoomPlayers.find(p => p.id === gameState.networkManager.playerId);
            if (selfInRoster) {
                selfInRoster.zone = data.zoneId;
            }

            // Update zone host status after zone change
            updateZoneHostStatus();
        }
    };

    gameState.networkManager.onPlayerZoneChange = (data) => {
        // Another player changed zones - update tracking, don't transition local player
        if (!gameState.game || !data.playerId || !data.zoneId) return;

        // Update the player's zone in currentRoomPlayers
        const playerInfo = gameState.currentRoomPlayers.find(p => p.id === data.playerId);
        if (playerInfo) {
            playerInfo.zone = data.zoneId;
        }

        // If the host changed zones, update zone host status
        if (data.playerId === gameState.currentHostId) {
            updateZoneHostStatus();
        }

        // If they left our zone, remove them from game.players
        // If they entered our zone, add them
        const localZoneId = gameState.game.zoneId || 'hub';
        if (data.zoneId !== localZoneId) {
            gameState.game.players = gameState.game.players.filter(p => p.id !== data.playerId);
        } else if (data.zoneId === localZoneId) {
            // Player entered our zone - add them if not already present
            // Never add local player as duplicate
            if (data.playerId === gameState.networkManager.playerId) return;

            const existingPlayer = gameState.game.players.find(p => p.id === data.playerId);
            if (!existingPlayer && playerInfo) {
                const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
                const color = colors[gameState.game.players.length % colors.length];
                const newPlayer = new Player(
                    gameState.game.zone.startX,
                    gameState.game.zone.startY,
                    color,
                    data.playerId,
                    playerInfo.username,
                    playerInfo.character
                );
                gameState.game.players.push(newPlayer);
            }
        }
    };

    gameState.networkManager.onBalanceUpdate = (data) => {
        updateBalanceDisplay(data.balance);
    };

    gameState.networkManager.onEnemyRespawn = (data) => {
        if (gameState.game && data.enemyId && data.zone) {
            // Only respawn if player is in the same zone
            if (gameState.game.zoneId !== data.zone) return;

            // Server sends full enemy state in new system
            if (data.enemy) {
                const enemyData = data.enemy;
                const enemy = new Enemy(enemyData.x, enemyData.y, data.enemyId, {
                    stationary: enemyData.stationary,
                    passive: enemyData.passive,
                    hp: enemyData.hp,
                    maxHp: enemyData.maxHp
                });
                gameState.game.enemies.push(enemy);
                return;
            }

            // Fallback for legacy respawn format (backward compatibility)
            const zoneData = typeof ZONES !== 'undefined' ? ZONES[data.zone] : null;
            if (zoneData && zoneData.enemies) {
                const enemyIndex = parseInt(data.enemyId.split('-').pop());
                if (!isNaN(enemyIndex) && enemyIndex >= 0 && enemyIndex < zoneData.enemies.length) {
                    const enemyConfig = zoneData.enemies[enemyIndex];
                    const enemy = new Enemy(enemyConfig.x, enemyConfig.y, data.enemyId, {
                        stationary: enemyConfig.stationary,
                        passive: enemyConfig.passive,
                        hp: enemyConfig.hp,
                        maxHp: enemyConfig.maxHp
                    });
                    gameState.game.enemies.push(enemy);
                }
            }
        }
    };

    // Server-authoritative enemy HP update
    gameState.networkManager.onEnemyStateUpdate = (data) => {
        if (!gameState.game || !data.enemyId) return;

        const enemy = gameState.game.enemies.find(e => e.id === data.enemyId);
        if (enemy) {
            enemy.hp = data.hp;
            if (data.maxHp !== undefined) {
                enemy.maxHp = data.maxHp;
            }
        }
    };

    // Server confirms enemy death - spawn death effects, then remove from game
    gameState.networkManager.onEnemyKilledSync = (data) => {
        if (!gameState.game || !data.enemyId) return;
        if (data.zone && gameState.game.zoneId !== data.zone) return;

        // Capture position before removal for death particles
        const enemy = gameState.game.enemies.find(e => e.id === data.enemyId);
        if (enemy) {
            gameState.game.spawnDeathParticles(enemy.x, enemy.y);
            gameState.game.triggerScreenShake(CONFIG.SCREEN_SHAKE_ENEMY_KILL, 0.1);
        }

        gameState.game.enemies = gameState.game.enemies.filter(e => e.id !== data.enemyId);
    };

    gameState.networkManager.onEnemySync = (data) => {
        // Apply enemy sync if we're not authoritative, OR during grace period after zone transition
        // Grace period allows zone host to hand off enemy state when main host enters their zone
        const inGracePeriod = gameState.game && gameState.game.zoneTransitionGrace > 0;
        const isAuthoritative = gameState.game && (gameState.game.isHost || gameState.game.isZoneHost);

        if (gameState.game && (!isAuthoritative || inGracePeriod)) {
            gameState.game.applyEnemySync(data.enemies);
        }
    };

    gameState.networkManager.onHostAssigned = (data) => {
        if (data.hostId && gameState.networkManager) {
            updateHostStatus(data.hostId);
        }
    };

    // Note: onEnemyDamage is no longer used - server handles all damage
    // Kept for potential backward compatibility with legacy messages
    gameState.networkManager.onEnemyDamage = () => {
        // Server-authoritative: damage is handled server-side now
        // Client receives enemy_state_update with new HP
    };

    gameState.networkManager.onPlayerLeft = (data) => {
        if (gameState.game) {
            gameState.game.players = gameState.game.players.filter(p => p.id !== data.playerId);
        }
    };

    gameState.networkManager.onRoomFull = (data) => {
        alert(`Room is full. Max party size is ${data.maxPlayers}.`);
        gameState.networkManager.disconnect();
        gameState.networkManager = null;
        showScreen('menu');
    };

    gameState.networkManager.onPlayerFire = (data) => {
        // Another player fired - spawn visual projectile
        if (gameState.game && data.playerId && data.playerId !== gameState.networkManager.playerId) {
            gameState.game.spawnRemoteProjectile(data.x, data.y, data.angle, data.playerId);
        }
    };

    gameState.networkManager.onChatMessage = (data) => {
        // Chat message received from another player
        if (gameState.game && data.playerId && data.playerId !== gameState.networkManager.playerId) {
            const player = gameState.game.players.find(p => p.id === data.playerId);
            if (player) {
                player.setSpeech(data.text);
                // Play TTS voice if available
                if (window.StrictHotelTTS) {
                    window.StrictHotelTTS.speakPlayerMessage(data.username, data.text);
                }
            }
        }
        // Add to chat history
        appendChatMessage(data.username, data.text);
    };
}

function updateHostStatus(hostId) {
    gameState.currentHostId = hostId;
    if (!gameState.game || !gameState.networkManager) return;
    const wasHost = gameState.game.isHost;
    gameState.game.isHost = (gameState.networkManager.playerId === hostId);

    if (gameState.game.isHost && !wasHost) {
        // Start enemy sync interval when becoming host
        startEnemySyncInterval();
    } else if (!gameState.game.isHost && wasHost) {
        // Stop enemy sync interval when losing host status
        stopEnemySyncInterval();
    }

    // Update zone host status
    updateZoneHostStatus();
}

function updateZoneHostStatus() {
    if (!gameState.game || !gameState.networkManager) return;

    // If we're the main host, we're authoritative for our zone
    if (gameState.game.isHost) {
        gameState.game.isZoneHost = false; // isHost takes precedence
        return;
    }

    // Check if the main host is in our zone
    const localZone = gameState.game.zoneId || 'hub';
    const hostPlayer = gameState.currentRoomPlayers.find(p => p.id === gameState.currentHostId);
    const hostZone = hostPlayer ? hostPlayer.zone : 'hub';

    const wasZoneHost = gameState.game.isZoneHost;

    // If host is in our zone, we're not zone host
    if (hostZone === localZone) {
        gameState.game.isZoneHost = false;
    } else {
        // Host is in a different zone - select ONE zone host deterministically
        // The player with the smallest ID in this zone becomes zone host
        const playersInMyZone = gameState.currentRoomPlayers
            .filter(p => p.zone === localZone && p.id !== gameState.currentHostId)
            .sort((a, b) => a.id.localeCompare(b.id));

        const zoneHostId = playersInMyZone.length > 0 ? playersInMyZone[0].id : null;
        gameState.game.isZoneHost = (zoneHostId === gameState.networkManager.playerId);
    }

    // Start/stop enemy sync based on zone host status change
    if (gameState.game.isZoneHost && !wasZoneHost) {
        console.log('Became zone host for zone:', localZone);
        startEnemySyncInterval();
    } else if (!gameState.game.isZoneHost && wasZoneHost && !gameState.game.isHost) {
        console.log('Lost zone host status - sending final enemy sync for handoff');
        // Send ONE final enemy sync to hand off position/AI state to the new authoritative player
        // Note: HP is server-authoritative, so we don't need to include it
        if (gameState.networkManager && gameState.networkManager.connected && gameState.game.enemies) {
            gameState.networkManager.sendEnemySync(gameState.game.enemies.map(e => ({
                id: e.id,
                x: e.x,
                y: e.y,
                stunned: e.stunned,
                stunnedTime: e.stunnedTime,
                attackCooldown: e.attackCooldown
            })));
        }
        stopEnemySyncInterval();
    }
}

function startEnemySyncInterval() {
    stopEnemySyncInterval();
    gameState.enemySyncInterval = setInterval(() => {
        // Both main host and zone host should send enemy syncs for position/AI state
        // But not during grace period (allows receiving handoff from previous zone host)
        const isAuthoritative = gameState.game && gameState.game.running && (gameState.game.isHost || gameState.game.isZoneHost);
        const inGracePeriod = gameState.game && gameState.game.zoneTransitionGrace > 0;

        if (isAuthoritative && !inGracePeriod && gameState.networkManager && gameState.networkManager.connected) {
            // Sync position and AI state only - HP is server-authoritative
            gameState.networkManager.sendEnemySync(gameState.game.enemies.map(e => ({
                id: e.id,
                x: e.x,
                y: e.y,
                // Note: HP excluded - server is authoritative for HP via enemy_state_update
                stunned: e.stunned,
                stunnedTime: e.stunnedTime,
                attackCooldown: e.attackCooldown
            })));
        }
    }, 100); // 10 sync updates per second for enemies
}

function stopEnemySyncInterval() {
    if (gameState.enemySyncInterval) {
        clearInterval(gameState.enemySyncInterval);
        gameState.enemySyncInterval = null;
    }
}

async function startRoomBrowsing() {
    stopRoomBrowsing();

    const browserEl = document.getElementById('roomBrowser');
    if (browserEl) browserEl.style.display = 'block';

    gameState.browseManager = new NetworkManager();
    try {
        await gameState.browseManager.connect();
        gameState.browseManager.onRoomList = (data) => {
            renderRoomList(data.rooms || []);
        };
        gameState.browseManager.requestRoomList();
    } catch (error) {
        console.error('Failed to connect for room browsing:', error);
        renderRoomList([]);
    }
}

function stopRoomBrowsing() {
    if (gameState.browseManager) {
        gameState.browseManager.disconnect();
        gameState.browseManager = null;
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
    if (!gameState.currentUsername) {
        alert('Please enter your name first');
        return;
    }

    // Stop browsing before joining
    stopRoomBrowsing();

    if (!gameState.networkManager) {
        gameState.networkManager = new NetworkManager();
        try {
            await gameState.networkManager.connect();

            const playerId = 'player-' + Math.random().toString(36).substring(2, 11);

            gameState.networkManager.joinRoom(roomId, playerId, gameState.currentUsername, gameState.selectedCharacter);

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
        gameState.currentProfile = data;

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
        if (gameState.game && gameState.game.localPlayer) {
            gameState.game.localPlayer.setAvatar(avatarUrl);
        }
        if (gameState.game) {
            gameState.game.setInventory(data.inventory || []);
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

function scheduleInventorySave(inventory) {
    if (!gameState.currentUsername) return;
    if (gameState.inventorySaveTimeout) {
        clearTimeout(gameState.inventorySaveTimeout);
    }

    gameState.inventorySaveTimeout = setTimeout(async () => {
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: gameState.currentUsername,
                    inventory
                })
            });
            if (response.ok) {
                const data = await response.json();
                if (gameState.currentProfile) {
                    gameState.currentProfile.inventory = Array.isArray(data.inventory) ? data.inventory : inventory;
                }
            }
        } catch (error) {
            console.error('Failed to save inventory:', error);
        }
    }, 300);
}

async function hydrateRoomAvatars(players) {
    if (!gameState.game || !players) return;
    const targets = players.filter(p => {
        if (!p || !p.username) return false;
        const playerObj = gameState.game.players.find(player => player.username === p.username);
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
        const playerObj = gameState.game.players.find(player => player.username === targetUsername);
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

async function startGame(zoneName) {
    if (!gameState.game) {
        gameState.game = new Game();
    }

    const playerId = gameState.networkManager ? gameState.networkManager.playerId : 'player1';
    console.log('Starting game:', { zoneName, playerId, isHost: gameState.currentHostId === playerId, character: gameState.selectedCharacter });

    // In multiplayer, request zone enter from server to get enemy state
    // Init with empty enemies - they'll be synced via onZoneEnter
    if (gameState.networkManager && gameState.networkManager.connected) {
        // Init without enemies (pass empty array) - server will send state
        await gameState.game.init(zoneName, gameState.currentUsername, playerId, gameState.selectedCharacter, []);
        // Request enemy state from server
        gameState.networkManager.enterZone(zoneName);
    } else {
        // No network - fall back to loading enemies from zone data
        await gameState.game.init(zoneName, gameState.currentUsername, playerId, gameState.selectedCharacter);
    }
    gameState.game.onPortalEnter = (targetZoneId) => {
        if (gameState.networkManager && gameState.networkManager.connected) {
            gameState.networkManager.enterZone(targetZoneId);
        } else {
            console.error('No network connection for portal transition');
        }
    };

    // Wire up enemy kill callback
    gameState.game.onEnemyKilled = (enemyId, zone) => {
        if (gameState.networkManager && gameState.networkManager.connected) {
            gameState.networkManager.sendEnemyKilled(enemyId, zone);
        }
    };

    // Wire up enemy damage callback for non-host players
    gameState.game.onEnemyDamage = (enemyId, damage) => {
        if (gameState.networkManager && gameState.networkManager.connected) {
            gameState.networkManager.sendEnemyDamage(enemyId, damage);
        }
    };
    gameState.game.onInventoryChanged = (inventory) => {
        scheduleInventorySave(inventory);
    };

    // Wire up death penalty callback
    gameState.game.onPlayerDeath = () => {
        // Clear local inventory
        gameState.game.setInventory([]);

        // Notify server to apply death penalty (coin deduction + clear DB inventory)
        if (gameState.networkManager && gameState.networkManager.connected) {
            gameState.networkManager.sendPlayerDeath(gameState.game.zoneId || 'unknown');
        }
    };

    // Wire up projectile sync callback
    gameState.game.onPlayerFire = (x, y, angle) => {
        if (gameState.networkManager && gameState.networkManager.connected) {
            gameState.networkManager.sendPlayerFire(x, y, angle);
        }
    };

    if (gameState.currentProfile && Array.isArray(gameState.currentProfile.inventory)) {
        gameState.game.setInventory(gameState.currentProfile.inventory);
    }

    // Apply host status BEFORE starting game loop (fixes first shots not dealing damage)
    if (gameState.networkManager && gameState.currentHostId) {
        updateHostStatus(gameState.currentHostId);
    }

    showScreen('game');
    gameState.game.start();

    // Initialize chat system
    initializeChat();

    // Send updates to server
    if (gameState.networkManager) {

        // Only sync players in the same zone (hub for initial game start)
        const localZoneId = gameState.game.zoneId || 'hub';
        const zonePlayers = gameState.currentRoomPlayers.filter(p => p.zone === localZoneId);
        gameState.game.syncMultiplayerPlayers(zonePlayers, gameState.networkManager.playerId);

        // Clear previous interval to prevent leaks
        if (gameState.playerUpdateInterval) {
            clearInterval(gameState.playerUpdateInterval);
            gameState.playerUpdateInterval = null;
        }

        // Track last sent state to avoid redundant updates
        let lastSentState = null;

        gameState.playerUpdateInterval = setInterval(() => {
            if (gameState.game.localPlayer && gameState.game.running) {
                const currentState = gameState.game.localPlayer.getState();

                // Only send if state has changed significantly
                if (!lastSentState || hasSignificantChange(lastSentState, currentState)) {
                    gameState.networkManager.sendPlayerUpdate(currentState);
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
           oldState.zoneLevel !== newState.zoneLevel ||
           oldState.hp !== newState.hp ||
           oldState.isDead !== newState.isDead;
}

function recallToHub() {
    if (!gameState.game) return;
    if (gameState.game.zone && gameState.game.zone.isHub) return;

    // If player is dead, handle respawn first
    if (gameState.game.localPlayer && gameState.game.localPlayer.isDead) {
        gameState.game.hideDeathScreen();
        gameState.game.localPlayer.respawn();
    }

    if (gameState.networkManager && gameState.networkManager.connected) {
        gameState.networkManager.enterZone('hub');
    } else {
        console.error('No network connection for recall');
    }
}

// ===== CHAT SYSTEM =====

function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const muteTtsBtn = document.getElementById('btn-mute-tts');

    if (!chatInput || !chatSendBtn) return;

    // Send button click
    chatSendBtn.addEventListener('click', sendChatMessage);

    // Enter key in input
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Mute TTS button
    if (muteTtsBtn && window.StrictHotelTTS) {
        muteTtsBtn.addEventListener('click', () => {
            window.StrictHotelTTS.toggleMute();
        });
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;

    const text = chatInput.value.trim();
    if (!text) return;

    // Send via network
    if (gameState.networkManager) {
        gameState.networkManager.sendChatMessage(text);
    }

    // Clear input
    chatInput.value = '';
}

function appendChatMessage(username, text) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `<span class="name">${escapeHtml(username)}:</span>${escapeHtml(text)}`;
    chatMessages.appendChild(messageEl);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Keep only last 50 messages
    const allMessages = chatMessages.querySelectorAll('.chat-message');
    if (allMessages.length > 50) {
        allMessages[0].remove();
    }

    // Auto-fade out after 10 seconds
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.classList.add('fade-out');
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.remove();
                }
            }, 1000);
        }
    }, 10000);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
