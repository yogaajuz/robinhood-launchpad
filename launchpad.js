/**
 * Robinhood Chain Launchpad - Application Core
 * Arbitrum Orbit L2 (Chain ID 4663 - Robinhood Chain Mainnet)
 * 2.0 ETH Bonding Curve with Uniswap v4 Singleton LP Migration, Real Web3 Wallet & Cloud Sync
 */

const RH_MAINNET_CONFIG = {
  chainId: '0x1237', // 4663 in hex
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://robinhood-rpc.publicnode.com', 'https://rpc-robinhood.blockmachine.io', 'https://rpc-robinhood.globalstake.io'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
};

const RH_TESTNET_CONFIG = {
  chainId: '0xb626', // 46630 in hex
  chainName: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com']
};

// Default strictly to Robinhood Chain Mainnet (4663)
let RH_CHAIN_CONFIG = RH_MAINNET_CONFIG;

// Deployed Smart Contracts on Robinhood Chain Mainnet
let FACTORY_CONTRACT_ADDRESS = '0xC1C1E61a2b8b604551ba3770bc6248707fBf1f58';
const V4_ROUTER_ADDRESS = '0x4A92D26F7B19d518A59deF8fBf85e9C85258b1Df';
const UNISWAP_V4_POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';

// Full Smart Contract ABIs for On-Chain Interactions
const FACTORY_ABI = [
  "function createToken(string name, string symbol, string metadataUri, uint256 creatorTaxBps, uint256 holderTaxBps) external payable returns (address tokenAddress, address curveAddress)",
  "function totalLaunches() external view returns (uint256)",
  "function allCurves(uint256 index) external view returns (address)",
  "function tokenToCurve(address token) external view returns (address)",
  "function curveToToken(address curve) external view returns (address)",
  "event TokenCreated(address indexed tokenAddress, address indexed curveAddress, address indexed creator, string name, string symbol, string metadataUri, uint256 creatorTaxBps, uint256 holderTaxBps, uint256 timestamp)"
];

const BONDING_CURVE_ABI = [
  "function buyTokens(uint256 minTokensExpected) external payable",
  "function sellTokens(uint256 tokensIn, uint256 minEthExpected) external",
  "function claimHolderRewards() external",
  "function realEthReserve() external view returns (uint256)",
  "function tokenReserve() external view returns (uint256)",
  "function isGraduated() external view returns (bool)",
  "function creatorTaxBps() external view returns (uint256)",
  "function holderTaxBps() external view returns (uint256)",
  "function token() external view returns (address)",
  "function creator() external view returns (address)",
  "function claimableRewards(address holder) external view returns (uint256)",
  "function getTokensOutForEth(uint256 ethIn) external view returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 holderFee)",
  "function getEthOutForTokens(uint256 tokensIn) external view returns (uint256 netEthOut, uint256 protocolFee, uint256 creatorFee, uint256 holderFee)",
  "event TokensPurchased(address indexed buyer, uint256 ethPaid, uint256 tokensReceived, uint256 protocolFee, uint256 creatorTax, uint256 holderTax)",
  "event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethReturned, uint256 protocolFee, uint256 creatorTax, uint256 holderTax)",
  "event HolderRewardClaimed(address indexed holder, uint256 ethAmount)",
  "event UniswapV4Graduated(address indexed token, uint256 ethGraduated, uint256 tokensGraduated, address uniswapV4Pool)"
];

const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)"
];

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

// Web3 Provider & Signer References
let browserProvider = null;
let browserSigner = null;

