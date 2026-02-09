// Network manager for multiplayer
class NetworkManager {
    constructor() {
        this.ws = null;
        this.roomId = null;
        this.playerId = null;
        this.connected = false;
        this.onRoomUpdate = null;
        this.onPlayerState = null;
        this.onRaceStart = null;
        this.onItemUsed = null;
        this.onPlayerLeft = null;
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
            case 'race_start':
                if (this.onRaceStart) this.onRaceStart(data);
                break;
            case 'item_used':
                if (this.onItemUsed) this.onItemUsed(data);
                break;
            case 'player_left':
                if (this.onPlayerLeft) this.onPlayerLeft(data);
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
    
    startRace() {
        if (!this.connected) return;
        
        this.send({
            type: 'race_start',
            roomId: this.roomId
        });
    }
    
    useItem(itemType, target) {
        if (!this.connected) return;
        
        this.send({
            type: 'item_use',
            itemType: itemType,
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
