const fs = require('fs');
const path = require('path');
const solc = require('../backend/node_modules/solc');

const contractsDir = path.join(__dirname, '../contracts');
const artifactsDir = path.join(__dirname, '../contracts/artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function findImports(importPath) {
  let resolvedPath = path.resolve(contractsDir, importPath);
  if (fs.existsSync(resolvedPath)) {
    return { contents: fs.readFileSync(resolvedPath, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

const sources = {};
const files = [
  'interfaces/IERC20.sol',
  'RobinhoodToken.sol',
  'RobinhoodBondingCurve.sol',
  'RobinhoodUniswapV4MigrationRouter.sol',
  'RobinhoodTokenFactory.sol'
];

for (const file of files) {
  const filePath = path.join(contractsDir, file);
  sources[file] = {
    content: fs.readFileSync(filePath, 'utf8')
  };
}

const input = {
  language: 'Solidity',
  sources: sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

console.log('⏳ Compiling Robinhood Chain smart contracts with Solc 0.8.20...');
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasErrors = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === 'error') {
      console.error('❌', err.formattedMessage);
      hasErrors = true;
    } else {
      console.warn('⚠️', err.formattedMessage);
    }
  }
}

if (hasErrors) {
  console.error('Compilation failed.');
  process.exit(1);
}

const compiledContracts = {};

for (const sourceFile in output.contracts) {
  for (const contractName in output.contracts[sourceFile]) {
    const contract = output.contracts[sourceFile][contractName];
    const artifact = {
      contractName,
      sourceFile,
      abi: contract.abi,
      bytecode: contract.evm.bytecode.object
    };

    fs.writeFileSync(
      path.join(artifactsDir, `${contractName}.json`),
      JSON.stringify(artifact, null, 2)
    );
    compiledContracts[contractName] = artifact;
    console.log(`✅ Compiled: ${contractName} (${contract.abi.length} ABI items, ${contract.evm.bytecode.object.length / 2} bytes)`);
  }
}

// Also output a single combined artifacts file for browser deployer
fs.writeFileSync(
  path.join(artifactsDir, 'all_artifacts.json'),
  JSON.stringify(compiledContracts, null, 2)
);

console.log('🎉 All smart contracts compiled successfully to contracts/artifacts/');