// --- Initial Showcase Tokens (will be augmented by live Neon DB / On-chain launches) ---
let tokens = [
  {
    id: "gme2",
    address: null,
    curveAddress: null,
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
    address: null,
    curveAddress: null,
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
    address: null,
    curveAddress: null,
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
    address: null,
    curveAddress: null,
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
    address: null,
    curveAddress: null,
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
let activeTab = "latest";
let ethUsdPrice = 4200;
let uploadedLogoDataUrl = null;
let uploadedLogoFileRaw = null;

// User Wallet initialized to REAL unauthenticated state (Zero fake balance!)
let userWallet = {
  connected: false,
  address: null,
  balanceEth: 0.0,
  holdings: {},
  claimableRewardsEth: {}
};

let recentTrades = [];

let comments = [
  { user: "0x742d...44e", text: "Robinhood Chain gas is under 0.0001 ETH, super fast L2! ⚡", time: "5m ago", avatar: "🏹" },
  { user: "0x892a...12c", text: "2.0 ETH target makes graduation super fast into Uniswap v4.", time: "12m ago", avatar: "🦄" },
  { user: "0x19a2...99f", text: "Reflection dividends are sent straight in native ETH.", time: "25m ago", avatar: "💎" }
];

// --- Helper: Get Token Fallback Emoji ---
function getFallbackEmoji(ticker = "", name = "") {
  const s = ((ticker || "") + " " + (name || "")).toUpperCase();
  if (s.includes("SAMPI") || s.includes("COW") || s.includes("BULL") || s.includes("METALUH")) return "🐮";
  if (s.includes("SCAT") || s.includes("CAT") || s.includes("KITTY") || s.includes("SMILLE")) return "🐱";
  if (s.includes("DOG") || s.includes("SHIB") || s.includes("INU")) return "🐶";
  if (s.includes("PEPE") || s.includes("FROG")) return "🐸";
  if (s.includes("GME") || s.includes("GAME")) return "🎮";
  if (s.includes("WSB") || s.includes("DIAMOND")) return "💎";
  if (s.includes("HOOD") || s.includes("ROBIN")) return "🏹";
  if (s.includes("MOON") || s.includes("ROCKET")) return "🚀";
  if (s.includes("BEAR")) return "🐻";
  if (s.includes("LION")) return "🦁";
  if (s.includes("PUMP")) return "📈";
  return "🪙";
}

// --- IPFS Decentralized Storage Configuration ---
// Free Pinata Signup: https://app.pinata.cloud/developers/api-keys
// If you want direct browser IPFS pinning without server, paste your Pinata JWT here.
// Or leave empty and upload.php / server.js will handle IPFS pinning on the server!
const IPFS_CONFIG = {
  pinataJwt: "", // Optional: Admin Pinata JWT for direct browser-to-IPFS pinning
  gateway: "https://gateway.pinata.cloud/ipfs/"
};

async function uploadFileToPinataIpfs(file, ticker = "coin") {
  if (!IPFS_CONFIG.pinataJwt) return null;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("pinataMetadata", JSON.stringify({
      name: `logo_${ticker.toLowerCase()}_${Date.now()}`,
      keyvalues: { platform: "robinhood-launchpad" }
    }));
    formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${IPFS_CONFIG.pinataJwt}`
      },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data.IpfsHash) {
        console.log("🌐 [IPFS] Direct browser upload pinned successfully:", data.IpfsHash);
        return `${IPFS_CONFIG.gateway}${data.IpfsHash}`;
      }
    }
  } catch (err) {
    console.warn("Direct IPFS upload error:", err);
  }
  return null;
}

// --- Helper: Render Token Icon with Instant Zero-Loading Dual Layer ---
function renderTokenIconHtml(icon, sizeClass = "w-10 h-10 text-2xl", tokenObj = null) {
  const ticker = tokenObj?.ticker || "";
  const name = tokenObj?.name || "";
  const fallback = getFallbackEmoji(ticker, name);

  if (!icon) {
    return `<span class="${sizeClass} flex items-center justify-center p-2 rounded-xl bg-[#121721] border border-gray-800 select-none">${fallback}</span>`;
  }

  // Check if icon is an image URL, path, IPFS URI, or base64 data URL
  const isImage = typeof icon === "string" && (
    icon.startsWith("data:image/") ||
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("ipfs://") ||
    icon.startsWith("/uploads/") ||
    icon.startsWith("uploads/") ||
    /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(icon)
  );

  if (isImage) {
    let fullUrl = icon;
    // Map IPFS protocol URI to public gateway
    if (fullUrl.startsWith("ipfs://")) {
      fullUrl = fullUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
    }
    // Map production host uploads to local if running on localhost
    if (isLocalhost && fullUrl.includes("web.hotelsbazzar.com/uploads/")) {
      fullUrl = fullUrl.replace(/https?:\/\/web\.hotelsbazzar\.com\/uploads\//, "/uploads/");
    }
    if (fullUrl.startsWith("uploads/")) {
      fullUrl = "/" + fullUrl;
    }
    // If running from file:// protocol, strip leading slash
    if (window.location.protocol === "file:" && fullUrl.startsWith("/uploads/")) {
      fullUrl = fullUrl.slice(1);
    }

    return `
      <div class="relative ${sizeClass} shrink-0 inline-flex items-center justify-center rounded-xl bg-[#121721] border border-gray-800 overflow-hidden shadow-sm">
        <span class="absolute inset-0 flex items-center justify-center select-none leading-none pointer-events-none">${fallback}</span>
        <img src="${fullUrl}" alt="${ticker || 'Logo'}" 
          class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200" 
          onload="this.style.opacity='1'; if(this.previousElementSibling) this.previousElementSibling.style.display='none';" 
          onerror="this.style.display='none';" />
      </div>
    `;
  }

  return `<span class="${sizeClass} flex items-center justify-center p-2 rounded-xl bg-[#121721] border border-gray-800 select-none">${icon}</span>`;
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

  // Auto-connect if already authorized in MetaMask
  if (window.ethereum && window.ethereum.selectedAddress) {
    try {
      await connectWallet();
    } catch (e) {
      console.log("Auto-connect quiet skip:", e);
    }
  }
});

// --- Backend Sync, On-Chain Discovery & WebSocket ---
const LOCAL_STORAGE_TOKENS_KEY = 'rh_mainnet_tokens_cache';

async function fetchOnChainTokens() {
  try {
    const rpcUrl = RH_CHAIN_CONFIG.rpcUrls[0];
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const factory = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, provider);
    const total = await factory.totalLaunches();
    const count = Number(total);
    console.log(`📡 [On-Chain] Querying Factory (${FACTORY_CONTRACT_ADDRESS}): Found ${count} launches...`);

    const CURVE_READER_ABI = [
      "function token() external view returns (address)",
      "function realEthReserve() external view returns (uint256)",
      "function isGraduated() external view returns (bool)",
      "function creator() external view returns (address)",
      "function creatorTaxBps() external view returns (uint256)",
      "function holderTaxBps() external view returns (uint256)"
    ];
    const TOKEN_READER_ABI = [
      "function name() external view returns (string)",
      "function symbol() external view returns (string)",
      "function metadataUri() external view returns (string)"
    ];

    const discovered = [];
    for (let i = count - 1; i >= 0; i--) {
      try {
        const curveAddr = await factory.allCurves(i);
        const curve = new ethers.Contract(curveAddr, CURVE_READER_ABI, provider);
        const tokenAddr = await curve.token();
        const token = new ethers.Contract(tokenAddr, TOKEN_READER_ABI, provider);

        const [tName, tSym, tUri, realEthWei, isGrad, creator, devTax, holderTax] = await Promise.all([
          token.name().catch(() => 'Robinhood Coin'),
          token.symbol().catch(() => 'RH'),
          token.metadataUri().catch(() => ''),
          curve.realEthReserve().catch(() => 0n),
          curve.isGraduated().catch(() => false),
          curve.creator().catch(() => '0x0000000000000000000000000000000000000000'),
          curve.creatorTaxBps().catch(() => 0n),
          curve.holderTaxBps().catch(() => 0n)
        ]);

        const realEth = Number(ethers.formatEther(realEthWei));
        const currentTotalEth = 0.5 + realEth;
        const tokensLeft = 800000000 * (0.5 / currentTotalEth);
        const marketCapUsd = Math.round(currentTotalEth * ethUsdPrice * 2.5);
        const volume24hUsd = Math.round(realEth * ethUsdPrice + 350);

        // Determine best token logo / icon
        const cachedLogo = localStorage.getItem(`rh_token_logo_${tokenAddr.toLowerCase()}`) || 
                           localStorage.getItem(`rh_token_logo_${tSym.toUpperCase()}`);
        let tokenIcon = cachedLogo;
        if (!tokenIcon) {
          if (tUri && (tUri.startsWith('http') || tUri.startsWith('data:') || tUri.startsWith('/uploads'))) {
            tokenIcon = tUri;
          } else if (tSym === 'SCAT') {
            tokenIcon = '/uploads/logo_scat.png';
          } else if (tSym === 'SAMPI') {
            tokenIcon = '/uploads/logo_sampi.png';
          } else {
            tokenIcon = getFallbackEmoji(tSym, tName);
          }
        }

        discovered.push({
          id: tokenAddr,
          address: tokenAddr,
          curveAddress: curveAddr,
          name: tName,
          ticker: tSym,
          description: `Verified bonding curve on Robinhood Chain Mainnet`,
          icon: tokenIcon,
          creator: creator.slice(0, 6) + '...' + creator.slice(-4),
          createdAgo: i === count - 1 ? 'Just now' : `${count - i}h ago`,
          createdAtTimestamp: Date.now() - (count - 1 - i) * 600000,
          launchIndex: i,
          realEth,
          tokensLeft,
          priceEth: (currentTotalEth * currentTotalEth) / (0.5 * 800000000),
          marketCapUsd,
          change24h: realEth > 0 ? 168.4 : 0.0,
          volume24hUsd,
          graduated: Boolean(isGrad),
          creatorTax: Number(devTax) / 100,
          holderTax: Number(holderTax) / 100,
          history: [0.1, realEth > 0 ? realEth : 0.1]
        });
      } catch (errInner) {
        console.warn(`Could not load launch #${i}:`, errInner);
      }
    }

    if (discovered.length > 0) {
      const discoveredIds = new Set(discovered.map(t => t.id.toLowerCase()));
      const otherTokens = tokens.filter(t => !discoveredIds.has((t.id || '').toLowerCase()));
      tokens = [...discovered, ...otherTokens];
      try {
        localStorage.setItem(LOCAL_STORAGE_TOKENS_KEY, JSON.stringify(discovered));
      } catch (e) {}
      activeToken = tokens[0];
      renderKothBanner();
      renderTokenGrid();
      renderTerminal();
      drawChart();
    }
  } catch (err) {
    console.warn("Direct on-chain discovery error:", err);
  }
}

