// Sprite manager for loading and caching images

class SpriteManager {
    constructor() {
        this.sprites = {};
        this.loaded = false;
        this.loading = false;
        this.loadPromise = null;
    }

    async loadAll() {
        if (this.loaded || this.loading) {
            return this.loadPromise;
        }

        this.loading = true;

        const manifest = {
            player: 'sprites/player.png',
            playerWalk1: 'sprites/player_walk1.png',
            playerWalk2: 'sprites/player_walk2.png',
            enemy: 'sprites/enemy.png',
            doorClosed: 'sprites/door_closed.png',
            doorOpen: 'sprites/door_open.png',
            wallTile: 'sprites/wall_tile.png',
            floorTile: 'sprites/floor_tile.png'
        };

        this.loadPromise = Promise.all(
            Object.entries(manifest).map(([key, path]) =>
                this.loadSprite(key, path).catch(err => {
                    console.warn(`Failed to load sprite: ${path}`, err);
                    return null;
                })
            )
        ).then(() => {
            this.loaded = true;
            this.loading = false;
            console.log('Sprites loaded:', Object.keys(this.sprites).length);
        });

        return this.loadPromise;
    }

    loadSprite(key, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.sprites[key] = img;
                resolve(img);
            };
            img.onerror = () => {
                reject(new Error(`Failed to load: ${path}`));
            };
            img.src = path;
        });
    }

    get(key) {
        return this.sprites[key] || null;
    }

    has(key) {
        return key in this.sprites;
    }
}

// Global sprite manager instance
const spriteManager = new SpriteManager();
