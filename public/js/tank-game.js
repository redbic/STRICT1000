// TankGame - Wii Play Tanks inspired wave combat
// Player keeps normal character controls (WASD + mouse aim + shoot)
// Enemies ARE the tanks — they patrol, aim, and fire bouncing projectiles
// This class hooks ADDITIVELY into the game loop (layers on top)

class TankGame {
    constructor(game) {
        this.game = game;
        this.takeover = false; // Additive mode — game loop still runs normally

        // Wave system
        this.currentWave = 0;
        this.waveDelay = 0;
        this.waveActive = false;
        this.waveBanner = { text: '', timer: 0 };
        this.gameOver = false;
        this.victory = false;

        // Tank enemies (managed by TankGame, separate from game.enemies)
        this.tankEnemies = [];
        this.tankProjectiles = [];

        // Destructible crates
        this.crates = [];
        // Health pickups
        this.healthPickups = [];

        // Wave definitions
        this.waves = [
            {
                tanks: [
                    { type: 'basic', count: 2 }  // Slow, no shooting (chase only)
                ]
            },
            {
                tanks: [
                    { type: 'shooter', count: 3 } // Fire straight-line projectiles
                ]
            },
            {
                tanks: [
                    { type: 'shooter', count: 3 },
                    { type: 'red', count: 1 }     // Bouncing shots, faster
                ]
            },
            {
                tanks: [
                    { type: 'shooter', count: 3 },
                    { type: 'red', count: 2 }
                ]
            },
            {
                tanks: [
                    { type: 'boss', count: 1 },   // Boss: high HP, triple-shot spread
                    { type: 'red', count: 2 }      // Escorts
                ]
            }
        ];

        // Initialize arena
        this.initArena();
        this.startWave(0);
    }

    initArena() {
        // Create a mix of destructible crates and permanent pillars
        // Arena is 960x960, with playable area roughly 96-864 per axis
        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};

        // Permanent stone pillars (added as walls to zone for collision)
        const pillars = [
            { x: 240, y: 240, width: 48, height: 48 },
            { x: 672, y: 240, width: 48, height: 48 },
            { x: 240, y: 624, width: 48, height: 48 },
            { x: 672, y: 624, width: 48, height: 48 },
            { x: 456, y: 432, width: 48, height: 48 },
        ];

        // Add pillars to zone walls for collision
        if (this.game.zone) {
            pillars.forEach(p => {
                this.game.zone.walls.push({ ...p, isPillar: true });
            });
        }

        // Destructible wooden crates
        const cratePositions = [
            { x: 360, y: 192 }, { x: 552, y: 192 },
            { x: 168, y: 432 }, { x: 744, y: 432 },
            { x: 312, y: 384 }, { x: 600, y: 384 },
            { x: 360, y: 672 }, { x: 552, y: 672 },
            { x: 456, y: 288 }, { x: 456, y: 576 },
        ];

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

            // Add crate to zone walls for collision
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

