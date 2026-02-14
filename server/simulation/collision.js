// Server-side collision detection
// Port of Zone.checkCollision() from public/js/track.js

class ServerCollision {
  /**
   * @param {Object} zoneData - Parsed zone JSON data
   */
  constructor(zoneData) {
    this.width = zoneData.width || 720;
    this.height = zoneData.height || 720;
    this.walls = zoneData.walls || [];
    this.tileSize = 48; // Matches client fallback (tilesetManager.tileSize * tilesetManager.scale)

    // Build physical objects map from zone tile data
    this.objectsMap = new Map();
    if (zoneData.objects && Array.isArray(zoneData.objects.tiles)) {
      for (const tile of zoneData.objects.tiles) {
        if (tile.physical) {
          this.objectsMap.set(`${tile.x},${tile.y}`, tile);
        }
      }
    }
  }

  /**
   * Check AABB collision for an entity (center-based x,y with width,height)
   * Mirrors client Zone.checkCollision() exactly
   * @param {{ x: number, y: number, width: number, height: number }} entity
   * @returns {boolean}
   */
  checkCollision(entity) {
    // Check against AABB walls (corner-based)
    for (const wall of this.walls) {
      if (
        entity.x - entity.width / 2 < wall.x + wall.width &&
        entity.x + entity.width / 2 > wall.x &&
        entity.y - entity.height / 2 < wall.y + wall.height &&
        entity.y + entity.height / 2 > wall.y
      ) {
        return true;
      }
    }

    // Check against physical tile objects
    if (this.objectsMap.size > 0) {
      const entityLeft = entity.x - entity.width / 2;
      const entityRight = entity.x + entity.width / 2;
      const entityTop = entity.y - entity.height / 2;
      const entityBottom = entity.y + entity.height / 2;

      const minTileX = Math.floor(entityLeft / this.tileSize);
      const maxTileX = Math.floor(entityRight / this.tileSize);
      const minTileY = Math.floor(entityTop / this.tileSize);
      const maxTileY = Math.floor(entityBottom / this.tileSize);

      for (let ty = minTileY; ty <= maxTileY; ty++) {
        for (let tx = minTileX; tx <= maxTileX; tx++) {
          const tile = this.objectsMap.get(`${tx},${ty}`);
          if (tile && tile.physical) {
            const tileLeft = tx * this.tileSize;
            const tileRight = tileLeft + this.tileSize;
            const tileTop = ty * this.tileSize;
            const tileBottom = tileTop + this.tileSize;

            if (entityRight > tileLeft && entityLeft < tileRight &&
                entityBottom > tileTop && entityTop < tileBottom) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }
}

module.exports = { ServerCollision };
