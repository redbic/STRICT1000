// Network manager for multiplayer
class NetworkManager {
    constructor() {
        this.ws = null;
        this.roomId = null;
        this.playerId = null;
        this.connected = false;
        this.onRoomUpdate = null;
        this.onPlayerState = null;
        this.onGameStart = null;
        this.onPlayerLeft = null;
        this.onRoomFull = null;
        this.onZoneEnter = null;
        this.onBalanceUpdate = null; // Callback for balance updates
        this.onEnemyRespawn = null; // Callback for enemy respawns
        this.onEnemySync = null; // Callback for enemy state sync
        this.onHostAssigned = null; // Callback for host assignment
        this.onEnemyDamage = null; // Callback for enemy damage (received by host)
        this.onRoomList = null; // Callback for available room list
        this.onPlayerZoneChange = null; // Callback when OTHER player changes zone
        this.onPlayerFire = null; // Callback when another player fires
        this.onEnemyStateUpdate = null; // Callback for server-authoritative enemy HP update
        this.onEnemyKilledSync = null; // Callback when server confirms enemy death
        this.onEnemyAttack = null; // Callback when server-authoritative enemy attacks this player
        this.onChatMessage = null; // Callback for chat messages from other players
        // Tank minigame callbacks
        this.onTankSync = null;
        this.onTankWaveStart = null;
        this.onTankKilled = null;
        this.onTankPlayerHit = null;
        this.onTankPickupCollected = null;
        this.onTankCrateDestroyed = null;
        this.onTankGameOver = null;
        this.onTankStateReset = null;
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            // Connection timeout (10 seconds)
            const timeout = setTimeout(() => {
                if (this.ws) {
                    this.ws.close();
                }
                reject(new Error('Connection timeout'));
            }, 10000);

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log('WebSocket connected');
                this.connected = true;
                resolve();
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.connected = false;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Message parse error:', error);
                }
            };
        });
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'room_update':
                if (this.onRoomUpdate) this.onRoomUpdate(data);
                break;
            case 'player_state':
                if (this.onPlayerState) this.onPlayerState(data);
                break;
            case 'game_start':
                if (this.onGameStart) this.onGameStart(data);
                break;
            case 'player_left':
                if (this.onPlayerLeft) this.onPlayerLeft(data);
                break;
            case 'room_full':
                if (this.onRoomFull) this.onRoomFull(data);
                break;
            case 'zone_enter':
                if (this.onZoneEnter) this.onZoneEnter(data);
                break;
            case 'balance_update':
                if (this.onBalanceUpdate) this.onBalanceUpdate(data);
                break;
            case 'enemy_respawn':
                if (this.onEnemyRespawn) this.onEnemyRespawn(data);
                break;
            case 'enemy_sync':
                if (this.onEnemySync) this.onEnemySync(data);
                break;
            case 'host_assigned':
                if (this.onHostAssigned) this.onHostAssigned(data);
                break;
            case 'enemy_damage':
                if (this.onEnemyDamage) this.onEnemyDamage(data);
                break;
            case 'room_list':
                if (this.onRoomList) this.onRoomList(data);
                break;
            case 'player_zone':
                // Another player changed zones - do NOT transition local player
                if (this.onPlayerZoneChange) this.onPlayerZoneChange(data);
                break;
            case 'player_fire':
                if (this.onPlayerFire) this.onPlayerFire(data);
                break;
            case 'enemy_state_update':
                if (this.onEnemyStateUpdate) this.onEnemyStateUpdate(data);
                break;
            case 'enemy_killed_sync':
                if (this.onEnemyKilledSync) this.onEnemyKilledSync(data);
                break;
            case 'enemy_attack':
                if (this.onEnemyAttack) this.onEnemyAttack(data);
                break;
            case 'chat_message':
                if (this.onChatMessage) this.onChatMessage(data);
                break;
            // Tank minigame messages
            case 'tank_sync':
                if (this.onTankSync) this.onTankSync(data);
                break;
            case 'tank_wave_start':
                if (this.onTankWaveStart) this.onTankWaveStart(data);
                break;
            case 'tank_killed':
                if (this.onTankKilled) this.onTankKilled(data);
                break;
            case 'tank_player_hit':
                if (this.onTankPlayerHit) this.onTankPlayerHit(data);
                break;
            case 'tank_pickup_collected':
                if (this.onTankPickupCollected) this.onTankPickupCollected(data);
                break;
            case 'tank_crate_destroyed':
                if (this.onTankCrateDestroyed) this.onTankCrateDestroyed(data);
                break;
            case 'tank_game_over':
                if (this.onTankGameOver) this.onTankGameOver(data);
                break;
            case 'tank_state_reset':
                if (this.onTankStateReset) this.onTankStateReset(data);
                break;
        }
    }
    
    joinRoom(roomId, playerId, username, characterNum = 1) {
        if (!this.connected) return;

        this.roomId = roomId;
        this.playerId = playerId;

        this.send({
            type: 'join_room',
            roomId: roomId,
            playerId: playerId,
            username: username,
            character: characterNum
        });
    }
    
    leaveRoom() {
        if (!this.connected) return;
        
        this.send({
            type: 'leave_room',
            roomId: this.roomId,
            playerId: this.playerId
        });
    }
    
    sendPlayerUpdate(state) {
        if (!this.connected) return;
        
        this.send({
            type: 'player_update',
            state: state
        });
    }
    
    startGame() {
        if (!this.connected) return;
        
        this.send({
            type: 'game_start',
            roomId: this.roomId
        });
    }

    enterZone(zoneId) {
        if (!this.connected) return;
        this.send({
            type: 'zone_enter',
            zoneId: zoneId
        });
    }
    
    sendEnemyDamage(enemyId, damage, fromX, fromY) {
        if (!this.connected) return;
        this.send({
            type: 'enemy_damage',
            enemyId: enemyId,
            damage: damage,
            fromX: fromX,
            fromY: fromY
        });
    }
    
    requestRoomList() {
        if (!this.connected) return;
        this.send({ type: 'list_rooms' });
    }

    sendPlayerDeath(zone) {
        if (!this.connected) return;
        this.send({
            type: 'player_death',
            zone: zone
        });
    }

    sendPlayerFire(x, y, angle) {
        if (!this.connected) return;
        this.send({
            type: 'player_fire',
            x: x,
            y: y,
            angle: angle
        });
    }

    sendChatMessage(text) {
        if (!this.connected) return;
        if (typeof text !== 'string' || !text.trim()) return;
        this.send({
            type: 'player_chat',
            text: text.trim()
        });
    }

    sendTankCrateDamage(crateId, damage, fromX, fromY) {
        if (!this.connected) return;
        this.send({
            type: 'tank_crate_damage',
            crateId: crateId,
            damage: damage,
            fromX: fromX,
            fromY: fromY
        });
    }

    sendTankRestart() {
        if (!this.connected) return;
        this.send({ type: 'tank_restart' });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
