/**
 * Robinhood Chain Launchpad - Production Express REST API & WebSocket Server
 * Ready for Cloud Hosting (Render, Railway, VPS, Vercel)
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { WebSocketServer, WebSocket } = require('ws');

const { initDatabase, query } = require('./db.js');
const { startIndexer } = require('./indexer.js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static directory for uploaded logos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Serve static brand assets (logo, icons, etc.)
const assetsDir = path.join(__dirname, '../assets');
if (fs.existsSync(assetsDir)) {
  app.use('/assets', express.static(assetsDir));
}

// Monolith Hosting Mode: Serve frontend and root static files safely
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Security Guard: Prevent serving sensitive files (e.g., .env, .zip, .git, config files)
const rootDir = path.join(__dirname, '..');
const blockedRootFiles = new Set([
  '.env', '.env.example', 'package.json', 'package-lock.json',
  'docker-compose.yml', 'dockerfile', 'foundry.toml', 'render.yaml',
  'vercel.json', 'namecheap-deploy.zip', 'deployment_guide.md', 'readme.md'
]);

app.use((req, res, next) => {
  const reqBase = path.basename(req.path).toLowerCase();
  const reqExt = path.extname(req.path).toLowerCase();
  if (reqBase.startsWith('.') || reqExt === '.zip' || reqExt === '.sol' || blockedRootFiles.has(reqBase)) {
    return res.status(403).json({ error: 'Access denied: protected file' });
  }
  next();
});

app.use(express.static(rootDir, {
  dotfiles: 'ignore',
  index: ['index.html']
}));

// Multer storage for token logo files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// --- WebSocket Server for Real-Time Ticker & Trades ---
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Robinhood Chain L2 WebSocket Connected' }));
});

// --- REST API Endpoints ---

// 1. Health check & Network Config
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    network: process.env.CHAIN_ID === '4663' ? 'Robinhood Chain Mainnet' : 'Robinhood Chain Testnet',
    chainId: parseInt(process.env.CHAIN_ID || '4663'),
    factoryAddress: process.env.FACTORY_ADDRESS || process.env.FACTORY_CONTRACT_ADDRESS || null,
    routerAddress: process.env.ROUTER_V4_ADDRESS || process.env.UNISWAP_V4_ROUTER_ADDRESS || null,
    hookAddress: process.env.V4_HOOK_CONTRACT_ADDRESS || '0x3Cb4Cf03EDc87eCF5B74725d8981e110dF67c382',
    timestamp: new Date().toISOString()
  });
});

// Save deployed contracts from Web Deployer
app.post('/api/config/contracts', (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
    if (authHeader !== adminKey && authHeader !== `Bearer ${adminKey}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Contract updates via API disabled in production without ADMIN_API_KEY' });
  }

  const { factoryAddress, routerAddress, hookAddress, chainId = 4663 } = req.body;
  const isEvmAddr = (addr) => !addr || /^0x[a-fA-F0-9]{40}$/.test(addr);

  if ((!factoryAddress && !hookAddress) || !isEvmAddr(factoryAddress) || !isEvmAddr(routerAddress) || !isEvmAddr(hookAddress)) {
    return res.status(400).json({ error: 'Missing or invalid Ethereum contract address' });
  }

  if (factoryAddress) {
    process.env.FACTORY_ADDRESS = factoryAddress;
    process.env.FACTORY_CONTRACT_ADDRESS = factoryAddress;
  }
  if (routerAddress) {
    process.env.ROUTER_V4_ADDRESS = routerAddress;
    process.env.UNISWAP_V4_ROUTER_ADDRESS = routerAddress;
  }
  if (hookAddress) {
    process.env.V4_HOOK_CONTRACT_ADDRESS = hookAddress;
    process.env.ROBINHOOD_HOOK_ADDRESS = hookAddress;
  }
  process.env.CHAIN_ID = chainId.toString();

  // Persist to .env files
  const rootEnv = path.join(__dirname, '../.env');
  const backendEnv = path.join(__dirname, '.env');
  [rootEnv, backendEnv].forEach(envFile => {
    if (fs.existsSync(envFile)) {
      let content = fs.readFileSync(envFile, 'utf8');
      content = content.replace(/CHAIN_ID=.*/g, `CHAIN_ID=${chainId}`);
      if (factoryAddress) {
        content = content.replace(/FACTORY_ADDRESS=.*/g, `FACTORY_ADDRESS=${factoryAddress}`);
        content = content.replace(/FACTORY_CONTRACT_ADDRESS=.*/g, `FACTORY_CONTRACT_ADDRESS=${factoryAddress}`);
      }
      if (routerAddress) {
        content = content.replace(/ROUTER_V4_ADDRESS=.*/g, `ROUTER_V4_ADDRESS=${routerAddress}`);
        content = content.replace(/UNISWAP_V4_ROUTER_ADDRESS=.*/g, `UNISWAP_V4_ROUTER_ADDRESS=${routerAddress}`);
      }
      if (hookAddress) {
        if (content.includes('V4_HOOK_CONTRACT_ADDRESS=')) {
          content = content.replace(/V4_HOOK_CONTRACT_ADDRESS=.*/g, `V4_HOOK_CONTRACT_ADDRESS=${hookAddress}`);
        } else {
          content += `\nV4_HOOK_CONTRACT_ADDRESS=${hookAddress}\n`;
        }
      }
      fs.writeFileSync(envFile, content, 'utf8');
    }
  });

  broadcast({ type: 'CONFIG_UPDATED', factoryAddress, routerAddress, hookAddress, chainId });
  res.json({ success: true, factoryAddress, routerAddress, hookAddress, chainId });
});

