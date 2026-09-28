/**
 * Robinhood Chain Mainnet Smart Contract Deployment Script
 * Chain ID: 4663 | Native Gas: ETH
 * Uniswap v4 PoolManager: 0x8366a39cc670b4001a1121b8f6a443a643e40951
 */

const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, defineChain, formatEther, parseEther } = require('../backend/node_modules/viem');
const { privateKeyToAccount } = require('../backend/node_modules/viem/accounts');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Define Robinhood Chain Mainnet
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

// Load Compiled Contract Artifacts
const artifactsDir = path.join(__dirname, '../contracts/artifacts');
const routerArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'RobinhoodUniswapV4MigrationRouter.json'), 'utf8'));
const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'RobinhoodTokenFactory.json'), 'utf8'));

// Uniswap v4 PoolManager on Robinhood Chain Mainnet
const UNISWAP_V4_POOL_MANAGER = process.env.UNISWAP_V4_POOL_MANAGER || '0x8366a39cc670b4001a1121b8f6a443a643e40951';

async function main() {
  console.log('\n🏹 ==============================================================');
  console.log('   ROBINHOOD CHAIN MAINNET SMART CONTRACT DEPLOYMENT (CHAIN 4663)');
  console.log('================================================================\n');

  let privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.argv[2];

  if (!privateKey) {
    console.error('❌ Error: Missing deployer private key.');
    console.log('\nTo deploy:');
    console.log('1. Add DEPLOYER_PRIVATE_KEY=0x... to your .env file, OR');
    console.log('2. Run: node scripts/deploy-mainnet.js <YOUR_PRIVATE_KEY>, OR');
    console.log('3. Open http://localhost:3001/deploy.html to deploy via MetaMask without private key.\n');
    process.exit(1);
  }

  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`👤 Deployer Address: ${account.address}`);

  const publicClient = createPublicClient({
    chain: robinhoodMainnet,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: robinhoodMainnet,
    transport: http()
  });

  // Check ETH Balance on Robinhood Chain Mainnet
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Deployer Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('❌ Insufficient balance: Deployer address has 0 ETH on Robinhood Chain Mainnet.');
    console.log('Please bridge a small amount of ETH (e.g. 0.005 ETH) to your wallet to pay for gas.');
    process.exit(1);
  }

  console.log('\n--- Step 1: Deploying Uniswap v4 Migration Router ---');
  console.log(`Using Uniswap v4 PoolManager: ${UNISWAP_V4_POOL_MANAGER}`);

  const routerTxHash = await walletClient.deployContract({
    abi: routerArtifact.abi,
    bytecode: '0x' + routerArtifact.bytecode,
    args: [UNISWAP_V4_POOL_MANAGER]
  });
  console.log(`🚀 Router Deployment TX Sent: ${routerTxHash}`);
  console.log('Waiting for confirmation...');

  const routerReceipt = await publicClient.waitForTransactionReceipt({ hash: routerTxHash });
  const routerAddress = routerReceipt.contractAddress;
  console.log(`✅ Uniswap v4 Migration Router deployed at: ${routerAddress}`);
  console.log(`🔗 Explorer: https://robinhoodchain.blockscout.com/address/${routerAddress}`);

  console.log('\n--- Step 2: Deploying RobinhoodTokenFactory ---');
  console.log(`Fee Recipient: ${account.address}`);
  console.log(`Migration Router: ${routerAddress}`);

  const creationFeeEth = process.env.CREATION_FEE_ETH || '0.005';
  const creationFeeWei = parseEther(creationFeeEth);
  console.log(`Creation Fee: ${creationFeeEth} ETH (${creationFeeWei} wei)`);

  const factoryTxHash = await walletClient.deployContract({
    abi: factoryArtifact.abi,
    bytecode: '0x' + factoryArtifact.bytecode,
    args: [account.address, routerAddress, creationFeeWei]
  });
  console.log(`🚀 Factory Deployment TX Sent: ${factoryTxHash}`);
  console.log('Waiting for confirmation...');

  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryTxHash });
  const factoryAddress = factoryReceipt.contractAddress;
  console.log(`✅ Robinhood Token Factory deployed at: ${factoryAddress}`);
  console.log(`🔗 Explorer: https://robinhoodchain.blockscout.com/address/${factoryAddress}`);

  // Automatically update .env and frontend
  console.log('\n--- Step 3: Saving Addresses to Configs ---');
  updateConfigs(factoryAddress, routerAddress);

  console.log('\n🎉 ==============================================================');
  console.log('   MAINNET DEPLOYMENT COMPLETE! YOUR LAUNCHPAD IS LIVE ON CHAIN');
  console.log('================================================================');
  console.log(`Token Factory:  ${factoryAddress}`);
  console.log(`v4 Router:      ${routerAddress}`);
  console.log(`Graduation:     2.00 ETH Target -> Uniswap v4 (${UNISWAP_V4_POOL_MANAGER})`);
  console.log('================================================================\n');
}

function updateConfigs(factoryAddress, routerAddress) {
  const rootEnvPath = path.join(__dirname, '../.env');
  const backendEnvPath = path.join(__dirname, '../backend/.env');

  [rootEnvPath, backendEnvPath].forEach(envPath => {
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/CHAIN_ID=.*/g, 'CHAIN_ID=4663');
      content = content.replace(/ROBINHOOD_RPC_URL=.*/g, 'ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com');
      content = content.replace(/FACTORY_ADDRESS=.*/g, `FACTORY_ADDRESS=${factoryAddress}`);
      content = content.replace(/ROUTER_V4_ADDRESS=.*/g, `ROUTER_V4_ADDRESS=${routerAddress}`);
      content = content.replace(/FACTORY_CONTRACT_ADDRESS=.*/g, `FACTORY_CONTRACT_ADDRESS=${factoryAddress}`);
      content = content.replace(/UNISWAP_V4_ROUTER_ADDRESS=.*/g, `UNISWAP_V4_ROUTER_ADDRESS=${routerAddress}`);
      fs.writeFileSync(envPath, content, 'utf8');
      console.log(`📝 Updated ${path.basename(envPath)}`);
    }
  });
}

main().catch(err => {
  console.error('\n❌ Deployment failed:', err.message);
  process.exit(1);
});
