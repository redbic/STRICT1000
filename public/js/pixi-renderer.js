// PixiJS Renderer - WebGL-accelerated rendering wrapper

class PixiRenderer {
    constructor() {
        this.app = null;
        this.containers = {};
        this.initialized = false;
        this.worldContainer = null;
        this.uiContainer = null;

        // Sprite/graphics pools for reuse
        this.playerSprites = new Map();
        this.enemySprites = new Map();
        this.npcSprites = new Map();
        this.projectileSprites = [];
        this.sparkSprites = [];

        // Environment graphics (created once per zone)
        this.floorGraphics = null;
        this.wallGraphics = [];
        this.portalGraphics = [];
        this.decorationGraphics = [];
        this.itemGraphics = [];

        // Effects
        this.vignetteSprite = null;
        this.screenFlashGraphics = null;
    }

    async init(canvas) {
        // Create PixiJS application
        this.app = new PIXI.Application();

        await this.app.init({
            canvas: canvas,
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x050505,
            antialias: false,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            powerPreference: 'high-performance'
        });

        // Create world container (moves with camera)
        this.worldContainer = new PIXI.Container();
        this.app.stage.addChild(this.worldContainer);

        // Create layer containers within world (z-ordering)
        this.containers = {
            floor: new PIXI.Container(),
            walls: new PIXI.Container(),
            items: new PIXI.Container(),
            portals: new PIXI.Container(),
            decorations: new PIXI.Container(),
            entities: new PIXI.Container(),
            projectiles: new PIXI.Container(),
            effects: new PIXI.Container()
        };

        // Add containers in order (back to front)
        this.worldContainer.addChild(this.containers.floor);
        this.worldContainer.addChild(this.containers.walls);
        this.worldContainer.addChild(this.containers.items);
        this.worldContainer.addChild(this.containers.portals);
        this.worldContainer.addChild(this.containers.decorations);
        this.worldContainer.addChild(this.containers.entities);
        this.worldContainer.addChild(this.containers.projectiles);
        this.worldContainer.addChild(this.containers.effects);

        // Create UI container (fixed to screen, doesn't move with camera)
        this.uiContainer = new PIXI.Container();
        this.app.stage.addChild(this.uiContainer);

        // Create vignette effect
        this.createVignette();

        // Create screen flash overlay
        this.createScreenFlash();

        this.initialized = true;
        console.log('PixiJS Renderer initialized (WebGL)');
    }

    // Camera follows player
    updateCamera(playerX, playerY) {
        if (!this.worldContainer) return;
        this.worldContainer.x = -playerX + this.app.screen.width / 2;
        this.worldContainer.y = -playerY + this.app.screen.height / 2;
    }

    // Handle window resize
    resize() {
        if (!this.app) return;
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
        this.createVignette(); // Recreate vignette for new size
    }

