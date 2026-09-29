/**
 * Uniswap v4 Bonding Curve Hook Deployment Script
 * Chain ID: 4663 (Robinhood Chain Mainnet)
 * PoolManager: 0x8366a39cc670b4001a1121b8f6a443a643e40951
 */

const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, defineChain, formatEther } = require('../backend/node_modules/viem');
const { privateKeyToAccount } = require('../backend/node_modules/viem/accounts');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain Mainnet',
  network: 'robinhood-mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] },
    public: { http: [process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Blockscout', url: 'https://robinhoodchain.blockscout.com' }
  }
});

const artifactsDir = path.join(__dirname, '../contracts/artifacts');
const hookArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'RobinhoodBondingCurveHook.json'), 'utf8'));

const UNISWAP_V4_POOL_MANAGER = process.env.UNISWAP_V4_POOL_MANAGER || '0x8366a39cc670b4001a1121b8f6a443a643e40951';

async function main() {
  console.log('\n🦄 ==============================================================');
  console.log('   UNISWAP V4 BONDING CURVE HOOK DEPLOYMENT (CHAIN 4663)');
  console.log('   Enables Bitget Swap & DEX Aggregators Out-of-the-Box!');
  console.log('================================================================\n');

  let privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.argv[2];

  if (!privateKey) {
    console.error('❌ Error: Missing deployer private key.');
    console.log('\nUsage:');
    console.log('node scripts/deploy-v4-hook.js <YOUR_PRIVATE_KEY>');
    console.log('or add DEPLOYER_PRIVATE_KEY=0x... to your .env file.\n');
    process.exit(1);
  }

  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`👤 Deployer Address: ${account.address}`);
  console.log(`🦄 Target PoolManager: ${UNISWAP_V4_POOL_MANAGER}`);

  const publicClient = createPublicClient({
    chain: robinhoodMainnet,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: robinhoodMainnet,
    transport: http()
  });

  const balanceWei = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Deployer Balance: ${formatEther(balanceWei)} ETH`);

  if (balanceWei === 0n) {
    console.error('❌ Deployer account has 0 ETH on Robinhood Chain Mainnet.');
    process.exit(1);
  }

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || account.address;
  console.log(`💼 Protocol Fee Recipient: ${feeRecipient}\n`);

  console.log('⏳ Deploying RobinhoodBondingCurveHook...');
  const hash = await walletClient.deployContract({
    abi: hookArtifact.abi,
    bytecode: '0x' + hookArtifact.bytecode,
    args: [UNISWAP_V4_POOL_MANAGER, feeRecipient]
  });

  console.log(`📤 Tx Sent: https://robinhoodchain.blockscout.com/tx/${hash}`);
  console.log('⏳ Waiting for block confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const hookAddress = receipt.contractAddress;

  console.log('\n🎉 ==============================================================');
  console.log(`✅ RobinhoodBondingCurveHook Deployed!`);
  console.log(`📍 Contract Address: ${hookAddress}`);
  console.log(`🔍 Blockscout: https://robinhoodchain.blockscout.com/address/${hookAddress}`);
  console.log('================================================================\n');

  // Update .env with new Hook address
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('V4_HOOK_CONTRACT_ADDRESS=')) {
      envContent = envContent.replace(/V4_HOOK_CONTRACT_ADDRESS=.*/, `V4_HOOK_CONTRACT_ADDRESS=${hookAddress}`);
    } else {
      envContent += `\nV4_HOOK_CONTRACT_ADDRESS=${hookAddress}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log(`💾 Saved V4_HOOK_CONTRACT_ADDRESS=${hookAddress} to .env`);
  }
}

main().catch(err => {
  console.error('❌ Deployment error:', err);
  process.exit(1);
});
