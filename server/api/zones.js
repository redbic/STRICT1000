const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { normalizeSafeString } = require('../validation');

const zonesDir = path.join(__dirname, '..', '..', 'public', 'data', 'zones');

// Cache for zone data (to avoid repeated file reads)
const zoneDataCache = new Map();

/**
 * Load zone data from JSON file
 * @param {string} zoneId
 * @returns {Promise<Object|null>}
 */
async function loadZoneData(zoneId) {
  if (zoneDataCache.has(zoneId)) {
    return zoneDataCache.get(zoneId);
  }

  try {
    const filePath = path.join(zonesDir, `${zoneId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    zoneDataCache.set(zoneId, parsed);
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to load zone ${zoneId}:`, error);
    }
    return null;
  }
}

/**
 * Create zone API router
 * @param {boolean} isProduction
 * @returns {express.Router}
 */
function createZoneRouter(isProduction) {
  const router = express.Router();

  // Save zone data (restricted to development mode only)
  router.post('/zones/:zoneId', async (req, res) => {
    if (isProduction) {
      return res.status(403).json({ error: 'Zone editing is disabled in production' });
    }

    const zoneId = normalizeSafeString(req.params.zoneId);
    if (!zoneId || !/^[a-z0-9_-]+$/i.test(zoneId)) {
      return res.status(400).json({ error: 'Invalid zone ID' });
    }

    const zoneData = req.body;
    if (!zoneData || typeof zoneData !== 'object') {
      return res.status(400).json({ error: 'Invalid zone data' });
    }

    try {
      await fs.mkdir(zonesDir, { recursive: true });
      const filePath = path.join(zonesDir, `${zoneId}.json`);
      await fs.writeFile(filePath, JSON.stringify(zoneData, null, 2));
      res.json({ success: true, zoneId });
    } catch (error) {
      console.error('Zone save error:', error);
      res.status(500).json({ error: 'Failed to save zone' });
    }
  });

  // Get zone data
  router.get('/zones/:zoneId', async (req, res) => {
    const zoneId = normalizeSafeString(req.params.zoneId);
    if (!zoneId || !/^[a-z0-9_-]+$/i.test(zoneId)) {
      return res.status(400).json({ error: 'Invalid zone ID' });
    }

    try {
      const filePath = path.join(zonesDir, `${zoneId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Zone not found' });
      }
      console.error('Zone load error:', error);
      res.status(500).json({ error: 'Failed to load zone' });
    }
  });

  // List all zones
  router.get('/zones', async (req, res) => {
    try {
      await fs.mkdir(zonesDir, { recursive: true });
      const files = await fs.readdir(zonesDir);
      const zones = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      res.json({ zones });
    } catch (error) {
      console.error('Zone list error:', error);
      res.status(500).json({ error: 'Failed to list zones' });
    }
  });

  return router;
}

module.exports = { createZoneRouter, loadZoneData };