    // Create dark vignette overlay effect
    createVignette() {
        if (this.vignetteSprite) {
            this.uiContainer.removeChild(this.vignetteSprite);
            this.vignetteSprite.destroy();
        }

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        // Create canvas for gradient (PixiJS can use canvas as texture)
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Radial gradient from center (transparent) to edges (dark)
        const centerX = w / 2;
        const centerY = h / 2;
        const outerRadius = Math.max(w, h) * 0.7;

        const gradient = ctx.createRadialGradient(
            centerX, centerY, w * 0.2,
            centerX, centerY, outerRadius
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        // Create sprite from canvas
        const texture = PIXI.Texture.from(canvas);
        this.vignetteSprite = new PIXI.Sprite(texture);
        this.vignetteSprite.zIndex = 1000;
        this.uiContainer.addChild(this.vignetteSprite);
    }

    // Create screen flash overlay for damage feedback
    createScreenFlash() {
        if (this.screenFlashGraphics) {
            this.uiContainer.removeChild(this.screenFlashGraphics);
            this.screenFlashGraphics.destroy();
        }

        this.screenFlashGraphics = new PIXI.Graphics();
        this.screenFlashGraphics.rect(0, 0, this.app.screen.width, this.app.screen.height);
        this.screenFlashGraphics.fill({ color: 0xff0000, alpha: 0 });
        this.screenFlashGraphics.zIndex = 999;
        this.uiContainer.addChild(this.screenFlashGraphics);
    }

    // Show screen flash (call when player takes damage)
    triggerScreenFlash(alpha = 0.3) {
        if (!this.screenFlashGraphics) return;
        this.screenFlashGraphics.alpha = alpha;
    }

    // Update screen flash (call every frame)
    updateScreenFlash(dt) {
        if (!this.screenFlashGraphics) return;
        if (this.screenFlashGraphics.alpha > 0) {
            this.screenFlashGraphics.alpha -= dt * 3; // Fade out
            if (this.screenFlashGraphics.alpha < 0) {
                this.screenFlashGraphics.alpha = 0;
            }
        }
    }

    // Clear zone graphics (call when changing zones)
    clearZone() {
        // Clear all world containers
        Object.values(this.containers).forEach(container => {
            container.removeChildren();
        });

        // Clear pools
        this.playerSprites.clear();
        this.enemySprites.clear();
        this.projectileSprites = [];
        this.sparkSprites = [];
        this.wallGraphics = [];
        this.portalGraphics = [];
        this.decorationGraphics = [];
        this.itemGraphics = [];
        this.floorGraphics = null;
    }

    // Build zone graphics (call once when entering a zone)
    buildZone(zone) {
        this.clearZone();
        this.buildFloor(zone);
        this.buildWalls(zone);
        this.buildPortals(zone);
        this.buildDecorations(zone);
        this.buildItems(zone);
    }

    // Build tiled floor
    buildFloor(zone) {
        const floor = new PIXI.Graphics();
        const floorColor = parseInt((zone.floorColor || '#080505').replace('#', ''), 16);

        // Draw solid floor
        floor.rect(0, 0, zone.width, zone.height);
        floor.fill({ color: floorColor });

        // Draw subtle grid lines
        const gridColor = 0x1a0a0a;
        const tileSize = 64;

        for (let x = 0; x <= zone.width; x += tileSize) {
            floor.moveTo(x, 0);
            floor.lineTo(x, zone.height);
        }
        for (let y = 0; y <= zone.height; y += tileSize) {
            floor.moveTo(0, y);
            floor.lineTo(zone.width, y);
        }
        floor.stroke({ color: gridColor, alpha: 0.3, width: 1 });

        this.floorGraphics = floor;
        this.containers.floor.addChild(floor);
    }

    // Build wall graphics
    buildWalls(zone) {
        const wallColor = parseInt((zone.wallColor || '#0d0d0d').replace('#', ''), 16);

        zone.walls.forEach(wall => {
            const g = new PIXI.Graphics();

            if (wall.isPillar) {
                // Pillar style
                g.rect(wall.x, wall.y, wall.width, wall.height);
                g.fill({ color: 0x1a1a1a });

                // Red accent stripe
                g.rect(wall.x + wall.width / 2 - 1, wall.y, 2, wall.height);
                g.fill({ color: 0x8b0000, alpha: 0.4 });
            } else {
                // Normal wall
                g.rect(wall.x, wall.y, wall.width, wall.height);
                g.fill({ color: wallColor });

                // Red accent on top
                g.rect(wall.x, wall.y, wall.width, 2);
                g.fill({ color: 0x8b0000, alpha: 0.4 });

                // Inner shadow
                g.rect(wall.x + 2, wall.y + 2, wall.width - 4, wall.height - 4);
                g.fill({ color: 0x000000, alpha: 0.3 });
            }

            this.wallGraphics.push(g);
            this.containers.walls.addChild(g);
        });
    }

    // Build portal/door graphics
    buildPortals(zone) {
        zone.portals.forEach(portal => {
            const container = new PIXI.Container();
            container.x = portal.x;
            container.y = portal.y;

            // Red glow under door
            const glow = new PIXI.Graphics();
            glow.rect(0, portal.height - 3, portal.width, 6);
            glow.fill({ color: 0x8b0000, alpha: 0.4 });
            container.addChild(glow);

            // Door frame
            const frame = new PIXI.Graphics();
            frame.rect(-4, -4, portal.width + 8, portal.height + 8);
            frame.fill({ color: 0x1a0a0a });
            container.addChild(frame);

            // Door body
            const door = new PIXI.Graphics();
            door.rect(0, 0, portal.width, portal.height);
            door.fill({ color: 0x0d0505 });

            // Door panels
            door.moveTo(portal.width * 0.33, 5);
            door.lineTo(portal.width * 0.33, portal.height - 5);
            door.moveTo(portal.width * 0.66, 5);
            door.lineTo(portal.width * 0.66, portal.height - 5);
            door.stroke({ color: 0x2a0a0a, width: 2 });

            // Door handle
            door.circle(portal.width - 12, portal.height / 2, 4);
            door.fill({ color: 0x8b6f47 });

            container.addChild(door);

            // Label plaque
            if (portal.label) {
                const plaque = new PIXI.Graphics();
                plaque.rect(portal.width / 2 - 45, -30, 90, 22);
                plaque.fill({ color: 0x1a0a0a });
                plaque.rect(portal.width / 2 - 45, -30, 90, 22);
                plaque.stroke({ color: 0x4a0000, width: 1 });
                container.addChild(plaque);

                const label = new PIXI.Text({
                    text: portal.label.toUpperCase(),
                    style: {
                        fontFamily: 'serif',
                        fontSize: 11,
                        fontWeight: 'bold',
                        fill: 0x8b0000
                    }
                });
                label.anchor.set(0.5, 0.5);
                label.x = portal.width / 2;
                label.y = -19;
                container.addChild(label);
            }

            // Locked indicator
            if (portal.locked) {
                const lock = new PIXI.Graphics();
                lock.circle(portal.width / 2, portal.height / 2, 18);
                lock.fill({ color: 0x8b0000, alpha: 0.8 });
                container.addChild(lock);

                const lockIcon = new PIXI.Text({
                    text: '🔒',
                    style: { fontSize: 18 }
                });
                lockIcon.anchor.set(0.5, 0.5);
                lockIcon.x = portal.width / 2;
                lockIcon.y = portal.height / 2;
                container.addChild(lockIcon);
            }

            this.portalGraphics.push(container);
            this.containers.portals.addChild(container);
        });
    }

    // Build decoration graphics
    buildDecorations(zone) {
        if (!zone.decorations) return;

        // Chandelier
        if (zone.decorations.chandelier) {
            const ch = zone.decorations.chandelier;
            const container = new PIXI.Container();
            container.x = ch.x;
            container.y = ch.y;

            // Glow effect (large semi-transparent circle)
            const glow = new PIXI.Graphics();
            glow.circle(0, 0, 200);
            glow.fill({ color: 0x8b0000, alpha: 0.1 });
            container.addChild(glow);

            // Body
            const body = new PIXI.Graphics();
            body.circle(0, 0, 12);
            body.fill({ color: 0x1a0a0a });
            container.addChild(body);

            // Crystals
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const crystal = new PIXI.Graphics();
                crystal.circle(Math.cos(angle) * 24, 18, 5);
                crystal.fill({ color: 0x8b0000 });
                container.addChild(crystal);
            }

            this.decorationGraphics.push(container);
            this.containers.decorations.addChild(container);
        }

        // Clock
        if (zone.decorations.clock) {
            const cl = zone.decorations.clock;
            const container = new PIXI.Container();
            container.x = cl.x;
            container.y = cl.y;

            // Body
            const body = new PIXI.Graphics();
            body.rect(-22, 0, 44, 155);
            body.fill({ color: 0x0d0505 });
            body.rect(-22, 0, 44, 155);
            body.stroke({ color: 0x4a0000, width: 2 });
            container.addChild(body);

            // Face
            const face = new PIXI.Graphics();
            face.circle(0, 32, 26);
            face.fill({ color: 0x1a0a0a });
            face.circle(0, 32, 26);
            face.stroke({ color: 0x8b0000, alpha: 0.6, width: 2 });
            container.addChild(face);

            // Store reference for hand animation
            container.clockHands = { hour: null, minute: null };

            // Hour hand
            const hourHand = new PIXI.Graphics();
            hourHand.moveTo(0, 0);
            hourHand.lineTo(0, -12);
            hourHand.stroke({ color: 0x8b0000, width: 2, cap: 'round' });
            hourHand.x = 0;
            hourHand.y = 32;
            container.addChild(hourHand);
            container.clockHands.hour = hourHand;

            // Minute hand
            const minuteHand = new PIXI.Graphics();
            minuteHand.moveTo(0, 0);
            minuteHand.lineTo(0, -18);
            minuteHand.stroke({ color: 0x8b0000, width: 2, cap: 'round' });
            minuteHand.x = 0;
            minuteHand.y = 32;
            container.addChild(minuteHand);
            container.clockHands.minute = minuteHand;

            // Center dot
            const center = new PIXI.Graphics();
            center.circle(0, 32, 3);
            center.fill({ color: 0x8b0000 });
            container.addChild(center);

            this.decorationGraphics.push(container);
            this.containers.decorations.addChild(container);
        }

        // Portraits
        if (zone.decorations.portraits) {
            zone.decorations.portraits.forEach(p => {
                const container = new PIXI.Container();
                container.x = p.x;
                container.y = p.y;

                // Frame
                const frame = new PIXI.Graphics();
                frame.rect(-42, -62, 84, 104);
                frame.fill({ color: 0x0d0505 });
                frame.rect(-42, -62, 84, 104);
                frame.stroke({ color: 0x4a0000, width: 2 });
                container.addChild(frame);

                // Inner
                const inner = new PIXI.Graphics();
                inner.rect(-36, -56, 72, 92);
                inner.fill({ color: 0x050505 });
                container.addChild(inner);

                // Figure
                const figure = new PIXI.Graphics();
                figure.circle(0, -22, 16);
                figure.fill({ color: 0x1a0a0a });
                figure.rect(-22, -2, 44, 34);
                figure.fill({ color: 0x1a0a0a });
                container.addChild(figure);

                // Eyes
                const eyes = new PIXI.Graphics();
                eyes.circle(-5, -24, 2);
                eyes.circle(5, -24, 2);
                eyes.fill({ color: 0x8b0000 });
                container.addChild(eyes);

                this.decorationGraphics.push(container);
                this.containers.decorations.addChild(container);
            });
        }
    }

