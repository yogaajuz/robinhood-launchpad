/**
 * Initialize Canonical Uniswap v4 Pool on Robinhood Chain Mainnet (Chain 4663)
 * Enables immediate discovery, pricing, and trading on Bitget Swap, GeckoTerminal, and DEX aggregators!
 */

const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, defineChain, parseAbi, keccak256, encodeAbiParameters, parseAbiParameters } = require('../backend/node_modules/viem');
const { privateKeyToAccount } = require('../backend/node_modules/viem/accounts');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain Mainnet',
  network: 'robinhood-mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC_URL || 'https://robinhood-rpc.publicnode.com'] },
    public: { http: [process.env.ROBINHOOD_RPC_URL || 'https://robinhood-rpc.publicnode.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Blockscout', url: 'https://robinhoodchain.blockscout.com' }
  }
});

const UNISWAP_V4_POOL_MANAGER = process.env.UNISWAP_V4_POOL_MANAGER || '0x8366a39cc670b4001a1121b8f6a443a643e40951';

const poolManagerAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function initialize(PoolKey key, uint160 sqrtPriceX96) external returns (int24 tick)'
]);

async function main() {
  console.log('\n🦄 ==============================================================');
  console.log('   INITIALIZE CANONICAL UNISWAP V4 POOL (ROBINHOOD CHAIN 4663)');
  console.log('   Creates on-chain DEX pool for Bitget Swap & DEX Aggregators!');
  console.log('================================================================\n');

  const tokenAddress = process.argv[2] || process.env.TARGET_TOKEN_ADDRESS;
  if (!tokenAddress || !tokenAddress.startsWith('0x')) {
    console.error('❌ Error: Missing target token address.');
    console.log('\nUsage:');
    console.log('  node scripts/create-uniswap-pool.js <TOKEN_ADDRESS> [PRIVATE_KEY]');
    console.log('Example:');
    console.log('  node scripts/create-uniswap-pool.js 0xaB00706959E9e958b74E818319a4FB4dB96e61c7\n');
    process.exit(1);
  }

  let privateKey = process.argv[3] || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log('ℹ️ No private key provided. You can initialize the pool via:');
    console.log('  1. Running: node scripts/create-uniswap-pool.js ' + tokenAddress + ' <YOUR_PRIVATE_KEY>');
    console.log('  2. OR clicking "✨ Create Uniswap Pool" directly in the launchpad web terminal with MetaMask / Bitget Wallet!\n');
    process.exit(0);
  }

  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
  const account = privateKeyToAccount(privateKey);
  console.log(`👤 Caller Wallet: ${account.address}`);
  console.log(`📍 Target Token: ${tokenAddress}`);
  console.log(`🦄 PoolManager: ${UNISWAP_V4_POOL_MANAGER}\n`);

  const publicClient = createPublicClient({ chain: robinhoodMainnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: robinhoodMainnet, transport: http() });

  const poolKey = {
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: tokenAddress,
    fee: 3000, // 0.30%
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000' // Canonical pool
  };

  // sqrtPriceX96 for 1.6B tokens / ETH (40,000 * 2^96)
  const sqrtPriceX96 = 3169126500570573503741758013440000n;

  // Compute PoolId
  const encodedKey = encodeAbiParameters(
    parseAbiParameters('address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks'),
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  const poolId = keccak256(encodedKey);
  console.log(`🔑 Canonical Pool ID: ${poolId}`);

  console.log('⏳ Broadcasting initialize transaction...');
  try {
    const hash = await walletClient.writeContract({
      address: UNISWAP_V4_POOL_MANAGER,
      abi: poolManagerAbi,
      functionName: 'initialize',
      args: [poolKey, sqrtPriceX96]
    });

    console.log(`📤 Tx Hash: ${hash}`);
    console.log(`🔍 Explorer: https://robinhoodchain.blockscout.com/tx/${hash}`);
    console.log('⏳ Waiting for block confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log('\n🎉 ==============================================================');
    console.log('✅ Canonical Uniswap v4 Pool Successfully Initialized!');
    console.log(`📍 Token Address: ${tokenAddress}`);
    console.log(`🔑 Pool ID: ${poolId}`);
    console.log(`🔗 Blockscout: https://robinhoodchain.blockscout.com/tx/${receipt.transactionHash}`);
    console.log('   Bitget Swap & DEX aggregators will now discover this pool on Robinhood Chain!');
    console.log('================================================================\n');
  } catch (err) {
    if (err.message && (err.message.includes('revert') || err.message.includes('PoolAlreadyInitialized'))) {
      console.log('ℹ️ This pool is already initialized in PoolManager on Robinhood Chain!');
      console.log(`🔑 Pool ID: ${poolId}`);
    } else {
      console.error('❌ Failed to initialize pool:', err.shortMessage || err.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