async function initBackendSync() {
  // 1. Immediately restore any cached tokens from localStorage
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_TOKENS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cachedIds = new Set(parsed.map(t => t.id.toLowerCase()));
        tokens = [...parsed, ...tokens.filter(t => !cachedIds.has((t.id || '').toLowerCase()))];
        activeToken = tokens[0];
        renderKothBanner();
        renderTokenGrid();
        renderTerminal();
        drawChart();
      }
    }
  } catch (e) {}

  // 2. Try Cloud / Backend REST API
  try {
    const res = await fetch(`${BACKEND_API_URL}/health`);
    if (res.ok) {
      isBackendConnected = true;
      const healthData = await res.json();
      if (healthData.factoryAddress && healthData.factoryAddress.startsWith("0x") && healthData.factoryAddress !== '0x0000000000000000000000000000000000000000') {
        FACTORY_CONTRACT_ADDRESS = healthData.factoryAddress;
        console.log(`📡 [Mainnet] Using Factory Contract: ${FACTORY_CONTRACT_ADDRESS}`);
      }
      console.log(`✅ Connected to Launchpad Backend at ${BACKEND_API_URL}`);
      await fetchTokensFromDb();
      connectWebSocket();
    }
  } catch (err) {
    console.log('ℹ️ Running in standalone Web3 client mode directly with Robinhood Chain Mainnet.');
  }

  // 3. Always run on-chain discovery directly from Robinhood Chain RPC!
  await fetchOnChainTokens();
}

