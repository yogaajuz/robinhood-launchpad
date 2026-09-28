/**
 * Robinhood Chain Launchpad - Application Core
 * Arbitrum Orbit L2 (Chain ID 4663 - Robinhood Chain Mainnet)
 * 2.0 ETH Bonding Curve with Uniswap v4 LP Migration, Real Web3 Wallet & Cloud Sync
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
let FACTORY_CONTRACT_ADDRESS = '0xD7d41a4E8EA876078227697c1C973fE92a8BCBBa';
const V4_ROUTER_ADDRESS = '0x00c5fc8CD66B9b0D9C021D2329AEAB05b9aEfB10';
const UNISWAP_V4_POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';

// Full Smart Contract ABIs for On-Chain Interactions
const FACTORY_ABI = [
  "function createToken(string name, string symbol, string metadataUri, uint256 creatorTaxBps, uint256 holderTaxBps) external payable returns (address tokenAddress, address curveAddress)",
  "function totalLaunches() external view returns (uint256)",
  "function creationFee() external view returns (uint256)",
  "function setCreationFee(uint256 _newFee) external",
  "function feeRecipient() external view returns (address)",
  "function allCurves(uint256 index) external view returns (address)",
  "function tokenToCurve(address token) external view returns (address)",
  "function curveToToken(address curve) external view returns (address)",
  "event TokenCreated(address indexed tokenAddress, address indexed curveAddress, address indexed creator, string name, string symbol, string metadataUri, uint256 creatorTaxBps, uint256 holderTaxBps, uint256 creationFeePaid, uint256 timestamp)"
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
  "function getPendingHolderRewards(address account) external view returns (uint256)",
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
  PROTOCOL_FEE_PERCENT: 0.01,   // 1%
  INITIAL_K: 0.5 * 800_000_000, // 400,000,000
  ETH_PRICE_USD: 4200
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

// Universal On-Chain RPC Provider for Robinhood Chain Mainnet
let rpcProvider = null;
try {
  if (typeof ethers !== 'undefined' && ethers.JsonRpcProvider) {
    rpcProvider = new ethers.JsonRpcProvider(RH_CHAIN_CONFIG.rpcUrls[0]);
  }
} catch (e) {
  console.warn("Could not initialize global rpcProvider:", e);
}

// --- Live On-Chain Tokens on Robinhood Chain Mainnet ---
let tokens = [
  {
    id: "0x7Ad937A5f1c33E1b6B3761381Ac93D76C0c39BfC",
    address: "0x7Ad937A5f1c33E1b6B3761381Ac93D76C0c39BfC",
    curveAddress: "0xf548ae015fcCE6AeA58705b2853347a5D9ec6654",
    ticker: "YDOGS",
    name: "Yellow Dogs",
    description: "Newly launched on Robinhood Chain",
    icon: "https://gateway.pinata.cloud/ipfs/bafybeieqi7ggpx7l4jwpktsxk7ertrnvirujpgpoffj3fjyg5kqxhviaru",
    creator: "0xe14482e488A7Cee514fbB7Ac99D323a9070e90C8",
    rawCreator: "0xe14482e488A7Cee514fbB7Ac99D323a9070e90C8",
    creatorAddress: "0xe14482e488a7cee514fbb7ac99d323a9070e90c8",
    createdAgo: "Just now",
    realEth: 0.0,
    tokensLeft: 800000000,
    priceEth: 0.000000000625,
    marketCapUsd: 0,
    change24h: 0.0,
    volume24hUsd: 0,
    graduated: false,
    creatorTax: 3.0,
    holderTax: 1.0,
    website: null,
    twitter: null,
    telegram: null,
    youtube: null,
    discord: null,
    history: [0.0]
  },
  {
    id: "0xaB00706959E9e958b74E818319a4FB4dB96e61c7",
    address: "0xaB00706959E9e958b74E818319a4FB4dB96e61c7",
    curveAddress: "0xde6dA779f568C12e376be58A0d7281e5EeFde2Ca",
    ticker: "SAMPI",
    name: "Sampi metaluh",
    description: "Newly launched on Robinhood Chain",
    icon: "https://gateway.pinata.cloud/ipfs/bafybeieqi7ggpx7l4jwpktsxk7ertrnvirujpgpoffj3fjyg5kqxhviaru",
    creator: "0x3b2cB0805eeEB947ae2649a5534065049d16bcb9",
    rawCreator: "0x3b2cB0805eeEB947ae2649a5534065049d16bcb9",
    creatorAddress: "0x3b2cb0805eeeb947ae2649a5534065049d16bcb9",
    createdAgo: "1d ago",
    realEth: 0.000096,
    tokensLeft: 799846400,
    priceEth: 0.000000000625,
    marketCapUsd: 2100,
    change24h: 12.0,
    volume24hUsd: 403,
    graduated: false,
    creatorTax: 2.0,
    holderTax: 0.0,
    website: null,
    twitter: null,
    telegram: null,
    youtube: null,
    discord: null,
    history: [0.000096]
  },
  {
    id: "0x60F5E4F14aCa10921626201ECA1f2EDeaF9D16C0",
    address: "0x60F5E4F14aCa10921626201ECA1f2EDeaF9D16C0",
    curveAddress: "0xE9aD3f3A8c9807EE041410c9BAdD36b67Cfc5C5E",
    ticker: "SCAT",
    name: "Smille Cat",
    description: "Newly launched on Robinhood Chain",
    icon: "https://gateway.pinata.cloud/ipfs/bafybeih3crzhlp5xpywjo5vetg2nhomvxcngr2o2vhepuizw7ks3a34dsi",
    creator: "0x3b2cB0805eeEB947ae2649a5534065049d16bcb9",
    rawCreator: "0x3b2cB0805eeEB947ae2649a5534065049d16bcb9",
    creatorAddress: "0x3b2cb0805eeeb947ae2649a5534065049d16bcb9",
    createdAgo: "2d ago",
    realEth: 0.0,
    tokensLeft: 800000000,
    priceEth: 0.000000000625,
    marketCapUsd: 0,
    change24h: 0.0,
    volume24hUsd: 0,
    graduated: false,
    creatorTax: 2.0,
    holderTax: 0.0,
    website: null,
    twitter: null,
    telegram: null,
    youtube: null,
    discord: null,
    history: [0.0]
  }
];

// --- State Variables ---
let activeToken = tokens[0];
let activeTab = "latest";
let currentView = "explore";
let ethUsdPrice = 4200;
let uploadedLogoDataUrl = null;
let uploadedLogoFileRaw = null;
let preUploadedServerUrl = null;

// User Wallet initialized to REAL unauthenticated state (Zero fake balance!)
let userWallet = {
  connected: false,
  address: null,
  balanceEth: 0.0,
  holdings: {},
  claimableRewardsEth: {}
};

let tokenTradesMap = {};
const defaultMockTrades = {};
let recentTrades = [];

let comments = [
  { user: "0x742d...44e", text: "Robinhood Chain gas is under 0.0001 ETH, super fast L2! ⚡", time: "5m ago", avatar: "🏹" },
  { user: "0x892a...12c", text: "2.0 ETH target makes graduation super fast into Uniswap v4.", time: "12m ago", avatar: "🦄" },
  { user: "0x19a2...99f", text: "Reflection dividends are sent straight in native ETH.", time: "25m ago", avatar: "💎" }
];

// Default Token Logo Placeholder (Decentralized IPFS)
const DEFAULT_TOKEN_LOGO = "https://gateway.pinata.cloud/ipfs/bafybeieqi7ggpx7l4jwpktsxk7ertrnvirujpgpoffj3fjyg5kqxhviaru";

// --- HTML Escaping & Formatting Helpers ---
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const escapeHTML = escapeHtml;

function formatShortAddress(addr, chars = 4) {
  if (!addr || typeof addr !== 'string') return '';
  if (addr.length <= chars * 2 + 2) return addr;
  return addr.slice(0, chars + 2) + '...' + addr.slice(-chars);
}

function copyContractAddress(addr, event, btnElement) {
  if (event) event.stopPropagation();
  if (!addr) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(addr).then(() => {
      if (btnElement) {
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<span class="text-[#00C805] font-bold text-[8px]">COPIED</span>`;
        setTimeout(() => {
          btnElement.innerHTML = originalHtml;
        }, 1500);
      }
    }).catch(() => {
      prompt("Token Contract:", addr);
    });
  } else {
    prompt("Token Contract:", addr);
  }
}

function renderTokenContractUnderLogoHtml(token, isTerminal = false) {
  if (!token) return '';
  const addr = (token.address && token.address.startsWith("0x")) ? token.address : (token.id && token.id.startsWith("0x") ? token.id : null);
  if (!addr) return '';
  const shortAddr = formatShortAddress(addr, 3); // e.g. 0x7Ad...9BfC

  return `
    <div class="mt-1 flex items-center justify-center gap-1 text-[9px] font-mono text-gray-400 hover:text-white transition bg-[#121721] px-1.5 py-0.5 rounded border border-gray-800 shadow-sm" onclick="event.stopPropagation();" title="Smart Contract: ${addr}">
      <a href="https://robinhoodchain.blockscout.com/address/${addr}" target="_blank" rel="noopener noreferrer" class="hover:text-[#00C805] hover:underline flex items-center gap-0.5">
        <span>${shortAddr}</span>
        <span class="text-[8px] opacity-70">↗</span>
      </a>
      <button type="button" onclick="copyContractAddress('${addr}', event, this)" class="text-gray-500 hover:text-[#00C805] transition cursor-pointer p-0.5" title="Copy Contract Address">
        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
      </button>
    </div>
  `;
}

// --- IPFS Decentralized Storage Configuration ---
// Free Pinata Signup: https://app.pinata.cloud/developers/api-keys
// If you want direct browser IPFS pinning without server, paste your Pinata JWT here.
// Or leave empty and upload.php / server.js will handle IPFS pinning on the server!
const IPFS_CONFIG = {
  pinataJwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI4ZGYxMDkyNC1jYTg4LTQ3MzUtYmQyZi1jMDI5NjI5ZTczMWMiLCJlbWFpbCI6ImFuYW5kYXlvZ2E5ODg4QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJlMjgyMTc3NDRlOGRjNzY4NWYzNCIsInNjb3BlZEtleVNlY3JldCI6IjY4YWYzZmQ3OTE0Yzc2YmQ5N2Y3YmQ0NTUwNjRlZDg3MTI4OGQyODg2OGQzMTU2NjdhYzgwNmUxMTEzNmRlZWMiLCJleHAiOjE4MjIxMDE0MzR9.DmREDFoppa3zfDKecrQ0lq7rhNlBi8A1UgnDtNgeafg",
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

// --- Helper: Render Token Icon (Professional image rendering with clean fallback, NO emojis) ---
function renderTokenIconHtml(icon, sizeClass = "w-10 h-10 text-2xl", tokenObj = null) {
  const ticker = tokenObj?.ticker || "";
  const name = tokenObj?.name || "";

  // Sanitize icon: If icon is missing or an emoji/invalid string, use DEFAULT_TOKEN_LOGO
  let fullUrl = icon;
  const isEmojiOrInvalid = !fullUrl || fullUrl === "??" || fullUrl === "🪙" || fullUrl === "🚀" || (typeof fullUrl === "string" && fullUrl.length <= 4 && !fullUrl.includes("/"));
  if (isEmojiOrInvalid) {
    fullUrl = DEFAULT_TOKEN_LOGO;
  }

  // Map IPFS protocol URI to public gateway
  if (typeof fullUrl === "string") {
    if (fullUrl.startsWith("ipfs://")) {
      fullUrl = fullUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
    }
    if (isLocalhost && fullUrl.includes("web.hotelsbazzar.com/uploads/")) {
      fullUrl = fullUrl.replace(/https?:\/\/web\.hotelsbazzar\.com\/uploads\//, "/uploads/");
    }
    if (fullUrl.startsWith("uploads/")) {
      fullUrl = "/" + fullUrl;
    }
    if (window.location.protocol === "file:" && fullUrl.startsWith("/uploads/")) {
      fullUrl = fullUrl.slice(1);
    }
  }

  return `
    <div class="relative ${sizeClass} shrink-0 inline-flex items-center justify-center rounded-xl bg-[#121721] border border-gray-800 overflow-hidden shadow-sm">
      <div class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#182335] to-[#101723] text-[#00C805] font-mono font-black text-xs select-none">
        ${escapeHtml(ticker.slice(0, 3) || 'RH')}
      </div>
      <img src="${escapeHtml(fullUrl)}" alt="${escapeHtml(ticker || 'Logo')}" 
        class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200" 
        onload="this.style.opacity='1';" 
        onerror="if(this.src !== window.location.origin + '${DEFAULT_TOKEN_LOGO}') { this.src='${DEFAULT_TOKEN_LOGO}'; } else { this.style.display='none'; }" />
    </div>
  `;
}

// --- Helper: Format and Sanitize Social Media URLs ---
function formatSocialUrl(url, type) {
  if (!url || typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;

  if (type === 'twitter') {
    if (url.startsWith('@')) url = url.slice(1);
    if (url.includes('twitter.com/') || url.includes('x.com/')) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
      return url;
    }
    const handle = url.replace(/[^a-zA-Z0-9_]/g, '');
    return handle ? `https://x.com/${handle}` : `https://x.com/${encodeURIComponent(url)}`;
  }

  if (type === 'telegram') {
    if (url.startsWith('@')) url = url.slice(1);
    if (url.includes('t.me/')) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
      return url;
    }
    const handle = url.replace(/[^a-zA-Z0-9_]/g, '');
    return handle ? `https://t.me/${handle}` : `https://t.me/${encodeURIComponent(url)}`;
  }

  if (type === 'youtube') {
    if (url.includes('youtube.com/')) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
      return url;
    }
    return `https://youtube.com/${url.startsWith('@') ? url : '@' + url}`;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// --- Universal Social Media Resolver & Cache ---
let sharedSocialsCache = {};

function getTokenSocials(token) {
  if (!token) return {};
  const res = {
    website: token.website || null,
    twitter: token.twitter || null,
    telegram: token.telegram || null,
    youtube: token.youtube || null,
    discord: token.discord || null
  };

  const keysToTry = [
    token.id,
    token.address,
    token.curveAddress,
    token.ticker
  ].filter(Boolean);

  for (const k of keysToTry) {
    const lower = k.toLowerCase();
    const upper = k.toUpperCase();

    // 1. Check shared in-memory socials cache (loaded from server / PHP)
    if (sharedSocialsCache[lower]) {
      const sc = sharedSocialsCache[lower];
      if (sc.website && !res.website) res.website = sc.website;
      if (sc.twitter && !res.twitter) res.twitter = sc.twitter;
      if (sc.telegram && !res.telegram) res.telegram = sc.telegram;
      if (sc.youtube && !res.youtube) res.youtube = sc.youtube;
      if (sc.discord && !res.discord) res.discord = sc.discord;
    }

    // 2. Check localStorage
    try {
      const stored = localStorage.getItem(`rh_token_socials_${lower}`) || 
                     localStorage.getItem(`rh_token_socials_${upper}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.website && !res.website) res.website = parsed.website;
        if (parsed.twitter && !res.twitter) res.twitter = parsed.twitter;
        if (parsed.telegram && !res.telegram) res.telegram = parsed.telegram;
        if (parsed.youtube && !res.youtube) res.youtube = parsed.youtube;
        if (parsed.discord && !res.discord) res.discord = parsed.discord;
      }
    } catch (e) {}
  }

  // 3. Check on-chain metadata URI if it contains JSON payload
  if (token.metadataUri && typeof token.metadataUri === 'string' && token.metadataUri.trim().startsWith('{')) {
    try {
      const m = JSON.parse(token.metadataUri);
      if (m.website && !res.website) res.website = m.website;
      if (m.twitter && !res.twitter) res.twitter = m.twitter;
      if (m.telegram && !res.telegram) res.telegram = m.telegram;
      if (m.youtube && !res.youtube) res.youtube = m.youtube;
      if (m.discord && !res.discord) res.discord = m.discord;
    } catch (e) {}
  }

  return res;
}

async function fetchSharedSocials() {
  try {
    const res = await fetch('/socials.php');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.allSocials) {
        sharedSocialsCache = { ...sharedSocialsCache, ...data.allSocials };
      }
    }
  } catch (e) {}

  tokens.forEach(tok => {
    const socials = getTokenSocials(tok);
    if (socials.website) tok.website = socials.website;
    if (socials.twitter) tok.twitter = socials.twitter;
    if (socials.telegram) tok.telegram = socials.telegram;
    if (socials.youtube) tok.youtube = socials.youtube;
    if (socials.discord) tok.discord = socials.discord;
  });

  if (activeToken) {
    const aSoc = getTokenSocials(activeToken);
    if (aSoc.website) activeToken.website = aSoc.website;
    if (aSoc.twitter) activeToken.twitter = aSoc.twitter;
    if (aSoc.telegram) activeToken.telegram = aSoc.telegram;
    if (aSoc.youtube) activeToken.youtube = aSoc.youtube;
    if (aSoc.discord) activeToken.discord = aSoc.discord;
    const socialsContainer = document.getElementById("terminalSocialLinks");
    if (socialsContainer) {
      socialsContainer.innerHTML = renderSocialBadgesHtml(activeToken);
    }
  }
}

async function saveTokenSocials(token, rawSocials) {
  if (!token) return;
  const idKey = (token.id || token.address || '').toLowerCase();
  const tickerKey = (token.ticker || '').toUpperCase();

  const formatted = {
    website: formatSocialUrl(rawSocials.website, 'website'),
    twitter: formatSocialUrl(rawSocials.twitter, 'twitter'),
    telegram: formatSocialUrl(rawSocials.telegram, 'telegram'),
    youtube: formatSocialUrl(rawSocials.youtube, 'youtube'),
    discord: formatSocialUrl(rawSocials.discord, 'discord')
  };

  // 1. Update in-memory
  token.website = formatted.website;
  token.twitter = formatted.twitter;
  token.telegram = formatted.telegram;
  token.youtube = formatted.youtube;
  token.discord = formatted.discord;

  if (idKey) sharedSocialsCache[idKey] = formatted;
  if (tickerKey) sharedSocialsCache[tickerKey.toLowerCase()] = formatted;

  // 2. Save in localStorage
  try {
    if (idKey) localStorage.setItem(`rh_token_socials_${idKey}`, JSON.stringify(formatted));
    if (tickerKey) localStorage.setItem(`rh_token_socials_${tickerKey}`, JSON.stringify(formatted));
    if (token.address) localStorage.setItem(`rh_token_socials_${token.address.toLowerCase()}`, JSON.stringify(formatted));
  } catch (e) {}

  // 3. Post to PHP socials.php (cPanel)
  try {
    await fetch('/socials.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: token.id,
        ticker: token.ticker,
        address: token.address,
        ...formatted
      })
    });
  } catch (e) {}

  // 4. Post to Node backend if connected
  if (isBackendConnected) {
    try {
      await fetch(`${BACKEND_API_URL}/tokens/${token.id}/socials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: formatted.website,
          twitterUrl: formatted.twitter,
          telegramUrl: formatted.telegram,
          youtubeUrl: formatted.youtube,
          discordUrl: formatted.discord
        })
      });
    } catch (e) {}
  }

  // 5. Update UI
  const socialsContainer = document.getElementById("terminalSocialLinks");
  if (socialsContainer && activeToken && (activeToken.id === token.id || activeToken.ticker === token.ticker)) {
    socialsContainer.innerHTML = renderSocialBadgesHtml(activeToken);
  }
}

function openEditSocialsModal(tokenId) {
  const token = tokens.find(t => 
    (t.id && t.id.toLowerCase() === (tokenId || '').toLowerCase()) ||
    (t.address && t.address.toLowerCase() === (tokenId || '').toLowerCase()) ||
    (t.ticker && t.ticker.toUpperCase() === (tokenId || '').toUpperCase())
  ) || activeToken;

  if (!token) return;

  const modal = document.getElementById("editSocialsModal");
  if (!modal) return;

  const titleEl = document.getElementById("editSocialsTitle");
  if (titleEl) {
    titleEl.innerHTML = `<span>✏️</span> <span>Manage Links for $${escapeHtml(token.ticker)}</span>`;
  }

  const idInput = document.getElementById("editSocialsTokenId");
  if (idInput) idInput.value = token.id || token.address;

  const socials = getTokenSocials(token);

  const twitterInput = document.getElementById("editSocialsTwitter");
  if (twitterInput) twitterInput.value = socials.twitter || '';

  const telegramInput = document.getElementById("editSocialsTelegram");
  if (telegramInput) telegramInput.value = socials.telegram || '';

  const websiteInput = document.getElementById("editSocialsWebsite");
  if (websiteInput) websiteInput.value = socials.website || '';

  const youtubeInput = document.getElementById("editSocialsYoutube");
  if (youtubeInput) youtubeInput.value = socials.youtube || '';

  const discordInput = document.getElementById("editSocialsDiscord");
  if (discordInput) discordInput.value = socials.discord || '';

  modal.classList.remove("hidden");
}

function closeEditSocialsModal() {
  const modal = document.getElementById("editSocialsModal");
  if (modal) modal.classList.add("hidden");
}

async function handleEditSocialsSubmit(e) {
  e.preventDefault();
  const tokenId = document.getElementById("editSocialsTokenId")?.value;
  const token = tokens.find(t => 
    (t.id && t.id.toLowerCase() === (tokenId || '').toLowerCase()) ||
    (t.address && t.address.toLowerCase() === (tokenId || '').toLowerCase())
  ) || activeToken;

  if (!token) return;

  const twitterRaw = document.getElementById("editSocialsTwitter")?.value.trim() || '';
  const telegramRaw = document.getElementById("editSocialsTelegram")?.value.trim() || '';
  const websiteRaw = document.getElementById("editSocialsWebsite")?.value.trim() || '';
  const youtubeRaw = document.getElementById("editSocialsYoutube")?.value.trim() || '';
  const discordRaw = document.getElementById("editSocialsDiscord")?.value.trim() || '';

  const saveBtn = document.getElementById("saveSocialsBtn");
  const origText = saveBtn ? saveBtn.innerText : "Save Links";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";
  }

  try {
    await saveTokenSocials(token, {
      twitter: twitterRaw,
      telegram: telegramRaw,
      website: websiteRaw,
      youtube: youtubeRaw,
      discord: discordRaw
    });

    closeEditSocialsModal();
    alert(`✅ Community links for $${token.ticker} saved successfully!`);
  } catch (err) {
    console.error("Save socials error:", err);
    alert("Could not save links: " + (err.message || err));
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = origText;
    }
  }
}

function renderSocialBadgesHtml(token) {
  if (!token) return '';
  const socials = getTokenSocials(token);
  const badges = [];

  const website = formatSocialUrl(socials.website, 'website');
  const twitter = formatSocialUrl(socials.twitter, 'twitter');
  const telegram = formatSocialUrl(socials.telegram, 'telegram');
  const youtube = formatSocialUrl(socials.youtube, 'youtube');
  const discord = formatSocialUrl(socials.discord, 'discord');

  if (website) {
    badges.push(`
      <a href="${website}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121721] hover:bg-[#1f283a] border border-gray-800 hover:border-gray-700 text-xs text-gray-200 hover:text-white transition font-medium">
        <span>🌐</span> <span>Website</span> <span class="text-gray-500 text-[10px]">↗</span>
      </a>
    `);
  }
  if (twitter) {
    badges.push(`
      <a href="${twitter}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121721] hover:bg-[#1f283a] border border-gray-800 hover:border-gray-700 text-xs text-gray-200 hover:text-white transition font-mono font-medium">
        <span class="font-bold">𝕏</span> <span>Twitter</span> <span class="text-gray-500 text-[10px]">↗</span>
      </a>
    `);
  }
  if (telegram) {
    badges.push(`
      <a href="${telegram}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121721] hover:bg-[#1f283a] border border-gray-800 hover:border-gray-700 text-xs text-sky-400 hover:text-sky-300 transition font-medium">
        <span>💬</span> <span>Telegram</span> <span class="text-sky-500 text-[10px]">↗</span>
      </a>
    `);
  }
  if (youtube) {
    badges.push(`
      <a href="${youtube}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121721] hover:bg-[#1f283a] border border-gray-800 hover:border-gray-700 text-xs text-red-400 hover:text-red-300 transition font-medium">
        <span>▶️</span> <span>YouTube</span> <span class="text-red-500 text-[10px]">↗</span>
      </a>
    `);
  }
  if (discord) {
    badges.push(`
      <a href="${discord}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121721] hover:bg-[#1f283a] border border-gray-800 hover:border-gray-700 text-xs text-indigo-400 hover:text-indigo-300 transition font-medium">
        <span>🎮</span> <span>Discord</span> <span class="text-indigo-500 text-[10px]">↗</span>
      </a>
    `);
  }

  return badges.join('');
}

function renderMiniSocialsHtml(token) {
  if (!token) return '';
  const items = [];
  const socials = getTokenSocials(token);
  const website = formatSocialUrl(socials.website, 'website');
  const twitter = formatSocialUrl(socials.twitter, 'twitter');
  const telegram = formatSocialUrl(socials.telegram, 'telegram');
  const youtube = formatSocialUrl(socials.youtube, 'youtube');
  const discord = formatSocialUrl(socials.discord, 'discord');

  if (website) items.push(`<a href="${website}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="text-gray-400 hover:text-white" title="Website">🌐</a>`);
  if (twitter) items.push(`<a href="${twitter}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="text-gray-400 hover:text-white font-bold text-[10px]" title="X / Twitter">𝕏</a>`);
  if (telegram) items.push(`<a href="${telegram}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="text-gray-400 hover:text-sky-400" title="Telegram">💬</a>`);
  if (youtube) items.push(`<a href="${youtube}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="text-gray-400 hover:text-red-400" title="YouTube">▶️</a>`);
  if (discord) items.push(`<a href="${discord}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="text-gray-400 hover:text-indigo-400" title="Discord">🎮</a>`);

  if (items.length === 0) return '';
  return `<div class="flex items-center gap-1.5 text-xs bg-[#121721] px-2 py-0.5 rounded-lg border border-gray-800 shrink-0">${items.join('')}</div>`;
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

// Backward-compatible alias for bonding curve AMM math
function calculateTokenAMM(realEth) {
  return getCurveMath(realEth);
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
  fetchTokenTrades(activeToken);
  drawChart();

  handleHashRouting();
  window.addEventListener("hashchange", handleHashRouting);

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

        // Determine best token logo, description & socials from on-chain metadata or fallback
        let tokenDesc = "Verified bonding curve on Robinhood Chain Mainnet";
        let tokenIcon = DEFAULT_TOKEN_LOGO;
        let tokenSocials = {};

        if (tUri) {
          const trimmedUri = tUri.trim();
          if (trimmedUri.startsWith('{')) {
            try {
              const meta = JSON.parse(trimmedUri);
              if (meta.image || meta.icon) tokenIcon = meta.image || meta.icon;
              if (meta.description) tokenDesc = meta.description;
              if (meta.website) tokenSocials.website = meta.website;
              if (meta.twitter) tokenSocials.twitter = meta.twitter;
              if (meta.telegram) tokenSocials.telegram = meta.telegram;
              if (meta.youtube) tokenSocials.youtube = meta.youtube;
              if (meta.discord) tokenSocials.discord = meta.discord;
            } catch (e) {}
          } else if (trimmedUri.startsWith('http') || trimmedUri.startsWith('data:') || trimmedUri.startsWith('/uploads')) {
            tokenIcon = trimmedUri;
          }
        }

        // Check cached logo fallback
        const cachedLogo = localStorage.getItem(`rh_token_logo_${tokenAddr.toLowerCase()}`) || 
                           localStorage.getItem(`rh_token_logo_${tSym.toUpperCase()}`);
        if (cachedLogo) {
          tokenIcon = cachedLogo;
        } else if (tokenIcon === DEFAULT_TOKEN_LOGO) {
          if (tSym === 'SCAT') {
            tokenIcon = 'https://gateway.pinata.cloud/ipfs/bafybeih3crzhlp5xpywjo5vetg2nhomvxcngr2o2vhepuizw7ks3a34dsi';
          } else if (tSym === 'SAMPI') {
            tokenIcon = 'https://gateway.pinata.cloud/ipfs/bafybeieqi7ggpx7l4jwpktsxk7ertrnvirujpgpoffj3fjyg5kqxhviaru';
          }
        }

        // Resolve socials from full multi-tiered resolver (shared PHP, localStorage, on-chain)
        const resolvedSocials = getTokenSocials({
          id: tokenAddr,
          address: tokenAddr,
          curveAddress: curveAddr,
          ticker: tSym,
          ...tokenSocials
        });
        tokenSocials = { ...tokenSocials, ...resolvedSocials };

        discovered.push({
          id: tokenAddr,
          address: tokenAddr,
          curveAddress: curveAddr,
          name: tName,
          ticker: tSym,
          description: tokenDesc,
          icon: tokenIcon,
          creator: creator.slice(0, 6) + '...' + creator.slice(-4),
          rawCreator: creator,
          creatorAddress: creator.toLowerCase(),
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
          website: tokenSocials.website || null,
          twitter: tokenSocials.twitter || null,
          telegram: tokenSocials.telegram || null,
          youtube: tokenSocials.youtube || null,
          discord: tokenSocials.discord || null,
          metadataUri: tUri,
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

      if (activeToken) {
        const matchingActive = tokens.find(t => 
          (t.id && t.id.toLowerCase() === activeToken.id.toLowerCase()) ||
          (t.address && t.address.toLowerCase() === (activeToken.address || '').toLowerCase()) ||
          (t.ticker && t.ticker.toUpperCase() === (activeToken.ticker || '').toUpperCase())
        );
        if (matchingActive) {
          activeToken = matchingActive;
        } else {
          activeToken = tokens[0];
        }
      } else {
        activeToken = tokens[0];
      }

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
  // 1. Immediately fetch shared socials from socials.php / local cache
  await fetchSharedSocials();

  // 2. Immediately restore any cached tokens from localStorage
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

  // 3. Try Cloud / Backend REST API
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

  // 4. Always run on-chain discovery directly from Robinhood Chain RPC!
  await fetchOnChainTokens();
  await fetchSharedSocials();
}

async function fetchTokensFromDb() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/tokens?sort=${activeTab}`);
    const data = await res.json();
    if (data.success && data.tokens && data.tokens.length > 0) {
      tokens = data.tokens.map(dbTok => {
        const dbSocials = {
          website: dbTok.website_url || null,
          twitter: dbTok.twitter_url || null,
          telegram: dbTok.telegram_url || null,
          youtube: dbTok.youtube_url || null,
          discord: dbTok.discord_url || null
        };
        const resolved = getTokenSocials({ id: dbTok.id, ticker: dbTok.symbol, address: dbTok.id, ...dbSocials });
        const finalSocials = { ...dbSocials, ...resolved };

        return {
          id: dbTok.id,
          address: dbTok.id && dbTok.id.startsWith("0x") ? dbTok.id : null,
          curveAddress: dbTok.curve_address && dbTok.curve_address.startsWith("0x") ? dbTok.curve_address : null,
          ticker: dbTok.symbol,
          name: dbTok.name,
          description: dbTok.description,
          icon: dbTok.logo_url || DEFAULT_TOKEN_LOGO,
          creator: dbTok.creator ? (dbTok.creator.slice(0, 6) + '...' + dbTok.creator.slice(-4)) : "0xRobin...hood",
          rawCreator: dbTok.creator || null,
          creatorAddress: dbTok.creator ? dbTok.creator.toLowerCase() : null,
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
          website: finalSocials.website || null,
          twitter: finalSocials.twitter || null,
          telegram: finalSocials.telegram || null,
          youtube: finalSocials.youtube || null,
          discord: finalSocials.discord || null,
          history: [0.1, parseFloat(dbTok.real_eth) || 0.1]
        };
      });

      if (!activeToken || !tokens.some(t => (t.id || '').toLowerCase() === (activeToken.id || '').toLowerCase())) {
        activeToken = tokens[0];
      }
      renderKothBanner();
      renderTokenGrid();
      renderTerminal();
      fetchTokenTrades(activeToken);
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
        const tr = msg.trade;
        const targetToken = tokens.find(t => 
          (t.id && t.id.toLowerCase() === (tr.tokenAddress || '').toLowerCase()) || 
          (t.address && t.address.toLowerCase() === (tr.tokenAddress || '').toLowerCase()) ||
          (t.curveAddress && t.curveAddress.toLowerCase() === (tr.tokenAddress || '').toLowerCase())
        );
        const mappedTrade = {
          type: tr.isBuy ? 'buy' : 'sell',
          user: tr.trader ? (tr.trader.slice(0, 6) + '...' + tr.trader.slice(-4)) : '0x...',
          rawTrader: tr.trader,
          eth: Number(tr.ethAmount || 0),
          tokens: Number(tr.tokenAmount || 0),
          timestamp: tr.time ? new Date(tr.time).getTime() : Date.now(),
          time: 'Just now',
          txHash: tr.txHash
        };
        recordTrade(targetToken || { id: tr.tokenAddress, ticker: 'TOKEN' }, mappedTrade);
        if (targetToken) {
          if (tr.isBuy) {
            targetToken.realEth = (Number(targetToken.realEth) || 0) + Number(tr.ethAmount || 0);
          } else {
            targetToken.realEth = Math.max(0, (Number(targetToken.realEth) || 0) - Number(tr.ethAmount || 0));
          }
          if (activeToken && (
            (activeToken.id && activeToken.id.toLowerCase() === (targetToken.id || '').toLowerCase()) ||
            (activeToken.address && activeToken.address.toLowerCase() === (targetToken.address || '').toLowerCase())
          )) {
            renderTerminal();
            drawChart();
          }
        }
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

    // Query all on-chain tokens in parallel
    const onChainTokens = tokens.filter(t => t.address && t.address.startsWith("0x") && t.curveAddress && t.curveAddress.startsWith("0x"));

    await Promise.all(onChainTokens.map(async (t) => {
      try {
        const tokenContract = new ethers.Contract(t.address, ERC20_ABI, browserProvider);
        const curveContract = new ethers.Contract(t.curveAddress, BONDING_CURVE_ABI, browserProvider);

        const [balWei, rewardWei, realEthWei, isGrad] = await Promise.all([
          tokenContract.balanceOf(userWallet.address).catch(() => 0n),
          curveContract.getPendingHolderRewards(userWallet.address)
            .catch(() => curveContract.claimableRewards(userWallet.address))
            .catch(() => 0n),
          curveContract.realEthReserve().catch(() => null),
          curveContract.isGraduated().catch(() => null)
        ]);

        userWallet.holdings[t.id] = parseFloat(ethers.formatEther(balWei));
        userWallet.claimableRewardsEth[t.id] = parseFloat(ethers.formatEther(rewardWei));

        if (realEthWei !== null) {
          t.realEth = parseFloat(ethers.formatEther(realEthWei));
        }
        if (isGrad !== null) {
          t.graduated = Boolean(isGrad);
        }
      } catch (e) {
        console.warn(`Could not refresh data for token ${t.ticker}:`, e);
      }
    }));

    // Check total claimable rewards to toggle notification badge on nav
    let totalClaimable = 0;
    for (const key in userWallet.claimableRewardsEth) {
      totalClaimable += (userWallet.claimableRewardsEth[key] || 0);
    }
    const badge = document.getElementById("navRewardBadge");
    if (badge) {
      if (totalClaimable > 0) {
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    renderHeader();
    renderTerminal();
    if (currentView === "profile") {
      renderUserProfile();
    }
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

// --- Multi-View Navigation & Routing System ---
function goToHomePage() {
  switchView('explore');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchView(viewName, tokenId = null) {
  currentView = viewName;
  const viewExplore = document.getElementById("viewExplore");
  const viewToken = document.getElementById("viewToken");
  const viewProfile = document.getElementById("viewProfile");

  const navExplore = document.getElementById("navExploreBtn");
  const navToken = document.getElementById("navTokenBtn");
  const navProfile = document.getElementById("navProfileBtn");

  const activeClass = "px-3 py-1.5 rounded-full font-bold text-xs bg-[#00C805] text-black shadow-md shadow-[#00C805]/20 transition cursor-pointer flex items-center gap-1.5";
  const inactiveClass = "px-3 py-1.5 rounded-full font-bold text-xs bg-[#181f2c] hover:bg-[#222b3d] border border-gray-700 text-gray-300 transition cursor-pointer flex items-center gap-1.5";

  if (navExplore) navExplore.className = (viewName === 'explore') ? activeClass : inactiveClass;
  if (navToken) navToken.className = (viewName === 'token') ? activeClass : inactiveClass;
  if (navProfile) navProfile.className = (viewName === 'profile') ? (activeClass + " relative") : (inactiveClass + " relative");

  if (viewExplore) viewExplore.classList.add("hidden");
  if (viewToken) viewToken.classList.add("hidden");
  if (viewProfile) viewProfile.classList.add("hidden");

  if (viewName === "explore") {
    stopChartLiveTicker();
    if (viewExplore) viewExplore.classList.remove("hidden");
    if (window.location.hash !== "#explore") {
      history.replaceState(null, "", "#explore");
    }
    renderKothBanner();
    renderTokenGrid();
  } else if (viewName === "token") {
    if (viewToken) viewToken.classList.remove("hidden");
    if (tokenId) {
      const cleanId = (tokenId || '').toLowerCase();
      const found = tokens.find(t => 
        (t.id && t.id.toLowerCase() === cleanId) ||
        (t.address && t.address.toLowerCase() === cleanId) ||
        (t.ticker && t.ticker.toLowerCase() === cleanId)
      );
      if (found) activeToken = found;
    }
    if (window.location.hash !== `#token=${activeToken.id}`) {
      history.replaceState(null, "", `#token=${activeToken.id}`);
    }
    const blockscoutLink = document.getElementById("tokenBlockscoutLink");
    if (blockscoutLink) {
      blockscoutLink.href = (activeToken.address && activeToken.address.startsWith("0x"))
        ? `https://robinhoodchain.blockscout.com/token/${activeToken.address}`
        : "https://robinhoodchain.blockscout.com";
    }
    renderTerminal();
    fetchTokenTrades(activeToken);
    startChartLiveTicker();
    setTimeout(drawChart, 60);
    if (userWallet.connected) {
      refreshUserWalletData();
    }
  } else if (viewName === "profile") {
    stopChartLiveTicker();
    if (viewProfile) viewProfile.classList.remove("hidden");
    if (window.location.hash !== "#profile") {
      history.replaceState(null, "", "#profile");
    }
    renderUserProfile();
    if (userWallet.connected) {
      refreshUserWalletData();
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openTokenDetail(tokenId) {
  const cleanId = (tokenId || '').toLowerCase();
  const found = tokens.find(t => 
    (t.id && t.id.toLowerCase() === cleanId) ||
    (t.address && t.address.toLowerCase() === cleanId) ||
    (t.ticker && t.ticker.toLowerCase() === cleanId)
  );
  if (found) {
    activeToken = found;
  }
  switchView('token', tokenId);
}

function copyTokenShareLink() {
  const shareUrl = `${window.location.origin}${window.location.pathname}#token=${activeToken.id}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert(`Copied link to $${activeToken.ticker}!\n\n${shareUrl}`);
    }).catch(() => {
      prompt("Copy token link:", shareUrl);
    });
  } else {
    prompt("Copy token link:", shareUrl);
  }
}

function handleHashRouting() {
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    const tokenId = hash.replace("#token=", "").trim();
    if (tokenId) {
      openTokenDetail(tokenId);
      return;
    }
  } else if (hash === "#profile") {
    switchView("profile");
    return;
  }
  // Default to explore view if hash is #explore or empty
  if (hash === "#explore" || !hash) {
    switchView("explore");
  }
}

// --- User Profile & Token Holdings Rendering ---

function isTokenCreatedByUser(token, userAddr) {
  if (!token || !userAddr) return false;
  const cleanUser = userAddr.toLowerCase();

  // 1. Direct creatorAddress or rawCreator match
  if (token.creatorAddress && token.creatorAddress.toLowerCase() === cleanUser) return true;
  if (token.rawCreator && token.rawCreator.toLowerCase() === cleanUser) return true;

  // 2. Short address match e.g. "0x1234...abcd" or full address in creator
  if (token.creator && typeof token.creator === 'string') {
    const creatorLower = token.creator.toLowerCase();
    if (creatorLower === cleanUser) return true;
    const shortUser = (cleanUser.slice(0, 6) + '...' + cleanUser.slice(-4)).toLowerCase();
    if (creatorLower === shortUser) return true;
  }

  // 3. LocalStorage user launched registry
  try {
    const registryKey = `rh_user_launched_${cleanUser}`;
    const launchedIds = JSON.parse(localStorage.getItem(registryKey) || '[]');
    if (Array.isArray(launchedIds)) {
      const tId = (token.id || '').toLowerCase();
      const tAddr = (token.address || '').toLowerCase();
      const tCurve = (token.curveAddress || '').toLowerCase();
      if (launchedIds.some(id => id.toLowerCase() === tId || id.toLowerCase() === tAddr || id.toLowerCase() === tCurve)) {
        return true;
      }
    }
  } catch (e) {}

  return false;
}

function copyTokenShareLinkFor(tokenId, tokenTicker) {
  const url = `${window.location.origin}${window.location.pathname}#token=${tokenId}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert(`🔗 Share link for $${tokenTicker} copied to clipboard!\n\n${url}`);
    }).catch(() => {
      prompt("Copy token link:", url);
    });
  } else {
    prompt("Copy token link:", url);
  }
}

function renderUserProfile() {
  const container = document.getElementById("profileContainer");
  if (!container) return;

  if (!userWallet.connected || !userWallet.address) {
    container.innerHTML = `
      <div class="rounded-3xl bg-[#181f2c] border border-[#242e42] p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xl">
        <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#009e04] to-[#00C805] flex items-center justify-center text-4xl mx-auto mb-5 shadow-xl shadow-[#00C805]/30">
          👤
        </div>
        <h2 class="text-2xl font-black text-white">Your Robinhood Chain Portfolio</h2>
        <p class="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
          Connect your Web3 wallet (MetaMask, Rabby, or Coinbase Wallet) to view all the tokens you've bought, track your portfolio balances, and claim your native ETH reflection dividends in 1-Click.
        </p>
        <div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onclick="connectWallet()" class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-sm shadow-xl shadow-[#00C805]/25 transition transform active:scale-95 cursor-pointer flex items-center justify-center gap-2">
            <span>⚡</span>
            <span>Connect Web3 Wallet</span>
          </button>
          <button onclick="switchView('explore')" class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#121721] hover:bg-[#1f2737] text-gray-300 font-bold text-sm border border-gray-700 transition cursor-pointer">
            Explore Coins First
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Calculate user portfolio aggregates
  const shortAddr = userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4);
  const ethBalance = userWallet.balanceEth || 0;
  const ethValueUsd = ethBalance * ethUsdPrice;

  // Filter tokens where user holds a balance > 0
  let ownedTokens = tokens.filter(t => (userWallet.holdings[t.id] || 0) > 0);

  // Filter tokens launched / created by this user
  const launchedTokens = tokens.filter(t => isTokenCreatedByUser(t, userWallet.address));

  let totalTokenValueUsd = 0;
  let totalDividendsEth = 0;

  tokens.forEach(t => {
    const bal = userWallet.holdings[t.id] || 0;
    const reward = userWallet.claimableRewardsEth[t.id] || 0;
    if (bal > 0) {
      totalTokenValueUsd += (bal * t.priceEth * ethUsdPrice);
    }
    if (reward > 0) {
      totalDividendsEth += reward;
    }
  });

  const totalPortfolioUsd = ethValueUsd + totalTokenValueUsd;
  const totalDividendsUsd = totalDividendsEth * ethUsdPrice;

  container.innerHTML = `
    <!-- User Profile Header Banner -->
    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#121721] via-[#182235] to-[#121721] border border-[#242e42] p-6 sm:p-8 shadow-xl">
      <div class="absolute -right-16 -top-16 w-56 h-56 bg-[#00C805]/10 rounded-full blur-3xl pointer-events-none"></div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#00C805] to-emerald-300 flex items-center justify-center text-2xl shadow-lg shadow-[#00C805]/20 font-black text-black">
            ${userWallet.address.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-xl sm:text-2xl font-black text-white font-mono">${shortAddr}</h2>
              <button onclick="navigator.clipboard.writeText('${userWallet.address}'); alert('Address copied: ${userWallet.address}');" class="px-2 py-0.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono transition cursor-pointer" title="Copy Address">
                📋 Copy
              </button>
              <a href="https://robinhoodchain.blockscout.com/address/${userWallet.address}" target="_blank" class="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-mono transition flex items-center gap-1">
                <span>Explorer</span> <span>↗</span>
              </a>
            </div>
            <div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
              <span class="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Robinhood Chain Mainnet (L2)
              </span>
              <span>•</span>
              <span class="font-mono">Chain ID 4663</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button onclick="refreshUserWalletData()" class="px-3.5 py-2 rounded-xl bg-[#181f2c] hover:bg-[#222b3d] border border-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer">
            <span>🔄</span> <span>Refresh Balances</span>
          </button>
          <button onclick="claimAllDividends()" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
            totalDividendsEth > 0 
              ? 'bg-gradient-to-r from-cyan-400 via-[#00C805] to-emerald-400 hover:opacity-95 text-black font-extrabold shadow-cyan-500/25 animate-pulse' 
              : 'bg-[#181f2c] hover:bg-[#222b3d] border border-cyan-500/30 text-cyan-300'
          }">
            <span>💎</span> <span>Claim Dividend</span>
            ${totalDividendsEth > 0 ? `<span class="px-1.5 py-0.5 rounded-md bg-black/20 text-black text-[10px] font-mono font-bold">${totalDividendsEth.toFixed(4)} ETH</span>` : ''}
          </button>
          <button onclick="openCreateModal()" class="px-4 py-2 rounded-xl bg-[#00C805] hover:bg-[#00e700] text-black text-xs font-bold shadow-md shadow-[#00C805]/20 transition cursor-pointer">
            <span>+ Launch Coin</span>
          </button>
        </div>
      </div>

      <!-- Portfolio Summary 4-Column Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-gray-800/80">
        <!-- Metric 1: ETH Balance -->
        <div class="rounded-2xl bg-[#121721]/80 border border-gray-800 p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <span>👛</span> <span>ETH Balance</span>
          </div>
          <div class="text-base sm:text-xl font-black font-mono text-white mt-1">
            ${ethBalance.toFixed(4)} ETH
          </div>
          <div class="text-xs text-gray-400 font-mono mt-0.5">
            ~$${ethValueUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
        </div>

        <!-- Metric 2: Total Portfolio Value -->
        <div class="rounded-2xl bg-[#121721]/80 border border-gray-800 p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <span>📈</span> <span>Total Portfolio</span>
          </div>
          <div class="text-base sm:text-xl font-black font-mono text-[#00C805] mt-1">
            $${totalPortfolioUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div class="text-xs text-gray-400 font-mono mt-0.5">
            Tokens + ETH Combined
          </div>
        </div>

        <!-- Metric 3: Claimable Dividends (Highlighted!) -->
        <div class="rounded-2xl bg-gradient-to-br from-cyan-950/40 to-[#121721] border border-cyan-500/30 p-4 flex flex-col justify-between">
          <div>
            <div class="text-[11px] uppercase tracking-wider text-cyan-300 font-bold flex items-center justify-between">
              <span class="flex items-center gap-1.5"><span>💎</span> <span>Claimable Dividends</span></span>
              ${totalDividendsEth > 0 ? `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>` : ''}
            </div>
            <div class="text-base sm:text-xl font-black font-mono text-cyan-300 mt-1">
              ${totalDividendsEth.toFixed(4)} ETH
            </div>
            <div class="text-xs text-emerald-400 font-mono mt-0.5">
              ~$${totalDividendsUsd.toFixed(2)} USD Accrued
            </div>
          </div>
          <button onclick="claimAllDividends()" class="mt-3 w-full py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
            totalDividendsEth > 0 
              ? 'bg-gradient-to-r from-cyan-400 to-[#00C805] hover:opacity-90 text-black font-extrabold shadow-md shadow-cyan-500/25' 
              : 'bg-[#181f2c] text-gray-400 border border-gray-700 hover:text-white'
          }">
            <span>⚡</span> <span>Claim Dividend</span>
          </button>
        </div>

        <!-- Metric 4: Coins Launched -->
        <div class="rounded-2xl bg-[#121721]/80 border border-gray-800 p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <span>🚀</span> <span>Coins Launched</span>
          </div>
          <div class="text-base sm:text-xl font-black font-mono text-white mt-1">
            ${launchedTokens.length} Created
          </div>
          <div class="text-xs text-[#00C805] font-mono mt-0.5">
            ${ownedTokens.length} Assets Held
          </div>
        </div>
      </div>

      <!-- Unclaimed Dividends Alert Banner -->
      ${totalDividendsEth > 0 ? `
        <div class="mt-5 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-[#132832] to-[#121721] border border-cyan-500/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 text-black flex items-center justify-center text-2xl font-black shrink-0 shadow-lg shadow-cyan-500/30">
              💎
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-sm sm:text-base font-extrabold text-white">Unclaimed ETH Reflection Dividends Ready!</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00C805]/20 text-[#00C805] border border-[#00C805]/30">Live</span>
              </div>
              <p class="text-xs text-gray-300 mt-0.5">
                You have accrued <span class="font-mono font-bold text-cyan-300">${totalDividendsEth.toFixed(4)} ETH</span> (~$${totalDividendsUsd.toFixed(2)} USD) in passive reflection fees from trading volume on Robinhood Chain.
              </p>
            </div>
          </div>
          <button onclick="claimAllDividends()" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-[#00C805] to-emerald-400 hover:opacity-95 text-black font-black text-xs shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 transition cursor-pointer transform active:scale-95 shrink-0">
            <span>⚡</span>
            <span>Claim All Dividends (${totalDividendsEth.toFixed(4)} ETH)</span>
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Coins Launched by You Section -->
    <div class="mt-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold text-white flex items-center gap-2">
              <span>🚀</span>
              <span>Coins Launched by You</span>
            </h3>
            <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#00C805]/15 text-[#00C805] border border-[#00C805]/30">
              ${launchedTokens.length} ${launchedTokens.length === 1 ? 'Coin' : 'Coins'}
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">Tokens created and deployed by your connected wallet on Robinhood Chain Mainnet</p>
        </div>
        <button onclick="openCreateModal()" class="px-3.5 py-1.5 rounded-xl bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-xs shadow-md shadow-[#00C805]/20 flex items-center gap-1.5 transition cursor-pointer">
          <span>+</span> <span>Launch New Coin</span>
        </button>
      </div>

      ${launchedTokens.length === 0 ? `
        <!-- Empty State for Launched Coins -->
        <div class="rounded-2xl bg-[#181f2c]/70 border border-dashed border-[#242e42] p-8 text-center">
          <div class="text-4xl mb-3">🚀</div>
          <h4 class="text-base font-bold text-white">You Haven't Launched Any Coins Yet</h4>
          <p class="text-xs text-gray-400 max-w-md mx-auto mt-1 leading-relaxed">
            Deploy your own meme coin on Robinhood Chain in under 30 seconds! Set custom Dev & Holder taxes to earn trading fees on every swap.
          </p>
          <button onclick="openCreateModal()" class="mt-4 px-5 py-2.5 bg-gradient-to-r from-[#00C805] to-emerald-400 hover:opacity-90 text-black font-bold text-xs rounded-xl shadow-lg shadow-[#00C805]/25 transition cursor-pointer flex items-center gap-2 mx-auto">
            <span>🚀</span> <span>Launch Your First Coin Now</span>
          </button>
        </div>
      ` : `
        <!-- Launched Coins List -->
        <div class="grid grid-cols-1 gap-4">
          ${launchedTokens.map(t => {
            const math = getCurveMath(t.realEth);
            const remainingEth = Math.max(0, AMM_PARAMS.GRADUATION_ETH_TARGET - t.realEth);
            const isGraduated = t.graduated || t.realEth >= AMM_PARAMS.GRADUATION_ETH_TARGET;
            const tokenTrades = getTradesForToken(t);
            const explorerAddr = t.address || t.curveAddress || '';
            const reward = userWallet.claimableRewardsEth[t.id] || 0;

            return `
              <div class="rounded-2xl bg-[#181f2c] hover:bg-[#1c2434] border border-[#00C805]/30 hover:border-[#00C805]/60 p-4 sm:p-5 transition shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
                <div class="absolute -right-12 -bottom-12 w-32 h-32 bg-[#00C805]/5 rounded-full blur-2xl pointer-events-none"></div>

                <!-- Left: Token Identity & Badges -->
                <div class="flex items-center gap-3.5 cursor-pointer group" onclick="openTokenDetail('${t.id}')">
                  <div class="flex flex-col items-center shrink-0">
                    ${renderTokenIconHtml(t.icon, "w-14 h-14 text-3xl group-hover:scale-105 transition-transform", t)}
                    ${renderTokenContractUnderLogoHtml(t)}
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4 class="text-base font-bold text-white group-hover:text-[#00C805] transition">${escapeHtml(t.name)}</h4>
                      <span class="text-xs font-mono font-bold text-[#00C805] px-2 py-0.5 rounded bg-[#00C805]/10 border border-[#00C805]/20">$${escapeHtml(t.ticker)}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        👑 You Created
                      </span>
                      ${t.creatorTax > 0 ? `
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          ${t.creatorTax.toFixed(1)}% Dev Fee
                        </span>
                      ` : ''}
                      ${isGraduated ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                          🎓 Graduated
                        </span>
                      ` : ''}
                    </div>

                    <div class="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span>Price: <b class="font-mono text-gray-200">$${(t.priceEth * ethUsdPrice).toFixed(6)}</b></span>
                      <span>•</span>
                      <span>MCap: <b class="font-mono text-gray-200">$${t.marketCapUsd.toLocaleString()}</b></span>
                      <span>•</span>
                      <span>Vol: <b class="font-mono text-gray-200">$${t.volume24hUsd.toLocaleString()}</b></span>
                      <span>•</span>
                      <span>Trades: <b class="font-mono text-gray-200">${tokenTrades.length}</b></span>
                    </div>

                    <div class="mt-1.5">
                      ${renderMiniSocialsHtml(t)}
                    </div>
                  </div>
                </div>

                <!-- Middle: Bonding Curve Progress to 2.0 ETH Target -->
                <div class="bg-[#121721] p-3.5 rounded-xl border border-gray-800 min-w-[240px] flex-1 max-w-md">
                  <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="text-gray-400 text-[11px] font-medium flex items-center gap-1">
                      <span>🎯</span> <span>Bonding Progress</span>
                    </span>
                    <span class="font-mono font-bold text-white text-xs">
                      ${t.realEth.toFixed(3)} / ${AMM_PARAMS.GRADUATION_ETH_TARGET.toFixed(1)} ETH
                    </span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-[#181f2c] overflow-hidden border border-gray-800 relative">
                    <div class="h-full bg-gradient-to-r from-emerald-500 via-[#00C805] to-cyan-400 rounded-full transition-all duration-500" style="width: ${math.progressPercent}%;"></div>
                  </div>
                  <div class="flex items-center justify-between text-[10px] text-gray-400 mt-1.5 font-mono">
                    <span class="text-[#00C805] font-bold">${math.progressPercent.toFixed(1)}% Completed</span>
                    <span>${isGraduated ? '🎉 Ready for Uniswap v4' : `${remainingEth.toFixed(3)} ETH to v4`}</span>
                  </div>
                </div>

                <!-- Right: Quick Actions -->
                <div class="flex items-center gap-2 shrink-0 self-end lg:self-center flex-wrap">
                  <button onclick="copyTokenShareLinkFor('${t.id}', '${escapeHtml(t.ticker)}')" class="px-3 py-2 rounded-xl bg-[#121721] hover:bg-[#1a2233] text-gray-300 hover:text-white border border-gray-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer" title="Copy shareable link">
                    <span>📋</span> <span>Share</span>
                  </button>

                  ${reward > 0 ? `
                    <button onclick="claimRewards('${t.curveAddress || ''}')" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 via-[#00C805] to-emerald-400 hover:opacity-95 text-black font-extrabold text-xs shadow-md shadow-cyan-500/20 flex items-center gap-1.5 transition cursor-pointer animate-pulse" title="Claim ${reward.toFixed(5)} ETH in reflection dividends">
                      <span>💎</span> <span>Claim Dividend (${reward.toFixed(4)} ETH)</span>
                    </button>
                  ` : ''}

                  ${explorerAddr && explorerAddr.startsWith('0x') ? `
                    <a href="https://robinhoodchain.blockscout.com/address/${explorerAddr}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-2 rounded-xl bg-[#121721] hover:bg-[#1a2233] text-gray-400 hover:text-emerald-400 border border-gray-800 text-xs font-mono transition flex items-center gap-1" title="View on Blockscout">
                      <span>Explorer</span> <span>↗</span>
                    </a>
                  ` : ''}

                  <button onclick="openTokenDetail('${t.id}')" class="px-4 py-2 rounded-xl bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-xs shadow-md shadow-[#00C805]/20 flex items-center gap-1 transition cursor-pointer">
                    <span>Trade & Manage</span> <span>↗</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Token Holdings List Section -->
    <div class="mt-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <span>🪙</span>
            <span>Your Purchased Coins & Reflection Rewards</span>
          </h3>
          <p class="text-xs text-gray-400">Tokens you have acquired on Robinhood Chain with live bonding curves & reflection dividends</p>
        </div>
        <button onclick="switchView('explore')" class="text-xs text-[#00C805] hover:underline font-bold flex items-center gap-1 cursor-pointer">
          <span>+ Buy More Coins</span> <span>→</span>
        </button>
      </div>

      ${ownedTokens.length === 0 ? `
        <!-- Empty State -->
        <div class="rounded-2xl bg-[#181f2c] border border-[#242e42] p-8 text-center">
          <div class="text-4xl mb-3">🪙</div>
          <h4 class="text-base font-bold text-white">No Token Holdings Found Yet</h4>
          <p class="text-xs text-gray-400 max-w-md mx-auto mt-1 leading-relaxed">
            You don't hold any launched tokens on this wallet yet. Browse coins on our 2.0 ETH bonding curve to purchase tokens and begin receiving continuous reflection dividends!
          </p>
          <button onclick="switchView('explore')" class="mt-4 px-5 py-2.5 bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-xs rounded-xl shadow-lg shadow-[#00C805]/20 transition cursor-pointer">
            Explore All Coins Now
          </button>
        </div>
      ` : `
        <!-- Token Cards List -->
        <div class="grid grid-cols-1 gap-4">
          ${ownedTokens.map(t => {
            const holding = userWallet.holdings[t.id] || 0;
            const reward = userWallet.claimableRewardsEth[t.id] || 0;
            const rewardUsd = (reward * ethUsdPrice).toFixed(2);
            const tokenValueUsd = (holding * t.priceEth * ethUsdPrice).toFixed(2);
            const math = getCurveMath(t.realEth);

            return `
              <div class="rounded-2xl bg-[#181f2c] hover:bg-[#1c2434] border border-[#242e42] hover:border-gray-700 p-4 sm:p-5 transition shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <!-- Left: Token Info & Thumbnail -->
                <div class="flex items-center gap-3.5 cursor-pointer group" onclick="openTokenDetail('${t.id}')">
                  <div class="flex flex-col items-center shrink-0">
                    ${renderTokenIconHtml(t.icon, "w-14 h-14 text-3xl group-hover:scale-105 transition-transform", t)}
                    ${renderTokenContractUnderLogoHtml(t)}
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4 class="text-base font-bold text-white group-hover:text-[#00C805] transition">${t.name}</h4>
                      <span class="text-xs font-mono font-bold text-[#00C805] px-2 py-0.5 rounded bg-[#00C805]/10 border border-[#00C805]/20">$${t.ticker}</span>
                      ${getTaxBadgeHtml(t)}
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span>Price: <b class="font-mono text-gray-200">$${(t.priceEth * ethUsdPrice).toFixed(6)}</b></span>
                      <span>•</span>
                      <span>MCap: <b class="font-mono text-gray-200">$${t.marketCapUsd.toLocaleString()}</b></span>
                      <span>•</span>
                      <span class="text-purple-300 font-semibold">${math.progressPercent.toFixed(1)}% to v4</span>
                    </div>
                    <div class="mt-1.5">
                      ${renderMiniSocialsHtml(t)}
                    </div>
                  </div>
                </div>

                <!-- Middle: Your Holdings -->
                <div class="bg-[#121721] p-3 rounded-xl border border-gray-800 min-w-[180px]">
                  <div class="text-[10px] uppercase tracking-wider text-gray-400">Your Balance</div>
                  <div class="text-sm font-black font-mono text-[#00C805] mt-0.5">
                    ${holding.toLocaleString()} $${t.ticker}
                  </div>
                  <div class="text-[11px] font-mono text-gray-400 mt-0.5">
                    ~$${tokenValueUsd} USD
                  </div>
                </div>

                <!-- Right: Dividend Reward Box & Claim Action -->
                <div class="bg-gradient-to-r from-[#121d2d] to-[#121721] p-3 rounded-xl border border-cyan-500/30 flex items-center justify-between md:justify-end gap-4">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-cyan-300 font-bold flex items-center gap-1">
                      <span>💎</span> <span>Claimable Dividend</span>
                    </div>
                    <div class="text-sm font-black font-mono text-white mt-0.5">
                      ${reward.toFixed(5)} ETH
                    </div>
                    <div class="text-[10px] font-mono text-emerald-400">
                      ~$${rewardUsd} USD
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <button onclick="claimRewards('${t.curveAddress || ''}')" ${reward <= 0 ? 'disabled' : ''} 
                      class="px-3.5 py-2 rounded-xl font-bold text-xs transition transform active:scale-95 cursor-pointer shadow-md ${
                        reward > 0 
                          ? 'bg-gradient-to-r from-cyan-400 via-[#00C805] to-emerald-400 hover:opacity-95 text-black shadow-cyan-500/25 animate-pulse font-extrabold' 
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }">
                      <span>⚡ Claim Dividend</span>
                    </button>

                    <button onclick="openTokenDetail('${t.id}')" class="px-3 py-2 rounded-xl bg-[#181f2c] hover:bg-[#222b3d] text-gray-300 hover:text-white border border-gray-700 font-bold text-xs transition cursor-pointer" title="Trade this token">
                      Trade ↗
                    </button>
                  </div>
                </div>

              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function renderKothBanner() {
  const koth = tokens.reduce((prev, current) => (prev.realEth > current.realEth && !prev.graduated) ? prev : current);
  const banner = document.getElementById("kothBanner");
  if (!banner) return;

  const math = getCurveMath(koth.realEth);

  banner.innerHTML = `
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#181f2c] via-[#1b263b] to-[#181f2c] border border-[#00C805]/30 hover:border-[#00C805]/60 p-4 sm:p-5 shadow-lg shadow-black/40 cursor-pointer transition" onclick="openTokenDetail('${koth.id}')">
      <div class="absolute -right-10 -bottom-10 w-44 h-44 bg-[#00C805]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="flex flex-col items-center shrink-0">
            <div class="relative">
              ${renderTokenIconHtml(koth.icon, "w-14 h-14 text-4xl", koth)}
              <span class="absolute -top-1.5 -right-1.5 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-bold">👑 KOTH</span>
            </div>
            ${renderTokenContractUnderLogoHtml(koth)}
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

          <button onclick="event.stopPropagation(); openTokenDetail('${koth.id}')" class="px-4 py-2 bg-[#00C805] hover:bg-[#00e700] text-black font-bold text-xs rounded-xl shadow-md transition transform active:scale-95 cursor-pointer">
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
      <div onclick="openTokenDetail('${t.id}')" class="group relative rounded-xl bg-[#181f2c] hover:bg-[#1f2737] border ${isSelected ? 'border-[#00C805] shadow-lg shadow-[#00C805]/15' : 'border-[#242e42]'} hover:border-[#00C805]/60 p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between hover:scale-[1.01]">
        ${t.graduated ? `<div class="absolute top-3 right-3 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><span>🦄</span> Graduated v4</div>` : ''}

        <div>
          <div class="flex items-start gap-3">
            <div class="flex flex-col items-center shrink-0">
              <div class="transition-transform group-hover:scale-105">
                ${renderTokenIconHtml(t.icon, "w-11 h-11 text-2xl shrink-0", t)}
              </div>
              ${renderTokenContractUnderLogoHtml(t)}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-white text-sm truncate group-hover:text-[#00C805] transition-colors">${t.name}</span>
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

          <div class="mt-3 flex items-center justify-between text-[11px] text-gray-400 gap-2">
            <span class="text-[#00C805] group-hover:underline font-semibold flex items-center gap-1">
              <span>Trade & View</span> <span>→</span>
            </span>
            <div class="flex items-center gap-1.5 flex-wrap justify-end">
              ${renderMiniSocialsHtml(t)}
              ${t.holderTax > 0 ? `<span class="text-cyan-300 font-mono text-[10px]">💎 ${t.holderTax}%</span>` : ''}
            </div>
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
  document.getElementById("terminalTokenIcon").innerHTML = `
    <div class="flex flex-col items-center">
      ${renderTokenIconHtml(activeToken.icon, "w-12 h-12 text-3xl", activeToken)}
      ${renderTokenContractUnderLogoHtml(activeToken, true)}
    </div>
  `;
  document.getElementById("terminalTokenDesc").innerText = activeToken.description;
  document.getElementById("terminalCreator").innerText = activeToken.creator;

  const socialsContainer = document.getElementById("terminalSocialLinks");
  if (socialsContainer) {
    socialsContainer.innerHTML = renderSocialBadgesHtml(activeToken);
  }

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
  renderTradeHistory();
  renderComments();
  updateSwapEstimate();
}

function renderHolderRewardsCard() {
  const container = document.getElementById("holderRewardsSection");
  if (container) {
    container.innerHTML = "";
    container.classList.add("hidden");
  }
}

async function claimRewards(targetCurveAddress = null) {
  if (!userWallet.connected || !browserSigner) {
    alert("Please connect your Web3 wallet first!");
    await connectWallet();
    if (!userWallet.connected || !browserSigner) return;
  }

  const curveToClaim = targetCurveAddress || (activeToken && activeToken.curveAddress);

  if (!curveToClaim || !curveToClaim.startsWith("0x")) {
    alert("Reflection rewards can only be claimed for live on-chain tokens deployed on Robinhood Chain Mainnet.");
    return;
  }

  try {
    const curveContract = new ethers.Contract(curveToClaim, BONDING_CURVE_ABI, browserSigner);
    const tx = await curveContract.claimHolderRewards();
    alert("Claim transaction submitted! Waiting for block confirmation on Robinhood Chain...");
    const receipt = await tx.wait();

    alert(`🎉 Successfully claimed ETH reflection rewards!\n\nTx Hash: ${receipt.hash}\nExplorer: https://robinhoodchain.blockscout.com/tx/${receipt.hash}`);
    await refreshUserWalletData();
    if (typeof renderUserProfile === 'function' && currentView === 'profile') {
      renderUserProfile();
    }
  } catch (err) {
    console.error("Claim error:", err);
    alert("Failed to claim rewards: " + (err.reason || err.message || err));
  }
}

async function claimAllDividends() {
  if (!userWallet.connected || !browserSigner) {
    alert("Please connect your Web3 wallet first to claim reflection dividends!");
    await connectWallet();
    if (!userWallet.connected || !browserSigner) return;
  }

  // Find all tokens with positive claimable reflection rewards
  const eligible = [];
  for (const t of tokens) {
    const reward = userWallet.claimableRewardsEth[t.id] || 0;
    if (reward > 0 && t.curveAddress && t.curveAddress.startsWith("0x")) {
      eligible.push({ token: t, reward });
    }
  }

  if (eligible.length === 0) {
    let total = 0;
    for (const key in userWallet.claimableRewardsEth) {
      total += (userWallet.claimableRewardsEth[key] || 0);
    }
    if (total <= 0) {
      alert("ℹ️ No Claimable Dividends Yet\n\nYou currently have 0.0000 ETH in claimable dividends.\n\nReflection dividends accumulate continuously in native ETH whenever other traders swap tokens on Robinhood Chain!\n\nHold tokens with holder reflection tax to earn continuous passive rewards.");
      return;
    }
  }

  if (eligible.length === 1) {
    await claimRewards(eligible[0].token.curveAddress);
    return;
  }

  const totalEth = eligible.reduce((sum, item) => sum + item.reward, 0);
  const proceed = confirm(
    `💎 Claim Reflection Dividends\n\n` +
    `You have ${eligible.length} tokens with claimable reflection dividends totaling ~${totalEth.toFixed(5)} ETH:\n\n` +
    eligible.map(item => ` • $${item.token.ticker}: ${item.reward.toFixed(5)} ETH`).join('\n') +
    `\n\nWould you like to claim them now? (You will confirm each transaction in your Web3 wallet)`
  );

  if (!proceed) return;

  let successCount = 0;
  for (let i = 0; i < eligible.length; i++) {
    const item = eligible[i];
    try {
      const curveContract = new ethers.Contract(item.token.curveAddress, BONDING_CURVE_ABI, browserSigner);
      alert(`[Step ${i + 1}/${eligible.length}]\nPlease confirm transaction in your wallet to claim dividends for $${item.token.ticker} (~${item.reward.toFixed(5)} ETH)...`);
      const tx = await curveContract.claimHolderRewards();
      await tx.wait();
      successCount++;
    } catch (err) {
      console.error(`Failed to claim dividends for $${item.token.ticker}:`, err);
      const cont = confirm(`Claim for $${item.token.ticker} was skipped or rejected: ${(err.reason || err.message || err)}.\n\nContinue claiming remaining tokens?`);
      if (!cont) break;
    }
  }

  if (successCount > 0) {
    alert(`🎉 Successfully claimed reflection dividends for ${successCount} token(s)!\n\nYour balances will update now.`);
    await refreshUserWalletData();
    if (typeof renderUserProfile === 'function' && currentView === 'profile') {
      renderUserProfile();
    }
  }
}

window.claimRewards = claimRewards;
window.claimAllDividends = claimAllDividends;

// --- Per-Token Trade Tape & History Management ---

function formatTimeAgo(dateString) {
  if (!dateString) return 'Just now';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDays = Math.floor(diffHour / 24);
    return `${diffDays}d ago`;
  } catch (e) {
    return 'Recently';
  }
}

function getTradesForToken(token) {
  if (!token) return [];
  const idKey = (token.id || '').toLowerCase();
  const addrKey = (token.address || '').toLowerCase();
  const curveKey = (token.curveAddress || '').toLowerCase();
  const tickerKey = (token.ticker || '').toLowerCase();

  if (tokenTradesMap[idKey] && tokenTradesMap[idKey].length > 0) return tokenTradesMap[idKey];
  if (addrKey && tokenTradesMap[addrKey] && tokenTradesMap[addrKey].length > 0) return tokenTradesMap[addrKey];
  if (curveKey && tokenTradesMap[curveKey] && tokenTradesMap[curveKey].length > 0) return tokenTradesMap[curveKey];
  if (tickerKey && tokenTradesMap[tickerKey] && tokenTradesMap[tickerKey].length > 0) return tokenTradesMap[tickerKey];

  try {
    const cached = localStorage.getItem('rh_trades_' + idKey) || 
                   (addrKey ? localStorage.getItem('rh_trades_' + addrKey) : null) ||
                   (tickerKey ? localStorage.getItem('rh_trades_' + tickerKey) : null);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tokenTradesMap[idKey] = parsed;
        return parsed;
      }
    }
  } catch (e) {}

  if (defaultMockTrades[idKey]) return defaultMockTrades[idKey];
  if (tickerKey && defaultMockTrades[tickerKey]) return defaultMockTrades[tickerKey];

  return [];
}

function setTokenTrades(token, tradesList) {
  if (!token) return;
  const idKey = (token.id || '').toLowerCase();
  const addrKey = (token.address || '').toLowerCase();
  const tickerKey = (token.ticker || '').toLowerCase();

  if (idKey) tokenTradesMap[idKey] = tradesList;
  if (addrKey) tokenTradesMap[addrKey] = tradesList;
  if (token.curveAddress) tokenTradesMap[token.curveAddress.toLowerCase()] = tradesList;
  if (tickerKey) tokenTradesMap[tickerKey] = tradesList;

  try {
    if (idKey) localStorage.setItem('rh_trades_' + idKey, JSON.stringify(tradesList.slice(0, 50)));
    if (addrKey) localStorage.setItem('rh_trades_' + addrKey, JSON.stringify(tradesList.slice(0, 50)));
    if (tickerKey) localStorage.setItem('rh_trades_' + tickerKey, JSON.stringify(tradesList.slice(0, 50)));
  } catch (e) {}
}

function recordTrade(token, tradeData) {
  if (!token) return;
  const idKey = (token.id || token.address || '').toLowerCase();
  const current = getTradesForToken(token);
  const updated = [tradeData, ...current.filter(t => !tradeData.txHash || t.txHash !== tradeData.txHash)];
  if (updated.length > 50) updated.pop();
  setTokenTrades(token, updated);

  recentTrades = updated;

  if (activeToken && (
    (activeToken.id && activeToken.id.toLowerCase() === idKey) ||
    (activeToken.address && activeToken.address.toLowerCase() === idKey) ||
    (activeToken.curveAddress && activeToken.curveAddress.toLowerCase() === idKey)
  )) {
    try {
      renderTradeHistory();
    } catch (e) {
      console.warn("Trade history render warning:", e);
    }
    try {
      drawChart();
    } catch (e) {
      console.warn("Chart render warning:", e);
    }
  }
}

async function fetchTokenTrades(token) {
  if (!token) return;
  const lookupKey = (token.id || token.address || '').toLowerCase();
  if (!lookupKey) return;

  let loadedTrades = [];

  // 1. Fetch indexed trades from Cloud / Local REST API
  try {
    const res = await fetch(`${BACKEND_API_URL}/tokens/${lookupKey}/trades`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.trades) && data.trades.length > 0) {
        loadedTrades = data.trades.map(t => {
          const parsedTs = t.timestamp ? new Date(t.timestamp).getTime() : Date.now();
          return {
            type: (t.is_buy === 1 || t.is_buy === true || t.type === 'buy') ? 'buy' : 'sell',
            user: t.trader ? (t.trader.slice(0, 6) + '...' + t.trader.slice(-4)) : '0x...',
            rawTrader: t.trader,
            eth: Number(t.eth_amount || t.eth || 0),
            tokens: Number(t.token_amount || t.tokens || 0),
            timestamp: isNaN(parsedTs) ? Date.now() : parsedTs,
            time: formatTimeAgo(t.timestamp),
            txHash: t.tx_hash
          };
        });
      }
    }
  } catch (e) {
    // Backend offline or unreachable
  }

  // 2. Fallback to PHP trades.php (for cPanel robinpump.world)
  if (loadedTrades.length === 0) {
    try {
      const phpUrl = `/trades.php?token=${encodeURIComponent(lookupKey)}&ticker=${encodeURIComponent(token.ticker || '')}`;
      const res = await fetch(phpUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.trades) && data.trades.length > 0) {
          loadedTrades = data.trades.map(t => {
            const parsedTs = t.timestamp ? new Date(t.timestamp).getTime() : Date.now();
            return {
              type: (t.is_buy === 1 || t.is_buy === true || t.type === 'buy') ? 'buy' : 'sell',
              user: t.trader ? (t.trader.slice(0, 6) + '...' + t.trader.slice(-4)) : '0x...',
              rawTrader: t.trader,
              eth: Number(t.eth_amount || t.eth || 0),
              tokens: Number(t.token_amount || t.tokens || 0),
              timestamp: isNaN(parsedTs) ? Date.now() : parsedTs,
              time: formatTimeAgo(t.timestamp),
              txHash: t.tx_hash
            };
          });
        }
      }
    } catch (e) {}
  }

  // 3. Fallback / Sync real on-chain curve reserve
  if (token.curveAddress && token.curveAddress.startsWith('0x') && rpcProvider) {
    try {
      const curveContract = new ethers.Contract(token.curveAddress, BONDING_CURVE_ABI, rpcProvider);
      const currentReserveWei = await curveContract.realEthReserve();
      const currentReserve = Number(ethers.formatEther(currentReserveWei));
      if (Math.abs(currentReserve - (token.realEth || 0)) > 0.000000001) {
        token.realEth = currentReserve;
      }
    } catch (err) {}
  }

  if (loadedTrades.length > 0) {
    loadedTrades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setTokenTrades(token, loadedTrades);
  }

  renderTradeHistory();
  drawChart();
}

function renderTradeHistory() {
  const container = document.getElementById("tradeHistoryContainer");
  if (!container) return;

  const currentToken = activeToken || tokens[0];
  const ticker = currentToken ? currentToken.ticker : "TOKEN";

  // Update header badges
  const tokenBadge = document.getElementById("tradeTapeTokenBadge");
  if (tokenBadge) {
    tokenBadge.innerText = `($${ticker})`;
  }

  const explorerLink = document.getElementById("tradeTapeExplorerLink");
  if (explorerLink) {
    const explorerTarget = currentToken.curveAddress || currentToken.address;
    if (explorerTarget && explorerTarget.startsWith("0x")) {
      explorerLink.href = `https://robinhoodchain.blockscout.com/address/${explorerTarget}#transactions`;
      explorerLink.style.display = "inline";
    } else {
      explorerLink.href = "https://robinhoodchain.blockscout.com";
    }
  }

  const trades = getTradesForToken(currentToken);
  const countBadge = document.getElementById("tradeTapeCountBadge");
  if (countBadge) {
    countBadge.innerText = `${trades.length} ${trades.length === 1 ? 'Trade' : 'Trades'}`;
  }

  if (trades.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center py-10 text-center text-gray-500">
        <div class="text-3xl mb-2">⏳</div>
        <p class="text-xs font-semibold text-gray-300">No trades yet on $${escapeHtml(ticker)}</p>
        <p class="text-[11px] text-gray-500 mt-1">Be the first to trade on this bonding curve!</p>
      </div>`;
    return;
  }

  container.innerHTML = trades.map(trade => {
    const isBuy = trade.type === 'buy';
    const ethFormatted = typeof trade.eth === 'number' ? trade.eth.toFixed(4) : trade.eth;
    const tokensFormatted = trade.tokens ? Math.floor(trade.tokens).toLocaleString() : '--';
    const traderAddr = trade.rawTrader || trade.user;
    const traderShort = trade.user || (traderAddr.length > 10 ? traderAddr.slice(0, 6) + '...' + traderAddr.slice(-4) : traderAddr);

    return `
      <div class="flex items-center justify-between text-xs py-2 px-2 border-b border-gray-800/60 font-mono hover:bg-[#1f293d]/50 transition rounded-lg">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-[#00C805]/15 text-[#00C805] border border-[#00C805]/30' : 'bg-[#ff4b4b]/15 text-[#ff4b4b] border border-[#ff4b4b]/30'}">
            ${trade.type.toUpperCase()}
          </span>
          <a href="https://robinhoodchain.blockscout.com/address/${escapeHtml(traderAddr)}" target="_blank" rel="noopener noreferrer" class="text-gray-300 hover:text-white hover:underline transition">
            ${escapeHtml(traderShort)}
          </a>
        </div>
        <div class="text-right">
          <div class="text-white font-medium flex items-center justify-end gap-1.5">
            <span>${tokensFormatted} ${escapeHtml(ticker)}</span>
            <span class="text-gray-500 text-[10px]">(${ethFormatted} ETH)</span>
          </div>
          <div class="flex items-center justify-end gap-2 text-[10px] text-gray-500 mt-0.5">
            <span>${escapeHtml(trade.time || 'Just now')}</span>
            ${trade.txHash ? `
              <a href="https://robinhoodchain.blockscout.com/tx/${trade.txHash}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:text-emerald-300 hover:underline">
                tx ↗
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");
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

// --- Interactive Token Chart Engine ---

function formatPriceString(p) {
  if (p === undefined || p === null || isNaN(p)) return "0.00";
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

let chartTimeframe = '1m';
let currentChartData = { points: [] };
let isChartHoverListenerAttached = false;
let chartLiveTickerInterval = null;

function updateChartLiveBadge() {
  const badgeText = document.getElementById("chartLiveTimeText");
  if (!badgeText) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  badgeText.innerText = `Live • ${timeStr}`;
}

function startChartLiveTicker() {
  if (chartLiveTickerInterval) clearInterval(chartLiveTickerInterval);
  updateChartLiveBadge();

  chartLiveTickerInterval = setInterval(async () => {
    if (currentView !== 'token' || !activeToken || document.hidden) return;

    updateChartLiveBadge();

    // Check on-chain reserve directly from RPC for live accuracy
    if (activeToken.curveAddress && activeToken.curveAddress.startsWith('0x') && rpcProvider) {
      try {
        const curveContract = new ethers.Contract(activeToken.curveAddress, BONDING_CURVE_ABI, rpcProvider);
        const reserveWei = await curveContract.realEthReserve();
        const freshRealEth = Number(ethers.formatEther(reserveWei));
        if (Math.abs(freshRealEth - (activeToken.realEth || 0)) > 0.000000001) {
          activeToken.realEth = freshRealEth;
          renderTerminal();
        }
      } catch (e) {}
    }

    drawChart();
  }, 3000);
}

function stopChartLiveTicker() {
  if (chartLiveTickerInterval) {
    clearInterval(chartLiveTickerInterval);
    chartLiveTickerInterval = null;
  }
}

window.setChartTimeframe = function(tf) {
  chartTimeframe = tf;
  ['1m', '5m', '1h', '1d', 'all'].forEach(t => {
    const btn = document.getElementById(`tfBtn_${t}`);
    if (btn) {
      if (t === tf) {
        btn.className = "px-2 py-0.5 rounded bg-[#00C805] text-black font-bold cursor-pointer transition shadow";
      } else {
        btn.className = "px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white cursor-pointer transition";
      }
    }
  });
  drawChart();
};

function generatePriceHistory(token, timeframe) {
  if (!token) return [];

  const now = Date.now();
  const currentUsdRate = (typeof ethUsdPrice === 'number' && ethUsdPrice > 0) ? ethUsdPrice : (AMM_PARAMS.ETH_PRICE_USD || 4200);

  // Current on-chain curve metrics
  const currentRealEth = Number(token.realEth || 0);
  const currentMath = getCurveMath(currentRealEth);
  const basePriceEth = (AMM_PARAMS.VIRTUAL_ETH * AMM_PARAMS.VIRTUAL_ETH) / currentMath.k;
  const basePriceUsd = basePriceEth * currentUsdRate;
  const currentPriceUsd = currentMath.currentPriceEth * currentUsdRate;

  // Retrieve actual trade events for this token
  const tokenTrades = getTradesForToken(token) || [];

  // Parse and sort trades chronologically (oldest first)
  const parsedTrades = tokenTrades
    .map(t => {
      let ts = t.timestamp;
      if (!ts) {
        ts = t.time === 'Just now' ? now : (now - 60000);
      } else if (typeof ts === 'string') {
        ts = new Date(ts).getTime();
      }
      return {
        ...t,
        ts: isNaN(ts) ? now : ts,
        eth: Number(t.eth || t.eth_amount || 0),
        tokens: Number(t.tokens || t.token_amount || 0),
        isBuy: (t.type === 'buy' || t.is_buy === true || t.is_buy === 1)
      };
    })
    .filter(t => t.ts && !isNaN(t.ts))
    .sort((a, b) => a.ts - b.ts);

  // Timeframe window setup
  let intervalMs = 60 * 1000;
  let defaultWindowMs = 30 * 60 * 1000; // 30 minutes
  let labelFormat = 'time';

  if (timeframe === '5m') {
    intervalMs = 5 * 60 * 1000;
    defaultWindowMs = 2 * 60 * 60 * 1000; // 2 hours
  } else if (timeframe === '1h') {
    intervalMs = 60 * 60 * 1000;
    defaultWindowMs = 24 * 60 * 60 * 1000; // 24 hours
  } else if (timeframe === '1d') {
    intervalMs = 24 * 60 * 60 * 1000;
    defaultWindowMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    labelFormat = 'date';
  } else if (timeframe === 'all') {
    intervalMs = 15 * 60 * 1000;
    labelFormat = 'date';
  }

  // Token creation / earliest known trade time
  let birthTime = token.createdAtTimestamp;
  if (!birthTime && parsedTrades.length > 0) {
    birthTime = parsedTrades[0].ts - 60000;
  }
  if (!birthTime) {
    birthTime = now - 15 * 60 * 1000;
  }

  let startTime = now - defaultWindowMs;
  if (timeframe === 'all' || startTime < birthTime) {
    startTime = Math.min(birthTime, now - 5 * 60 * 1000);
  }

  const totalDuration = Math.max(intervalMs, now - startTime);
  const numPoints = Math.max(15, Math.min(60, Math.ceil(totalDuration / intervalMs) + 1));
  const stepMs = totalDuration / (numPoints - 1);

  // Build price milestones from actual trades
  let runningEth = 0;
  const milestones = [];

  // Initial milestone at start time
  milestones.push({
    time: Math.min(startTime, birthTime),
    price: basePriceUsd,
    trade: null
  });

  for (const tr of parsedTrades) {
    if (tr.isBuy) {
      runningEth += tr.eth;
    } else {
      runningEth = Math.max(0, runningEth - tr.eth);
    }
    const math = getCurveMath(runningEth);
    const pUsd = math.currentPriceEth * currentUsdRate;
    milestones.push({
      time: tr.ts,
      price: pUsd,
      trade: tr
    });
  }

  // Always append current live price at now
  milestones.push({
    time: now,
    price: currentPriceUsd,
    trade: null
  });

  milestones.sort((a, b) => a.time - b.time);

  // Generate continuous timeline points
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const t = (i === numPoints - 1) ? now : Math.round(startTime + i * stepMs);

    let activeMilestone = milestones[0];
    for (let m = 0; m < milestones.length; m++) {
      if (milestones[m].time <= t) {
        activeMilestone = milestones[m];
      } else {
        break;
      }
    }

    let p = activeMilestone.price;
    if (i === numPoints - 1) {
      p = currentPriceUsd;
    }

    const mcap = p * AMM_PARAMS.TOKENS_FOR_CURVE;
    const dateObj = new Date(t);

    let timeStr = "";
    if (labelFormat === 'date' || (now - startTime > 36 * 3600 * 1000)) {
      timeStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    } else {
      timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    }

    const fullTimeStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    points.push({
      time: t,
      timeStr,
      fullTimeStr,
      price: p,
      mcap,
      trade: (i === numPoints - 1) ? null : activeMilestone.trade,
      isLive: (i === numPoints - 1)
    });
  }

  return points;
}

function drawChart(hoverIndex = null) {
  const canvas = document.getElementById("priceChartCanvas");
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (!parent) return;

  const width = parent.clientWidth;
  const height = parent.clientHeight || 260;
  if (width <= 0 || height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  const ctx = canvas.getContext("2d");
  if (ctx.resetTransform) {
    ctx.resetTransform();
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const currentToken = activeToken || tokens[0];
  if (!currentToken) return;

  const points = generatePriceHistory(currentToken, chartTimeframe);
  if (!points || points.length === 0) return;

  const prices = points.map(p => p.price);
  let minVal = Math.min(...prices);
  let maxVal = Math.max(...prices);
  if (minVal === maxVal) {
    minVal *= 0.95;
    maxVal *= 1.05;
  }
  const paddingY = (maxVal - minVal) * 0.12;
  minVal -= paddingY;
  maxVal += paddingY;

  // Update Mini-Bar metrics
  const headerElem = document.getElementById("chartTokenHeader");
  if (headerElem) headerElem.innerText = `$${currentToken.ticker} Price Chart`;

  const highElem = document.getElementById("chartHighPrice");
  if (highElem) highElem.innerText = `$${formatPriceString(maxVal * 1.015)}`;

  const lowElem = document.getElementById("chartLowPrice");
  if (lowElem) lowElem.innerText = `$${formatPriceString(Math.max(0.00000001, minVal * 0.985))}`;

  const volElem = document.getElementById("chartVolumeDisplay");
  if (volElem) {
    const tokenTrades = getTradesForToken(currentToken);
    const calculatedVol = tokenTrades.reduce((sum, t) => sum + (Number(t.eth || 0) * AMM_PARAMS.ETH_PRICE_USD), 0);
    const displayVol = currentToken.volume24hUsd || calculatedVol || 18500;
    volElem.innerText = `$${Math.round(displayVol).toLocaleString()}`;
  }

  updateChartLiveBadge();

  const paddingLeft = 10;
  const paddingRight = 68;
  const paddingTop = 16;
  const paddingBottom = 22;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const getX = (index) => paddingLeft + (index / (points.length - 1)) * plotWidth;
  const getY = (val) => paddingTop + plotHeight - ((val - minVal) / (maxVal - minVal)) * plotHeight;

  const mappedPoints = points.map((p, idx) => ({
    ...p,
    x: getX(idx),
    y: getY(p.price)
  }));

  currentChartData = {
    points: mappedPoints,
    minVal,
    maxVal,
    width,
    height,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    plotWidth,
    plotHeight
  };

  // 1. Horizontal Grid Lines & Price Labels
  const numGridLines = 4;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "10px monospace";

  for (let i = 0; i <= numGridLines; i++) {
    const yRatio = i / numGridLines;
    const yPos = paddingTop + yRatio * plotHeight;
    const priceVal = maxVal - yRatio * (maxVal - minVal);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(36, 46, 66, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(paddingLeft, yPos);
    ctx.lineTo(width - paddingRight, yPos);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(156, 163, 175, 0.85)";
    ctx.fillText("$" + formatPriceString(priceVal), width - 6, yPos);
  }

  // 2. Vertical Grid Lines & Time Labels
  const numTimeLabels = Math.min(5, points.length);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < numTimeLabels; i++) {
    const ptIdx = Math.round(i * (points.length - 1) / (numTimeLabels - 1));
    const pt = mappedPoints[ptIdx];
    if (!pt) continue;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(36, 46, 66, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(pt.x, paddingTop);
    ctx.lineTo(pt.x, paddingTop + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(107, 114, 128, 0.9)";
    ctx.fillText(pt.timeStr, pt.x, height - paddingBottom + 5);
  }

  // 3. Gradient Fill
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotHeight);
  gradient.addColorStop(0, "rgba(0, 200, 5, 0.28)");
  gradient.addColorStop(0.7, "rgba(0, 200, 5, 0.08)");
  gradient.addColorStop(1, "rgba(0, 200, 5, 0.0)");

  ctx.beginPath();
  ctx.moveTo(mappedPoints[0].x, mappedPoints[0].y);
  for (let i = 1; i < mappedPoints.length; i++) {
    const prev = mappedPoints[i - 1];
    const curr = mappedPoints[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }
  ctx.lineTo(mappedPoints[mappedPoints.length - 1].x, paddingTop + plotHeight);
  ctx.lineTo(mappedPoints[0].x, paddingTop + plotHeight);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // 4. Glowing Stroke
  ctx.save();
  ctx.shadowColor = "rgba(0, 200, 5, 0.65)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(mappedPoints[0].x, mappedPoints[0].y);
  for (let i = 1; i < mappedPoints.length; i++) {
    const prev = mappedPoints[i - 1];
    const curr = mappedPoints[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = "#00C805";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // 5. Point Beacon or Hover Indicator
  if (hoverIndex === null) {
    const lastPt = mappedPoints[mappedPoints.length - 1];
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 200, 5, 0.25)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#00C805";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const hoverPt = mappedPoints[hoverIndex];
    if (hoverPt) {
      // Crosshair lines
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 200, 5, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(hoverPt.x, paddingTop);
      ctx.lineTo(hoverPt.x, paddingTop + plotHeight);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(paddingLeft, hoverPt.y);
      ctx.lineTo(width - paddingRight, hoverPt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.beginPath();
      ctx.arc(hoverPt.x, hoverPt.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 200, 5, 0.3)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(hoverPt.x, hoverPt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#00C805";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Right axis price pill
      ctx.fillStyle = "#00C805";
      const pillW = 64;
      const pillH = 16;
      ctx.fillRect(width - paddingRight + 2, hoverPt.y - pillH / 2, pillW, pillH);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$" + formatPriceString(hoverPt.price), width - paddingRight + 2 + pillW / 2, hoverPt.y);
    }
  }

  setupChartHoverListeners();
}

function setupChartHoverListeners() {
  const canvas = document.getElementById("priceChartCanvas");
  const tooltip = document.getElementById("chartTooltip");
  const tooltipPrice = document.getElementById("chartTooltipPrice");
  const tooltipTime = document.getElementById("chartTooltipTime");

  if (!canvas || !tooltip || isChartHoverListenerAttached) return;
  isChartHoverListenerAttached = true;

  const handleMove = (clientX, clientY) => {
    if (!currentChartData.points || currentChartData.points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;

    let closestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < currentChartData.points.length; i++) {
      const dist = Math.abs(currentChartData.points[i].x - mouseX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    }

    const pt = currentChartData.points[closestIdx];
    drawChart(closestIdx);

    if (tooltipPrice) {
      const tradeTag = pt.trade ? (
        pt.trade.isBuy
          ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[9px]">🟢 BUY ${pt.trade.eth.toFixed(4)} ETH</span>`
          : `<span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold text-[9px]">🔴 SELL ${pt.trade.eth.toFixed(4)} ETH</span>`
      ) : (pt.isLive ? `<span class="px-1.5 py-0.5 rounded bg-[#00C805]/20 text-[#00C805] font-bold text-[9px]">⚡ Live Market</span>` : '');

      tooltipPrice.innerHTML = `
        <div class="flex items-center justify-between gap-1 mb-0.5">
          <span class="text-[#00C805] font-bold text-xs">$${formatPriceString(pt.price)}</span>
          ${tradeTag}
        </div>
        <div class="text-[10px] text-gray-400 font-mono">MCap: $${Math.round(pt.mcap).toLocaleString()}</div>
      `;
    }
    if (tooltipTime) {
      tooltipTime.innerText = pt.fullTimeStr || pt.timeStr;
    }

    const tooltipWidth = 160;
    let tipLeft = pt.x + 12;
    if (tipLeft + tooltipWidth > canvas.parentElement.clientWidth) {
      tipLeft = pt.x - tooltipWidth - 12;
    }
    let tipTop = Math.max(10, pt.y - 45);

    tooltip.style.left = `${tipLeft}px`;
    tooltip.style.top = `${tipTop}px`;
    tooltip.classList.remove("hidden");
  };

  const handleLeave = () => {
    tooltip.classList.add("hidden");
    drawChart(null);
  };

  canvas.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
  canvas.addEventListener("mouseleave", handleLeave);
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  canvas.addEventListener("touchend", handleLeave);
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

      const tradeTs = Date.now();
      const buyTrade = {
        type: "buy",
        user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4),
        rawTrader: userWallet.address,
        eth: inputAmount,
        tokens: Math.floor(inputAmount * 28000000),
        timestamp: tradeTs,
        time: "Just now",
        txHash: receipt.hash
      };
      recordTrade(activeToken, buyTrade);

      // Re-query curve on-chain reserve immediately
      try {
        const freshReserveWei = await curveContract.realEthReserve();
        activeToken.realEth = Number(ethers.formatEther(freshReserveWei));
      } catch (e) {
        activeToken.realEth = (Number(activeToken.realEth) || 0) + inputAmount;
      }

      // Persist to trades.php and Node backend
      const buyPayload = {
        token: activeToken.id || activeToken.address,
        trader: userWallet.address,
        isBuy: true,
        ethAmount: inputAmount,
        tokenAmount: buyTrade.tokens,
        txHash: receipt.hash,
        timestamp: new Date(tradeTs).toISOString()
      };
      try {
        fetch('/trades.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buyPayload)
        }).catch(() => {});
      } catch (e) {}
      if (isBackendConnected) {
        try {
          fetch(`${BACKEND_API_URL}/tokens/${activeToken.id}/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buyPayload)
          }).catch(() => {});
        } catch (e) {}
      }

      renderTerminal();
      drawChart();

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

      const tradeTs = Date.now();
      const sellTrade = {
        type: "sell",
        user: userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4),
        rawTrader: userWallet.address,
        eth: inputAmount * 0.00000003,
        tokens: Math.floor(inputAmount),
        timestamp: tradeTs,
        time: "Just now",
        txHash: receipt.hash
      };
      recordTrade(activeToken, sellTrade);

      // Re-query curve on-chain reserve immediately
      try {
        const freshReserveWei = await curveContract.realEthReserve();
        activeToken.realEth = Number(ethers.formatEther(freshReserveWei));
      } catch (e) {
        activeToken.realEth = Math.max(0, (Number(activeToken.realEth) || 0) - sellTrade.eth);
      }

      // Persist to trades.php and Node backend
      const sellPayload = {
        token: activeToken.id || activeToken.address,
        trader: userWallet.address,
        isBuy: false,
        ethAmount: sellTrade.eth,
        tokenAmount: sellTrade.tokens,
        txHash: receipt.hash,
        timestamp: new Date(tradeTs).toISOString()
      };
      try {
        fetch('/trades.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sellPayload)
        }).catch(() => {});
      } catch (e) {}
      if (isBackendConnected) {
        try {
          fetch(`${BACKEND_API_URL}/tokens/${activeToken.id}/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sellPayload)
          }).catch(() => {});
        } catch (e) {}
      }

      renderTerminal();
      drawChart();

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

  // If dropzone is NOT a native <label>, attach click listener; if it IS a <label for="newTokenLogoFile">, clicking naturally triggers fileInput
  if (dropzone.tagName.toLowerCase() !== "label") {
    dropzone.addEventListener("click", () => fileInput.click());
  }

  // Prevent default window drag/drop behavior so dropping an image outside doesn't navigate away
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      if (e.target !== fileInput && e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
      }
    }, false);
  });

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
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processLogoFile(files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processLogoFile(e.target.files[0]);
    }
  });

  // Support pasting image directly from clipboard (e.g. screenshot or copied image)
  window.addEventListener("paste", (e) => {
    const modal = document.getElementById("createTokenModal");
    if (!modal || modal.classList.contains("hidden")) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          processLogoFile(blob);
          break;
        }
      }
    }
  });
}

// Pre-upload logo to server/IPFS in background while user fills in other fields
async function preUploadLogoInBackground(file) {
  try {
    const ticker = (document.getElementById("newTokenTicker")?.value || "rh").trim().toLowerCase();

    // 0. Direct Pinata IPFS if configured
    if (IPFS_CONFIG && IPFS_CONFIG.pinataJwt) {
      try {
        const ipfsUrl = await uploadFileToPinataIpfs(file, ticker);
        if (ipfsUrl) {
          preUploadedServerUrl = ipfsUrl;
          console.log("⚡ [Background Upload] Logo pinned directly to IPFS:", ipfsUrl);
          return;
        }
      } catch (e) {}
    }

    // 1. Try PHP cPanel upload.php
    try {
      const phpFormData = new FormData();
      phpFormData.append('logo', file);
      phpFormData.append('ticker', ticker);
      const phpRes = await fetch('/upload.php', { method: 'POST', body: phpFormData });
      if (phpRes.ok) {
        const phpData = await phpRes.json();
        if (phpData.success && phpData.logoUrl) {
          preUploadedServerUrl = phpData.logoUrl;
          console.log("⚡ [Background Upload] Logo stored via upload.php:", preUploadedServerUrl);
          return;
        }
      }
    } catch (e) {}

    // 2. Try Node backend if connected
    if (isBackendConnected) {
      try {
        const formData = new FormData();
        formData.append('logo', file);
        formData.append('ticker', ticker);
        const res = await fetch(`${BACKEND_API_URL}/upload-logo`, { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.logoUrl) {
            preUploadedServerUrl = data.logoUrl;
            console.log("⚡ [Background Upload] Logo stored via backend:", preUploadedServerUrl);
            return;
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn("Background pre-upload error:", err);
  }
}

function processLogoFile(file) {
  if (!file.type || !file.type.startsWith("image/")) {
    alert("Please select a valid image file (PNG, JPG, SVG, WebP, GIF)!");
    return;
  }

  uploadedLogoFileRaw = file;
  preUploadedServerUrl = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedLogoDataUrl = e.target.result;

    const dropzone = document.getElementById("logoUploadDropzone");
    const previewContainer = document.getElementById("logoPreviewContainer");
    const previewImg = document.getElementById("logoPreviewImg");
    const fileNameText = document.getElementById("logoFileName");

    if (previewImg) previewImg.src = uploadedLogoDataUrl;
    if (fileNameText) fileNameText.innerText = file.name || "uploaded_logo.png";

    if (dropzone) dropzone.classList.add("hidden");
    if (previewContainer) previewContainer.classList.remove("hidden");

    // Initiate background upload immediately
    preUploadLogoInBackground(file);
  };
  reader.readAsDataURL(file);
}

function removeUploadedLogo(e) {
  if (e) e.stopPropagation();
  uploadedLogoDataUrl = null;
  uploadedLogoFileRaw = null;
  preUploadedServerUrl = null;

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

// --- Elegant Token Creation Success Modal ---
let successModalTimer = null;
let successModalInterval = null;

function showTokenCreatedSuccessModal(token, txHash, initialTokensBought = 0) {
  const modal = document.getElementById("createSuccessModal");
  if (!modal) {
    if (token) openTokenDetail(token.id);
    return;
  }

  const iconEl = document.getElementById("successModalTokenIcon");
  const nameEl = document.getElementById("successModalTokenName");
  const tickerEl = document.getElementById("successModalTokenTicker");
  const addrEl = document.getElementById("successModalContractAddr");
  const explorerLink = document.getElementById("successModalExplorerLink");
  const countdownEl = document.getElementById("successModalCountdown");
  const devBuyBadge = document.getElementById("successModalDevBuyBadge");
  const devBuyText = document.getElementById("successModalDevBuyText");

  if (iconEl) {
    iconEl.innerHTML = renderTokenIconHtml(token.icon, "w-12 h-12 text-2xl", token);
  }
  if (nameEl) nameEl.innerText = token.name || "Coin";
  if (tickerEl) tickerEl.innerText = `$${token.ticker || "TOKEN"}`;
  if (addrEl) {
    addrEl.innerText = token.address ? `Contract: ${token.address}` : "Bonding curve initialized";
  }
  if (explorerLink && txHash) {
    explorerLink.href = `https://robinhoodchain.blockscout.com/tx/${txHash}`;
    explorerLink.style.display = "flex";
  } else if (explorerLink) {
    explorerLink.style.display = "none";
  }

  if (devBuyBadge && devBuyText) {
    if (initialTokensBought > 0) {
      devBuyText.innerHTML = `🛡️ Sniper Defense: <b class="text-white font-mono">${Math.round(initialTokensBought).toLocaleString()} $${token.ticker}</b> received in your wallet!`;
      devBuyBadge.classList.remove("hidden");
    } else {
      devBuyBadge.classList.add("hidden");
    }
  }

  // Pre-switch to the token terminal in the background so it's fully ready
  openTokenDetail(token.id);

  modal.classList.remove("hidden");

  let remaining = initialTokensBought > 0 ? 3 : 2;
  if (countdownEl) countdownEl.innerText = remaining;

  if (successModalInterval) clearInterval(successModalInterval);
  if (successModalTimer) clearTimeout(successModalTimer);

  successModalInterval = setInterval(() => {
    remaining--;
    if (countdownEl) countdownEl.innerText = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(successModalInterval);
    }
  }, 1000);

  successModalTimer = setTimeout(() => {
    dismissSuccessModal();
  }, (remaining + 0.5) * 1000);
}

function dismissSuccessModal() {
  if (successModalInterval) clearInterval(successModalInterval);
  if (successModalTimer) clearTimeout(successModalTimer);
  const modal = document.getElementById("createSuccessModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  if (activeToken) {
    openTokenDetail(activeToken.id);
  }
}

async function openCreateModal() {
  document.getElementById("createTokenModal").classList.remove("hidden");
  selectTaxPreset("fair");
  removeUploadedLogo();
  ['newTokenWebsite', 'newTokenTwitter', 'newTokenTelegram', 'newTokenYoutube', 'newTokenDiscord'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Query on-chain creation fee from factory if configured
  try {
    const factory = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, rpcProvider);
    const feeWei = await factory.creationFee();
    const feeNotice = document.getElementById("createModalFeeNotice");
    const feeAmount = document.getElementById("createModalFeeAmount");
    if (feeNotice && feeAmount) {
      if (feeWei > 0n) {
        feeAmount.innerText = `${ethers.formatEther(feeWei)} ETH`;
        feeNotice.classList.remove("hidden");
      } else {
        feeNotice.classList.add("hidden");
      }
    }
  } catch (errFee) {
    // If legacy factory without creationFee method, keep hidden
    document.getElementById("createModalFeeNotice")?.classList.add("hidden");
  }
}

function closeCreateModal() {
  document.getElementById("createTokenModal").classList.add("hidden");
  removeUploadedLogo();
  ['newTokenWebsite', 'newTokenTwitter', 'newTokenTelegram', 'newTokenYoutube', 'newTokenDiscord'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
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

window.setDevBuyPreset = function(val) {
  const input = document.getElementById("newTokenDevBuy");
  if (input) {
    input.value = val > 0 ? val.toString() : "";
    input.focus();
    updateDevBuyEstimate();
  }
};

window.updateDevBuyEstimate = function() {
  const input = document.getElementById("newTokenDevBuy");
  const box = document.getElementById("devBuyEstimateBox");
  const amountEl = document.getElementById("devBuyEstimateAmount");
  if (!input || !box || !amountEl) return;

  const ethVal = parseFloat(input.value) || 0;
  if (ethVal < 0.0001) {
    box.classList.add("hidden");
    return;
  }

  // Curve constant product estimate:
  // VIRTUAL_ETH = 0.05, TOKENS_FOR_CURVE = 800,000,000
  // Net ETH after ~2% total protocol/dev fee
  const netEth = ethVal * 0.98;
  const currentEth = 0.05;
  const newEth = currentEth + netEth;
  const k = 0.05 * 800000000;
  const newTokenReserve = k / newEth;
  const tokensOut = Math.max(0, 800000000 - newTokenReserve);

  amountEl.innerText = `~${Math.round(tokensOut).toLocaleString()} tokens`;
  box.classList.remove("hidden");
};

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
  const devBuyEth = parseFloat(document.getElementById("newTokenDevBuy")?.value) || 0;

  // Enforce minimum 0.0001 ETH if Sniper Defense (Optional Initial Buy) is used
  if (devBuyEth > 0 && devBuyEth < 0.0001) {
    alert("⚠️ Sniper Defense (Initial Buy) minimum is 0.0001 ETH.\n\nPlease enter at least 0.0001 ETH, or clear the field (0) to skip initial buy.");
    return;
  }

  // Optional Social Media and Community Links
  const website = document.getElementById("newTokenWebsite")?.value.trim() || "";
  const twitter = document.getElementById("newTokenTwitter")?.value.trim() || "";
  const telegram = document.getElementById("newTokenTelegram")?.value.trim() || "";
  const youtube = document.getElementById("newTokenYoutube")?.value.trim() || "";
  const discord = document.getElementById("newTokenDiscord")?.value.trim() || "";

  const formattedWebsite = formatSocialUrl(website, 'website');
  const formattedTwitter = formatSocialUrl(twitter, 'twitter');
  const formattedTelegram = formatSocialUrl(telegram, 'telegram');
  const formattedYoutube = formatSocialUrl(youtube, 'youtube');
  const formattedDiscord = formatSocialUrl(discord, 'discord');

  const directLogoUrl = document.getElementById("newTokenLogoUrl")?.value.trim();

  // Validate that user provided an uploaded image file or direct image URL
  if (!uploadedLogoFileRaw && !uploadedLogoDataUrl && !directLogoUrl) {
    alert("Please upload a logo image or enter a direct image URL for your token!");
    return;
  }

  let finalIcon = directLogoUrl || preUploadedServerUrl || uploadedLogoDataUrl || DEFAULT_TOKEN_LOGO;

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

  const estimatedCreationFee = 0.0003;
  const totalEthNeeded = estimatedCreationFee + devBuyEth;
  if (totalEthNeeded > userWallet.balanceEth) {
    alert(`Insufficient ETH balance in your connected wallet!\n\nYour balance: ${userWallet.balanceEth.toFixed(4)} ETH\nRequired: ~${totalEthNeeded.toFixed(4)} ETH (${estimatedCreationFee} creation fee + ${devBuyEth > 0 ? `${devBuyEth} initial buy + ` : ''}gas)`);
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : "Deploy Coin";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Confirm in MetaMask...";
  }

  // Handle Logo Upload (Direct IPFS, cPanel PHP with IPFS, Node backend with IPFS, or Canvas Thumbnail)
  if (uploadedLogoFileRaw && !directLogoUrl && !preUploadedServerUrl) {
    if (submitBtn) submitBtn.innerText = "Storing Coin Logo on IPFS...";
    let uploadSuccess = false;

    // 0. Try direct browser Pinata IPFS upload (if configured in frontend)
    if (IPFS_CONFIG && IPFS_CONFIG.pinataJwt) {
      try {
        const ipfsDirectUrl = await uploadFileToPinataIpfs(uploadedLogoFileRaw, ticker);
        if (ipfsDirectUrl) {
          finalIcon = ipfsDirectUrl;
          uploadSuccess = true;
          preUploadedServerUrl = ipfsDirectUrl;
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
            preUploadedServerUrl = phpData.logoUrl;
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
          preUploadedServerUrl = uploadData.logoUrl;
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
  } else if (preUploadedServerUrl && !directLogoUrl) {
    finalIcon = preUploadedServerUrl;
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
      alert("⚠️ Protocol contracts are currently undergoing maintenance. Please try again shortly.");
      return;
    }

    const factory = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, browserSigner);
    const creatorTaxBps = Math.round(creatorTax * 100);
    const holderTaxBps = Math.round(holderTax * 100);
    const devBuyWei = devBuyEth >= 0.0001 ? ethers.parseEther(devBuyEth.toString()) : 0n;

    // Sanitize on-chain logo URL
    let onChainLogo = finalIcon;
    if (onChainLogo.startsWith("data:image/") && onChainLogo.length > 2500) {
      try {
        const microThumb = await createCompressedThumbnail(onChainLogo, 48, 48);
        if (microThumb && microThumb.length < 2500) {
          onChainLogo = microThumb;
        } else {
          onChainLogo = DEFAULT_TOKEN_LOGO;
        }
      } catch (e) {
        onChainLogo = DEFAULT_TOKEN_LOGO;
      }
    }

    // Construct full decentralized JSON metadata to store directly on-chain on Robinhood Chain
    const onChainMetadataObj = {
      name: name,
      symbol: ticker,
      description: desc,
      image: onChainLogo,
      website: formattedWebsite,
      twitter: formattedTwitter,
      telegram: formattedTelegram,
      youtube: formattedYoutube,
      discord: formattedDiscord,
      creator: userWallet.address,
      createdAt: Date.now()
    };
    const onChainMetadataUri = JSON.stringify(onChainMetadataObj);

    // Check if factory requires an upfront creation fee
    let creationFeeWei = 0n;
    try {
      creationFeeWei = await factory.creationFee();
    } catch (errFee) {
      creationFeeWei = ethers.parseEther("0.0003");
    }

    if (submitBtn) {
      submitBtn.innerText = devBuyEth >= 0.0001
        ? "1/2 Deploying Coin on Robinhood Chain..."
        : "Deploying on Robinhood Chain...";
    }

    // IMPORTANT: Pass ONLY creationFeeWei to factory.createToken!
    // Never send devBuyEth into factory.createToken, because the factory contract
    // is the caller/msg.sender of curve.buyTokens and does not forward tokens to the user.
    const tx = await factory.createToken(
      name,
      ticker,
      onChainMetadataUri,
      creatorTaxBps,
      holderTaxBps,
      { value: creationFeeWei }
    );

    if (submitBtn) submitBtn.innerText = "Confirming Deployment...";
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

    // Step 2: Execute Sniper Defense Initial Buy directly from the user's wallet!
    // This ensures tokens are transferred DIRECTLY into the creator's wallet!
    let tokensBoughtAmount = 0;
    let buyTxHash = null;

    if (devBuyEth >= 0.0001 && deployedCurveAddress) {
      try {
        if (submitBtn) {
          submitBtn.innerText = `2/2 Executing Sniper Defense Buy (${devBuyEth} ETH)...`;
        }
        const curveContract = new ethers.Contract(deployedCurveAddress, BONDING_CURVE_ABI, browserSigner);
        const buyTx = await curveContract.buyTokens(0n, { value: devBuyWei });
        const buyReceipt = await buyTx.wait();
        buyTxHash = buyReceipt.hash;
        console.log(`✅ Sniper Defense Initial Buy Confirmed! Tx: ${buyTxHash}`);

        // Read exact on-chain balance credited to the user
        if (deployedTokenAddress) {
          try {
            const tokenContract = new ethers.Contract(deployedTokenAddress, ERC20_ABI, browserProvider);
            const userBalWei = await tokenContract.balanceOf(userWallet.address);
            tokensBoughtAmount = parseFloat(ethers.formatEther(userBalWei));
            userWallet.holdings[deployedTokenAddress] = tokensBoughtAmount;
            console.log(`💰 User token balance credited: ${tokensBoughtAmount.toLocaleString()} $${ticker}`);
          } catch (balErr) {
            console.warn("Could not fetch user token balance:", balErr);
          }
        }
      } catch (buyErr) {
        console.error("Sniper defense buy error:", buyErr);
        alert(`⚠️ Coin deployed successfully, but Sniper Defense initial buy was cancelled or failed:\n${buyErr.reason || buyErr.message || buyErr}\n\nYou can still buy tokens manually on the trade terminal!`);
      }
    }

    const shortCreator = userWallet.address.slice(0, 6) + "..." + userWallet.address.slice(-4);
    const initialEthReserve = (tokensBoughtAmount > 0 && devBuyEth >= 0.0001) ? devBuyEth : 0.0;

    const newToken = {
      id: deployedTokenAddress || `token_${Date.now()}`,
      address: deployedTokenAddress,
      curveAddress: deployedCurveAddress,
      ticker: ticker,
      name: name,
      description: desc,
      icon: finalIcon,
      creator: shortCreator,
      rawCreator: userWallet.address,
      creatorAddress: userWallet.address.toLowerCase(),
      createdAgo: "Just now",
      realEth: initialEthReserve,
      tokensLeft: AMM_PARAMS.TOKENS_FOR_CURVE - tokensBoughtAmount,
      priceEth: 0.00000001,
      marketCapUsd: Math.round((initialEthReserve + 0.05) * ethUsdPrice * 8),
      change24h: 0.0,
      volume24hUsd: initialEthReserve * ethUsdPrice,
      graduated: false,
      creatorTax: creatorTax,
      holderTax: holderTax,
      website: formattedWebsite,
      twitter: formattedTwitter,
      telegram: formattedTelegram,
      youtube: formattedYoutube,
      discord: formattedDiscord,
      history: [0.05, initialEthReserve > 0 ? initialEthReserve : 0.05]
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
            initialEth: initialEthReserve,
            websiteUrl: formattedWebsite,
            twitterUrl: formattedTwitter,
            telegramUrl: formattedTelegram,
            youtubeUrl: formattedYoutube,
            discordUrl: formattedDiscord
          })
        });

        // Record initial buy trade if executed
        if (tokensBoughtAmount > 0) {
          await fetch(`${BACKEND_API_URL}/tokens/${deployedTokenAddress}/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trader: userWallet.address,
              isBuy: true,
              ethAmount: devBuyEth,
              tokenAmount: tokensBoughtAmount,
              txHash: buyTxHash || receipt.hash
            })
          });
        }
      } catch (e) {
        console.warn("Could not post new token to backend:", e);
      }
    }

    if (deployedTokenAddress) {
      try {
        localStorage.setItem(`rh_token_logo_${deployedTokenAddress.toLowerCase()}`, finalIcon || uploadedLogoDataUrl);
        localStorage.setItem(`rh_token_logo_${ticker.toUpperCase()}`, finalIcon || uploadedLogoDataUrl);

        // Save to universal social stores (PHP, Node, LocalStorage)
        await saveTokenSocials(newToken, {
          website: formattedWebsite,
          twitter: formattedTwitter,
          telegram: formattedTelegram,
          youtube: formattedYoutube,
          discord: formattedDiscord
        });

        // Save to user launched registry so it appears on profile instantly
        const userLaunchedKey = `rh_user_launched_${userWallet.address.toLowerCase()}`;
        let myLaunched = [];
        try {
          myLaunched = JSON.parse(localStorage.getItem(userLaunchedKey) || '[]');
        } catch (e) { myLaunched = []; }
        if (!myLaunched.includes(deployedTokenAddress.toLowerCase())) {
          myLaunched.push(deployedTokenAddress.toLowerCase());
          localStorage.setItem(userLaunchedKey, JSON.stringify(myLaunched));
        }
      } catch (e) {}
    }

    tokens.unshift(newToken);
    if (tokensBoughtAmount > 0) {
      userWallet.holdings[newToken.id] = tokensBoughtAmount;
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_TOKENS_KEY, JSON.stringify(tokens));
    } catch (e) {}
    closeCreateModal();
    renderTokenGrid();
    renderKothBanner();
    await refreshUserWalletData();
    setTimeout(fetchOnChainTokens, 3000);

    // Elegant Success Modal with automatic transition to Token Page
    showTokenCreatedSuccessModal(newToken, buyTxHash || receipt.hash, tokensBoughtAmount);
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
    await fetchTokenTrades(activeToken);
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
