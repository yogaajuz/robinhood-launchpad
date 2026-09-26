/**
 * Robinhood Chain Testnet Event Indexer
 * Connects via viem, parses on-chain logs, stores in Database, and triggers WebSockets.
 */

const { createPublicClient, http, parseAbiItem } = require('viem');
const { query } = require('./db.js');
require('dotenv').config();

const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const FACTORY_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || process.env.FACTORY_ADDRESS || '0x84D44D6ee5297e3073cf536aBB8d3978D7cc9Ca2';

const client = createPublicClient({
  transport: http(RPC_URL)
});

// ABIs to watch
const EVENT_TOKEN_CREATED = parseAbiItem('event TokenCreated(address indexed tokenAddress, address indexed curveAddress, address indexed creator, string name, string symbol, string metadataUri, uint256 creatorTaxBps, uint256 holderTaxBps, uint256 timestamp)');
const EVENT_PURCHASED = parseAbiItem('event TokensPurchased(address indexed buyer, uint256 ethPaid, uint256 tokensReceived, uint256 protocolFee, uint256 creatorTax, uint256 holderTax)');
const EVENT_SOLD = parseAbiItem('event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethReturned, uint256 protocolFee, uint256 creatorTax, uint256 holderTax)');
const EVENT_GRADUATED = parseAbiItem('event UniswapV4Graduated(address indexed token, uint256 ethGraduated, uint256 tokensGraduated, address uniswapV4Pool)');

/**
 * Handle new token deployment event
 */
