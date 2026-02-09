// Item system for power-ups
const ITEM_TYPES = {
    boost: {
        name: 'Speed Boost',
        icon: '🚀',
        description: 'Temporary speed increase'
    },
    shell: {
        name: 'Shell',
        icon: '🐚',
        description: 'Stun nearest player'
    },
    star: {
        name: 'Star',
        icon: '⭐',
        description: 'Invincibility'
    },
    banana: {
        name: 'Banana',
        icon: '🍌',
        description: 'Place hazard on track'
    }
};

class ItemManager {
    constructor() {
        this.hazards = [];
    }
    
    update(players) {
        // Check hazard collisions
        this.hazards.forEach((hazard, index) => {
            players.forEach(player => {
                if (player.invincible) return;
                
                const dist = Math.hypot(player.x - hazard.x, player.y - hazard.y);
                if (dist < 25) {
                    // Hit banana
                    if (hazard.type === 'banana') {
                        player.stunned = true;
                        player.stunnedTime = 60;
                        this.hazards.splice(index, 1);
                    }
                }
            });
        });
    }
    
    draw(ctx, cameraX, cameraY) {
        // Draw hazards
        ctx.font = '30px Arial';
        this.hazards.forEach(hazard => {
            if (hazard.type === 'banana') {
                ctx.fillText('🍌', hazard.x - cameraX - 15, hazard.y - cameraY + 15);
            }
        });
    }
    
    addHazard(hazard) {
        this.hazards.push(hazard);
    }
}
