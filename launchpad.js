/**
 * Robinhood Chain Launchpad - Application Core
 * Arbitrum Orbit L2 (Chain ID 46630)
 * 2.0 ETH Bonding Curve with Uniswap v4 Migration, Logo Upload, and Dynamic Cloud Hosting Sync
 */

const RH_MAINNET_CONFIG = {
  chainId: '0x1237', // 4663 in hex
  chainName: 'Robinhood Chain Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
};

const RH_TESTNET_CONFIG = {
  chainId: '0xb626', // 46630 in hex
  chainName: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com']
};

// Default to Robinhood Chain Mainnet (4663)
let RH_CHAIN_CONFIG = RH_MAINNET_CONFIG;

// Deployed Smart Contracts on Robinhood Chain Mainnet
const FACTORY_CONTRACT_ADDRESS = '0x84D44D6ee5297e3073cf536aBB8d3978D7cc9Ca2';
const UNISWAP_V4_POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';

const AMM_PARAMS = {
  TOTAL_SUPPLY: 1_000_000_000,
  TOKENS_FOR_CURVE: 800_000_000,
  TOKENS_FOR_DEX: 200_000_000,
  VIRTUAL_ETH: 0.5,             // Calibrated for 2.0 ETH target
  GRADUATION_ETH_TARGET: 2.0,   // Exactly 2 ETH target
  PROTOCOL_FEE_PERCENT: 0.01    // 1%
};

// Dynamic URL detection: Works automatically on localhost AND on live cloud hosting!
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BACKEND_API_URL = isLocalhost ? 'http://localhost:3001/api' : `${window.location.origin}/api`;
const WS_URL = isLocalhost
  ? 'ws://localhost:3001'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

let isBackendConnected = false;
let wsClient = null;

// --- Initial Mock / Fallback Tokens Data ---
let tokens = [
  {
    id: "gme2",
    ticker: "GME2",
    name: "GameStop 2.0",
    description: "The digital sequel to the short squeeze that started it all on Robinhood. Can't stop, won't stop.",
    icon: "🎮",
    creator: "0x742d...44e",
    createdAgo: "12m ago",
    realEth: 1.62,
    tokensLeft: 250000000,
    priceEth: 0.000000034,
    marketCapUsd: 142800,
    change24h: 184.2,
    volume24hUsd: 38400,
    graduated: false,
    creatorTax: 1.0,
    holderTax: 2.0,
    history: [0.3, 0.6, 0.9, 1.2, 1.45, 1.62]
  },
  {
    id: "wsb",
    ticker: "WSB",
    name: "WallStreetBets Token",
    description: "Diamond hands only. Built for the retail army ready to graduate into Uniswap v4.",
    icon: "💎",
    creator: "0x892a...12c",
    createdAgo: "1h ago",
    realEth: 1.94,
    tokensLeft: 60000000,
    priceEth: 0.000000048,
    marketCapUsd: 201600,
    change24h: 312.8,
    volume24hUsd: 94200,
    graduated: false,
    creatorTax: 0.0,
    holderTax: 3.0,
    history: [0.4, 0.8, 1.2, 1.6, 1.82, 1.94]
  },
  {
    id: "hoodie",
    ticker: "HOODIE",
    name: "RobinHoodie",
    description: "Official mascot token for the Robinhood Chain degens wearing neon green hoodies.",
    icon: "🏹",
    creator: "0x19a2...99f",
    createdAgo: "34m ago",
    realEth: 0.85,
    tokensLeft: 520000000,
    priceEth: 0.000000021,
    marketCapUsd: 88200,
    change24h: 62.5,
    volume24hUsd: 19500,
    graduated: false,
    creatorTax: 2.0,
    holderTax: 0.0,
    history: [0.2, 0.4, 0.65, 0.85]
  },
  {
    id: "deepvalue",
    ticker: "DFV",
    name: "Deep F***ing Value",
    description: "In memory of the red headband and the roaring kitten. Pure classic fair launch.",
    icon: "🐱",
    creator: "0x33e1...fa8",
    createdAgo: "2h ago",
    realEth: 0.40,
    tokensLeft: 690000000,
    priceEth: 0.000000014,
    marketCapUsd: 58800,
    change24h: -8.4,
    volume24hUsd: 8200,
    graduated: false,
    creatorTax: 0.0,
    holderTax: 0.0,
    history: [0.1, 0.25, 0.40]
  },
  {
    id: "doge2",
    ticker: "DOGE2",
    name: "Robin Doge",
    description: "Successfully graduated into Uniswap v4 with LP burned permanently.",
    icon: "🐕",
    creator: "0x44c9...71b",
    createdAgo: "3h ago",
    realEth: 2.0,
    tokensLeft: 0,
    priceEth: 0.000000052,
    marketCapUsd: 218400,
    change24h: 420.0,
    volume24hUsd: 145000,
    graduated: true,
    creatorTax: 1.5,
    holderTax: 1.5,
    history: [0.3, 0.8, 1.3, 1.7, 2.0]
  }
];

// --- State Variables ---
let activeToken = tokens[0];
let activeTab = "trending";
let ethUsdPrice = 4200;
let uploadedLogoDataUrl = null;
let uploadedLogoFileRaw = null;

let userWallet = {
  connected: false,
  address: null,
  balanceEth: 2.50,
  holdings: {
    "gme2": 450000,
    "hoodie": 0,
    "wsb": 120000,
    "deepvalue": 0,
    "doge2": 0
  },
  claimableRewardsEth: {
    "gme2": 0.0185,
    "wsb": 0.0092,
    "hoodie": 0,
    "deepvalue": 0,
    "doge2": 0
  }
};

