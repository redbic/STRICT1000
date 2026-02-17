// TankGame - Wii Play Tanks inspired wave combat (render-only client)
// Server runs all simulation via TankZoneSession.
// This class handles rendering, visual effects, and input only.

class TankGame {
    constructor(game) {
        this.game = game;
        this.takeover = false; // Additive mode — game loop still runs normally

        // State received from server
        this.tankEnemies = [];
        this.tankProjectiles = [];
        this.crates = [];
        this.healthPickups = [];
        this.currentWave = 0;
        this.waveActive = false;
        this.waveDelay = 0;
        this.victory = false;
        this.waveBanner = { text: '', timer: 0 };

        // Initialize arena pillars and crate walls for local player collision
        this.initArena();
    }

    initArena() {
        // Permanent stone pillars (added as walls to zone for collision)
        const pillars = [
            { x: 240, y: 240, width: 48, height: 48 },
            { x: 672, y: 240, width: 48, height: 48 },
            { x: 240, y: 624, width: 48, height: 48 },
            { x: 672, y: 624, width: 48, height: 48 },
            { x: 456, y: 432, width: 48, height: 48 },
        ];

        if (this.game.zone) {
            // Remove any existing pillar/crate walls first to prevent duplicates on re-entry
            this.game.zone.walls = this.game.zone.walls.filter(w => !w.isPillar && !w.isCrate);
            pillars.forEach(p => {
                this.game.zone.walls.push({ ...p, isPillar: true });
            });
        }

        // Destructible wooden crates — positions match server
        const cratePositions = [
            { x: 360, y: 192 }, { x: 552, y: 192 },
            { x: 168, y: 432 }, { x: 744, y: 432 },
            { x: 312, y: 384 }, { x: 600, y: 384 },
            { x: 360, y: 672 }, { x: 552, y: 672 },
            { x: 456, y: 288 }, { x: 456, y: 576 },
        ];

        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
        const crateHp = C.TANK_CRATE_HP || 3;
        cratePositions.forEach((pos, i) => {
            this.crates.push({
                id: `crate-${i}`,
                x: pos.x,
                y: pos.y,
                width: 40,
                height: 40,
                hp: crateHp,
                maxHp: crateHp,
                alive: true
            });

            // Add crate to zone walls for local player collision
            if (this.game.zone) {
                this.game.zone.walls.push({
                    x: pos.x - 20,
                    y: pos.y - 20,
                    width: 40,
                    height: 40,
                    isCrate: true,
                    crateId: `crate-${i}`
                });
            }
        });
    }

    // --- Server sync methods ---

    applyServerSync(data) {
        // Sync tank positions/state
        if (data.tanks) {
            this._syncTanks(data.tanks);
        }

        // Sync projectile positions
        if (data.projectiles) {
            this.tankProjectiles = data.projectiles.map(p => ({
                id: p.id,
                x: p.x, y: p.y,
                vx: p.vx, vy: p.vy,
                angle: p.angle,
                bounces: p.bounces,
                radius: 5,
                alive: true,
            }));
        }

        // Sync crate alive status
        if (data.crates) {
            for (const sc of data.crates) {
                const local = this.crates.find(c => c.id === sc.id);
                if (local) {
                    const wasAlive = local.alive;
                    local.hp = sc.hp;
                    local.alive = sc.alive;
                    // Remove crate wall if it was just destroyed
                    if (wasAlive && !sc.alive && this.game.zone) {
                        this.game.zone.walls = this.game.zone.walls.filter(w => w.crateId !== sc.id);
                    }
                }
            }
        }

        // Sync health pickups
        if (data.healthPickups) {
            // Preserve bob timers for smooth animation
            const existing = new Map();
            for (const h of this.healthPickups) existing.set(h.id, h);

            this.healthPickups = data.healthPickups.map(h => {
                const prev = existing.get(h.id);
                return {
                    id: h.id, x: h.x, y: h.y,
                    bobTimer: prev ? prev.bobTimer : 0,
                };
            });
        }

        // Sync game state
        if (data.wave !== undefined) this.currentWave = data.wave;
        if (data.waveActive !== undefined) this.waveActive = data.waveActive;
        if (data.waveDelay !== undefined) this.waveDelay = data.waveDelay;
        // gameOver removed - player death now handled by main game system
        // When player dies, main game shows death screen and handles respawn to hub
        if (data.victory !== undefined) {
            if (data.victory && !this.victory) {
                this.waveBanner = { text: 'VICTORY!', timer: 5.0 };
            }
            this.victory = data.victory;
        }
    }