    // Build item graphics
    buildItems(zone) {
        if (!zone.items) return;

        zone.items.forEach((item, index) => {
            const container = new PIXI.Container();
            container.x = item.x;
            container.y = item.y;

            // Red glow
            const glow = new PIXI.Graphics();
            glow.circle(0, 0, 14);
            glow.fill({ color: 0x8b0000, alpha: 0.3 });
            container.addChild(glow);

            // Icon
            const icon = new PIXI.Text({
                text: item.icon || '📦',
                style: { fontSize: 18 }
            });
            icon.anchor.set(0.5, 0.5);
            container.addChild(icon);

            container.itemData = item;
            container.itemIndex = index;
            this.itemGraphics.push(container);
            this.containers.items.addChild(container);
        });
    }

    // Remove an item (when picked up)
    removeItem(index) {
        const itemG = this.itemGraphics.find(g => g.itemIndex === index);
        if (itemG) {
            this.containers.items.removeChild(itemG);
            itemG.destroy();
            this.itemGraphics = this.itemGraphics.filter(g => g !== itemG);
        }
    }

    // Update clock hands animation
    updateClockHands() {
        const clockContainer = this.decorationGraphics.find(d => d.clockHands);
        if (!clockContainer) return;

        const time = new Date();
        const hours = time.getHours() % 12;
        const minutes = time.getMinutes();

        const hourAngle = (hours + minutes / 60) * (Math.PI / 6);
        const minuteAngle = minutes * (Math.PI / 30);

        if (clockContainer.clockHands.hour) {
            clockContainer.clockHands.hour.rotation = hourAngle;
        }
        if (clockContainer.clockHands.minute) {
            clockContainer.clockHands.minute.rotation = minuteAngle;
        }
    }