let recentTrades = [
  { type: "buy", user: "0x89f...21a", eth: 0.15, tokens: 6800000, time: "Just now" },
  { type: "buy", user: "0x44e...99c", eth: 0.05, tokens: 2750000, time: "1m ago" },
  { type: "sell", user: "0x12a...77b", eth: 0.04, tokens: 2200000, time: "2m ago" },
  { type: "buy", user: "0x66c...33f", eth: 0.20, tokens: 13500000, time: "4m ago" }
];

let comments = [
  { user: "DegenDave", text: "Target is only 2 ETH! Uniswap v4 graduation is right around the corner 🚀", time: "2m ago", avatar: "🤠" },
  { user: "UniswapV4Alpha", text: "Uniswap v4 singleton pool will lock liquidity with zero hook risk.", time: "4m ago", avatar: "🦄" },
  { user: "RobinTrader", text: "Robinhood Chain gas is literally 0.0001 ETH, so smooth.", time: "6m ago", avatar: "⚡" },
  { user: "ApeTogether", text: "Holding $GME2 pays real ETH dividends! Just claimed 0.018 ETH.", time: "11m ago", avatar: "🦍" }
];

// --- Helper: Render Token Icon ---
function renderTokenIconHtml(icon, sizeClass = "w-10 h-10 text-2xl") {
  if (!icon) return `<span class="${sizeClass} flex items-center justify-center">🚀</span>`;
  if (icon.startsWith("data:image/") || icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/uploads/")) {
    const fullUrl = (icon.startsWith("/uploads/") && isLocalhost) ? `http://localhost:3001${icon}` : icon;
    return `<img src="${fullUrl}" alt="Logo" class="${sizeClass} object-cover rounded-xl border border-gray-800 shadow-sm" />`;
  }
  return `<span class="${sizeClass} flex items-center justify-center p-2 rounded-xl bg-[#121721] border border-gray-800">${icon}</span>`;
}

// --- AMM Math Calculations ---
function getCurveMath(realEth) {
  const k = AMM_PARAMS.VIRTUAL_ETH * AMM_PARAMS.TOKENS_FOR_CURVE;
  const currentTotalEth = AMM_PARAMS.VIRTUAL_ETH + realEth;
  const tokensLeft = k / currentTotalEth;
  const tokensSold = AMM_PARAMS.TOKENS_FOR_CURVE - tokensLeft;
  const progressPercent = Math.min(100, (realEth / AMM_PARAMS.GRADUATION_ETH_TARGET) * 100);
  const currentPriceEth = (currentTotalEth * currentTotalEth) / k;

  return {
    k,
    currentTotalEth,
    tokensLeft,
    tokensSold,
    progressPercent,
    currentPriceEth
  };
}

function calculateTokensOut(ethIn, currentRealEth, token) {
  const protocolFee = ethIn * AMM_PARAMS.PROTOCOL_FEE_PERCENT;
  const creatorFee = ethIn * (token.creatorTax / 100);
  const holderFee = ethIn * (token.holderTax / 100);
  const totalFees = protocolFee + creatorFee + holderFee;
  const ethAfterFees = ethIn - totalFees;

  const k = AMM_PARAMS.VIRTUAL_ETH * AMM_PARAMS.TOKENS_FOR_CURVE;
  const currentEth = AMM_PARAMS.VIRTUAL_ETH + currentRealEth;
  const newEth = currentEth + ethAfterFees;
  const currentTokenReserve = k / currentEth;
  const newTokenReserve = k / newEth;

  const tokensOut = currentTokenReserve - newTokenReserve;
  return { tokensOut, protocolFee, creatorFee, holderFee, totalFees };
}

function calculateEthOut(tokensIn, currentRealEth, token) {
  const k = AMM_PARAMS.VIRTUAL_ETH * AMM_PARAMS.TOKENS_FOR_CURVE;
  const currentEth = AMM_PARAMS.VIRTUAL_ETH + currentRealEth;
  const currentTokenReserve = k / currentEth;
  const newTokenReserve = currentTokenReserve + tokensIn;
  const newEth = k / newTokenReserve;
  const grossEth = currentEth - newEth;

  const protocolFee = grossEth * AMM_PARAMS.PROTOCOL_FEE_PERCENT;
  const creatorFee = grossEth * (token.creatorTax / 100);
  const holderFee = grossEth * (token.holderTax / 100);
  const totalFees = protocolFee + creatorFee + holderFee;
  const netEthOut = grossEth - totalFees;

  return { netEthOut, protocolFee, creatorFee, holderFee, totalFees };
}

// --- DOM Initialization & Backend Detection ---
document.addEventListener("DOMContentLoaded", async () => {
  renderHeader();
  renderKothBanner();
  renderTokenGrid();
  renderTerminal();
  setupEventListeners();
  setupLogoUploadListeners();
  drawChart();

  await initBackendSync();
  setInterval(simulateLiveMarketTick, 7000);
});

