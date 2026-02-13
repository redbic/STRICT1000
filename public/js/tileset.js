// Tileset loader and renderer for LimeZu Modern Interiors

class TilesetManager {
    constructor() {
        this.tilesets = new Map();
        this.tileSize = 16;
        this.scale = 3; // Scale up 16px tiles to 48px for visibility
        this.loaded = false;
    }

    async loadAll() {
        const tilesetFiles = {
            floors: '/assets/tiles/Room_Builder_Floors_16x16.png',
            walls: '/assets/tiles/Room_Builder_Walls_16x16.png',
            generic: '/assets/tiles/1_Generic_16x16.png',
            livingRoom: '/assets/tiles/2_LivingRoom_16x16.png',
            bedroom: '/assets/tiles/4_Bedroom_16x16.png',
            conference: '/assets/tiles/13_Conference_Hall_16x16.png'
        };

        const loadPromises = Object.entries(tilesetFiles).map(([name, path]) => {
            return this.loadTileset(name, path);
        });

        await Promise.all(loadPromises);
        this.loaded = true;
        console.log('All tilesets loaded');
    }

    loadTileset(name, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.tilesets.set(name, {
                    image: img,
                    width: img.width,
                    height: img.height,
                    tilesPerRow: Math.floor(img.width / this.tileSize),
                    tilesPerCol: Math.floor(img.height / this.tileSize)
                });
                console.log(`Loaded tileset: ${name} (${img.width}x${img.height})`);
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load tileset: ${name} from ${path}`);
                resolve(); // Don't reject, just continue without this tileset
            };
            img.src = path;
        });
    }

    getTileset(name) {
        return this.tilesets.get(name);
    }

    // Draw a single tile from a tileset
    drawTile(ctx, tilesetName, tileX, tileY, destX, destY, scale = this.scale) {
        const tileset = this.tilesets.get(tilesetName);
        if (!tileset) return;

        const srcX = tileX * this.tileSize;
        const srcY = tileY * this.tileSize;
        const destSize = this.tileSize * scale;

        ctx.imageSmoothingEnabled = false; // Pixel-perfect scaling
        ctx.drawImage(
            tileset.image,
            srcX, srcY, this.tileSize, this.tileSize,
            destX, destY, destSize, destSize
        );
    }

    // Draw a tile by index (left-to-right, top-to-bottom)
    drawTileByIndex(ctx, tilesetName, index, destX, destY, scale = this.scale) {
        const tileset = this.tilesets.get(tilesetName);
        if (!tileset) return;

        const tileX = index % tileset.tilesPerRow;
        const tileY = Math.floor(index / tileset.tilesPerRow);
        this.drawTile(ctx, tilesetName, tileX, tileY, destX, destY, scale);
    }

    // Get the scaled tile size
    getScaledTileSize() {
        return this.tileSize * this.scale;
    }
}

// Tilemap class for defining room layouts
class TileMap {
    constructor(width, height, tileSize = 48) {
        this.width = width;   // Width in tiles
        this.height = height; // Height in tiles
        this.tileSize = tileSize;

        // Layers: floor, walls, furniture (back to front)
        this.layers = {
            floor: this.createLayer(),
            walls: this.createLayer(),
            furniture: this.createLayer(),
            foreground: this.createLayer() // Things drawn on top of player
        };

        // Collision map (true = solid)
        this.collision = new Array(width * height).fill(false);
    }

    createLayer() {
        return new Array(this.width * this.height).fill(null);
    }

    // Set a tile at position
    setTile(layer, x, y, tileData) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        const index = y * this.width + x;
        this.layers[layer][index] = tileData;
    }

    // Get a tile at position
    getTile(layer, x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.layers[layer][y * this.width + x];
    }

    // Set collision at position
    setCollision(x, y, solid = true) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.collision[y * this.width + x] = solid;
    }

    // Check collision at world position
    isCollision(worldX, worldY) {
        const tileX = Math.floor(worldX / this.tileSize);
        const tileY = Math.floor(worldY / this.tileSize);
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return true; // Outside bounds is solid
        }
        return this.collision[tileY * this.width + tileX];
    }

    // Fill a rectangle with a tile
    fillRect(layer, x, y, w, h, tileData) {
        for (let ty = y; ty < y + h; ty++) {
            for (let tx = x; tx < x + w; tx++) {
                this.setTile(layer, tx, ty, tileData);
            }
        }
    }

    // Fill collision rectangle
    fillCollision(x, y, w, h, solid = true) {
        for (let ty = y; ty < y + h; ty++) {
            for (let tx = x; tx < x + w; tx++) {
                this.setCollision(tx, ty, solid);
            }
        }
    }

    // Draw a layer
    drawLayer(ctx, layerName, cameraX, cameraY, tilesetManager) {
        const layer = this.layers[layerName];
        if (!layer) return;

        const startTileX = Math.floor(cameraX / this.tileSize);
        const startTileY = Math.floor(cameraY / this.tileSize);
        const tilesX = Math.ceil(ctx.canvas.width / this.tileSize) + 2;
        const tilesY = Math.ceil(ctx.canvas.height / this.tileSize) + 2;

        for (let ty = startTileY; ty < startTileY + tilesY; ty++) {
            for (let tx = startTileX; tx < startTileX + tilesX; tx++) {
                const tile = this.getTile(layerName, tx, ty);
                if (!tile) continue;

                const screenX = tx * this.tileSize - cameraX;
                const screenY = ty * this.tileSize - cameraY;

                tilesetManager.drawTile(
                    ctx,
                    tile.tileset,
                    tile.tileX,
                    tile.tileY,
                    screenX,
                    screenY,
                    this.tileSize / tilesetManager.tileSize
                );
            }
        }
    }

    // Get world dimensions
    getWorldWidth() {
        return this.width * this.tileSize;
    }

    getWorldHeight() {
        return this.height * this.tileSize;
    }
}

// Predefined tile references for easy use
const TILES = {
    // Floor tiles (from Room_Builder_Floors_16x16.png)
    // Each column is a different floor type, rows have variations
    FLOOR: {
        // Beige carpet (column 1, around row 3-6)
        CARPET_BEIGE: { tileset: 'floors', tileX: 1, tileY: 3 },
        CARPET_BEIGE_2: { tileset: 'floors', tileX: 1, tileY: 4 },

        // Green carpet
        CARPET_GREEN: { tileset: 'floors', tileX: 4, tileY: 3 },

        // Wood floor
        WOOD_LIGHT: { tileset: 'floors', tileX: 2, tileY: 8 },
        WOOD_DARK: { tileset: 'floors', tileX: 2, tileY: 10 },

        // Tile floor (bathroom/kitchen style)
        TILE_WHITE: { tileset: 'floors', tileX: 0, tileY: 0 },
        TILE_GREY: { tileset: 'floors', tileX: 4, tileY: 0 },

        // Checkered
        CHECKERED: { tileset: 'floors', tileX: 4, tileY: 5 },
    },

    // Wall tiles (from Room_Builder_Walls_16x16.png)
    WALL: {
        // Beige/cream walls (column 0)
        BEIGE_TOP: { tileset: 'walls', tileX: 0, tileY: 6 },
        BEIGE_MID: { tileset: 'walls', tileX: 0, tileY: 7 },
        BEIGE_BOT: { tileset: 'walls', tileX: 0, tileY: 8 },

        // Brown/wood walls (column 1)
        BROWN_TOP: { tileset: 'walls', tileX: 1, tileY: 6 },
        BROWN_MID: { tileset: 'walls', tileX: 1, tileY: 7 },
        BROWN_BOT: { tileset: 'walls', tileX: 1, tileY: 8 },

        // Grey walls
        GREY_TOP: { tileset: 'walls', tileX: 0, tileY: 0 },
        GREY_MID: { tileset: 'walls', tileX: 0, tileY: 1 },
        GREY_BOT: { tileset: 'walls', tileX: 0, tileY: 2 },
    }
};

// Helper to create a hotel lobby tilemap
function createHotelLobbyMap() {
    // 38x30 tiles at 48px = 1824x1440 world size (close to current 1800x1400)
    const map = new TileMap(38, 30, 48);

    // Fill entire floor with beige carpet
    map.fillRect('floor', 0, 0, 38, 30, TILES.FLOOR.CARPET_BEIGE);

    // Add walls around the perimeter (top wall is 3 tiles tall for visibility)
    // Top wall
    for (let x = 0; x < 38; x++) {
        map.setTile('walls', x, 0, TILES.WALL.BEIGE_TOP);
        map.setTile('walls', x, 1, TILES.WALL.BEIGE_MID);
        map.setTile('walls', x, 2, TILES.WALL.BEIGE_BOT);
        map.setCollision(x, 0, true);
        map.setCollision(x, 1, true);
    }

    // Bottom wall
    for (let x = 0; x < 38; x++) {
        map.setTile('walls', x, 28, TILES.WALL.BEIGE_TOP);
        map.setTile('walls', x, 29, TILES.WALL.BEIGE_MID);
        map.setCollision(x, 28, true);
        map.setCollision(x, 29, true);
    }

    // Left wall
    for (let y = 0; y < 30; y++) {
        map.setTile('walls', 0, y, TILES.WALL.BEIGE_MID);
        map.setCollision(0, y, true);
    }

    // Right wall
    for (let y = 0; y < 30; y++) {
        map.setTile('walls', 37, y, TILES.WALL.BEIGE_MID);
        map.setCollision(37, y, true);
    }

    return map;
}

// Global tileset manager instance
let tilesetManager = null;

// Initialize tilesets
async function initTilesets() {
    tilesetManager = new TilesetManager();
    await tilesetManager.loadAll();
    return tilesetManager;
}