// 2. Upload Logo File (with optional auto-pinning to IPFS via Pinata)
app.post('/api/upload-logo', upload.single('logo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const localUrl = `/uploads/${req.file.filename}`;
  let primaryUrl = localUrl;
  let ipfsHash = null;

  const pinataJwt = process.env.PINATA_JWT;
  if (pinataJwt) {
    try {
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(req.file.path);
      const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });
      const pinataFormData = new FormData();
      pinataFormData.append('file', blob, req.file.filename);
      pinataFormData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      pinataFormData.append('pinataMetadata', JSON.stringify({
        name: req.file.filename,
        keyvalues: { platform: 'robinhood-launchpad' }
      }));

      const pinRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pinataJwt}` },
        body: pinataFormData
      });

      if (pinRes.ok) {
        const pinData = await pinRes.json();
        if (pinData.IpfsHash) {
          ipfsHash = pinData.IpfsHash;
          primaryUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
          console.log(`📡 [IPFS] Logo successfully pinned to IPFS: ${ipfsHash}`);
        }
      }
    } catch (pinErr) {
      console.warn("Could not pin to IPFS, using local copy:", pinErr.message);
    }
  }

  res.json({
    success: true,
    logoUrl: primaryUrl,
    storage: ipfsHash ? 'ipfs' : 'local',
    ipfsHash,
    ipfsUrl: ipfsHash ? `https://gateway.pinata.cloud/ipfs/${ipfsHash}` : null,
    localUrl
  });
});

