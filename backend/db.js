/**
 * Universal Database Layer for Robinhood Chain Launchpad
 * Supports PostgreSQL (via DATABASE_URL with SSL for Neon/Supabase) with automated fallback to SQLite (launchpad.db)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbType = 'sqlite';
let pgPool = null;
let sqliteDb = null;

const rawDbUrl = process.env.DATABASE_URL || '';

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
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'launchpad.db');
  sqliteDb = new sqlite3.Database(dbPath);
  console.log(`📦 [Database] Using local SQLite database at: ${dbPath}`);
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

  // Seed sample tokens if table is empty
  const existing = await query('SELECT COUNT(*) as count FROM tokens');
  const count = existing[0]?.count || 0;

  if (parseInt(count) === 0) {
    console.log('🌱 [Database] Seeding initial token data...');
    const seedTokens = [
      {
        id: "0x71c597e7b686...gme2",
        curve: "0x12a5...curve1",
        name: "GameStop 2.0",
        symbol: "GME2",
        desc: "The digital sequel to the short squeeze that started it all on Robinhood. Can't stop, won't stop.",
        logo: "🎮",
        creator: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        realEth: 1.62,
        tokensLeft: 250000000,
        mcap: 142800,
        vol: 38400,
        devTax: 100,
        holderTax: 200,
        graduated: 0
      },
      {
        id: "0x892a12c4...wsb",
        curve: "0x33b1...curve2",
        name: "WallStreetBets Token",
        symbol: "WSB",
        desc: "Diamond hands only. Built for the retail army ready to graduate into Uniswap v4.",
        logo: "💎",
        creator: "0x892a0e44Cc0532925a3b844Bc454e4438f44e12c",
        realEth: 1.94,
        tokensLeft: 60000000,
        mcap: 201600,
        vol: 94200,
        devTax: 0,
        holderTax: 300,
        graduated: 0
      },
      {
        id: "0x19a299f...hoodie",
        curve: "0x44c2...curve3",
        name: "RobinHoodie",
        symbol: "HOODIE",
        desc: "Official mascot token for the Robinhood Chain degens wearing neon green hoodies.",
        logo: "🏹",
        creator: "0x19a235Cc6634C0532925a3b844Bc454e4438f99f",
        realEth: 0.85,
        tokensLeft: 520000000,
        mcap: 88200,
        vol: 19500,
        devTax: 200,
        holderTax: 0,
        graduated: 0
      }
    ];

    for (const t of seedTokens) {
      await query(
        `INSERT INTO tokens (id, curve_address, name, symbol, description, logo_url, creator, real_eth, tokens_left, market_cap_usd, volume_24h_usd, creator_tax_bps, holder_tax_bps, is_graduated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.curve, t.name, t.symbol, t.desc, t.logo, t.creator, t.realEth, t.tokensLeft, t.mcap, t.vol, t.devTax, t.holderTax, Boolean(t.graduated)]
      );
    }
  }

  console.log('✅ [Database] Ready for cloud hosting & local traffic.');
}

module.exports = {
  query,
  initDatabase,
  dbType
};