// --- Backend Sync & WebSocket ---
async function initBackendSync() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/health`);
    if (res.ok) {
      isBackendConnected = true;
      console.log(`✅ Connected to Launchpad Backend at ${BACKEND_API_URL}`);
      await fetchTokensFromDb();
      connectWebSocket();
    }
  } catch (err) {
    console.log('ℹ️ Running in standalone client mode (backend server offline).');
  }
}

async function fetchTokensFromDb() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/tokens?sort=${activeTab}`);
    const data = await res.json();
    if (data.success && data.tokens.length > 0) {
      tokens = data.tokens.map(dbTok => ({
        id: dbTok.id,
        ticker: dbTok.symbol,
        name: dbTok.name,
        description: dbTok.description,
        icon: dbTok.logo_url || "🚀",
        creator: dbTok.creator.slice(0, 6) + '...' + dbTok.creator.slice(-4),
        realEth: parseFloat(dbTok.real_eth) || 0.1,
        tokensLeft: parseFloat(dbTok.tokens_left) || 800000000,
        priceEth: 0.000000034,
        marketCapUsd: parseFloat(dbTok.market_cap_usd) || 12000,
        change24h: 14.5,
        volume24hUsd: parseFloat(dbTok.volume_24h_usd) || 3500,
        graduated: Boolean(dbTok.is_graduated),
        creatorTax: (dbTok.creator_tax_bps || 0) / 100,
        holderTax: (dbTok.holder_tax_bps || 0) / 100,
        history: [0.1, parseFloat(dbTok.real_eth) || 0.1]
      }));

      activeToken = tokens[0];
      renderKothBanner();
      renderTokenGrid();
      renderTerminal();
      drawChart();
    }
  } catch (err) {
    console.warn("Could not fetch tokens from DB:", err);
  }
}

function connectWebSocket() {
  try {
    wsClient = new WebSocket(WS_URL);
    wsClient.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'NEW_TRADE') {
        recentTrades.unshift({
          type: msg.trade.isBuy ? 'buy' : 'sell',
          user: msg.trade.trader.slice(0, 6) + '...' + msg.trade.trader.slice(-3),
          eth: msg.trade.ethAmount,
          tokens: msg.trade.tokenAmount,
          time: 'Just now'
        });
        if (recentTrades.length > 20) recentTrades.pop();
        renderTradeHistory();
      } else if (msg.type === 'TOKEN_CREATED') {
        fetchTokensFromDb();
      }
    };
  } catch (e) {
    console.warn("WebSocket connection error:", e);
  }
}

// --- UI Rendering Functions ---