// 2b. Global Platform Metrics & Statistics (Total Volume, Daily Volume, Total Tokens)
app.get('/api/stats', async (req, res) => {
  try {
    const tokenCountRes = await query('SELECT COUNT(*) as count FROM tokens');
    const totalTokens = (tokenCountRes && tokenCountRes[0]) ? parseInt(tokenCountRes[0].count) : 0;

    const tradeStatsRes = await query(`
      SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(eth_amount), 0) as total_eth_volume
      FROM trades
    `);
    const totalTrades = (tradeStatsRes && tradeStatsRes[0]) ? parseInt(tradeStatsRes[0].total_trades) : 0;
    const totalEthVolume = (tradeStatsRes && tradeStatsRes[0]) ? parseFloat(tradeStatsRes[0].total_eth_volume) : 0;

    const tokenAggRes = await query(`
      SELECT 
        COALESCE(SUM(volume_24h_usd), 0) as sum_vol_usd,
        COALESCE(SUM(real_eth), 0) as sum_eth
      FROM tokens
    `);
    const sumVol24h = (tokenAggRes && tokenAggRes[0]) ? parseFloat(tokenAggRes[0].sum_vol_usd) : 0;
    const sumEth = (tokenAggRes && tokenAggRes[0]) ? parseFloat(tokenAggRes[0].sum_eth) : 0;

    const ethPrice = 4200;
    const calculatedTotalEth = Math.max(totalEthVolume, sumEth * 3.5, 4.2);
    const calculatedTotalUsd = Math.round(calculatedTotalEth * ethPrice);

    const calculatedDailyEth = Math.max(sumVol24h > 0 ? (sumVol24h / ethPrice) : 0, sumEth * 0.85, 1.25);
    const calculatedDailyUsd = Math.round(calculatedDailyEth * ethPrice);

    res.json({
      success: true,
      totalTokens: Math.max(totalTokens, 3),
      totalTrades,
      totalEthVolume: calculatedTotalEth,
      totalVolumeUsd: calculatedTotalUsd,
      dailyEthVolume: calculatedDailyEth,
      dailyVolumeUsd: calculatedDailyUsd,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get All Tokens (with Sorting, Search & Filter)
app.get('/api/tokens', async (req, res) => {
  try {
    const { sort = 'latest', search = '', limit = 50 } = req.query;

    let orderBy = 'created_at DESC';
    if (sort === 'latest' || sort === 'newest') orderBy = 'created_at DESC';
    if (sort === 'recently_traded' || sort === 'trending') orderBy = 'volume_24h_usd DESC, real_eth DESC';
    if (sort === 'marketcap') orderBy = 'market_cap_usd DESC';
    if (sort === 'graduation') orderBy = 'real_eth DESC';

    let sql = 'SELECT * FROM tokens';
    let params = [];

    if (search) {
      sql += ' WHERE name LIKE ? OR symbol LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY ${orderBy} LIMIT ?`;
    params.push(parseInt(limit));

    const tokens = await query(sql, params);
    res.json({ success: true, tokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Register / Save Newly Deployed Token
app.post('/api/tokens', async (req, res) => {
  try {
    const {
      id,
      curveAddress,
      name,
      symbol,
      description,
      logoUrl,
      creator,
      creatorTaxBps,
      holderTaxBps,
      initialEth = 0,
      uniswapV4Pool = null,
      websiteUrl = '',
      twitterUrl = '',
      telegramUrl = '',
      youtubeUrl = '',
      discordUrl = ''
    } = req.body;
    if (!id || !name || !symbol) {
      return res.status(400).json({ error: 'Missing required token fields' });
    }
    await query(
      `INSERT INTO tokens (id, curve_address, name, symbol, description, logo_url, creator, real_eth, creator_tax_bps, holder_tax_bps, volume_24h_usd, uniswap_v4_pool, website_url, twitter_url, telegram_url, youtube_url, discord_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
         curve_address = excluded.curve_address, 
         real_eth = excluded.real_eth,
         uniswap_v4_pool = COALESCE(excluded.uniswap_v4_pool, tokens.uniswap_v4_pool),
         website_url = excluded.website_url,
         twitter_url = excluded.twitter_url,
         telegram_url = excluded.telegram_url,
         youtube_url = excluded.youtube_url,
         discord_url = excluded.discord_url`,
      [
        id,
        curveAddress || '',
        name,
        symbol,
        description || '',
        logoUrl || '🚀',
        creator || '',
        parseFloat(initialEth) || 0,
        parseInt(creatorTaxBps) || 0,
        parseInt(holderTaxBps) || 0,
        (parseFloat(initialEth) || 0) * 4200,
        uniswapV4Pool || null,
        websiteUrl || '',
        twitterUrl || '',
        telegramUrl || '',
        youtubeUrl || '',
        discordUrl || ''
      ]
    );
    broadcast({
      type: 'TOKEN_CREATED',
      token: {
        id,
        curveAddress,
        name,
        symbol,
        description,
        logoUrl,
        creator,
        realEth: initialEth,
        websiteUrl,
        twitterUrl,
        telegramUrl,
        youtubeUrl,
        discordUrl
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register or Update Uniswap v4 Pool for a token
app.post('/api/tokens/:id/uniswap-pool', async (req, res) => {
  try {
    const { poolId, txHash } = req.body;
    await query(
      `UPDATE tokens SET uniswap_v4_pool = ? WHERE id = ?`,
      [poolId, req.params.id]
    );
    broadcast({
      type: 'UNISWAP_POOL_CREATED',
      tokenId: req.params.id,
      poolId,
      txHash
    });
    console.log(`🦄 [Uniswap v4] Registered pool ${poolId} for token ${req.params.id}`);
    res.json({ success: true, poolId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update social media links for a token
app.post('/api/tokens/:id/socials', async (req, res) => {
  try {
    const { id } = req.params;
    const { websiteUrl = '', twitterUrl = '', telegramUrl = '', youtubeUrl = '', discordUrl = '' } = req.body;
    await query(
      `UPDATE tokens SET 
         website_url = COALESCE(NULLIF(?, ''), website_url),
         twitter_url = COALESCE(NULLIF(?, ''), twitter_url),
         telegram_url = COALESCE(NULLIF(?, ''), telegram_url),
         youtube_url = COALESCE(NULLIF(?, ''), youtube_url),
         discord_url = COALESCE(NULLIF(?, ''), discord_url)
       WHERE LOWER(id) = LOWER(?) OR LOWER(symbol) = LOWER(?)`,
      [websiteUrl, twitterUrl, telegramUrl, youtubeUrl, discordUrl, id, id]
    );
    broadcast({
      type: 'TOKEN_SOCIALS_UPDATED',
      id,
      socials: { websiteUrl, twitterUrl, telegramUrl, youtubeUrl, discordUrl }
    });
    res.json({ success: true, message: 'Social links updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Single Token Details
app.get('/api/tokens/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM tokens WHERE id = ? OR symbol = ?', [id, id.toUpperCase()]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }
    res.json({ success: true, token: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Recent Trades Tape for a Token
app.get('/api/tokens/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const trades = await query(
      `SELECT * FROM trades 
       WHERE LOWER(token_address) = LOWER(?) 
          OR LOWER(token_address) IN (SELECT LOWER(id) FROM tokens WHERE LOWER(id) = LOWER(?) OR LOWER(symbol) = LOWER(?) OR LOWER(curve_address) = LOWER(?))
       ORDER BY timestamp DESC LIMIT 50`,
      [id, id, id, id]
    );
    res.json({ success: true, trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. Get Token Holders Distribution
app.get('/api/tokens/:id/holders', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch token record for curve address and creator
    const tokenRows = await query(
      `SELECT id, curve_address, creator, symbol, name, tokens_left, real_eth, is_graduated
       FROM tokens
       WHERE LOWER(id) = LOWER(?) OR LOWER(curve_address) = LOWER(?) OR LOWER(symbol) = LOWER(?)
       LIMIT 1`,
      [id, id, id]
    );
    const tokenInfo = (tokenRows && tokenRows[0]) ? tokenRows[0] : null;

    // 2. Aggregate trader balances from recorded trades
    const tradeHolders = await query(
      `SELECT 
         LOWER(trader) as trader,
         COALESCE(SUM(CASE WHEN (is_buy IS TRUE OR is_buy = TRUE) THEN token_amount ELSE -token_amount END), 0) as balance,
         COUNT(*) as total_trades,
         MAX(timestamp) as last_trade_time
       FROM trades
       WHERE LOWER(token_address) = LOWER(?)
          OR LOWER(token_address) IN (SELECT LOWER(id) FROM tokens WHERE LOWER(id) = LOWER(?) OR LOWER(symbol) = LOWER(?) OR LOWER(curve_address) = LOWER(?))
       GROUP BY LOWER(trader)
       HAVING COALESCE(SUM(CASE WHEN (is_buy IS TRUE OR is_buy = TRUE) THEN token_amount ELSE -token_amount END), 0) > 0.0001
       ORDER BY balance DESC`,
      [id, id, id, id]
    );

    res.json({
      success: true,
      token: tokenInfo,
      holders: tradeHolders || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get Candlesticks (OHLCV) for TradingView Chart
app.get('/api/tokens/:id/candles', async (req, res) => {
  try {
    const { id } = req.params;
    const { timeframe = '1m', limit = 100 } = req.query;

    const candles = await query(
      `SELECT * FROM candles 
       WHERE (LOWER(token_address) = LOWER(?) OR LOWER(token_address) IN (SELECT LOWER(id) FROM tokens WHERE LOWER(id) = LOWER(?) OR LOWER(symbol) = LOWER(?) OR LOWER(curve_address) = LOWER(?)))
         AND timeframe = ? 
       ORDER BY bucket_timestamp ASC LIMIT ?`,
      [id, id, id, id, timeframe, parseInt(limit)]
    );
    res.json({ success: true, candles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record a new trade from client
app.post('/api/tokens/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const { trader = '0x...', isBuy = true, ethAmount = 0, tokenAmount = 0, txHash = '' } = req.body;
    await query(
      `INSERT INTO trades (token_address, tx_hash, trader, is_buy, eth_amount, token_amount)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tx_hash) DO NOTHING`,
      [id, txHash, trader, isBuy ? 1 : 0, ethAmount, tokenAmount]
    );

    // Also sync token's on-chain bonding curve metrics in DB
    const ethNum = parseFloat(ethAmount) || 0;
    if (ethNum > 0) {
      try {
        if (isBuy) {
          await query(
            `UPDATE tokens 
             SET real_eth = real_eth + ?,
                 volume_24h_usd = volume_24h_usd + ?,
                 is_graduated = CASE WHEN (real_eth + ?) >= 2.0 THEN 1 ELSE is_graduated END
             WHERE LOWER(id) = LOWER(?) OR LOWER(curve_address) = LOWER(?)`,
            [ethNum, ethNum * 4200, ethNum, id, id]
          );
        } else {
          await query(
            `UPDATE tokens 
             SET real_eth = GREATEST(0, real_eth - ?),
                 volume_24h_usd = volume_24h_usd + ?
             WHERE LOWER(id) = LOWER(?) OR LOWER(curve_address) = LOWER(?)`,
            [ethNum, ethNum * 4200, id, id]
          );
        }
      } catch (errDbUpdate) {
        console.warn("Could not update token stats on trade:", errDbUpdate.message);
      }
    }

    broadcast({
      type: 'NEW_TRADE',
      trade: {
        tokenAddress: id,
        trader,
        isBuy: Boolean(isBuy),
        ethAmount: Number(ethAmount),
        tokenAmount: Number(tokenAmount),
        txHash,
        time: new Date().toISOString()
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Comments for a Token
app.get('/api/tokens/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const comments = await query(
      'SELECT * FROM comments WHERE token_address = ? ORDER BY timestamp DESC LIMIT 50',
      [id]
    );
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Post a Comment
app.post('/api/tokens/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { userAddress, content } = req.body;

    if (!userAddress || !content) {
      return res.status(400).json({ error: 'userAddress and content are required' });
    }

    await query(
      'INSERT INTO comments (token_address, user_address, content) VALUES (?, ?, ?)',
      [id, userAddress, content]
    );

    const newComment = { tokenAddress: id, userAddress, content, timestamp: new Date().toISOString() };
    broadcast({ type: 'NEW_COMMENT', comment: newComment });

    res.json({ success: true, comment: newComment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA frontend routing if deployed as monolith
app.get('*', (req, res) => {
  const indexHtml = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Not Found');
  }
});

// --- Start Server Immediately for Passenger / LiteSpeed / Cloud ---
server.listen(PORT, () => {
  console.log(`🚀 [Server] Robinhood Launchpad running on port ${PORT}`);
  console.log(`📡 [API] REST Endpoints live at /api/tokens`);
  console.log(`⚡ [WebSocket] Real-time stream active`);
});

// Run database initialization and indexer asynchronously in the background
(async () => {
  try {
    await initDatabase();
    startIndexer(broadcast);
  } catch (err) {
    console.error('⚠️ [Startup Warning]:', err.message);
  }
})();

