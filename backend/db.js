/**
 * Universal Database Layer for Robinhood Chain Launchpad
 * Supports PostgreSQL (via DATABASE_URL with SSL for Neon/Supabase) with automated fallback to SQLite (launchpad.db)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

let dbType = 'sqlite';
let pgPool = null;
let sqliteDb = null;

const DEFAULT_NEON_DB = 'postgresql://neondb_owner:npg_shGaXT7mS4Yu@ep-weathered-thunder-b4e7ojiz-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const rawDbUrl = process.env.DATABASE_URL || DEFAULT_NEON_DB;

if (rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://')) {
  try {
    const { Pool } = require('pg');

    // Strip channel_binding if present to prevent node-postgres connection handshake issues
    const dbUrl = rawDbUrl.replace(/[?&]channel_binding=[^&]+/, '');

    // Cloud PostgreSQL (Neon / Supabase / Railway / Render / AWS) requires SSL
    const isCloud = dbUrl.includes('neon.tech') || dbUrl.includes('supabase') || dbUrl.includes('railway') || dbUrl.includes('render');

    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: isCloud ? { rejectUnauthorized: false } : undefined
    });

    dbType = 'postgres';
    console.log('📦 [Database] Connected to Cloud PostgreSQL (Neon.tech / AWS pooler with SSL).');
  } catch (err) {
    console.warn('⚠️ [Database] PostgreSQL client failed, falling back to SQLite.', err.message);
    dbType = 'sqlite';
  }
}

if (dbType === 'sqlite') {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'launchpad.db');
    sqliteDb = new sqlite3.Database(dbPath);
    console.log(`📦 [Database] Using local SQLite database at: ${dbPath}`);
  } catch (e) {
    console.warn('⚠️ [Database] SQLite module not loaded:', e.message);
  }
}

/**
 * Universal Query Helper
 */
async function query(sql, params = []) {
  if (dbType === 'postgres') {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      if (isSelect) {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      } else {
        sqliteDb.run(sql, params, function (err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
}

/**
 * Auto-initialize database tables and seed sample data
 */
async function initDatabase() {
  console.log('🔄 [Database] Checking and initializing database tables...');

  if (dbType === 'postgres') {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pgPool.query(schemaSql);

    // Auto-migrate social columns if table already exists in PostgreSQL
    try {
      await pgPool.query(`
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS uniswap_v4_pool VARCHAR(66);
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255);
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS telegram_url VARCHAR(255);
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(255);
        ALTER TABLE tokens ADD COLUMN IF NOT EXISTS discord_url VARCHAR(255);
      `);
    } catch (migErr) {
      console.warn("Postgres migration notice:", migErr.message);
    }
  } else {
    // SQLite Tables
    await query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        curve_address TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        creator TEXT NOT NULL,
        real_eth REAL DEFAULT 0,
        tokens_left REAL DEFAULT 800000000,
        market_cap_usd REAL DEFAULT 0,
        volume_24h_usd REAL DEFAULT 0,
        creator_tax_bps INTEGER DEFAULT 0,
        holder_tax_bps INTEGER DEFAULT 0,
        is_graduated INTEGER DEFAULT 0,
        uniswap_v4_pool TEXT,
        website_url TEXT,
        twitter_url TEXT,
        telegram_url TEXT,
        youtube_url TEXT,
        discord_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Auto-migrate for SQLite
    const cols = ['website_url', 'twitter_url', 'telegram_url', 'youtube_url', 'discord_url', 'uniswap_v4_pool'];
    for (const c of cols) {
      try {
        await query(`ALTER TABLE tokens ADD COLUMN ${c} TEXT`);
      } catch (e) {}
    }

    await query(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        tx_hash TEXT UNIQUE NOT NULL,
        trader TEXT NOT NULL,
        is_buy INTEGER NOT NULL,
        eth_amount REAL NOT NULL,
        token_amount REAL NOT NULL,
        protocol_fee REAL DEFAULT 0,
        creator_fee REAL DEFAULT 0,
        holder_fee REAL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS candles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        open_price REAL NOT NULL,
        high_price REAL NOT NULL,
        low_price REAL NOT NULL,
        close_price REAL NOT NULL,
        volume_eth REAL NOT NULL,
        bucket_timestamp INTEGER NOT NULL,
        UNIQUE(token_address, timeframe, bucket_timestamp)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        user_address TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Pure fair launch platform - no fake or demo tokens seeded
  console.log('✅ [Database] Ready for cloud hosting & local traffic.');
}

module.exports = {
  query,
  initDatabase,
  dbType
};
