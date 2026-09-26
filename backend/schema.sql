-- Robinhood Chain Fair Launchpad Database Schema
-- Compatible with PostgreSQL / TimescaleDB / Supabase / Neon

-- 1. Tokens Registry Table
CREATE TABLE IF NOT EXISTS tokens (
    id VARCHAR(66) PRIMARY KEY,                  -- Token contract address (0x...)
    curve_address VARCHAR(66) NOT NULL,          -- Bonding curve contract address
    name VARCHAR(64) NOT NULL,                   -- Token name (e.g. "GameStop 2.0")
    symbol VARCHAR(16) NOT NULL,                 -- Token ticker (e.g. "GME2")
    description TEXT,
    logo_url TEXT,                               -- Uploaded logo URL (S3 / R2 / IPFS / local)
    creator VARCHAR(42) NOT NULL,                -- Creator wallet address
    real_eth NUMERIC(38, 18) DEFAULT 0,          -- Real ETH raised (towards 2.0 ETH target)
    tokens_left NUMERIC(38, 0) DEFAULT 800000000000000000000000000, -- Remaining in curve (800M * 1e18)
    market_cap_usd NUMERIC(18, 2) DEFAULT 0,
    volume_24h_usd NUMERIC(18, 2) DEFAULT 0,
    creator_tax_bps INTEGER DEFAULT 0,           -- Basis points (e.g. 200 = 2.0%)
    holder_tax_bps INTEGER DEFAULT 0,            -- Basis points (e.g. 200 = 2.0%)
    is_graduated BOOLEAN DEFAULT FALSE,          -- True when 2.0 ETH target is reached
    uniswap_v4_pool VARCHAR(66),                 -- Uniswap v4 pool identifier
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Real-time Trades Table (The Live Tape)
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(66) REFERENCES tokens(id) ON DELETE CASCADE,
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    trader VARCHAR(42) NOT NULL,
    is_buy BOOLEAN NOT NULL,                     -- True = Buy, False = Sell
    eth_amount NUMERIC(38, 18) NOT NULL,
    token_amount NUMERIC(38, 0) NOT NULL,
    protocol_fee NUMERIC(38, 18) DEFAULT 0,      -- 1% Protocol Fee
    creator_fee NUMERIC(38, 18) DEFAULT 0,       -- Creator Royalty in ETH
    holder_fee NUMERIC(38, 18) DEFAULT 0,        -- Holder Reflection Dividend in ETH
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Candlesticks Table (For Live TradingView Charts)
CREATE TABLE IF NOT EXISTS candles (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(66) REFERENCES tokens(id) ON DELETE CASCADE,
    timeframe VARCHAR(8) NOT NULL,               -- '1m', '5m', '15m', '1h', '1d'
    open_price NUMERIC(38, 18) NOT NULL,
    high_price NUMERIC(38, 18) NOT NULL,
    low_price NUMERIC(38, 18) NOT NULL,
    close_price NUMERIC(38, 18) NOT NULL,
    volume_eth NUMERIC(38, 18) NOT NULL,
    bucket_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(token_address, timeframe, bucket_timestamp)
);

-- 4. Community Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(66) REFERENCES tokens(id) ON DELETE CASCADE,
    user_address VARCHAR(42) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tokens_ranking ON tokens(is_graduated, volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_real_eth ON tokens(real_eth DESC);
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(token_address, timeframe, bucket_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_comments_token ON comments(token_address, timestamp DESC);
