// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RobinhoodBondingCurve.sol";

interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

/**
 * @title RobinhoodTokenFactory
 * @notice Factory registry that deploys new tokens with configurable creator royalties and holder reflection taxes.
 */
contract RobinhoodTokenFactory {
    address public owner;
    address public feeRecipient;
    address public migrationRouter;
    address public poolManager; // Uniswap v4 PoolManager (e.g. 0x8366a39cc670b4001a1121b8f6a443a643e40951)
    uint256 public creationFee; // Upfront creation fee in wei (e.g. 0.005 ether)

    address[] public allCurves;
    mapping(address => address) public tokenToCurve;
    mapping(address => address) public curveToToken;

    event TokenCreated(
        address indexed tokenAddress,
        address indexed curveAddress,
        address indexed creator,
        string name,
        string symbol,
        string metadataUri,
        uint256 creatorTaxBps,
        uint256 holderTaxBps,
        uint256 creationFeePaid,
        uint256 timestamp
    );

    event UniswapV4PoolInitialized(
        address indexed tokenAddress,
        bytes32 indexed poolId,
        int24 tick
    );

    event CreationFeeUpdated(uint256 newFee);
    event PoolManagerUpdated(address newPoolManager);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not factory owner");
        _;
    }

    constructor(address _feeRecipient, address _migrationRouter, uint256 _creationFee) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        migrationRouter = _migrationRouter;
        creationFee = _creationFee;
        poolManager = 0x8366a39cc670b4001a1121b8f6a443a643e40951; // Canonical Uniswap v4 PoolManager on Robinhood Chain Mainnet
    }

    /**
     * @notice Deploy a new token and its bonding curve with custom tax settings
     * @param name Token name (e.g. "GameStop 2.0")
     * @param symbol Token symbol (e.g. "$GME2")
     * @param metadataUri IPFS or HTTPS URI
     * @param creatorTaxBps Royalty in basis points (e.g. 200 = 2% to creator)
     * @param holderTaxBps Reflection in basis points (e.g. 200 = 2% to holders)
     */
    function createToken(
        string memory name,
        string memory symbol,
        string memory metadataUri,
        uint256 creatorTaxBps,
        uint256 holderTaxBps
    ) external payable returns (address tokenAddress, address curveAddress) {
        require(creatorTaxBps + holderTaxBps <= 1000, "Max combined tax is 10%");
        require(msg.value >= creationFee, "Insufficient creation fee");

        // 1. Transfer upfront creation fee to protocol feeRecipient
        if (creationFee > 0) {
            (bool feeSuccess, ) = feeRecipient.call{value: creationFee}("");
            require(feeSuccess, "Creation fee transfer failed");
        }

        // 2. Deploy bonding curve which internally deploys the RobinhoodToken with tax metadata
        RobinhoodBondingCurve curve = new RobinhoodBondingCurve(
            name,
            symbol,
            metadataUri,
            msg.sender,
            feeRecipient,
            migrationRouter,
            creatorTaxBps,
            holderTaxBps
        );

        curveAddress = address(curve);
        tokenAddress = address(curve.token());

        allCurves.push(curveAddress);
        tokenToCurve[tokenAddress] = curveAddress;
        curveToToken[curveAddress] = tokenAddress;

        emit TokenCreated(
            tokenAddress,
            curveAddress,
            msg.sender,
            name,
            symbol,
            metadataUri,
            creatorTaxBps,
            holderTaxBps,
            creationFee,
            block.timestamp
        );

        // 3. Optional: Any excess ETH sent above the creation fee is an initial developer buy
        uint256 devBuyAmount = msg.value - creationFee;
        if (devBuyAmount > 0) {
            curve.buyTokens{value: devBuyAmount}(0);
            uint256 boughtTokens = curve.token().balanceOf(address(this));
            if (boughtTokens > 0) {
                curve.token().transfer(msg.sender, boughtTokens);
            }
        }

        // 4. Automatically initialize Canonical Uniswap v4 pool for Bitget Swap & DEX aggregators
        if (poolManager != address(0)) {
            try IPoolManager(poolManager).initialize(
                IPoolManager.PoolKey({
                    currency0: address(0),
                    currency1: tokenAddress,
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: address(0)
                }),
                792281625142643375935439503360 // ~1:100M-400M initial price range
            ) returns (int24 tick) {
                bytes32 poolId = keccak256(abi.encode(
                    IPoolManager.PoolKey({
                        currency0: address(0),
                        currency1: tokenAddress,
                        fee: 3000,
                        tickSpacing: 60,
                        hooks: address(0)
                    })
                ));
                emit UniswapV4PoolInitialized(tokenAddress, poolId, tick);
            } catch {}
        }
    }

    function totalLaunches() external view returns (uint256) {
        return allCurves.length;
    }

    function setCreationFee(uint256 _newFee) external onlyOwner {
        creationFee = _newFee;
        emit CreationFeeUpdated(_newFee);
    }

    function setFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Zero address");
        feeRecipient = _newRecipient;
    }

    function setMigrationRouter(address _newRouter) external onlyOwner {
        migrationRouter = _newRouter;
    }

    function setPoolManager(address _newPoolManager) external onlyOwner {
        poolManager = _newPoolManager;
        emit PoolManagerUpdated(_newPoolManager);
    }
}