    // Create or get player sprite
    getPlayerSprite(player) {
        if (this.playerSprites.has(player.id)) {
            return this.playerSprites.get(player.id);
        }

        const sprite = this.createPlayerSprite(player);
        this.playerSprites.set(player.id, sprite);
        this.containers.entities.addChild(sprite);
        return sprite;
    }

    // Create player sprite container
    createPlayerSprite(player) {
        const container = new PIXI.Container();

        // Shadow
        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 16, 14, 6);
        shadow.fill({ color: 0x000000, alpha: 0.6 });
        container.addChild(shadow);

        // Body
        const body = new PIXI.Graphics();
        body.ellipse(0, 2, 14, 11);
        body.fill({ color: 0x1a1a2e });
        body.ellipse(0, 2, 14, 11);
        body.stroke({ color: 0x8b0000, alpha: 0.5, width: 1.5 });
        container.addChild(body);
        container.body = body;

        // Red stripe
        const stripe = new PIXI.Graphics();
        stripe.moveTo(0, -8);
        stripe.lineTo(0, 10);
        stripe.stroke({ color: 0x8b0000, width: 2 });
        container.addChild(stripe);

        // Head
        const head = new PIXI.Graphics();
        head.circle(0, -12, 8);
        head.fill({ color: 0x2a2a2a });
        container.addChild(head);