function renderHeader() {
  const walletBtn = document.getElementById("walletConnectBtn");
  const balanceDisplay = document.getElementById("walletBalanceDisplay");

  if (userWallet.connected) {
    walletBtn.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-[#00C805] animate-ping mr-1"></span>
      <span class="font-mono text-xs">${userWallet.address}</span>
    `;
    walletBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#181f2c] border border-[#00C805] text-[#00C805] text-xs font-semibold hover:bg-opacity-80 transition";
    if (balanceDisplay) {
      balanceDisplay.innerHTML = `<span class="text-xs text-gray-400">Balance:</span> <span class="text-xs font-mono font-bold text-white">${userWallet.balanceEth.toFixed(3)} ETH</span>`;
      balanceDisplay.classList.remove("hidden");
    }
  } else {
    walletBtn.innerHTML = `
      <svg class="w-4 h-4 text-[#00C805]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      <span>Connect Wallet</span>
    `;
    walletBtn.className = "flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00C805] text-black text-xs font-bold hover:bg-[#10b981] transition shadow-md shadow-[#00C805]/20";
    if (balanceDisplay) balanceDisplay.classList.add("hidden");
  }
}

function getTaxBadgeHtml(token) {
  if (token.creatorTax === 0 && token.holderTax === 0) {
    return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">⚡ 0% Tax (Pure Fair)</span>`;
  }
  return `
    <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
      ${token.creatorTax > 0 ? `👑 ${token.creatorTax}% Dev` : ''}
      ${token.creatorTax > 0 && token.holderTax > 0 ? ' • ' : ''}
      ${token.holderTax > 0 ? `💎 ${token.holderTax}% Holders` : ''}
    </span>
  `;
}

function renderKothBanner() {
  const koth = tokens.reduce((prev, current) => (prev.realEth > current.realEth && !prev.graduated) ? prev : current);
  const banner = document.getElementById("kothBanner");
  if (!banner) return;

  const math = getCurveMath(koth.realEth);

  banner.innerHTML = `
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#181f2c] via-[#1b263b] to-[#181f2c] border border-[#00C805]/30 p-4 sm:p-5 shadow-lg shadow-black/40 cursor-pointer" onclick="selectToken('${koth.id}')">
      <div class="absolute -right-10 -bottom-10 w-44 h-44 bg-[#00C805]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="relative">
            ${renderTokenIconHtml(koth.icon, "w-14 h-14 text-4xl")}
            <span class="absolute -top-1.5 -right-1.5 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-bold">👑 KOTH</span>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-lg sm:text-xl font-bold text-white">${koth.name}</h2>
              <span class="text-xs font-mono font-bold text-[#00C805] px-2 py-0.5 rounded bg-[#00C805]/10 border border-[#00C805]/20">$${koth.ticker}</span>
              ${getTaxBadgeHtml(koth)}
            </div>
            <p class="text-xs text-gray-400 line-clamp-1 max-w-md mt-0.5">${koth.description}</p>
          </div>
        </div>

        <div class="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-gray-800">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span>Uniswap v4 Migration</span>
              <span class="text-[9px] px-1.5 py-0.2 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">v4 LP</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <div class="w-32 sm:w-44 bg-gray-800 h-2.5 rounded-full overflow-hidden">
                <div class="progress-fill h-full" style="width: ${math.progressPercent.toFixed(1)}%"></div>
              </div>
              <span class="font-mono text-xs font-bold text-[#00C805]">${math.progressPercent.toFixed(1)}%</span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">${koth.realEth.toFixed(2)} / ${AMM_PARAMS.GRADUATION_ETH_TARGET.toFixed(2)} ETH Raised</div>
          </div>

          <button class="px-4 py-2 bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-xs rounded-xl shadow-md transition transform active:scale-95">
            Quick Trade
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTokenGrid() {
  const container = document.getElementById("tokensGrid");
  if (!container) return;

  let filtered = [...tokens];
  const searchInput = document.getElementById("searchInput")?.value.toLowerCase().trim() || "";

  if (searchInput) {
    filtered = filtered.filter(t => t.name.toLowerCase().includes(searchInput) || t.ticker.toLowerCase().includes(searchInput));
  }

  if (activeTab === "trending") {
    filtered.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  } else if (activeTab === "graduation") {
    filtered.sort((a, b) => b.realEth - a.realEth);
  } else if (activeTab === "marketcap") {
    filtered.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  }

  container.innerHTML = filtered.map(t => {
    const math = getCurveMath(t.realEth);
    const isSelected = activeToken.id === t.id;

    return `
      <div onclick="selectToken('${t.id}')" class="group relative rounded-xl bg-[#181f2c] hover:bg-[#1f2737] border ${isSelected ? 'border-[#00C805] shadow-lg shadow-[#00C805]/15' : 'border-[#242e42]'} p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between">
        ${t.graduated ? `<div class="absolute top-3 right-3 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><span>🦄</span> Graduated v4</div>` : ''}

        <div>
          <div class="flex items-start gap-3">
            ${renderTokenIconHtml(t.icon, "w-11 h-11 text-2xl shrink-0")}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-white text-sm truncate">${t.name}</span>
                <span class="text-[11px] font-mono text-[#00C805] font-semibold">$${t.ticker}</span>
              </div>
              <div class="text-[11px] text-gray-400 mt-0.5">By <span class="font-mono text-gray-300">${t.creator}</span></div>
            </div>
          </div>

          <div class="mt-2.5">
            ${getTaxBadgeHtml(t)}
          </div>

          <p class="text-xs text-gray-400 line-clamp-2 mt-2 leading-relaxed">${t.description}</p>
        </div>

        <div class="mt-4 pt-3 border-t border-gray-800/80">
          <div class="flex items-center justify-between text-xs mb-1.5">
            <span class="text-gray-400">Market Cap:</span>
            <span class="font-mono font-bold text-white">$${t.marketCapUsd.toLocaleString()}</span>
          </div>

          <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-gray-400">Uniswap v4 Progress:</span>
            <span class="font-mono text-[#00C805] font-semibold">${math.progressPercent.toFixed(1)}%</span>
          </div>

          <div class="w-full bg-[#121721] h-1.5 rounded-full overflow-hidden">
            <div class="progress-fill h-full" style="width: ${math.progressPercent}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderTerminal() {
  const math = getCurveMath(activeToken.realEth);

  document.getElementById("terminalTokenName").innerText = activeToken.name;
  document.getElementById("terminalTokenTicker").innerText = `$${activeToken.ticker}`;
  document.getElementById("terminalTokenIcon").innerHTML = renderTokenIconHtml(activeToken.icon, "w-12 h-12 text-3xl");
  document.getElementById("terminalTokenDesc").innerText = activeToken.description;
  document.getElementById("terminalCreator").innerText = activeToken.creator;

  const taxBadgeContainer = document.getElementById("terminalTaxBadge");
  if (taxBadgeContainer) {
    taxBadgeContainer.innerHTML = getTaxBadgeHtml(activeToken);
  }

  // Stats
  document.getElementById("terminalPriceUsd").innerText = `$${(activeToken.priceEth * ethUsdPrice).toFixed(6)}`;
  document.getElementById("terminalPriceEth").innerText = `${(activeToken.priceEth * 1e9).toFixed(2)} Gwei`;
  document.getElementById("terminalMcap").innerText = `$${activeToken.marketCapUsd.toLocaleString()}`;
  document.getElementById("terminalVolume").innerText = `$${activeToken.volume24hUsd.toLocaleString()}`;

  // Progress Bar for 2.0 ETH
  document.getElementById("terminalProgressPercent").innerText = `${math.progressPercent.toFixed(1)}%`;
  document.getElementById("terminalEthProgress").innerText = `${activeToken.realEth.toFixed(2)} / ${AMM_PARAMS.GRADUATION_ETH_TARGET.toFixed(2)} ETH`;
  document.getElementById("terminalProgressBar").style.width = `${math.progressPercent}%`;

  const remainingEth = Math.max(0, AMM_PARAMS.GRADUATION_ETH_TARGET - activeToken.realEth);
  const remainingText = document.getElementById("terminalRemainingEth");
  if (remainingText) {
    remainingText.innerText = `${remainingEth.toFixed(2)} ETH to Uniswap v4`;
  }

  // User holdings
  const tokenHolding = userWallet.holdings[activeToken.id] || 0;
  document.getElementById("userTokenBalance").innerText = `${tokenHolding.toLocaleString()} $${activeToken.ticker}`;

  renderHolderRewardsCard();
  renderTradeHistory();
  renderComments();
  updateSwapEstimate();
}

function renderHolderRewardsCard() {
  const container = document.getElementById("holderRewardsSection");
  if (!container) return;

  if (activeToken.holderTax > 0) {
    const claimable = userWallet.claimableRewardsEth[activeToken.id] || 0;
    container.classList.remove("hidden");
    container.innerHTML = `
      <div class="rounded-2xl bg-gradient-to-r from-[#181f2c] to-[#14233a] border border-blue-500/30 p-4 shadow-lg">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">💎</span>
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-white">Holder ETH Reflection</span>
              <span class="ml-1 text-[10px] text-blue-400 font-mono font-bold">${activeToken.holderTax}% Tax Distributed</span>
            </div>
          </div>
          <span class="text-[10px] text-gray-400">Passive Income</span>
        </div>

        <div class="flex items-center justify-between mt-3 pt-2 border-t border-gray-800">
          <div>
            <div class="text-[10px] text-gray-400">Your Accrued Rewards:</div>
            <div class="text-sm font-bold font-mono text-[#00C805]">${claimable.toFixed(4)} ETH <span class="text-[11px] text-gray-400">($${(claimable * ethUsdPrice).toFixed(2)})</span></div>
          </div>

          <button onclick="claimRewards()" ${claimable <= 0 ? 'disabled' : ''} class="px-3.5 py-1.5 rounded-xl font-bold text-xs ${claimable > 0 ? 'bg-[#00C805] hover:bg-[#00e700] text-black shadow-md shadow-[#00C805]/20 cursor-pointer' : 'bg-gray-800 text-gray-500 cursor-not-allowed'} transition">
            Claim ETH
          </button>
        </div>
      </div>
    `;
  } else {
    container.classList.add("hidden");
  }
}

function claimRewards() {
  const claimable = userWallet.claimableRewardsEth[activeToken.id] || 0;
  if (claimable <= 0) return;

  userWallet.balanceEth += claimable;
  userWallet.claimableRewardsEth[activeToken.id] = 0;

  renderHeader();
  renderHolderRewardsCard();
  alert(`🎉 Successfully claimed ${claimable.toFixed(4)} ETH in holder reflection rewards!`);
}

function renderTradeHistory() {
  const container = document.getElementById("tradeHistoryContainer");
  if (!container) return;

  container.innerHTML = recentTrades.map(trade => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/60 font-mono">
      <div class="flex items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${trade.type === 'buy' ? 'bg-[#00C805]/15 text-[#00C805]' : 'bg-[#ff4b4b]/15 text-[#ff4b4b]'}">
          ${trade.type.toUpperCase()}
        </span>
        <span class="text-gray-400">${trade.user}</span>
      </div>
      <div class="text-right">
        <div class="text-white">${trade.eth.toFixed(3)} ETH</div>
        <div class="text-[10px] text-gray-500">${trade.time}</div>
      </div>
    </div>
  `).join("");
}

function renderComments() {
  const container = document.getElementById("commentsContainer");
  if (!container) return;

  container.innerHTML = comments.map(c => `
    <div class="flex items-start gap-2.5 text-xs py-2 border-b border-gray-800/40">
      <span class="text-xl p-1 bg-[#121721] rounded-lg border border-gray-800">${c.avatar}</span>
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <span class="font-bold text-gray-200">${c.user}</span>
          <span class="text-[10px] text-gray-500">${c.time}</span>
        </div>
        <p class="text-gray-300 mt-1 leading-relaxed">${c.text}</p>
      </div>
    </div>
  `).join("");
}

// --- Chart Rendering on HTML5 Canvas ---
function drawChart() {
  const canvas = document.getElementById("priceChartCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement.clientWidth;
  const height = canvas.height = canvas.parentElement.clientHeight || 260;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#1f293d";
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const data = activeToken.history;
  const minVal = Math.min(...data) * 0.9;
  const maxVal = Math.max(...data) * 1.1;

  const stepX = width / (data.length - 1);
  const getY = val => height - 30 - ((val - minVal) / (maxVal - minVal)) * (height - 60);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(0, 200, 5, 0.35)");
  gradient.addColorStop(1, "rgba(0, 200, 5, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, getY(data[0]));
  for (let i = 1; i < data.length; i++) {
    const x = i * stepX;
    const y = getY(data[i]);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, getY(data[0]));
  for (let i = 1; i < data.length; i++) {
    const x = i * stepX;
    const y = getY(data[i]);
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#00C805";
  ctx.lineWidth = 3;
  ctx.stroke();

  const lastX = width;
  const lastY = getY(data[data.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX - 4, lastY, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#00C805";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- Swap Interaction Logic ---
let swapMode = "buy";

function setSwapMode(mode) {
  swapMode = mode;
  const buyTab = document.getElementById("swapTabBuy");
  const sellTab = document.getElementById("swapTabSell");
  const actionBtn = document.getElementById("executeSwapBtn");
  const inputLabel = document.getElementById("swapInputLabel");
  const outputLabel = document.getElementById("swapOutputLabel");

  if (mode === "buy") {
    buyTab.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-[#00C805] text-black shadow";
    sellTab.className = "flex-1 py-2 text-xs font-bold rounded-lg text-gray-400 hover:text-white";
    actionBtn.className = "w-full py-3 rounded-xl bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-sm shadow-lg shadow-[#00C805]/20 transition active:scale-[0.98]";
    actionBtn.innerText = "Instant Buy (ETH)";
    inputLabel.innerText = "You Pay (ETH)";
    outputLabel.innerText = `You Receive ($${activeToken.ticker})`;
  } else {
    sellTab.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-[#ff4b4b] text-white shadow";
    buyTab.className = "flex-1 py-2 text-xs font-bold rounded-lg text-gray-400 hover:text-white";
    actionBtn.className = "w-full py-3 rounded-xl bg-[#ff4b4b] hover:bg-[#e03a3a] text-white font-bold text-sm shadow-lg shadow-[#ff4b4b]/20 transition active:scale-[0.98]";
    actionBtn.innerText = `Instant Sell ($${activeToken.ticker})`;
    inputLabel.innerText = `You Pay ($${activeToken.ticker})`;
    outputLabel.innerText = "You Receive (ETH)";
  }

  updateSwapEstimate();
}

function updateSwapEstimate() {
  const input = parseFloat(document.getElementById("swapInputAmount")?.value) || 0;
  const outputElem = document.getElementById("swapOutputAmount");
  const feeElem = document.getElementById("swapFeeDisplay");
  const taxBreakdownElem = document.getElementById("swapTaxBreakdown");

  const totalTaxPct = 1.0 + activeToken.creatorTax + activeToken.holderTax;

  if (swapMode === "buy") {
    if (input <= 0) {
      outputElem.value = "0";
      feeElem.innerText = `0.000 ETH (${totalTaxPct.toFixed(1)}%)`;
      if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken.creatorTax}% Dev | ${activeToken.holderTax}% Holders`;
      return;
    }
    const { tokensOut, totalFees } = calculateTokensOut(input, activeToken.realEth, activeToken);
    outputElem.value = Math.floor(tokensOut).toLocaleString();
    feeElem.innerText = `${totalFees.toFixed(4)} ETH (${totalTaxPct.toFixed(1)}%)`;
    if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken.creatorTax}% Dev | ${activeToken.holderTax}% Holders`;
  } else {
    if (input <= 0) {
      outputElem.value = "0";
      feeElem.innerText = `0.000 ETH (${totalTaxPct.toFixed(1)}%)`;
      if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken.creatorTax}% Dev | ${activeToken.holderTax}% Holders`;
      return;
    }
    const { netEthOut, totalFees } = calculateEthOut(input, activeToken.realEth, activeToken);
    outputElem.value = netEthOut.toFixed(4);
    feeElem.innerText = `${totalFees.toFixed(4)} ETH (${totalTaxPct.toFixed(1)}%)`;
    if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken.creatorTax}% Dev | ${activeToken.holderTax}% Holders`;
  }
}

function executeSwap() {
  if (!userWallet.connected) {
    connectWallet();
    return;
  }

  const inputAmount = parseFloat(document.getElementById("swapInputAmount")?.value) || 0;
  if (inputAmount <= 0) {
    alert("Please enter a valid amount!");
    return;
  }

  if (swapMode === "buy") {
    if (inputAmount > userWallet.balanceEth) {
      alert("Insufficient ETH balance on Robinhood Chain Testnet!");
      return;
    }

    const { tokensOut, totalFees, holderFee } = calculateTokensOut(inputAmount, activeToken.realEth, activeToken);

    userWallet.balanceEth -= inputAmount;
    userWallet.holdings[activeToken.id] = (userWallet.holdings[activeToken.id] || 0) + tokensOut;

    if (activeToken.holderTax > 0) {
      const userShareRatio = (userWallet.holdings[activeToken.id] / AMM_PARAMS.TOKENS_FOR_CURVE);
      userWallet.claimableRewardsEth[activeToken.id] = (userWallet.claimableRewardsEth[activeToken.id] || 0) + (holderFee * userShareRatio);
    }

    activeToken.realEth += (inputAmount - totalFees);
    activeToken.history.push(activeToken.realEth);
    activeToken.marketCapUsd = Math.round(activeToken.realEth * ethUsdPrice * 8);

    recentTrades.unshift({
      type: "buy",
      user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-3),
      eth: inputAmount,
      tokens: Math.floor(tokensOut),
      time: "Just now"
    });

    if (activeToken.realEth >= AMM_PARAMS.GRADUATION_ETH_TARGET && !activeToken.graduated) {
      activeToken.graduated = true;
      triggerGraduationCelebration(activeToken);
    }
  } else {
    const currentHolding = userWallet.holdings[activeToken.id] || 0;
    if (inputAmount > currentHolding) {
      alert(`Insufficient $${activeToken.ticker} balance to sell!`);
      return;
    }

    const { netEthOut, totalFees } = calculateEthOut(inputAmount, activeToken.realEth, activeToken);

    userWallet.balanceEth += netEthOut;
    userWallet.holdings[activeToken.id] -= inputAmount;

    activeToken.realEth = Math.max(0.05, activeToken.realEth - (netEthOut + totalFees));
    activeToken.history.push(activeToken.realEth);
    activeToken.marketCapUsd = Math.round(activeToken.realEth * ethUsdPrice * 8);

    recentTrades.unshift({
      type: "sell",
      user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-3),
      eth: netEthOut,
      tokens: Math.floor(inputAmount),
      time: "Just now"
    });
  }

  renderHeader();
  renderKothBanner();
  renderTokenGrid();
  renderTerminal();
  drawChart();

  document.getElementById("swapInputAmount").value = "";
  updateSwapEstimate();
}

function triggerGraduationCelebration(token) {
  alert(`🦄 CONGRATULATIONS! $${token.ticker} has reached the 2.0 ETH bonding curve target!\n\nAutomated liquidity migration initiated to Uniswap v4 Singleton PoolManager (Native ETH + 200M tokens) with LP permanently locked and burned!`);
}

function simulateLiveMarketTick() {
  if (isBackendConnected) return;

  const randomToken = tokens[Math.floor(Math.random() * tokens.length)];
  if (randomToken.graduated) return;

  const isBuy = Math.random() > 0.35;
  const tradeEth = (Math.random() * 0.06 + 0.01);

  if (isBuy) {
    randomToken.realEth = Math.min(AMM_PARAMS.GRADUATION_ETH_TARGET, randomToken.realEth + tradeEth);
    randomToken.history.push(randomToken.realEth);

    if (randomToken.holderTax > 0 && (userWallet.holdings[randomToken.id] || 0) > 0) {
      const rewardShare = (tradeEth * (randomToken.holderTax / 100)) * (userWallet.holdings[randomToken.id] / 200000000);
      userWallet.claimableRewardsEth[randomToken.id] = (userWallet.claimableRewardsEth[randomToken.id] || 0) + rewardShare;
      if (randomToken.id === activeToken.id) renderHolderRewardsCard();
    }

    if (randomToken.id === activeToken.id) {
      recentTrades.unshift({
        type: "buy",
        user: `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 5)}`,
        eth: tradeEth,
        tokens: Math.floor(tradeEth * 28000000),
        time: "Just now"
      });
      if (recentTrades.length > 20) recentTrades.pop();
    }

    if (randomToken.realEth >= AMM_PARAMS.GRADUATION_ETH_TARGET && !randomToken.graduated) {
      randomToken.graduated = true;
    }
  } else {
    randomToken.realEth = Math.max(0.1, randomToken.realEth - (tradeEth * 0.7));
    randomToken.history.push(randomToken.realEth);
  }

  if (randomToken.id === activeToken.id) {
    renderTerminal();
    drawChart();
  }
  renderTokenGrid();
  renderKothBanner();
}

async function connectWallet() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      userWallet.connected = true;
      userWallet.address = accounts[0].slice(0, 6) + "..." + accounts[0].slice(-4);

      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: RH_CHAIN_CONFIG.chainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [RH_CHAIN_CONFIG],
          });
        }
      }

      renderHeader();
      renderTerminal();
    } catch (e) {
      activateDemoMode();
    }
  } else {
    activateDemoMode();
  }
}

function activateDemoMode() {
  userWallet.connected = true;
  userWallet.address = "0xRH...46630";
  userWallet.balanceEth = 3.50;
  renderHeader();
  renderTerminal();
  alert("Connected to Robinhood Chain Testnet Demo Mode!\n\nTarget is 2.0 ETH per bonding curve. Test token launches with logo uploads and Uniswap v4 graduation.");
}

// --- Logo File Upload Handling ---
function setupLogoUploadListeners() {
  const fileInput = document.getElementById("newTokenLogoFile");
  const dropzone = document.getElementById("logoUploadDropzone");
  const previewContainer = document.getElementById("logoPreviewContainer");
  const previewImg = document.getElementById("logoPreviewImg");
  const fileNameText = document.getElementById("logoFileName");

  if (!fileInput || !dropzone) return;

  dropzone.addEventListener("click", () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("border-[#00C805]", "bg-[#00C805]/5");
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("border-[#00C805]", "bg-[#00C805]/5");
    }, false);
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processLogoFile(files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      processLogoFile(e.target.files[0]);
    }
  });
}

function processLogoFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Please select a valid image file (PNG, JPG, SVG, WebP, GIF)!");
    return;
  }

  uploadedLogoFileRaw = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedLogoDataUrl = e.target.result;

    const dropzone = document.getElementById("logoUploadDropzone");
    const previewContainer = document.getElementById("logoPreviewContainer");
    const previewImg = document.getElementById("logoPreviewImg");
    const fileNameText = document.getElementById("logoFileName");

    previewImg.src = uploadedLogoDataUrl;
    fileNameText.innerText = file.name;

    dropzone.classList.add("hidden");
    previewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function removeUploadedLogo(e) {
  if (e) e.stopPropagation();
  uploadedLogoDataUrl = null;
  uploadedLogoFileRaw = null;

  const fileInput = document.getElementById("newTokenLogoFile");
  if (fileInput) fileInput.value = "";

  document.getElementById("logoPreviewContainer")?.classList.add("hidden");
  document.getElementById("logoUploadDropzone")?.classList.remove("hidden");
}

let selectedTaxModel = "fair";

function selectTaxPreset(preset) {
  selectedTaxModel = preset;
  const customSection = document.getElementById("customTaxInputs");

  ["fair", "creator", "holder", "custom"].forEach(p => {
    const btn = document.getElementById(`taxPreset_${p}`);
    if (btn) {
      btn.className = "flex-1 py-2 px-2 rounded-xl text-center border text-xs font-semibold transition cursor-pointer " +
        (p === preset ? "bg-[#00C805]/15 border-[#00C805] text-white shadow-sm" : "bg-[#121721] border-gray-800 text-gray-400 hover:border-gray-700");
    }
  });

  if (preset === "fair") {
    document.getElementById("creatorTaxInput").value = "0.0";
    document.getElementById("holderTaxInput").value = "0.0";
    customSection.classList.add("hidden");
  } else if (preset === "creator") {
    document.getElementById("creatorTaxInput").value = "2.0";
    document.getElementById("holderTaxInput").value = "0.0";
    customSection.classList.add("hidden");
  } else if (preset === "holder") {
    document.getElementById("creatorTaxInput").value = "0.0";
    document.getElementById("holderTaxInput").value = "2.0";
    customSection.classList.add("hidden");
  } else if (preset === "custom") {
    customSection.classList.remove("hidden");
  }

  updateTaxSummary();
}

function updateTaxSummary() {
  const creatorTax = parseFloat(document.getElementById("creatorTaxInput").value) || 0;
  const holderTax = parseFloat(document.getElementById("holderTaxInput").value) || 0;
  const summaryElem = document.getElementById("taxSummaryText");

  if (creatorTax + holderTax > 10.0) {
    summaryElem.innerHTML = `<span class="text-red-400 font-bold">⚠️ Total tax cannot exceed 10.0%!</span>`;
    return;
  }

  summaryElem.innerHTML = `
    Total Trade Fee: <b class="text-white font-mono">${(1.0 + creatorTax + holderTax).toFixed(1)}%</b>
    <span class="text-gray-400">(1% Protocol + ${creatorTax.toFixed(1)}% Dev + ${holderTax.toFixed(1)}% Holders)</span>
  `;
}

function openCreateModal() {
  document.getElementById("createTokenModal").classList.remove("hidden");
  selectTaxPreset("fair");
  removeUploadedLogo();
}

function closeCreateModal() {
  document.getElementById("createTokenModal").classList.add("hidden");
  removeUploadedLogo();
}

async function handleCreateTokenSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("newTokenName").value.trim();
  const ticker = document.getElementById("newTokenTicker").value.trim().toUpperCase().replace("$", "");
  const desc = document.getElementById("newTokenDesc").value.trim();
  const devBuyEth = parseFloat(document.getElementById("newTokenDevBuy").value) || 0;

  const fallbackEmoji = document.getElementById("newTokenFallbackEmoji")?.value.trim();
  let finalIcon = uploadedLogoDataUrl || fallbackEmoji || "🚀";

  // If connected to backend and user uploaded an image file, upload to cloud/server
  if (isBackendConnected && uploadedLogoFileRaw) {
    try {
      const formData = new FormData();
      formData.append('logo', uploadedLogoFileRaw);
      const uploadRes = await fetch(`${BACKEND_API_URL}/upload-logo`, {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (uploadData.success && uploadData.logoUrl) {
        finalIcon = uploadData.logoUrl;
      }
    } catch (err) {
      console.warn("Could not upload to server, using base64 fallback:", err);
    }
  }

  const creatorTax = parseFloat(document.getElementById("creatorTaxInput").value) || 0;
  const holderTax = parseFloat(document.getElementById("holderTaxInput").value) || 0;

  if (creatorTax + holderTax > 10.0) {
    alert("Combined tax cannot exceed 10%!");
    return;
  }

  if (!name || !ticker || !desc) {
    alert("Please fill all required token fields!");
    return;
  }

  const newToken = {
    id: `token_${Date.now()}`,
    ticker: ticker,
    name: name,
    description: desc,
    icon: finalIcon,
    creator: userWallet.connected ? userWallet.address : "0xYou...Me",
    createdAgo: "Just now",
    realEth: devBuyEth > 0 ? devBuyEth : 0.05,
    tokensLeft: AMM_PARAMS.TOKENS_FOR_CURVE,
    priceEth: 0.00000001,
    marketCapUsd: Math.round((devBuyEth + 0.05) * ethUsdPrice * 8),
    change24h: 12.0,
    volume24hUsd: devBuyEth * ethUsdPrice,
    graduated: false,
    creatorTax: creatorTax,
    holderTax: holderTax,
    history: [0.05, devBuyEth > 0 ? devBuyEth : 0.05]
  };

  tokens.unshift(newToken);
  closeCreateModal();
  selectToken(newToken.id);
  renderTokenGrid();
  renderKothBanner();

  alert(`🎉 Token $${ticker} deployed on Robinhood Chain!\n\nBonding Curve Target: 2.0 ETH\nAutomated Migration: Uniswap v4 Singleton\nTax: ${creatorTax}% Dev | ${holderTax}% Holders`);
}

function selectToken(tokenId) {
  const found = tokens.find(t => t.id === tokenId);
  if (found) {
    activeToken = found;
    renderTerminal();
    drawChart();
    if (window.innerWidth < 768) {
      document.getElementById("tradingTerminalSection")?.scrollIntoView({ behavior: "smooth" });
    }
  }
}

function postComment() {
  const input = document.getElementById("commentInput");
  const text = input?.value.trim();
  if (!text) return;

  comments.unshift({
    user: userWallet.connected ? userWallet.address : "AnonTrader",
    text: text,
    time: "Just now",
    avatar: "🚀"
  });

  input.value = "";
  renderComments();
}

function setPresetAmount(amount) {
  document.getElementById("swapInputAmount").value = amount;
  updateSwapEstimate();
}

function setMaxAmount() {
  if (swapMode === "buy") {
    const maxEth = Math.max(0, userWallet.balanceEth - 0.005);
    document.getElementById("swapInputAmount").value = maxEth.toFixed(3);
  } else {
    const maxTokens = userWallet.holdings[activeToken.id] || 0;
    document.getElementById("swapInputAmount").value = maxTokens;
  }
  updateSwapEstimate();
}

function setDeviceMode(mode) {
  const container = document.getElementById("appContainer");
  const btnAuto = document.getElementById("deviceBtnAuto");
  const btnPhone = document.getElementById("deviceBtnPhone");
  const btnPc = document.getElementById("deviceBtnPc");

  [btnAuto, btnPhone, btnPc].forEach(b => {
    b.classList.remove("bg-[#00C805]", "text-black");
    b.classList.add("text-gray-400");
  });

  if (mode === "phone") {
    container.className = "mobile-view-container my-6";
    btnPhone.classList.add("bg-[#00C805]", "text-black");
  } else if (mode === "pc") {
    container.className = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6";
    btnPc.classList.add("bg-[#00C805]", "text-black");
  } else {
    container.className = "w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6";
    btnAuto.classList.add("bg-[#00C805]", "text-black");
  }
  setTimeout(drawChart, 100);
}

function setupEventListeners() {
  window.addEventListener("resize", drawChart);
  document.getElementById("searchInput")?.addEventListener("input", renderTokenGrid);

  document.querySelectorAll("[data-filter]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach(t => {
        t.classList.remove("bg-[#181f2c]", "text-[#00C805]", "border-[#00C805]/40");
        t.classList.add("text-gray-400");
      });
      tab.classList.add("bg-[#181f2c]", "text-[#00C805]", "border-[#00C805]/40");
      activeTab = tab.getAttribute("data-filter");
      if (isBackendConnected) {
        fetchTokensFromDb();
      } else {
        renderTokenGrid();
      }
    });
  });
}