    _syncTanks(serverTanks) {
        const localMap = new Map();
        for (const t of this.tankEnemies) localMap.set(t.id, t);

        const synced = [];
        for (const st of serverTanks) {
            let local = localMap.get(st.id);
            if (!local) {
                // New tank — create with rendering properties
                local = {
                    id: st.id,
                    type: st.type,
                    width: st.width || 28,
                    height: st.height || 22,
                    alive: true,
                    flashTimer: 0,
                    ...this._getTankColors(st.type),
                };
                if (st.type === 'boss') {
                    local.tripleShot = true;
                    local.glowColor = '#b04040';
                }
            }
            // Update from server
            local.x = st.x;
            local.y = st.y;
            local.hp = st.hp;
            local.maxHp = st.maxHp;
            local.angle = st.angle;
            local.turretAngle = st.turretAngle;
            local.knockbackVX = st.knockbackVX || 0;
            local.knockbackVY = st.knockbackVY || 0;
            if (st.flashTimer > 0) local.flashTimer = st.flashTimer;
            local.alive = true;
            local.width = st.width || local.width;
            local.height = st.height || local.height;
            synced.push(local);
        }
        this.tankEnemies = synced;
    }

    _getTankColors(type) {
        switch (type) {
            case 'basic':
            case 'shooter':
                return { color: '#6b8e4e', turretColor: '#4a6633' };
            case 'red':
                return { color: '#b04040', turretColor: '#802020' };
            case 'boss':
                return { color: '#3a3a3a', turretColor: '#222' };
            default:
                return { color: '#6b8e4e', turretColor: '#4a6633' };
        }
    }

    showWaveBanner(wave, isBoss) {
        const text = isBoss ? 'WAVE 5 — BOSS' : `WAVE ${wave + 1}`;
        this.waveBanner = { text, timer: 2.5 };
    }