        // Eyes
        const eyes = new PIXI.Graphics();
        eyes.circle(-3, -12, 1.5);
        eyes.circle(3, -12, 1.5);
        eyes.fill({ color: 0x8b0000 });
        container.addChild(eyes);

        // Gun (will be rotated)
        const gun = new PIXI.Graphics();
        gun.moveTo(0, 0);
        gun.lineTo(28, 0);
        gun.stroke({ color: 0x1a1a1a, width: 6, cap: 'round' });
        gun.moveTo(10, 0);
        gun.lineTo(28, 0);
        gun.stroke({ color: 0x4a0000, width: 2 });
        gun.x = 11;
        gun.y = 0;
        container.addChild(gun);
        container.gun = gun;

        // Muzzle flash (hidden by default)
        const flash = new PIXI.Graphics();
        flash.circle(0, 0, 10);
        flash.fill({ color: 0xff5028 });
        flash.x = 39;
        flash.y = 0;
        flash.visible = false;
        container.addChild(flash);
        container.muzzleFlash = flash;

        // Username label
        const nameLabel = new PIXI.Text({
            text: player.username || 'Player',
            style: {
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 12,
                fill: 0x999999
            }
        });
        nameLabel.anchor.set(0.5, 0);
        nameLabel.y = -48;
        container.addChild(nameLabel);
        container.nameLabel = nameLabel;