        // Add arena boundary walls (invisible, for projectile bouncing)
        if (this.game.zone && this.game.zone.walls.length === 0) {
            // Top/bottom/left/right boundaries handled by zone bounds
        }
    }

    startWave(waveIndex) {
        if (waveIndex >= this.waves.length) {
            this.victory = true;
            this.waveBanner = { text: 'VICTORY!', timer: 5.0 };
            return;
        }

        this.currentWave = waveIndex;
        this.waveActive = false;
        this.waveDelay = (typeof CONFIG !== 'undefined' ? CONFIG.TANK_WAVE_DELAY : 3.0);

        const isBoss = waveIndex === this.waves.length - 1;
        this.waveBanner = {
            text: isBoss ? 'WAVE 5 — BOSS' : `WAVE ${waveIndex + 1}`,
            timer: 2.5
        };
    }

    spawnWave(waveIndex) {
        const wave = this.waves[waveIndex];
        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};

        // Spawn positions — spread around the top half of the arena
        const spawnPoints = [
            { x: 192, y: 192 }, { x: 480, y: 144 }, { x: 768, y: 192 },
            { x: 144, y: 384 }, { x: 816, y: 384 },
            { x: 192, y: 576 }, { x: 768, y: 576 },
        ];

        let spawnIdx = 0;

        wave.tanks.forEach(def => {
            for (let i = 0; i < def.count; i++) {
                const spawn = spawnPoints[spawnIdx % spawnPoints.length];
                spawnIdx++;

                const tank = this.createTank(def.type, spawn.x, spawn.y, C);
                this.tankEnemies.push(tank);
            }
        });

        this.waveActive = true;
    }

    createTank(type, x, y, C) {
        const base = {
            x, y,
            type,
            width: C.TANK_BODY_WIDTH || 28,
            height: C.TANK_BODY_HEIGHT || 22,
            hp: C.TANK_ENEMY_HP || 50,
            maxHp: C.TANK_ENEMY_HP || 50,
            speed: C.TANK_ENEMY_SPEED || 60,
            fireCooldown: C.TANK_ENEMY_FIRE_COOLDOWN || 2.5,
            fireTimer: Math.random() * 2, // Stagger first shot
            projectileSpeed: C.TANK_ENEMY_PROJECTILE_SPEED || 250,
            projectileBounces: C.TANK_ENEMY_PROJECTILE_BOUNCES || 2,
            projectileDamage: C.TANK_ENEMY_PROJECTILE_DAMAGE || 25,
            canShoot: true,
            angle: 0,
            turretAngle: 0,
            alive: true,
            stunTimer: 0,
            knockbackVX: 0,
            knockbackVY: 0,
            patrolTarget: null,
            patrolTimer: 0,
            flashTimer: 0,
        };

        switch (type) {
            case 'basic':
                base.canShoot = false;
                base.speed = 45;
                base.color = '#6b8e4e';      // Olive green
                base.turretColor = '#4a6633';
                break;
            case 'shooter':
                base.color = '#6b8e4e';       // Olive green
                base.turretColor = '#4a6633';
                break;
            case 'red':
                base.speed = 80;
                base.fireCooldown = 2.0;
                base.projectileBounces = 3;
                base.color = '#b04040';        // Red
                base.turretColor = '#802020';
                break;
            case 'boss':
                base.hp = C.TANK_BOSS_HP || 200;
                base.maxHp = C.TANK_BOSS_HP || 200;
                base.width = 42;
                base.height = 33;
                base.speed = 35;
                base.fireCooldown = C.TANK_BOSS_FIRE_COOLDOWN || 1.5;
                base.projectileBounces = 3;
                base.tripleShot = true;
                base.spreadAngle = C.TANK_BOSS_SPREAD_ANGLE || 0.4;
                base.color = '#3a3a3a';        // Dark
                base.turretColor = '#222';
                base.glowColor = '#b04040';
                break;
        }

        return base;
    }

    update(dt) {
        if (this.gameOver || this.victory) {
            // Check for restart input
            if (this.game.keys[' ']) {
                if (this.gameOver) {
                    this.restart();
                } else if (this.victory) {
                    // Exit to hallway
                    if (this.game.onPortalEnter) {
                        this.game.onPortalEnter('hallway');
                    }
                }
            }
            this.waveBanner.timer -= dt;
            return;
        }

        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};

        // Wave delay countdown
        if (!this.waveActive && this.waveDelay > 0) {
            this.waveDelay -= dt;
            if (this.waveDelay <= 0) {
                this.spawnWave(this.currentWave);
            }
        }

        // Banner timer
        if (this.waveBanner.timer > 0) {
            this.waveBanner.timer -= dt;
        }

        // Update tank enemies
        this.updateTankEnemies(dt);

        // Update tank projectiles
        this.updateTankProjectiles(dt);

        // Update health pickups (floating animation)
        this.healthPickups.forEach(hp => {
            hp.bobTimer = (hp.bobTimer || 0) + dt;
        });

        // Check player collision with health pickups
        if (this.game.localPlayer && !this.game.localPlayer.isDead) {
            const lp = this.game.localPlayer;
            for (let i = this.healthPickups.length - 1; i >= 0; i--) {
                const hp = this.healthPickups[i];
                const dist = Math.hypot(lp.x - hp.x, lp.y - hp.y);
                if (dist < 24) {
                    const healAmount = C.TANK_HEALTH_DROP_AMOUNT || 25;
                    lp.hp = Math.min(lp.maxHp, lp.hp + healAmount);
                    this.game.spawnDamageNumber(hp.x, hp.y - 10, `+${healAmount}`);
                    this.healthPickups.splice(i, 1);
                }
            }
        }

        // Check player collision with tank projectiles
        if (this.game.localPlayer && !this.game.localPlayer.isDead) {
            const lp = this.game.localPlayer;
            for (let i = this.tankProjectiles.length - 1; i >= 0; i--) {
                const proj = this.tankProjectiles[i];
                const dist = Math.hypot(lp.x - proj.x, lp.y - proj.y);
                if (dist < (lp.width / 2) + proj.radius) {
                    lp.takeDamage(proj.damage);
                    this.game.triggerScreenShake(C.SCREEN_SHAKE_DAMAGE_TAKEN || 6, 0.15);
                    this.game.triggerHitStop(C.HIT_STOP_DURATION || 0.04);
                    this.tankProjectiles.splice(i, 1);
                }
            }
        }

        // Check if player died
        if (this.game.localPlayer && this.game.localPlayer.isDead && !this.gameOver) {
            this.gameOver = true;
            this.waveBanner = { text: 'MISSION FAILED', timer: 999 };
        }

        // Player projectile vs tank enemy collision
        for (let pi = this.game.projectiles.length - 1; pi >= 0; pi--) {
            const proj = this.game.projectiles[pi];
            if (!proj.alive || proj.isRemote) continue;

            for (let ti = this.tankEnemies.length - 1; ti >= 0; ti--) {
                const tank = this.tankEnemies[ti];
                if (!tank.alive) continue;

                const dist = Math.hypot(tank.x - proj.x, tank.y - proj.y);
                const tankRadius = Math.max(tank.width, tank.height) / 2;

                if (dist < tankRadius + proj.radius) {
                    tank.hp -= proj.damage;
                    tank.flashTimer = 0.15;
                    proj.alive = false;

                    // Game feel
                    this.game.spawnDamageNumber(proj.x, proj.y - 10, proj.damage);
                    this.game.triggerScreenShake(C.SCREEN_SHAKE_DAMAGE_DEALT || 3, 0.08);
                    this.game.triggerHitStop(C.HIT_STOP_DURATION || 0.04);
                    this.game.createHitSpark(proj.x, proj.y);

                    // Knockback
                    const kbForce = C.KNOCKBACK_FORCE || 300;
                    const kbDx = tank.x - proj.x;
                    const kbDy = tank.y - proj.y;
                    const kbDist = Math.hypot(kbDx, kbDy) || 1;
                    tank.knockbackVX = (kbDx / kbDist) * kbForce;
                    tank.knockbackVY = (kbDy / kbDist) * kbForce;

                    if (tank.hp <= 0) {
                        this.killTank(ti);
                    }
                    break;
                }
            }
        }

        // Player projectile vs crate collision
        for (let pi = this.game.projectiles.length - 1; pi >= 0; pi--) {
            const proj = this.game.projectiles[pi];
            if (!proj.alive) continue;

            for (let ci = this.crates.length - 1; ci >= 0; ci--) {
                const crate = this.crates[ci];
                if (!crate.alive) continue;

                const dx = Math.abs(crate.x - proj.x);
                const dy = Math.abs(crate.y - proj.y);
                if (dx < crate.width / 2 + proj.radius && dy < crate.height / 2 + proj.radius) {
                    crate.hp--;
                    proj.alive = false;
                    this.game.createHitSpark(proj.x, proj.y);

                    if (crate.hp <= 0) {
                        this.destroyCrate(ci);
                    }
                    break;
                }
            }
        }

        // Tank projectile vs crate collision
        for (let pi = this.tankProjectiles.length - 1; pi >= 0; pi--) {
            const proj = this.tankProjectiles[pi];

            for (let ci = this.crates.length - 1; ci >= 0; ci--) {
                const crate = this.crates[ci];
                if (!crate.alive) continue;

                const dx = Math.abs(crate.x - proj.x);
                const dy = Math.abs(crate.y - proj.y);
                if (dx < crate.width / 2 + proj.radius && dy < crate.height / 2 + proj.radius) {
                    crate.hp--;
                    this.tankProjectiles.splice(pi, 1);
                    this.game.createHitSpark(proj.x, proj.y);

                    if (crate.hp <= 0) {
                        this.destroyCrate(ci);
                    }
                    break;
                }
            }
        }

        // Check wave completion
        if (this.waveActive && this.tankEnemies.filter(t => t.alive).length === 0) {
            this.waveActive = false;
            this.startWave(this.currentWave + 1);
        }
    }

    updateTankEnemies(dt) {
        const player = this.game.localPlayer;
        if (!player) return;

        const kbDecay = typeof CONFIG !== 'undefined' ? CONFIG.KNOCKBACK_DECAY || 0.85 : 0.85;

        this.tankEnemies.forEach(tank => {
            if (!tank.alive) return;

            // Flash timer
            if (tank.flashTimer > 0) tank.flashTimer -= dt;

            // Knockback
            if (Math.abs(tank.knockbackVX) > 1 || Math.abs(tank.knockbackVY) > 1) {
                tank.x += tank.knockbackVX * dt;
                tank.y += tank.knockbackVY * dt;
                tank.knockbackVX *= kbDecay;
                tank.knockbackVY *= kbDecay;
                // Clamp to arena
                tank.x = Math.max(20, Math.min(940, tank.x));
                tank.y = Math.max(20, Math.min(940, tank.y));
                return;
            }

            // Turret always aims at player
            tank.turretAngle = Math.atan2(player.y - tank.y, player.x - tank.x);

            // Patrol / movement AI
            const distToPlayer = Math.hypot(player.x - tank.x, player.y - tank.y);

            if (!tank.patrolTarget || tank.patrolTimer <= 0) {
                // Pick a new patrol point (somewhat toward player but randomized)
                const targetAngle = Math.atan2(player.y - tank.y, player.x - tank.x);
                const randomOffset = (Math.random() - 0.5) * Math.PI;
                const moveDist = 100 + Math.random() * 150;
                tank.patrolTarget = {
                    x: tank.x + Math.cos(targetAngle + randomOffset) * moveDist,
                    y: tank.y + Math.sin(targetAngle + randomOffset) * moveDist
                };
                // Clamp patrol target
                tank.patrolTarget.x = Math.max(60, Math.min(900, tank.patrolTarget.x));
                tank.patrolTarget.y = Math.max(60, Math.min(900, tank.patrolTarget.y));
                tank.patrolTimer = 2 + Math.random() * 2;
            }

            tank.patrolTimer -= dt;

            // Move toward patrol target
            const dx = tank.patrolTarget.x - tank.x;
            const dy = tank.patrolTarget.y - tank.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 10) {
                const nx = dx / dist;
                const ny = dy / dist;
                const moveX = nx * tank.speed * dt;
                const moveY = ny * tank.speed * dt;

                const newX = tank.x + moveX;
                const newY = tank.y + moveY;

                // Check wall collision
                const testObj = {
                    x: newX,
                    y: newY,
                    width: tank.width,
                    height: tank.height
                };

                if (!this.game.zone || !this.game.zone.checkCollision(testObj)) {
                    tank.x = Math.max(20, Math.min(940, newX));
                    tank.y = Math.max(20, Math.min(940, newY));
                } else {
                    tank.patrolTimer = 0; // Pick new target
                }

                tank.angle = Math.atan2(ny, nx);
            }

            // Firing
            if (tank.canShoot && !player.isDead) {
                tank.fireTimer -= dt;
                if (tank.fireTimer <= 0) {
                    this.fireTankProjectile(tank);
                    tank.fireTimer = tank.fireCooldown;
                }
            }
        });
    }

    fireTankProjectile(tank) {
        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
        const angle = tank.turretAngle;

        if (tank.tripleShot) {
            // Boss triple-shot spread
            const spread = tank.spreadAngle || 0.4;
            [-spread, 0, spread].forEach(offset => {
                this.createTankProjectile(tank, angle + offset);
            });
        } else {
            this.createTankProjectile(tank, angle);
        }
    }

    createTankProjectile(tank, angle) {
        const barrelLen = tank.type === 'boss' ? 30 : 20;
        const startX = tank.x + Math.cos(angle) * barrelLen;
        const startY = tank.y + Math.sin(angle) * barrelLen;

        this.tankProjectiles.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * tank.projectileSpeed,
            vy: Math.sin(angle) * tank.projectileSpeed,
            speed: tank.projectileSpeed,
            angle: angle,
            radius: 5,
            damage: tank.projectileDamage,
            bounces: 0,
            maxBounces: tank.projectileBounces,
            lifetime: 4.0,
            alive: true
        });
    }

    updateTankProjectiles(dt) {
        for (let i = this.tankProjectiles.length - 1; i >= 0; i--) {
            const proj = this.tankProjectiles[i];

            proj.lifetime -= dt;
            if (proj.lifetime <= 0) {
                this.tankProjectiles.splice(i, 1);
                continue;
            }

            const nextX = proj.x + proj.vx * dt;
            const nextY = proj.y + proj.vy * dt;

            // Zone boundary bounce
            let bounced = false;
            if (nextX < proj.radius || nextX > 960 - proj.radius) {
                if (proj.bounces < proj.maxBounces) {
                    proj.vx = -proj.vx;
                    proj.bounces++;
                    bounced = true;
                } else {
                    this.tankProjectiles.splice(i, 1);
                    continue;
                }
            }
            if (nextY < proj.radius || nextY > 960 - proj.radius) {
                if (proj.bounces < proj.maxBounces) {
                    proj.vy = -proj.vy;
                    proj.bounces++;
                    bounced = true;
                } else {
                    this.tankProjectiles.splice(i, 1);
                    continue;
                }
            }

            // Wall collision bounce
            if (!bounced && this.game.zone) {
                const testObj = {
                    x: nextX,
                    y: nextY,
                    width: proj.radius * 2,
                    height: proj.radius * 2
                };
                if (this.game.zone.checkCollision(testObj)) {
                    if (proj.bounces < proj.maxBounces) {
                        // Determine axis to reflect
                        const testX = { x: nextX, y: proj.y, width: proj.radius * 2, height: proj.radius * 2 };
                        const testY = { x: proj.x, y: nextY, width: proj.radius * 2, height: proj.radius * 2 };
                        if (this.game.zone.checkCollision(testX)) proj.vx = -proj.vx;
                        if (this.game.zone.checkCollision(testY)) proj.vy = -proj.vy;
                        proj.bounces++;
                        bounced = true;
                    } else {
                        this.tankProjectiles.splice(i, 1);
                        continue;
                    }
                }
            }

            if (!bounced) {
                proj.x = nextX;
                proj.y = nextY;
            } else {
                // Move a small step in new direction
                proj.x += proj.vx * dt * 0.5;
                proj.y += proj.vy * dt * 0.5;
            }

            proj.angle = Math.atan2(proj.vy, proj.vx);
        }
    }

    killTank(index) {
        const tank = this.tankEnemies[index];
        tank.alive = false;

        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};

        // Death effects
        this.game.spawnDeathParticles(tank.x, tank.y);
        this.game.triggerScreenShake(C.SCREEN_SHAKE_ENEMY_KILL || 4, 0.15);

        // Play death sound
        if (typeof gameState !== 'undefined' && gameState.audioManager) {
            gameState.audioManager.playSound('enemy_death', {
                volume: C.AUDIO_ENEMY_DEATH_VOLUME || 0.6
            });
        }

        // Coin reward via existing enemy kill system
        if (this.game.onEnemyKilled) {
            this.game.onEnemyKilled(`tank-${this.currentWave}-${index}`, tank.x, tank.y);
        }
    }

    destroyCrate(index) {
        const crate = this.crates[index];
        crate.alive = false;

        // Debris particles
        this.game.spawnDeathParticles(crate.x, crate.y);

        // Remove from zone walls
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => w.crateId !== crate.id);
        }

        // Health drop chance
        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
        if (Math.random() < (C.TANK_HEALTH_DROP_CHANCE || 0.3)) {
            this.healthPickups.push({
                x: crate.x,
                y: crate.y,
                bobTimer: 0
            });
        }
    }

    restart() {
        this.gameOver = false;
        this.victory = false;
        this.tankEnemies = [];
        this.tankProjectiles = [];
        this.healthPickups = [];

        // Reset crates
        this.crates.forEach(c => {
            c.alive = true;
            c.hp = c.maxHp;
        });

        // Reset zone walls (re-add crate walls)
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => !w.isCrate);
            this.crates.forEach(crate => {
                this.game.zone.walls.push({
                    x: crate.x - 20,
                    y: crate.y - 20,
                    width: 40,
                    height: 40,
                    isCrate: true,
                    crateId: crate.id
                });
            });
        }

        // Respawn player
        if (this.game.localPlayer) {
            this.game.localPlayer.hp = this.game.localPlayer.maxHp;
            this.game.localPlayer.isDead = false;
            this.game.localPlayer.x = 480;
            this.game.localPlayer.y = 880;
            this.game.hideDeathScreen();
        }

        this.startWave(0);
    }

    draw(ctx, cameraX, cameraY) {
        // Draw arena floor background (concrete/military look)
        this.drawArenaFloor(ctx, cameraX, cameraY);

        // Draw crates
        this.crates.forEach(crate => {
            if (!crate.alive) return;
            const sx = crate.x - cameraX;
            const sy = crate.y - cameraY;

            // Wooden crate body
            ctx.fillStyle = '#a08050';
            ctx.fillRect(sx - crate.width / 2, sy - crate.height / 2, crate.width, crate.height);

            // Cross detail
            ctx.strokeStyle = '#6b5344';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx - crate.width / 2, sy - crate.height / 2);
            ctx.lineTo(sx + crate.width / 2, sy + crate.height / 2);
            ctx.moveTo(sx + crate.width / 2, sy - crate.height / 2);
            ctx.lineTo(sx - crate.width / 2, sy + crate.height / 2);
            ctx.stroke();

            // Outline
            ctx.strokeStyle = '#5a4030';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - crate.width / 2, sy - crate.height / 2, crate.width, crate.height);

            // HP indicator (cracks)
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

            // Green glow
            ctx.fillStyle = 'rgba(46, 204, 113, 0.3)';
            ctx.beginPath();
            ctx.arc(sx, sy, 16, 0, Math.PI * 2);
            ctx.fill();

            // Heart/cross icon
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

        // Draw tank projectiles (red glow to distinguish from player's yellow)
        this.tankProjectiles.forEach(proj => {
            const sx = proj.x - cameraX;
            const sy = proj.y - cameraY;

            // Red bullet body
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(sx, sy, proj.radius, 0, Math.PI * 2);
            ctx.fill();

            // Red glow
            ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
            ctx.beginPath();
            ctx.arc(sx, sy, proj.radius * 1.8, 0, Math.PI * 2);
            ctx.fill();

            // Trail
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

        // Draw wave UI
        this.drawWaveUI(ctx);
    }

    drawArenaFloor(ctx, cameraX, cameraY) {
        // Only draw if tileset not loaded (zone JSON handles tiles normally)
        if (typeof tilesetManager !== 'undefined' && tilesetManager && tilesetManager.loaded) return;

        // Concrete floor fallback
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

        // Boss glow
        if (tank.type === 'boss') {
            const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 200);
            ctx.fillStyle = `rgba(176, 64, 64, ${pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(sx, sy, tank.width * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Tank body
        ctx.translate(sx, sy);
        ctx.rotate(tank.angle);

        const bodyColor = tank.flashTimer > 0 ? '#fff' : tank.color;
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);

        // Treads
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(-tank.width / 2, -tank.height / 2 - 2, tank.width, 4);
        ctx.fillRect(-tank.width / 2, tank.height / 2 - 2, tank.width, 4);

        // Body outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);

        ctx.rotate(-tank.angle);

        // Turret (rotates independently to aim at player)
        ctx.rotate(tank.turretAngle);
        ctx.fillStyle = tank.turretColor;
        const turretLen = tank.type === 'boss' ? 26 : 18;
        const turretWidth = tank.type === 'boss' ? 8 : 5;
        ctx.fillRect(0, -turretWidth / 2, turretLen, turretWidth);

        // Turret hub
        ctx.fillStyle = tank.turretColor;
        ctx.beginPath();
        ctx.arc(0, 0, tank.type === 'boss' ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // HP bar
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

        // Wave banner
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

        // Enemies remaining (top right)
        if (this.waveActive && !this.gameOver && !this.victory) {
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

        // Game over / victory
        if (this.gameOver) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = '#b04040';
            ctx.font = 'bold 40px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('MISSION FAILED', ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
            ctx.fillStyle = '#e0d8c8';
            ctx.font = '18px monospace';
            ctx.fillText('Press SPACE to retry', ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
            ctx.restore();
        }

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
        // Clean up - remove added walls from zone
        if (this.game.zone) {
            this.game.zone.walls = this.game.zone.walls.filter(w => !w.isPillar && !w.isCrate);
        }
        this.tankEnemies = [];
        this.tankProjectiles = [];
        this.crates = [];
        this.healthPickups = [];
    }
}