async function handleTokenCreated(log, broadcast) {
  const { tokenAddress, curveAddress, creator, name, symbol, metadataUri, creatorTaxBps, holderTaxBps } = log.args;

  console.log(`🚀 [Indexer] New token created on Robinhood Chain: $${symbol} (${tokenAddress})`);

  await query(
    `INSERT INTO tokens (id, curve_address, name, symbol, description, logo_url, creator, real_eth, creator_tax_bps, holder_tax_bps)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [tokenAddress, curveAddress, name, symbol, "Newly launched on Robinhood Chain", "🚀", creator, Number(creatorTaxBps), Number(holderTaxBps)]
  );

  if (broadcast) {
    broadcast({
      type: 'TOKEN_CREATED',
      token: { id: tokenAddress, name, symbol, creator, curveAddress }
    });
  }
}

/**
 * Handle Buy / Sell Trade Event
 */
async function handleTradeEvent(log, isBuy, broadcast) {
  const tokenAddress = log.address;
  const trader = isBuy ? log.args.buyer : log.args.seller;
  const ethAmount = Number(isBuy ? log.args.ethPaid : log.args.ethReturned) / 1e18;
  const tokenAmount = Number(isBuy ? log.args.tokensReceived : log.args.tokensIn) / 1e18;
  const txHash = log.transactionHash;

  console.log(`📈 [Indexer] Trade on ${tokenAddress.slice(0, 10)}...: ${isBuy ? 'BUY' : 'SELL'} ${ethAmount.toFixed(4)} ETH`);

  // 1. Insert into trades table
  await query(
    `INSERT INTO trades (token_address, tx_hash, trader, is_buy, eth_amount, token_amount)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tx_hash) DO NOTHING`,
    [tokenAddress, txHash, trader, isBuy ? 1 : 0, ethAmount, tokenAmount]
  );

  // 2. Update real_eth and volume in tokens table
  const tokenRows = await query('SELECT real_eth, volume_24h_usd FROM tokens WHERE id = ? OR curve_address = ?', [tokenAddress, tokenAddress]);
  if (tokenRows.length > 0) {
    let currentEth = parseFloat(tokenRows[0].real_eth) || 0;
    let newEth = isBuy ? (currentEth + ethAmount) : Math.max(0.05, currentEth - ethAmount);
    let newVolume = (parseFloat(tokenRows[0].volume_24h_usd) || 0) + (ethAmount * 4200);

    const isGraduated = newEth >= 2.0 ? 1 : 0;

    await query(
      `UPDATE tokens SET real_eth = ?, volume_24h_usd = ?, is_graduated = ? WHERE id = ? OR curve_address = ?`,
      [newEth, newVolume, isGraduated, tokenAddress, tokenAddress]
    );
  }

  // 3. Update OHLCV Candlestick (1 minute bucket)
  const now = Math.floor(Date.now() / 60000) * 60; // 1-minute bucket timestamp
  const priceUsd = (ethAmount / (tokenAmount || 1)) * 4200;

  const existingCandle = await query(
    'SELECT * FROM candles WHERE token_address = ? AND timeframe = "1m" AND bucket_timestamp = ?',
    [tokenAddress, now]
  );

  if (existingCandle.length > 0) {
    const c = existingCandle[0];
    const high = Math.max(c.high_price, priceUsd);
    const low = Math.min(c.low_price, priceUsd);
    const close = priceUsd;
    const vol = c.volume_eth + ethAmount;

    await query(
      `UPDATE candles SET high_price = ?, low_price = ?, close_price = ?, volume_eth = ? WHERE id = ?`,
      [high, low, close, vol, c.id]
    );
  } else {
    await query(
      `INSERT INTO candles (token_address, timeframe, open_price, high_price, low_price, close_price, volume_eth, bucket_timestamp)
       VALUES (?, "1m", ?, ?, ?, ?, ?, ?)`,
      [tokenAddress, priceUsd, priceUsd, priceUsd, priceUsd, ethAmount, now]
    );
  }

  // 4. Broadcast live trade event to WebSockets
  if (broadcast) {
    broadcast({
      type: 'NEW_TRADE',
      trade: {
        tokenAddress,
        trader,
        isBuy,
        ethAmount,
        tokenAmount,
        txHash,
        time: new Date().toISOString()
      }
    });
  }
}

/**
 * Handle Uniswap v4 Graduation Event
 */
async function handleGraduation(log, broadcast) {
  const { token, ethGraduated, tokensGraduated, uniswapV4Pool } = log.args;
  console.log(`🦄 [Indexer] Token ${token} graduated into Uniswap v4 pool: ${uniswapV4Pool}`);

  await query(
    `UPDATE tokens SET is_graduated = 1, uniswap_v4_pool = ? WHERE id = ?`,
    [uniswapV4Pool, token]
  );

  if (broadcast) {
    broadcast({
      type: 'GRADUATED_UNISWAP_V4',
      token,
      uniswapV4Pool
    });
  }
}

/**
 * Start Live Blockchain Listener
 */
function startIndexer(broadcastFn) {
  console.log(`📡 [Indexer] Connecting to Robinhood Chain Testnet RPC (${RPC_URL})...`);

  if (FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    // Watch Token Factory
    client.watchContractEvent({
      address: FACTORY_ADDRESS,
      abi: [EVENT_TOKEN_CREATED],
      onLogs: (logs) => logs.forEach(l => handleTokenCreated(l, broadcastFn))
    });

    // Watch All Trade Events
    client.watchContractEvent({
      abi: [EVENT_PURCHASED, EVENT_SOLD, EVENT_GRADUATED],
      onLogs: (logs) => {
        logs.forEach(l => {
          if (l.eventName === 'TokensPurchased') handleTradeEvent(l, true, broadcastFn);
          if (l.eventName === 'TokensSold') handleTradeEvent(l, false, broadcastFn);
          if (l.eventName === 'UniswapV4Graduated') handleGraduation(l, broadcastFn);
        });
      }
    });

    console.log('✅ [Indexer] Watching live Robinhood Chain contracts.');
  } else {
    console.log('ℹ️ [Indexer] Factory address not set in .env yet. Running in development mode.');
  }
}

module.exports = {
  startIndexer,
  handleTokenCreated,
  handleTradeEvent
};