    handleServerReset(data) {
        this.tankEnemies = [];
        this.tankProjectiles = [];
        this.healthPickups = [];
        this.victory = false;
        this.currentWave = 0;
        this.waveActive = false;
        this.waveBanner = { text: '', timer: 0 };

        // Reset crates
        if (data && data.crates) {
            for (const sc of data.crates) {
                const local = this.crates.find(c => c.id === sc.id);
                if (local) {
                    local.hp = sc.hp !== undefined ? sc.hp : local.maxHp;
                    local.alive = sc.alive !== undefined ? sc.alive : true;
                }
            }
        } else {
            const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
            this.crates.forEach(c => {
                c.alive = true;
                c.hp = C.TANK_CRATE_HP || 3;
            });
        }

        // Re-add crate walls to zone
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => !w.isCrate);
            this.crates.forEach(crate => {
                if (crate.alive) {
                    this.game.zone.walls.push({
                        x: crate.x - 20,
                        y: crate.y - 20,
                        width: 40,
                        height: 40,
                        isCrate: true,
                        crateId: crate.id
                    });
                }
            });
        }
    }

    handleCrateDestroyed(data) {
        if (!data.crateId) return;
        const crate = this.crates.find(c => c.id === data.crateId);
        if (crate) {
            crate.alive = false;
            crate.hp = 0;
        }
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => w.crateId !== data.crateId);
        }
        if (data.x !== undefined && data.y !== undefined) {
            this.game.spawnDeathParticles(data.x, data.y);
        }
        if (data.pickup) {
            this.healthPickups.push({
                id: data.pickup.id,
                x: data.pickup.x,
                y: data.pickup.y,
                bobTimer: 0
            });
        }
    }

    handlePickupCollected(data) {
        if (!data.pickupId) return;
        this.healthPickups = this.healthPickups.filter(h => h.id !== data.pickupId);
    }

    // --- Update (visual only) ---

    update(dt) {
        if (this.waveBanner.timer > 0) {
            this.waveBanner.timer -= dt;
        }

        this.healthPickups.forEach(hp => {
            hp.bobTimer = (hp.bobTimer || 0) + dt;
        });

        this.tankEnemies.forEach(tank => {
            if (tank.flashTimer > 0) tank.flashTimer -= dt;
        });

        // Victory exit input - gameOver is handled by main game death screen now
        if (this.victory && this.game.keys[' ']) {
            if (this.game.onPortalEnter) {
                this.game.onPortalEnter('hallway');
            }
        }
    }

    // --- Drawing ---

    draw(ctx, cameraX, cameraY) {
        this.drawArenaFloor(ctx, cameraX, cameraY);

        // Draw crates
        this.crates.forEach(crate => {
            if (!crate.alive) return;
            const sx = crate.x - cameraX;
            const sy = crate.y - cameraY;

            ctx.fillStyle = '#a08050';
            ctx.fillRect(sx - crate.width / 2, sy - crate.height / 2, crate.width, crate.height);

            ctx.strokeStyle = '#6b5344';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx - crate.width / 2, sy - crate.height / 2);
            ctx.lineTo(sx + crate.width / 2, sy + crate.height / 2);
            ctx.moveTo(sx + crate.width / 2, sy - crate.height / 2);
            ctx.lineTo(sx - crate.width / 2, sy + crate.height / 2);
            ctx.stroke();

            ctx.strokeStyle = '#5a4030';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - crate.width / 2, sy - crate.height / 2, crate.width, crate.height);

            if (crate.hp < crate.maxHp) {
                const damage = 1 - (crate.hp / crate.maxHp);
                ctx.strokeStyle = `rgba(40, 30, 20, ${damage * 0.8})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sx - 5, sy - 8);
                ctx.lineTo(sx + 3, sy);
                ctx.lineTo(sx - 2, sy + 7);
                ctx.stroke();
            }
        });

        // Draw health pickups
        this.healthPickups.forEach(hp => {
            const sx = hp.x - cameraX;
            const sy = hp.y - cameraY + Math.sin((hp.bobTimer || 0) * 3) * 4;

            ctx.fillStyle = 'rgba(46, 204, 113, 0.3)';
            ctx.beginPath();
            ctx.arc(sx, sy, 16, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#2ecc71';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+', sx, sy);
        });

        // Draw tank enemies
        this.tankEnemies.forEach(tank => {
            if (!tank.alive) return;
            this.drawTank(ctx, tank, cameraX, cameraY);
        });

        // Draw tank projectiles
        this.tankProjectiles.forEach(proj => {
            const sx = proj.x - cameraX;
            const sy = proj.y - cameraY;

            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(sx, sy, proj.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
            ctx.beginPath();
            ctx.arc(sx, sy, proj.radius * 1.8, 0, Math.PI * 2);
            ctx.fill();

            const trailLen = 8;
            const trailX = sx - Math.cos(proj.angle) * trailLen;
            const trailY = sy - Math.sin(proj.angle) * trailLen;
            ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(trailX, trailY);
            ctx.stroke();
        });

        this.drawWaveUI(ctx);
    }

    drawArenaFloor(ctx, cameraX, cameraY) {
        if (typeof tilesetManager !== 'undefined' && tilesetManager && tilesetManager.loaded) return;
        ctx.fillStyle = '#8a8580';
        const zone = this.game.zone;
        if (zone) {
            ctx.fillRect(-cameraX, -cameraY, zone.width, zone.height);
        }
    }

    drawTank(ctx, tank, cameraX, cameraY) {
        const sx = tank.x - cameraX;
        const sy = tank.y - cameraY;

        ctx.save();

        if (tank.type === 'boss') {
            const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 200);
            ctx.fillStyle = `rgba(176, 64, 64, ${pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(sx, sy, tank.width * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.translate(sx, sy);
        ctx.rotate(tank.angle);

        const bodyColor = tank.flashTimer > 0 ? '#fff' : tank.color;
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(-tank.width / 2, -tank.height / 2 - 2, tank.width, 4);
        ctx.fillRect(-tank.width / 2, tank.height / 2 - 2, tank.width, 4);

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);

        ctx.rotate(-tank.angle);

        ctx.rotate(tank.turretAngle);
        ctx.fillStyle = tank.turretColor;
        const turretLen = tank.type === 'boss' ? 26 : 18;
        const turretWidth = tank.type === 'boss' ? 8 : 5;
        ctx.fillRect(0, -turretWidth / 2, turretLen, turretWidth);

        ctx.fillStyle = tank.turretColor;
        ctx.beginPath();
        ctx.arc(0, 0, tank.type === 'boss' ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (tank.hp < tank.maxHp) {
            const barWidth = tank.width + 8;
            const barHeight = 4;
            const barX = sx - barWidth / 2;
            const barY = sy - tank.height / 2 - 12;
            const hpRatio = tank.hp / tank.maxHp;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = tank.type === 'boss' ? '#e74c3c' : '#b04040';
            ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
        }
    }

    drawWaveUI(ctx) {
        const W = ctx.canvas.width;

        if (this.waveBanner.timer > 0) {
            const alpha = Math.min(1, this.waveBanner.timer * 2);
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.6})`;
            ctx.fillRect(0, W > 600 ? 180 : 100, ctx.canvas.width, 60);

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.waveBanner.text, ctx.canvas.width / 2, W > 600 ? 220 : 140);
            ctx.restore();
        }

        // Don't show enemy count if player is dead (main game shows death screen)
        const playerDead = this.game.localPlayer && this.game.localPlayer.isDead;
        if (this.waveActive && !playerDead && !this.victory) {
            const remaining = this.tankEnemies.filter(t => t.alive).length;
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(ctx.canvas.width - 160, 10, 150, 30);
            ctx.fillStyle = '#e0d8c8';
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`ENEMIES: ${remaining}`, ctx.canvas.width - 20, 30);
            ctx.restore();
        }

        // Victory screen (death is handled by main game system)
        if (this.victory) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 40px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('VICTORY!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
            ctx.fillStyle = '#e0d8c8';
            ctx.font = '18px monospace';
            ctx.fillText('Press SPACE to exit', ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
            ctx.restore();
        }
    }

    destroy() {
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => !w.isPillar && !w.isCrate);
        }
        this.tankEnemies = [];
        this.tankProjectiles = [];
        this.crates = [];
        this.healthPickups = [];
    }
}

// Register with minigame registry
if (typeof registerMinigame === 'function') {
    registerMinigame('tanks', TankGame);
}
