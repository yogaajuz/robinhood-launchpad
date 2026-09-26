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
require('dotenv').config();

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

// Monolith Hosting Mode: If frontend directory exists, serve frontend static files on same domain!
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

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

// 1. Health check & status for Hosting Provider Liveness Pings
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    network: 'Robinhood Chain Testnet',
    chainId: 46630,
    timestamp: new Date().toISOString()
  });
});

// 2. Upload Logo File
app.post('/api/upload-logo', upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }
  const logoUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, logoUrl });
});

// 3. Get All Tokens (with Sorting, Search & Filter)
app.get('/api/tokens', async (req, res) => {
  try {
    const { sort = 'trending', search = '', limit = 50 } = req.query;

    let orderBy = 'volume_24h_usd DESC';
    if (sort === 'graduation') orderBy = 'real_eth DESC';
    if (sort === 'marketcap') orderBy = 'market_cap_usd DESC';
    if (sort === 'newest') orderBy = 'created_at DESC';

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
      'SELECT * FROM trades WHERE token_address = ? ORDER BY timestamp DESC LIMIT 30',
      [id]
    );
    res.json({ success: true, trades });
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
      'SELECT * FROM candles WHERE token_address = ? AND timeframe = ? ORDER BY bucket_timestamp ASC LIMIT ?',
      [id, timeframe, parseInt(limit)]
    );
    res.json({ success: true, candles });
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

// --- Start Server ---
async function start() {
  await initDatabase();
  startIndexer(broadcast);

  server.listen(PORT, () => {
    console.log(`🚀 [Server] Robinhood Launchpad running on port ${PORT}`);
    console.log(`📡 [API] REST Endpoints live at /api/tokens`);
    console.log(`⚡ [WebSocket] Real-time stream active`);
  });
}

start();
