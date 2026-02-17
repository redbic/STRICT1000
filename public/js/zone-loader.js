// Zone Loader - Loads zone data from JSON files
// Falls back to hardcoded ZONES if JSON not available

const ZoneLoader = {
    cache: new Map(),
    loaded: false,

    /**
     * Load a zone from JSON file
     * @param {string} zoneId - Zone identifier (e.g., 'hub', 'training')
     * @returns {Promise<Object|null>} Zone data or null if not found
     */
    async loadZone(zoneId) {
        // Check cache first
        if (this.cache.has(zoneId)) {
            return this.cache.get(zoneId);
        }

        try {
            const response = await fetch(`/data/zones/${zoneId}.json`);
            if (!response.ok) {
                return null;
            }
            const zoneData = await response.json();
            this.cache.set(zoneId, zoneData);
            return zoneData;
        } catch (err) {
            console.warn(`Failed to load zone ${zoneId} from JSON:`, err.message);
            return null;
        }
    },

    /**
     * Get zone data - tries JSON first, falls back to ZONES constant
     * @param {string} zoneId - Zone identifier
     * @returns {Promise<Object|null>} Zone data
     */
    async getZone(zoneId) {
        // Try loading from JSON first
        const jsonZone = await this.loadZone(zoneId);
        if (jsonZone) {
            // Build floor map if floor data exists
            if (jsonZone.floor && jsonZone.floor.tiles) {
                jsonZone.floorMap = new Map();
                jsonZone.floor.tiles.forEach(tile => {
                    jsonZone.floorMap.set(`${tile.x},${tile.y}`, tile);
                });
            }
            return jsonZone;
        }

        // Fall back to hardcoded ZONES
        if (typeof ZONES !== 'undefined' && ZONES[zoneId]) {
            return ZONES[zoneId];
        }

        return null;
    },

    /**
     * Preload all known zones
     * @param {string[]} zoneIds - Array of zone IDs to preload
     */
    async preloadZones(zoneIds) {
        await Promise.all(zoneIds.map(id => this.loadZone(id)));
        this.loaded = true;
    },

    /**
     * Load zone data directly from an object (for server-generated/procedural zones).
     * Bypasses JSON file loading — stores directly into cache.
     * @param {string} zoneId - Zone identifier
     * @param {Object} zoneData - Zone data object
     * @returns {Object} The processed zone data
     */
    loadFromData(zoneId, zoneData) {
        // Build floor map if floor data exists
        if (zoneData.floor && zoneData.floor.tiles) {
            zoneData.floorMap = new Map();
            zoneData.floor.tiles.forEach(tile => {
                zoneData.floorMap.set(`${tile.x},${tile.y}`, tile);
            });
        }
        this.cache.set(zoneId, zoneData);
        return zoneData;
    },

    /**
     * Remove a specific zone from the cache (for disposable/temporary zones).
     * @param {string} zoneId - Zone identifier to evict
     */
    clearZone(zoneId) {
        this.cache.delete(zoneId);
    },

    /**
     * Clear the entire cache
     */
    clearCache() {
        this.cache.clear();
    },

    /**
     * Save zone data to server
     * @param {string} zoneId - Zone identifier
     * @param {Object} zoneData - Zone data to save
     * @returns {Promise<boolean>} Success status
     */
    async saveZone(zoneId, zoneData) {
        try {
            const response = await fetch(`/api/zones/${zoneId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(zoneData)
            });
            if (response.ok) {
                // Update cache with new data
                this.cache.set(zoneId, zoneData);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`Failed to save zone ${zoneId}:`, err);
            return false;
        }
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ZoneLoader = ZoneLoader;
}