async function fetchTokensFromDb() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/tokens?sort=${activeTab}`);
    const data = await res.json();
    if (data.success && data.tokens && data.tokens.length > 0) {
      tokens = data.tokens.map(dbTok => ({
        id: dbTok.id,
        address: dbTok.id && dbTok.id.startsWith("0x") ? dbTok.id : null,
        curveAddress: dbTok.curve_address && dbTok.curve_address.startsWith("0x") ? dbTok.curve_address : null,
        ticker: dbTok.symbol,
        name: dbTok.name,
        description: dbTok.description,
        icon: dbTok.logo_url || "🚀",
        creator: dbTok.creator ? (dbTok.creator.slice(0, 6) + '...' + dbTok.creator.slice(-4)) : "0xRobin...hood",
        realEth: parseFloat(dbTok.real_eth) || 0.0,
        tokensLeft: (function() {
          let tl = parseFloat(dbTok.tokens_left) || 800000000;
          if (tl > 1000000000) tl = tl / 1e18;
          return tl;
        })(),
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

// --- Real Web3 Mainnet Connection Logic ---

async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert("MetaMask or compatible Web3 wallet not detected!\n\nPlease install MetaMask, Rabby, or Coinbase Wallet to interact with Robinhood Chain Mainnet.");
    return;
  }

  try {
    browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_requestAccounts", []);
    if (!accounts || accounts.length === 0) {
      alert("No accounts authorized in wallet.");
      return;
    }

    // Check Network & prompt switch to Robinhood Chain Mainnet (4663 / 0x1237)
    const net = await browserProvider.getNetwork();
    if (Number(net.chainId) !== 4663) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: RH_MAINNET_CONFIG.chainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [RH_MAINNET_CONFIG],
          });
        } else {
          console.warn("Chain switch error:", switchError);
        }
      }
    }

    browserSigner = await browserProvider.getSigner();
    const address = await browserSigner.getAddress();

    userWallet.connected = true;
    userWallet.address = address;

    // Fetch live on-chain balances
    await refreshUserWalletData();

    // Attach listeners
    if (window.ethereum.on) {
      window.ethereum.on("accountsChanged", async (newAccounts) => {
        if (!newAccounts || newAccounts.length === 0) {
          disconnectWallet();
        } else {
          userWallet.address = newAccounts[0];
          browserSigner = await browserProvider.getSigner();
          await refreshUserWalletData();
        }
      });

      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    }

    renderHeader();
    renderTerminal();
  } catch (e) {
    console.error("Wallet connection failed:", e);
    alert("Wallet connection failed: " + (e.message || "User cancelled"));
  }
}

function disconnectWallet() {
  userWallet.connected = false;
  userWallet.address = null;
  userWallet.balanceEth = 0.0;
  userWallet.holdings = {};
  userWallet.claimableRewardsEth = {};
  browserProvider = null;
  browserSigner = null;
  renderHeader();
  renderTerminal();
}

async function refreshUserWalletData() {
  if (!userWallet.connected || !browserProvider || !userWallet.address) return;

  try {
    const balWei = await browserProvider.getBalance(userWallet.address);
    userWallet.balanceEth = parseFloat(ethers.formatEther(balWei));

    // If active token has on-chain contracts, query real token balance & reflection dividends
    if (activeToken && activeToken.address && activeToken.address.startsWith("0x")) {
      try {
        const tokenContract = new ethers.Contract(activeToken.address, ERC20_ABI, browserProvider);
        const tokenBal = await tokenContract.balanceOf(userWallet.address);
        userWallet.holdings[activeToken.id] = parseFloat(ethers.formatEther(tokenBal));
      } catch (e) {
        console.warn("Could not query token balance:", e);
      }

      if (activeToken.curveAddress && activeToken.curveAddress.startsWith("0x")) {
        try {
          const curveContract = new ethers.Contract(activeToken.curveAddress, BONDING_CURVE_ABI, browserProvider);
          const rewardWei = await curveContract.claimableRewards(userWallet.address);
          userWallet.claimableRewardsEth[activeToken.id] = parseFloat(ethers.formatEther(rewardWei));

          const realEthWei = await curveContract.realEthReserve();
          activeToken.realEth = parseFloat(ethers.formatEther(realEthWei));
          activeToken.graduated = await curveContract.isGraduated();
        } catch (e) {
          console.warn("Could not query curve data:", e);
        }
      }
    }

    renderHeader();
    renderTerminal();
  } catch (err) {
    console.warn("Error refreshing wallet data:", err);
  }
}

// --- UI Rendering Functions ---

function renderHeader() {
  const walletBtn = document.getElementById("walletConnectBtn");
  const balanceDisplay = document.getElementById("walletBalanceDisplay");

  if (userWallet.connected && userWallet.address) {
    const shortAddr = userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4);
    walletBtn.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-[#00C805] animate-ping mr-1"></span>
      <span class="font-mono text-xs font-bold text-[#00C805]">${shortAddr}</span>
    `;
    walletBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#181f2c] border border-[#00C805] text-[#00C805] text-xs font-semibold hover:bg-[#1f293d] transition cursor-pointer";
    walletBtn.onclick = () => {
      if (confirm(`Connected: ${userWallet.address}\nBalance: ${userWallet.balanceEth.toFixed(4)} ETH\n\nDo you want to disconnect?`)) {
        disconnectWallet();
      }
    };

    if (balanceDisplay) {
      balanceDisplay.innerHTML = `<span class="text-xs text-gray-400">Balance:</span> <span class="text-xs font-mono font-bold text-white">${userWallet.balanceEth.toFixed(4)} ETH</span>`;
      balanceDisplay.classList.remove("hidden");
    }
  } else {
    walletBtn.innerHTML = `
      <svg class="w-4 h-4 text-[#00C805]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      <span>Connect Wallet</span>
    `;
    walletBtn.className = "flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00C805] text-black text-xs font-bold hover:bg-[#10b981] transition shadow-md shadow-[#00C805]/20 cursor-pointer";
    walletBtn.onclick = connectWallet;

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
            ${renderTokenIconHtml(koth.icon, "w-14 h-14 text-4xl", koth)}
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

  if (activeTab === "latest") {
    filtered.sort((a, b) => (b.launchIndex !== undefined ? b.launchIndex : -1) - (a.launchIndex !== undefined ? a.launchIndex : -1) || (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0));
  } else if (activeTab === "recently_traded" || activeTab === "trending") {
    filtered.sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0) || (b.realEth || 0) - (a.realEth || 0));
  } else if (activeTab === "marketcap") {
    filtered.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));
  } else if (activeTab === "graduation") {
    filtered.sort((a, b) => (b.realEth || 0) - (a.realEth || 0));
  }

  container.innerHTML = filtered.map(t => {
    const math = getCurveMath(t.realEth);
    const isSelected = activeToken.id === t.id;

    return `
      <div onclick="selectToken('${t.id}')" class="group relative rounded-xl bg-[#181f2c] hover:bg-[#1f2737] border ${isSelected ? 'border-[#00C805] shadow-lg shadow-[#00C805]/15' : 'border-[#242e42]'} p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between">
        ${t.graduated ? `<div class="absolute top-3 right-3 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><span>🦄</span> Graduated v4</div>` : ''}

        <div>
          <div class="flex items-start gap-3">
            ${renderTokenIconHtml(t.icon, "w-11 h-11 text-2xl shrink-0", t)}
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
  document.getElementById("terminalTokenIcon").innerHTML = renderTokenIconHtml(activeToken.icon, "w-12 h-12 text-3xl", activeToken);
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

  // Progress Bar for 2.0 ETH Target
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

  setSwapMode(swapMode);
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

async function claimRewards() {
  if (!userWallet.connected || !browserSigner) {
    alert("Please connect your Web3 wallet first!");
    await connectWallet();
    if (!userWallet.connected || !browserSigner) return;
  }

  if (!activeToken.curveAddress || !activeToken.curveAddress.startsWith("0x")) {
    alert("Rewards can only be claimed for live on-chain tokens.");
    return;
  }

  try {
    const curveContract = new ethers.Contract(activeToken.curveAddress, BONDING_CURVE_ABI, browserSigner);
    const tx = await curveContract.claimHolderRewards();
    alert("Claim transaction submitted! Waiting for block confirmation on Robinhood Chain...");
    const receipt = await tx.wait();

    alert(`🎉 Successfully claimed ETH reflection rewards!\n\nTx Hash: ${receipt.hash}\nExplorer: https://robinhoodchain.blockscout.com/tx/${receipt.hash}`);
    await refreshUserWalletData();
  } catch (err) {
    console.error("Claim error:", err);
    alert("Failed to claim rewards: " + (err.reason || err.message || err));
  }
}

function renderTradeHistory() {
  const container = document.getElementById("tradeHistoryContainer");
  if (!container) return;

  if (recentTrades.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-xs text-gray-500">No on-chain trades yet. Be the first to buy!</div>`;
    return;
  }

  container.innerHTML = recentTrades.map(trade => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/60 font-mono">
      <div class="flex items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${trade.type === 'buy' ? 'bg-[#00C805]/15 text-[#00C805]' : 'bg-[#ff4b4b]/15 text-[#ff4b4b]'}">
          ${trade.type.toUpperCase()}
        </span>
        <span class="text-gray-400">${trade.user}</span>
      </div>
      <div class="text-right">
        <div class="text-white">${trade.eth.toFixed(4)} ETH</div>
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

  const data = activeToken.history && activeToken.history.length > 1 ? activeToken.history : [0.05, activeToken.realEth || 0.05];
  const minVal = Math.min(...data) * 0.9;
  const maxVal = Math.max(...data) * 1.1;

  const stepX = width / Math.max(1, data.length - 1);
  const getY = val => height - 30 - ((val - minVal) / (maxVal - minVal || 1)) * (height - 60);

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
  const inputBadge = document.getElementById("swapInputCurrencyBadge");
  const outputBadge = document.getElementById("swapOutputCurrencyBadge");
  const availableBal = document.getElementById("swapAvailableBalance");
  const presetsContainer = document.getElementById("swapPresetsContainer");
  const inputAmountElem = document.getElementById("swapInputAmount");

  const ticker = activeToken ? activeToken.ticker : "TOKEN";

  if (mode === "buy") {
    if (buyTab) buyTab.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-[#00C805] text-black shadow cursor-pointer";
    if (sellTab) sellTab.className = "flex-1 py-2 text-xs font-bold rounded-lg text-gray-400 hover:text-white cursor-pointer";
    if (actionBtn) {
      actionBtn.className = "w-full py-3.5 rounded-xl bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-sm shadow-lg shadow-[#00C805]/20 transition active:scale-[0.98] cursor-pointer";
      actionBtn.innerText = `Instant Buy ($${ticker}) with ETH`;
    }
    if (inputLabel) inputLabel.innerText = "You Pay (ETH)";
    if (outputLabel) outputLabel.innerText = `You Receive ($${ticker})`;
    if (inputBadge) {
      inputBadge.innerText = "ETH";
      inputBadge.className = "text-xs font-bold font-mono px-2.5 py-1 bg-gray-800 rounded-lg text-white shrink-0";
    }
    if (outputBadge) {
      outputBadge.innerText = `$${ticker}`;
      outputBadge.className = "text-xs font-bold font-mono px-2.5 py-1 bg-[#00C805]/20 text-[#00C805] rounded-lg shrink-0";
    }
    if (inputAmountElem) inputAmountElem.placeholder = "0.0";
    if (availableBal) {
      availableBal.innerText = `Bal: ${userWallet.connected ? userWallet.balanceEth.toFixed(4) : '0.00'} ETH`;
    }
    if (presetsContainer) {
      presetsContainer.innerHTML = `
        <button type="button" onclick="setPresetAmount(0.01)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">0.01 ETH</button>
        <button type="button" onclick="setPresetAmount(0.05)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">0.05 ETH</button>
        <button type="button" onclick="setPresetAmount(0.1)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">0.10 ETH</button>
        <button type="button" onclick="setPresetAmount(0.5)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">0.50 ETH</button>
      `;
    }
  } else {
    // SELL MODE: User sells Tokens, receives ETH!
    if (sellTab) sellTab.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-[#ff4b4b] text-white shadow cursor-pointer";
    if (buyTab) buyTab.className = "flex-1 py-2 text-xs font-bold rounded-lg text-gray-400 hover:text-white cursor-pointer";
    if (actionBtn) {
      actionBtn.className = "w-full py-3.5 rounded-xl bg-[#ff4b4b] hover:bg-[#e03a3a] text-white font-bold text-sm shadow-lg shadow-[#ff4b4b]/20 transition active:scale-[0.98] cursor-pointer";
      actionBtn.innerText = `Instant Sell ($${ticker}) for ETH`;
    }
    if (inputLabel) inputLabel.innerText = `You Sell ($${ticker})`;
    if (outputLabel) outputLabel.innerText = "You Receive (ETH)";
    if (inputBadge) {
      inputBadge.innerText = `$${ticker}`;
      inputBadge.className = "text-xs font-bold font-mono px-2.5 py-1 bg-red-500/20 text-red-300 rounded-lg shrink-0";
    }
    if (outputBadge) {
      outputBadge.innerText = "ETH";
      outputBadge.className = "text-xs font-bold font-mono px-2.5 py-1 bg-gray-800 rounded-lg text-white shrink-0";
    }
    if (inputAmountElem) inputAmountElem.placeholder = "0";
    const holding = activeToken ? (userWallet.holdings[activeToken.id] || 0) : 0;
    if (availableBal) {
      availableBal.innerText = `Bal: ${userWallet.connected ? holding.toLocaleString() : '0'} $${ticker}`;
    }
    if (presetsContainer) {
      presetsContainer.innerHTML = `
        <button type="button" onclick="setPresetPercent(25)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">25%</button>
        <button type="button" onclick="setPresetPercent(50)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">50%</button>
        <button type="button" onclick="setPresetPercent(75)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-gray-300 border border-gray-800 cursor-pointer">75%</button>
        <button type="button" onclick="setPresetPercent(100)" class="flex-1 py-1 rounded-lg bg-[#121721] hover:bg-gray-800 text-[#00C805] border border-gray-800 font-bold cursor-pointer">100%</button>
      `;
    }
  }

  updateSwapEstimate();
}

function updateSwapEstimate() {
  const input = parseFloat(document.getElementById("swapInputAmount")?.value) || 0;
  const outputElem = document.getElementById("swapOutputAmount");
  const feeElem = document.getElementById("swapFeeDisplay");
  const taxBreakdownElem = document.getElementById("swapTaxBreakdown");

  const totalTaxPct = 1.0 + (activeToken ? activeToken.creatorTax : 0) + (activeToken ? activeToken.holderTax : 0);

  if (swapMode === "buy") {
    // BUYING: Input is ETH, Output is Tokens
    if (input <= 0) {
      if (outputElem) outputElem.value = "0";
      if (feeElem) feeElem.innerText = `0.000 ETH (${totalTaxPct.toFixed(1)}%)`;
      if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken ? activeToken.creatorTax : 0}% Dev | ${activeToken ? activeToken.holderTax : 0}% Holders`;
      return;
    }
    const { tokensOut, totalFees } = calculateTokensOut(input, activeToken ? activeToken.realEth : 0, activeToken);
    if (outputElem) outputElem.value = Math.floor(tokensOut).toLocaleString();
    if (feeElem) feeElem.innerText = `${totalFees.toFixed(4)} ETH (${totalTaxPct.toFixed(1)}%)`;
    if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken ? activeToken.creatorTax : 0}% Dev | ${activeToken ? activeToken.holderTax : 0}% Holders`;
  } else {
    // SELLING: Input is Tokens, Output is ETH
    if (input <= 0) {
      if (outputElem) outputElem.value = "0.0000";
      if (feeElem) feeElem.innerText = `0.000 ETH (${totalTaxPct.toFixed(1)}%)`;
      if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken ? activeToken.creatorTax : 0}% Dev | ${activeToken ? activeToken.holderTax : 0}% Holders`;
      return;
    }
    const { netEthOut, totalFees } = calculateEthOut(input, activeToken ? activeToken.realEth : 0, activeToken);
    if (outputElem) outputElem.value = netEthOut.toFixed(6);
    if (feeElem) feeElem.innerText = `${totalFees.toFixed(6)} ETH (${totalTaxPct.toFixed(1)}%)`;
    if (taxBreakdownElem) taxBreakdownElem.innerText = `1% Protocol | ${activeToken ? activeToken.creatorTax : 0}% Dev | ${activeToken ? activeToken.holderTax : 0}% Holders`;
  }
}

async function executeSwap() {
  if (!userWallet.connected || !browserSigner) {
    alert("Please connect your Web3 wallet first to trade on Robinhood Chain Mainnet!");
    await connectWallet();
    if (!userWallet.connected || !browserSigner) return;
  }

  const inputAmount = parseFloat(document.getElementById("swapInputAmount")?.value) || 0;
  if (inputAmount <= 0) {
    alert("Please enter a valid amount!");
    return;
  }

  // Check if token has an on-chain curve contract
  if (!activeToken.curveAddress || !activeToken.curveAddress.startsWith("0x")) {
    alert(`Token $${activeToken.ticker} is a demo/showcase token.\n\nTo trade live on Robinhood Chain Mainnet, launch your own coin using 'Deploy Coin'!`);
    return;
  }

  const actionBtn = document.getElementById("executeSwapBtn");
  const originalBtnText = actionBtn ? actionBtn.innerText : "Swap";

  try {
    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.innerText = "Confirm in MetaMask...";
    }

    const curveContract = new ethers.Contract(activeToken.curveAddress, BONDING_CURVE_ABI, browserSigner);

    if (swapMode === "buy") {
      if (inputAmount > userWallet.balanceEth) {
        alert(`Insufficient ETH balance in your wallet!\nYour balance: ${userWallet.balanceEth.toFixed(4)} ETH\nAttempted buy: ${inputAmount} ETH`);
        return;
      }

      const ethWei = ethers.parseEther(inputAmount.toString());
      if (actionBtn) actionBtn.innerText = "Broadcasting Buy Tx...";
      const tx = await curveContract.buyTokens(0, { value: ethWei });

      if (actionBtn) actionBtn.innerText = "Waiting for Confirmation...";
      const receipt = await tx.wait();

      recentTrades.unshift({
        type: "buy",
        user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-3),
        eth: inputAmount,
        tokens: Math.floor(inputAmount * 28000000),
        time: "Just now"
      });

      alert(`✅ Instant Buy Confirmed on Robinhood Chain Mainnet!\n\nTx Hash: ${receipt.hash}\nExplorer: https://robinhoodchain.blockscout.com/tx/${receipt.hash}`);
    } else {
      // Selling tokens
      const userTokenBal = activeToken ? (userWallet.holdings[activeToken.id] || 0) : 0;
      if (inputAmount > userTokenBal) {
        alert(`Insufficient $${activeToken.ticker} balance in your wallet!\nYour balance: ${userTokenBal.toLocaleString()} $${activeToken.ticker}\nAttempted sell: ${inputAmount.toLocaleString()} $${activeToken.ticker}`);
        return;
      }

      const tokenContract = new ethers.Contract(activeToken.address, ERC20_ABI, browserSigner);
      const onChainBal = await tokenContract.balanceOf(userWallet.address);

      let tokensWei;
      if (inputAmount >= userTokenBal * 0.9999) {
        // If selling all or virtually all holding, use exact on-chain balance to prevent rounding dust
        tokensWei = onChainBal;
      } else {
        tokensWei = ethers.parseEther(inputAmount.toString());
      }

      if (tokensWei === 0n || tokensWei > onChainBal) {
        tokensWei = onChainBal;
      }

      if (tokensWei === 0n) {
        alert(`You do not have any $${activeToken.ticker} tokens to sell.`);
        return;
      }

      if (actionBtn) actionBtn.innerText = "Checking Token Approval...";
      const allowance = await tokenContract.allowance(userWallet.address, activeToken.curveAddress);

      if (allowance < tokensWei) {
        if (actionBtn) actionBtn.innerText = "Approve in MetaMask...";
        // Exact approval for safety (avoids Web3 wallet drainer/phishing heuristics)
        const approveTx = await tokenContract.approve(activeToken.curveAddress, tokensWei);
        await approveTx.wait();
      }

      if (actionBtn) actionBtn.innerText = "Broadcasting Sell Tx...";
      const tx = await curveContract.sellTokens(tokensWei, 0);

      if (actionBtn) actionBtn.innerText = "Waiting for Confirmation...";
      const receipt = await tx.wait();

      recentTrades.unshift({
        type: "sell",
        user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-3),
        eth: inputAmount * 0.00000003,
        tokens: Math.floor(inputAmount),
        time: "Just now"
      });

      alert(`✅ Instant Sell Confirmed on Robinhood Chain Mainnet!\n\nTx Hash: ${receipt.hash}\nExplorer: https://robinhoodchain.blockscout.com/tx/${receipt.hash}`);
    }

    await refreshUserWalletData();
    document.getElementById("swapInputAmount").value = "";
    updateSwapEstimate();

  } catch (err) {
    console.error("Swap error:", err);
    alert("Swap transaction failed or rejected: " + (err.reason || err.message || err));
  } finally {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.innerText = originalBtnText;
    }
  }
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

// --- Helper: Create Tiny Compressed Thumbnail for On-Chain / WebP Storage ---
function createCompressedThumbnail(dataUrl, width = 64, height = 64) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return resolve(dataUrl);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const webpData = canvas.toDataURL("image/webp", 0.75);
          if (webpData && webpData.length < 2500) return resolve(webpData);
        } catch (e) {}
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      } catch (err) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function handleCreateTokenSubmit(e) {
  e.preventDefault();

  if (!userWallet.connected || !browserSigner) {
    alert("Please connect your Web3 wallet first to deploy a coin on Robinhood Chain Mainnet!");
    await connectWallet();
    if (!userWallet.connected || !browserSigner) return;
  }

  const name = document.getElementById("newTokenName").value.trim();
  const ticker = document.getElementById("newTokenTicker").value.trim().toUpperCase().replace("$", "");
  const desc = document.getElementById("newTokenDesc").value.trim();
  const devBuyEth = parseFloat(document.getElementById("newTokenDevBuy").value) || 0;

  const directLogoUrl = document.getElementById("newTokenLogoUrl")?.value.trim();
  const fallbackEmoji = document.getElementById("newTokenFallbackEmoji")?.value.trim();
  let finalIcon = directLogoUrl || uploadedLogoDataUrl || fallbackEmoji || getFallbackEmoji(ticker, name);

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

  if (devBuyEth > 0 && devBuyEth > userWallet.balanceEth) {
    alert(`Insufficient ETH balance for initial dev buy!\nYour balance: ${userWallet.balanceEth.toFixed(4)} ETH\nRequired: ${devBuyEth} ETH`);
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : "Deploy Coin";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Confirm in MetaMask...";
  }

  // Handle Logo Upload (Direct IPFS, cPanel PHP with IPFS, Node backend with IPFS, or Canvas Thumbnail)
  if (uploadedLogoFileRaw && !directLogoUrl) {
    if (submitBtn) submitBtn.innerText = "Storing Coin Logo on IPFS...";
    let uploadSuccess = false;

    // 0. Try direct browser Pinata IPFS upload (if configured in frontend)
    if (IPFS_CONFIG.pinataJwt) {
      try {
        const ipfsDirectUrl = await uploadFileToPinataIpfs(uploadedLogoFileRaw, ticker);
        if (ipfsDirectUrl) {
          finalIcon = ipfsDirectUrl;
          uploadSuccess = true;
          console.log("🌐 [IPFS] Logo pinned directly to IPFS:", finalIcon);
        }
      } catch (errDirectIpfs) {
        console.warn("Direct IPFS upload error:", errDirectIpfs);
      }
    }

    // 1. Try Namecheap cPanel native upload.php (auto-pins to IPFS if server key configured, + local backup)
    if (!uploadSuccess) {
      try {
        const phpFormData = new FormData();
        phpFormData.append('logo', uploadedLogoFileRaw);
        phpFormData.append('ticker', ticker);
        const phpRes = await fetch('/upload.php', { method: 'POST', body: phpFormData });
        if (phpRes.ok) {
          const phpData = await phpRes.json();
          if (phpData.success && phpData.logoUrl) {
            finalIcon = phpData.logoUrl;
            uploadSuccess = true;
            console.log(`✅ Logo stored via upload.php (Storage: ${phpData.storage || 'local'}):`, finalIcon);
          }
        }
      } catch (errPhp) {
        // Quietly fall through
      }
    }

    // 2. Try Node.js backend if connected
    if (!uploadSuccess && isBackendConnected) {
      try {
        const formData = new FormData();
        formData.append('logo', uploadedLogoFileRaw);
        formData.append('ticker', ticker);
        const uploadRes = await fetch(`${BACKEND_API_URL}/upload-logo`, {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.logoUrl) {
          finalIcon = uploadData.logoUrl;
          uploadSuccess = true;
          console.log(`✅ Logo stored via Node.js backend (Storage: ${uploadData.storage || 'local'}):`, finalIcon);
        }
      } catch (err) {
        console.warn("Could not upload to backend:", err);
      }
    }

    // 3. If no server upload endpoint exists, compress to compact thumbnail
    if (!uploadSuccess && uploadedLogoDataUrl) {
      try {
        const thumb = await createCompressedThumbnail(uploadedLogoDataUrl, 64, 64);
        if (thumb && thumb.length < 2500) {
          finalIcon = thumb;
        }
      } catch (e) {
        console.warn("Thumbnail generation error:", e);
      }
    }
  }

  try {
    // 1. Verify that the user is connected to Robinhood Chain Mainnet (Chain 4663)
    const net = await browserProvider.getNetwork();
    if (Number(net.chainId) !== 4663) {
      alert("⚠️ Wrong Network!\n\nPlease switch your MetaMask wallet to Robinhood Chain Mainnet (Chain ID 4663) to deploy a coin.");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: RH_MAINNET_CONFIG.chainId }],
        });
      } catch (swErr) {
        console.warn(swErr);
      }
      return;
    }

    // 2. Verify that the Factory Contract has deployed bytecode on-chain
    const factoryCode = await browserProvider.getCode(FACTORY_CONTRACT_ADDRESS);
    if (!factoryCode || factoryCode === "0x" || factoryCode === "0x0") {
      alert(
        `⚠️ Factory Contract Not Deployed Yet!\n\n` +
        `The factory address (${FACTORY_CONTRACT_ADDRESS}) does not have contract bytecode on Robinhood Chain Mainnet yet.\n\n` +
        `👉 If you are the platform owner, please visit:\nhttps://${window.location.host}/deploy.html\n\nto deploy the Factory Contract in 1-Click with your MetaMask! Once deployed, coins can be created immediately.`
      );
      return;
    }

    const factory = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, browserSigner);
    const creatorTaxBps = Math.round(creatorTax * 100);
    const holderTaxBps = Math.round(holderTax * 100);
    const devBuyWei = devBuyEth > 0 ? ethers.parseEther(devBuyEth.toString()) : 0n;

    // Sanitize on-chain metadata URI to avoid massive base64 calldata out-of-gas reverts
    let onChainMetadataUri = finalIcon;
    if (onChainMetadataUri.startsWith("data:image/") && onChainMetadataUri.length > 2500) {
      onChainMetadataUri = `${window.location.origin}/uploads/logo_${ticker.toLowerCase()}.png`;
    }

    if (submitBtn) submitBtn.innerText = "Deploying on Robinhood Chain...";

    const tx = await factory.createToken(
      name,
      ticker,
      onChainMetadataUri,
      creatorTaxBps,
      holderTaxBps,
      { value: devBuyWei }
    );

    if (submitBtn) submitBtn.innerText = "Waiting for Confirmation...";
    const receipt = await tx.wait();

    let deployedTokenAddress = null;
    let deployedCurveAddress = null;

    // Parse TokenCreated event from receipt
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed && parsed.name === 'TokenCreated') {
          deployedTokenAddress = parsed.args.tokenAddress;
          deployedCurveAddress = parsed.args.curveAddress;
          break;
        }
      } catch (ign) {}
    }

    if (!deployedTokenAddress) {
      try {
        const total = await factory.totalLaunches();
        deployedCurveAddress = await factory.allCurves(total - 1n);
        const curveContract = new ethers.Contract(deployedCurveAddress, BONDING_CURVE_ABI, browserProvider);
        deployedTokenAddress = await curveContract.token();
      } catch (err) {
        console.warn("Could not fetch addresses:", err);
      }
    }

    const shortCreator = userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4);
    const newToken = {
      id: deployedTokenAddress || `token_${Date.now()}`,
      address: deployedTokenAddress,
      curveAddress: deployedCurveAddress,
      ticker: ticker,
      name: name,
      description: desc,
      icon: finalIcon,
      creator: shortCreator,
      createdAgo: "Just now",
      realEth: devBuyEth > 0 ? devBuyEth : 0.0,
      tokensLeft: AMM_PARAMS.TOKENS_FOR_CURVE,
      priceEth: 0.00000001,
      marketCapUsd: Math.round((devBuyEth + 0.05) * ethUsdPrice * 8),
      change24h: 0.0,
      volume24hUsd: devBuyEth * ethUsdPrice,
      graduated: false,
      creatorTax: creatorTax,
      holderTax: holderTax,
      history: [0.05, devBuyEth > 0 ? devBuyEth : 0.05]
    };

    // Save to backend database
    if (isBackendConnected && deployedTokenAddress) {
      try {
        await fetch(`${BACKEND_API_URL}/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: deployedTokenAddress,
            curveAddress: deployedCurveAddress,
            name: name,
            symbol: ticker,
            description: desc,
            logoUrl: finalIcon,
            creator: userWallet.address,
            creatorTaxBps: creatorTaxBps,
            holderTaxBps: holderTaxBps,
            initialEth: devBuyEth
          })
        });
      } catch (e) {
        console.warn("Could not post new token to backend:", e);
      }
    }

    if (deployedTokenAddress) {
      try {
        localStorage.setItem(`rh_token_logo_${deployedTokenAddress.toLowerCase()}`, finalIcon || uploadedLogoDataUrl);
        localStorage.setItem(`rh_token_logo_${ticker.toUpperCase()}`, finalIcon || uploadedLogoDataUrl);
      } catch (e) {}
    }

    tokens.unshift(newToken);
    try {
      localStorage.setItem(LOCAL_STORAGE_TOKENS_KEY, JSON.stringify(tokens));
    } catch (e) {}
    closeCreateModal();
    selectToken(newToken.id);
    renderTokenGrid();
    renderKothBanner();
    await refreshUserWalletData();
    setTimeout(fetchOnChainTokens, 3000);

    alert(
      `🎉 SUCCESS! $${ticker} DEPLOYED ON ROBINHOOD CHAIN MAINNET!\n\n` +
      `• Token: ${deployedTokenAddress || 'Created'}\n` +
      `• Curve: ${deployedCurveAddress || 'Created'}\n` +
      `• Tx Hash: ${receipt.hash}\n` +
      `• Explorer: https://robinhoodchain.blockscout.com/tx/${receipt.hash}\n\n` +
      `Graduation Target: 2.0 ETH -> Uniswap v4 Singleton`
    );
  } catch (err) {
    console.error("Token creation error:", err);
    alert("Transaction failed or rejected: " + (err.reason || err.message || err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

async function selectToken(tokenId) {
  const found = tokens.find(t => t.id === tokenId);
  if (found) {
    activeToken = found;
    renderTerminal();
    drawChart();
    if (userWallet.connected) {
      await refreshUserWalletData();
    }
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
    user: userWallet.connected && userWallet.address ? (userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4)) : "AnonTrader",
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

function setPresetPercent(percent) {
  if (swapMode === "sell") {
    const holding = activeToken ? (userWallet.holdings[activeToken.id] || 0) : 0;
    if (percent === 100) {
      document.getElementById("swapInputAmount").value = holding > 0 ? holding : "0";
    } else {
      const amount = (holding * percent) / 100;
      document.getElementById("swapInputAmount").value = amount >= 1 ? Math.floor(amount) : (amount > 0 ? amount.toFixed(4) : "0");
    }
  } else {
    const maxEth = Math.max(0, userWallet.balanceEth - 0.001);
    const amount = (maxEth * percent) / 100;
    document.getElementById("swapInputAmount").value = (amount > 0) ? amount.toFixed(4) : "0";
  }
  updateSwapEstimate();
}

function setMaxAmount() {
  if (swapMode === "buy") {
    const maxEth = Math.max(0, userWallet.balanceEth - 0.001);
    document.getElementById("swapInputAmount").value = maxEth > 0 ? maxEth.toFixed(4) : "0";
  } else {
    const maxTokens = activeToken ? (userWallet.holdings[activeToken.id] || 0) : 0;
    document.getElementById("swapInputAmount").value = maxTokens > 0 ? maxTokens : "0";
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
      renderTokenGrid();
      if (isBackendConnected) {
        fetchTokensFromDb();
      }
    });
  });
}
