/**
 * Robinhood Chain Mainnet Event Indexer
 * Connects via viem, parses on-chain logs, stores in Database, and triggers WebSockets.
 */

const { createPublicClient, http, parseAbiItem } = require('viem');
const { query } = require('./db.js');
require('dotenv').config();

const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://robinhood-rpc.publicnode.com';
const FACTORY_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || process.env.FACTORY_ADDRESS || '0xD7d41a4E8EA876078227697c1C973fE92a8BCBBa';

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
    `INSERT INTO tokens (id, curve_address, name, symbol, description, logo_url, creator, real_eth, tokens_left, creator_tax_bps, holder_tax_bps)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, 800000000, ?, ?)
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
  const curveAddress = log.address;
  const trader = isBuy ? log.args.buyer : log.args.seller;
  const ethAmount = Number(isBuy ? log.args.ethPaid : log.args.ethReturned) / 1e18;
  const tokenAmount = Number(isBuy ? log.args.tokensReceived : log.args.tokensIn) / 1e18;
  const txHash = log.transactionHash;

  console.log(`📈 [Indexer] Trade on ${curveAddress.slice(0, 10)}...: ${isBuy ? 'BUY' : 'SELL'} ${ethAmount.toFixed(4)} ETH`);

  // 0. Resolve actual token ID from curve address
  let tokenRows = await query('SELECT id, real_eth, volume_24h_usd FROM tokens WHERE curve_address = ? OR id = ?', [curveAddress, curveAddress]);
  let actualTokenId = null;

  if (tokenRows && tokenRows.length > 0) {
    actualTokenId = tokenRows[0].id;
  } else {
    try {
      const curveToken = await client.readContract({
        address: curveAddress,
        abi: [parseAbiItem('function token() external view returns (address)')],
        functionName: 'token'
      });
      if (curveToken) {
        actualTokenId = curveToken;
        await query(
          `INSERT INTO tokens (id, curve_address, name, symbol, description, logo_url, real_eth, tokens_left)
           VALUES (?, ?, ?, ?, ?, ?, 0.0, 800000000)
           ON CONFLICT(id) DO UPDATE SET curve_address = EXCLUDED.curve_address`,
          [curveToken, curveAddress, 'Robinhood Token', 'RH', 'Live bonding curve on Robinhood Chain', '🪙']
        );
        tokenRows = [{ id: curveToken, real_eth: 0.0, volume_24h_usd: 0.0 }];
      }
    } catch (e) {
      console.warn("Could not query on-chain token for curve:", e.message);
    }
  }

  if (!actualTokenId) {
    console.warn(`[Indexer] Could not resolve token for curve ${curveAddress}, skipping trade record`);
    return;
  }

  // 1. Insert into trades table
  try {
    await query(
      `INSERT INTO trades (token_address, tx_hash, trader, is_buy, eth_amount, token_amount)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tx_hash) DO NOTHING`,
      [actualTokenId, txHash, trader, isBuy ? 1 : 0, ethAmount, tokenAmount]
    );
  } catch (errTrade) {
    console.warn("[Indexer] Trade record insert warning:", errTrade.message);
  }

  // 2. Update real_eth and volume in tokens table
  if (tokenRows && tokenRows.length > 0) {
    let currentEth = parseFloat(tokenRows[0].real_eth) || 0;
    let newEth = isBuy ? (currentEth + ethAmount) : Math.max(0.05, currentEth - ethAmount);
    let newVolume = (parseFloat(tokenRows[0].volume_24h_usd) || 0) + (ethAmount * 4200);

    const isGraduated = newEth >= 2.0 ? 1 : 0;

    await query(
      `UPDATE tokens SET real_eth = ?, volume_24h_usd = ?, is_graduated = ? WHERE id = ? OR curve_address = ?`,
      [newEth, newVolume, isGraduated, actualTokenId, curveAddress]
    );
  }

  // 3. Update OHLCV Candlestick (1 minute bucket)
  const now = Math.floor(Date.now() / 60000) * 60; // 1-minute bucket timestamp
  const priceUsd = (ethAmount / (tokenAmount || 1)) * 4200;

  try {
    const existingCandle = await query(
      "SELECT * FROM candles WHERE token_address = ? AND timeframe = '1m' AND bucket_timestamp = ?",
      [actualTokenId, now]
    );

    if (existingCandle && existingCandle.length > 0) {
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
         VALUES (?, '1m', ?, ?, ?, ?, ?, ?)`,
        [actualTokenId, priceUsd, priceUsd, priceUsd, priceUsd, ethAmount, now]
      );
    }
  } catch (errCandle) {
    console.warn("[Indexer] Candle update warning:", errCandle.message);
  }

  // 4. Broadcast live trade event to WebSockets
  if (broadcast) {
    broadcast({
      type: 'NEW_TRADE',
      trade: {
        tokenAddress: actualTokenId,
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
  console.log(`📡 [Indexer] Connecting to Robinhood Chain Mainnet RPC (${RPC_URL})...`);

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
