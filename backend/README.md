# Robinhood Chain Launchpad - Backend & Indexer

A high-performance backend, database indexer, and WebSocket streaming server for the **Robinhood Chain Fair Launchpad**.

---

## ⚡ What This Backend Does

1. **Database Persistence**:
   * Uses **PostgreSQL** in production (or an embedded **SQLite** file for local development with zero external setup).
   * Automatically initializes tables (`tokens`, `trades`, `candles`, `comments`) on first boot.
2. **Blockchain Event Indexer (`indexer.js`)**:
   * Connects via `viem` to Robinhood Chain Testnet (`https://rpc.testnet.chain.robinhood.com`).
   * Indexes on-chain events: `TokenCreated`, `TokensPurchased`, `TokensSold`, and `UniswapV4Graduated`.
   * Calculates 1-minute OHLCV candlestick bars for TradingView charts.
3. **Sub-second WebSocket Streaming (`ws`)**:
   * Broadcasts live buy/sell transactions and price updates to all connected phones and PCs.
4. **Token Logo File Uploads**:
   * Handles multipart image uploads and saves them to `/uploads/` (or S3/Cloudflare R2).

---

## 🚀 How to Run the Backend

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
* **If you have PostgreSQL**: Set `DATABASE_URL=postgresql://user:password@localhost:5432/launchpad`.
* **If you don't have PostgreSQL**: Leave `DATABASE_URL` empty, and the server will automatically use local SQLite (`launchpad.db`)!

### 3. Start the Server
```bash
npm start
```

The server will start on:
* **REST API**: `http://localhost:3001`
* **WebSocket**: `ws://localhost:3001`

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Network status & health check |
| `GET` | `/api/tokens?sort=trending` | List tokens (supports `sort=trending/graduation/marketcap/newest`) |
| `GET` | `/api/tokens/:id` | Single token details |
| `GET` | `/api/tokens/:id/trades` | Recent trade tape (last 30 trades) |
| `GET` | `/api/tokens/:id/candles?timeframe=1m` | OHLCV candlesticks for charts |
| `GET` | `/api/tokens/:id/comments` | Fetch community thread |
| `POST` | `/api/tokens/:id/comments` | Post a community comment |
| `POST` | `/api/upload-logo` | Upload a token image file (multipart/form-data) |

---

## ⚡ WebSocket Events

Connect to `ws://localhost:3001`:

```json
// Emitted on every live trade:
{
  "type": "NEW_TRADE",
  "trade": {
    "tokenAddress": "0x71c5...",
    "trader": "0x89f...",
    "isBuy": true,
    "ethAmount": 0.25,
    "tokenAmount": 6800000,
    "time": "2026-09-26T12:00:00Z"
  }
}
```
