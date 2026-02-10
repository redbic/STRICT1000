// Ability system for adventure
const ITEM_TYPES = {
    dash: {
        name: 'Dash',
        icon: '💫',
        description: 'Quick burst of speed'
    },
    sword: {
        name: 'Sword Strike',
        icon: '⚔️',
        description: 'Strike nearest enemy'
    },
    shield: {
        name: 'Shield Block',
        icon: '🛡️',
        description: 'Temporary invincibility'
    },
    fireball: {
        name: 'Fireball',
        icon: '🔥',
        description: 'Launch a fireball'
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
                    // Hit by fireball
                    if (hazard.type === 'fireball') {
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
            if (hazard.type === 'fireball') {
                ctx.fillText('🔥', hazard.x - cameraX - 15, hazard.y - cameraY + 15);
            }
        });
    }
    
    addHazard(hazard) {
        this.hazards.push(hazard);
    }
}
