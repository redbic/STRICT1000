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
        this.onAbilityUsed = null;
        this.onPlayerLeft = null;
        this.onRoomFull = null;
        this.onZoneEnter = null;
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                resolve();
            };
            
            this.ws.onerror = (error) => {
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
            case 'ability_used':
                if (this.onAbilityUsed) this.onAbilityUsed(data);
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
        }
    }
    
    joinRoom(roomId, playerId, username) {
        if (!this.connected) return;
        
        this.roomId = roomId;
        this.playerId = playerId;
        
        this.send({
            type: 'join_room',
            roomId: roomId,
            playerId: playerId,
            username: username
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
    
    useAbility(abilityType, target) {
        if (!this.connected) return;
        
        this.send({
            type: 'ability_use',
            abilityType: abilityType,
            target: target
        });
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
