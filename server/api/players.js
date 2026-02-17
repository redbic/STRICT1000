const express = require('express');
const { normalizeSafeString, isValidUsername, sanitizeInventory } = require('../validation');

/**
 * Create player API router
 * @param {import('pg').Pool|null} pool - PostgreSQL pool (null for in-memory mode)
 * @returns {express.Router}
 */
function createPlayerRouter(pool) {
  const router = express.Router();

  // Create or upsert player
  router.post('/player', async (req, res) => {
    const username = normalizeSafeString(req.body.username);
    if (!username || !isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    if (!pool) {
      return res.json({ success: true, player: { name: username, inventory_data: [] } });
    }

    try {
      const result = await pool.query(`
        INSERT INTO players (name)
        VALUES ($1)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name, balance, character_data, inventory_data
      `, [username]);

      res.json({ success: true, player: result.rows[0] });
    } catch (error) {
      console.error('Player creation error:', error);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Get player profile
  router.get('/profile', async (req, res) => {
    const name = normalizeSafeString(req.query.name);
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!pool) {
      return res.json({ name, balance: null, character: null, inventory: [] });
    }

    try {
      const result = await pool.query(
        'SELECT name, balance, character_data, inventory_data FROM players WHERE name = $1 LIMIT 1',
        [name]
      );
      if (result.rows.length === 0) {
        return res.json({ name, balance: null, character: null, inventory: [] });
      }
      const row = result.rows[0];
      res.json({
        name: row.name,
        balance: row.balance !== null ? Number(row.balance) : null,
        character: row.character_data || null,
        inventory: sanitizeInventory(row.inventory_data),
      });
    } catch (error) {
      console.error('Profile lookup error:', error);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Inventory Save: Client-authoritative model
  // The client sends full inventory state, server trusts it after sanitization.
  // This is acceptable for cooperative play. For a competitive game, this would
  // need server-side item tracking with item generation/consumption validation.
  router.post('/inventory', async (req, res) => {
    const username = normalizeSafeString(req.body.username);
    if (!username || !isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const sanitized = sanitizeInventory(req.body.inventory);

    if (!pool) {
      return res.json({ success: true, inventory: sanitized });
    }

    try {
      const result = await pool.query(
        `UPDATE players
         SET inventory_data = $2::jsonb
         WHERE name = $1
         RETURNING inventory_data`,
        [username, JSON.stringify(sanitized)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }

      res.json({ success: true, inventory: sanitizeInventory(result.rows[0].inventory_data) });
    } catch (error) {
      console.error('Inventory save error:', error);
      res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
}

module.exports = { createPlayerRouter };