        return container;
    }

    // Update player sprite position/rotation
    updatePlayerSprite(player) {
        const sprite = this.getPlayerSprite(player);
        sprite.x = player.x;
        sprite.y = player.y;

        // Update gun rotation
        if (sprite.gun) {
            sprite.gun.rotation = player.angle;
        }

        // Update muzzle flash
        if (sprite.muzzleFlash) {
            sprite.muzzleFlash.rotation = player.angle;
            sprite.muzzleFlash.x = 11 + Math.cos(player.angle) * 34;
            sprite.muzzleFlash.y = Math.sin(player.angle) * 34;
            sprite.muzzleFlash.visible = player.muzzleFlash && player.muzzleFlash.active;
        }

        // Damage flash
        if (sprite.body && player.damageFlashTimer > 0) {
            sprite.body.tint = 0xff0000;
        } else if (sprite.body) {
            sprite.body.tint = 0xffffff;
        }

        // Update name
        if (sprite.nameLabel) {
            sprite.nameLabel.text = player.username || 'Player';
        }
    }

    // Remove player sprite
    removePlayerSprite(playerId) {
        const sprite = this.playerSprites.get(playerId);
        if (sprite) {
            this.containers.entities.removeChild(sprite);
            sprite.destroy();
            this.playerSprites.delete(playerId);
        }
    }

    // Create or get enemy sprite
    getEnemySprite(enemy) {
        if (this.enemySprites.has(enemy.id)) {
            return this.enemySprites.get(enemy.id);
        }

        const sprite = this.createEnemySprite(enemy);
        this.enemySprites.set(enemy.id, sprite);
        this.containers.entities.addChild(sprite);
        return sprite;
    }

    // Create enemy sprite container
    createEnemySprite(enemy) {
        const container = new PIXI.Container();

        // Shadow
        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, enemy.width / 2 + 4, enemy.width / 2, 4);
        shadow.fill({ color: 0x000000, alpha: 0.6 });
        container.addChild(shadow);

        // Body
        const body = new PIXI.Graphics();
        body.circle(0, 0, enemy.width / 2);
        body.fill({ color: 0x2d0a0a });
        body.circle(0, 0, enemy.width / 2);
        body.stroke({ color: 0x8b0000, alpha: 0.5, width: 2 });
        container.addChild(body);

        // Eyes
        const eyes = new PIXI.Graphics();
        eyes.circle(-4, -2, 2.5);
        eyes.circle(4, -2, 2.5);
        eyes.fill({ color: 0xff0000 });
        container.addChild(eyes);

        // HP bar background
        const hpBg = new PIXI.Graphics();
        hpBg.rect(-18, -24, 36, 5);
        hpBg.fill({ color: 0x000000, alpha: 0.7 });
        container.addChild(hpBg);

        // HP bar fill
        const hpBar = new PIXI.Graphics();
        hpBar.rect(-18, -24, 36, 5);
        hpBar.fill({ color: 0x8b0000 });
        container.addChild(hpBar);
        container.hpBar = hpBar;
        container.maxHp = enemy.maxHp;

        return container;
    }

    // Update enemy sprite
    updateEnemySprite(enemy) {
        const sprite = this.getEnemySprite(enemy);
        sprite.x = enemy.x;
        sprite.y = enemy.y;

        // Update HP bar
        if (sprite.hpBar) {
            const hpRatio = enemy.hp / (sprite.maxHp || enemy.maxHp);
            sprite.hpBar.clear();
            sprite.hpBar.rect(-18, -24, 36 * hpRatio, 5);
            sprite.hpBar.fill({ color: 0x8b0000 });
        }
    }

    // Remove enemy sprite
    removeEnemySprite(enemyId) {
        const sprite = this.enemySprites.get(enemyId);
        if (sprite) {
            this.containers.entities.removeChild(sprite);
            sprite.destroy();
            this.enemySprites.delete(enemyId);
        }
    }

    // Create or get NPC sprite
    getNpcSprite(npc) {
        const key = `${npc.x}-${npc.y}-${npc.name}`;
        if (this.npcSprites.has(key)) {
            return this.npcSprites.get(key);
        }

        const sprite = this.createNpcSprite(npc);
        this.npcSprites.set(key, sprite);
        this.containers.entities.addChild(sprite);
        return sprite;
    }

    // Create NPC sprite container
    createNpcSprite(npc) {
        const container = new PIXI.Container();

        const color = parseInt((npc.color || '#d4a745').replace('#', ''), 16);

        // Body
        const body = new PIXI.Graphics();
        body.circle(0, 0, npc.width / 2);
        body.fill({ color: color });
        container.addChild(body);

        // Diamond/hat shape on top
        const hat = new PIXI.Graphics();
        hat.moveTo(0, -npc.height / 2 - 8);
        hat.lineTo(-6, -npc.height / 2);
        hat.lineTo(0, -npc.height / 2 - 2);
        hat.lineTo(6, -npc.height / 2);
        hat.closePath();
        hat.fill({ color: 0xf5e6b8 });
        container.addChild(hat);

        // Name label
        const nameLabel = new PIXI.Text({
            text: npc.name,
            style: {
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 'bold',
                fill: 0xd4a745
            }
        });
        nameLabel.anchor.set(0.5, 1);
        nameLabel.y = -npc.height / 2 - 14;
        container.addChild(nameLabel);

        return container;
    }

    // Update NPC sprite
    updateNpcSprite(npc) {
        const sprite = this.getNpcSprite(npc);
        sprite.x = npc.x;
        sprite.y = npc.y;
    }

    // Create projectile sprite
    createProjectileSprite(projectile) {
        const container = new PIXI.Container();
        container.x = projectile.x;
        container.y = projectile.y;

        // Glow
        const glow = new PIXI.Graphics();
        glow.circle(0, 0, 9);
        glow.fill({ color: 0xf1c40f, alpha: 0.3 });
        container.addChild(glow);

        // Bullet
        const bullet = new PIXI.Graphics();
        bullet.circle(0, 0, 5);
        bullet.fill({ color: 0xf1c40f });
        container.addChild(bullet);

        // Trail
        const trail = new PIXI.Graphics();
        trail.moveTo(0, 0);
        trail.lineTo(-10, 0);
        trail.stroke({ color: 0xf1c40f, alpha: 0.5, width: 3 });
        trail.rotation = projectile.angle;
        container.addChild(trail);
        container.trail = trail;

        container.projectileId = projectile.id || Math.random();
        this.projectileSprites.push(container);
        this.containers.projectiles.addChild(container);

        return container;
    }

    // Update projectile sprite
    updateProjectileSprite(projectile, sprite) {
        sprite.x = projectile.x;
        sprite.y = projectile.y;
        if (sprite.trail) {
            sprite.trail.rotation = projectile.angle;
        }
    }

    // Remove projectile sprite
    removeProjectileSprite(sprite) {
        this.containers.projectiles.removeChild(sprite);
        sprite.destroy();
        this.projectileSprites = this.projectileSprites.filter(s => s !== sprite);
    }

    // Create hit spark
    createSpark(x, y) {
        const spark = new PIXI.Graphics();
        spark.circle(0, 0, 3);
        spark.fill({ color: 0xff5028 });
        spark.x = x;
        spark.y = y;
        spark.vx = (Math.random() - 0.5) * 150;
        spark.vy = (Math.random() - 0.5) * 150;
        spark.life = 0.3 + Math.random() * 0.2;

        this.sparkSprites.push(spark);
        this.containers.effects.addChild(spark);
    }

    // Update sparks
    updateSparks(dt) {
        for (let i = this.sparkSprites.length - 1; i >= 0; i--) {
            const spark = this.sparkSprites[i];
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            spark.vx *= 0.95;
            spark.vy *= 0.95;
            spark.life -= dt;
            spark.alpha = Math.min(1, spark.life * 3);

            if (spark.life <= 0) {
                this.containers.effects.removeChild(spark);
                spark.destroy();
                this.sparkSprites.splice(i, 1);
            }
        }
    }

    // Cleanup
    destroy() {
        this.clearZone();
        if (this.app) {
            this.app.destroy(true, { children: true, texture: true });
        }
    }
}

// Global renderer instance
let pixiRenderer = null;
