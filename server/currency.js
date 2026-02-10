// Currency management module (CommonJS)
// Provides functions to add/deduct balance and track wallet ledger

// In-memory fallback for local development without DATABASE_URL
const inMemoryBalances = new Map();

/**
 * Validate and round amount to 2 decimal places
 * @param {number} amount - The amount to validate
 * @returns {number|null} - Rounded amount or null if invalid
 */
function validateAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

/**
 * Add balance to a player's account
 * @param {Pool} pool - PostgreSQL connection pool (or null for in-memory)
 * @param {string} playerName - Player username
 * @param {number} amount - Amount to add (must be positive)
 * @param {string} reason - Reason for the transaction
 * @param {object} metadata - Additional metadata (e.g., {game: 'strict1000', enemy: 'enemy-1'})
 * @returns {Promise<number|null>} - New balance or null on failure
 */
async function addBalance(pool, playerName, amount, reason, metadata) {
  const validAmount = validateAmount(amount);
  if (validAmount === null) {
    console.error('Invalid amount:', amount);
    return null;
  }

  // In-memory fallback
  if (!pool) {
    const currentBalance = inMemoryBalances.get(playerName) || 1000;
    const newBalance = Math.round((currentBalance + validAmount) * 100) / 100;
    inMemoryBalances.set(playerName, newBalance);
    console.log(`[In-Memory] Added ${validAmount} to ${playerName}. New balance: ${newBalance}`);
    return newBalance;
  }

  // Database transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure player exists
    await client.query(
      `INSERT INTO players (name, balance) 
       VALUES ($1, 1000) 
       ON CONFLICT (name) DO NOTHING`,
      [playerName]
    );

    // Update balance
    const updateResult = await client.query(
      `UPDATE players 
       SET balance = round((balance + $1)::numeric, 2), 
           updated_at = now() 
       WHERE name = $2 
       RETURNING id, balance`,
      [validAmount, playerName]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Player not found after insert');
    }

    const playerId = updateResult.rows[0].id;
    const newBalance = Number(updateResult.rows[0].balance);

    // Insert ledger entry
    await client.query(
      `INSERT INTO wallet_ledger (player_id, delta, reason, metadata, created_at) 
       VALUES ($1, $2, $3, $4, now())`,
      [playerId, validAmount, reason, JSON.stringify(metadata || {})]
    );

    await client.query('COMMIT');
    console.log(`Added ${validAmount} to ${playerName}. New balance: ${newBalance}`);
    return newBalance;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addBalance error:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Deduct balance from a player's account (only if sufficient balance)
 * @param {Pool} pool - PostgreSQL connection pool (or null for in-memory)
 * @param {string} playerName - Player username
 * @param {number} amount - Amount to deduct (must be positive)
 * @param {string} reason - Reason for the transaction
 * @param {object} metadata - Additional metadata
 * @returns {Promise<number|null>} - New balance or null on failure/insufficient funds
 */
async function deductBalance(pool, playerName, amount, reason, metadata) {
  const validAmount = validateAmount(amount);
  if (validAmount === null) {
    console.error('Invalid amount:', amount);
    return null;
  }

  // In-memory fallback
  if (!pool) {
    const currentBalance = inMemoryBalances.get(playerName) || 1000;
    if (currentBalance < validAmount) {
      console.log(`[In-Memory] Insufficient funds for ${playerName}`);
      return null;
    }
    const newBalance = Math.round((currentBalance - validAmount) * 100) / 100;
    inMemoryBalances.set(playerName, newBalance);
    console.log(`[In-Memory] Deducted ${validAmount} from ${playerName}. New balance: ${newBalance}`);
    return newBalance;
  }

  // Database transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check current balance and update if sufficient
    const updateResult = await client.query(
      `UPDATE players 
       SET balance = round((balance - $1)::numeric, 2), 
           updated_at = now() 
       WHERE name = $2 AND balance >= $1
       RETURNING id, balance`,
      [validAmount, playerName]
    );

    if (updateResult.rows.length === 0) {
      console.log(`Insufficient funds or player not found: ${playerName}`);
      await client.query('ROLLBACK');
      return null;
    }

    const playerId = updateResult.rows[0].id;
    const newBalance = Number(updateResult.rows[0].balance);

    // Insert ledger entry (negative delta)
    await client.query(
      `INSERT INTO wallet_ledger (player_id, delta, reason, metadata, created_at) 
       VALUES ($1, $2, $3, $4, now())`,
      [playerId, -validAmount, reason, JSON.stringify(metadata || {})]
    );

    await client.query('COMMIT');
    console.log(`Deducted ${validAmount} from ${playerName}. New balance: ${newBalance}`);
    return newBalance;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('deductBalance error:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Get a player's current balance
 * @param {Pool} pool - PostgreSQL connection pool (or null for in-memory)
 * @param {string} playerName - Player username
 * @returns {Promise<number|null>} - Current balance or null if not found
 */
async function getBalance(pool, playerName) {
  // In-memory fallback
  if (!pool) {
    return inMemoryBalances.get(playerName) || null;
  }

  try {
    const result = await pool.query(
      'SELECT balance FROM players WHERE name = $1',
      [playerName]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return Number(result.rows[0].balance);
  } catch (error) {
    console.error('getBalance error:', error);
    return null;
  }
}

module.exports = {
  addBalance,
  deductBalance,
  getBalance
};
