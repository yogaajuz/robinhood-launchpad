// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

/// @notice Uniswap v4 PoolKey structure
struct PoolKey {
    address currency0; // Sorted: address(0) for native ETH
    address currency1; // Token address
    uint24 fee;        // e.g. 3000 (0.3%) or 10000 (1%)
    int24 tickSpacing; // e.g. 60
    address hooks;     // address(0) for standard unhooked pool
}

/// @notice Uniswap v4 ModifyLiquidityParams
struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96, bytes calldata hookData) external returns (int24 tick);
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (int256 callerDelta0, int256 callerDelta1);
    function settle() external payable returns (uint256);
}

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/**
 * @title RobinhoodUniswapV4MigrationRouter
 * @notice Receives ETH and tokens when curve hits 2.0 ETH, initializes Uniswap v4 pool, and seeds locked LP.
 */
contract RobinhoodUniswapV4MigrationRouter is IUnlockCallback {
    address public immutable poolManager;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Full-range ticks for Uniswap v4 tickSpacing = 60
    int24 public constant MIN_TICK_60 = -887220;
    int24 public constant MAX_TICK_60 = 887220;

    event UniswapV4LiquidityMigrated(
        bytes32 indexed poolId,
        address indexed token,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint160 sqrtPriceX96
    );

    struct CallbackData {
        PoolKey key;
        uint256 ethAmount;
        uint256 tokenAmount;
        uint160 sqrtPriceX96;
        address token;
    }

    constructor(address _poolManager) {
        poolManager = _poolManager;
    }

    /**
     * @notice Called automatically by RobinhoodBondingCurve when 2.0 ETH target is reached
     * @param token Address of the token to migrate
     * @param ethAmount Real ETH accumulated on the bonding curve (~2.0 ETH)
     * @param tokenAmount Reserved tokens for DEX pool (200,000,000 tokens)
     */
    function graduateAndMigrate(
        address token,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external payable returns (address poolIdPlaceholder) {
        require(msg.value >= ethAmount, "ETH mismatch");

        // Pull reserved tokens from bonding curve
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        // Native ETH is address(0) in Uniswap v4 (always currency0 as 0 < token)
        PoolKey memory key = PoolKey({
            currency0: address(0), // Native ETH
            currency1: token,      // Token
            fee: 3000,             // 0.30% Uniswap v4 tier
            tickSpacing: 60,
            hooks: address(0)      // Canonical pool with zero malicious hooks
        });

        // Calculate initial sqrtPriceX96: sqrt(tokens / eth) * 2^96
        // For 200M tokens : ~2 ETH, price = 100,000,000 tokens/ETH
        // sqrt(100,000,000) = 10,000. 10000 * 2^96:
        uint160 initialSqrtPriceX96 = 792281625142643375935439503360; // Approximate balanced sqrtPrice

        if (poolManager != address(0)) {
            // Initialize pool in Uniswap v4 Singleton
            try IPoolManager(poolManager).initialize(key, initialSqrtPriceX96, "") {} catch {}

            // Pack callback data and unlock PoolManager
            bytes memory callbackData = abi.encode(CallbackData({
                key: key,
                ethAmount: ethAmount,
                tokenAmount: tokenAmount,
                sqrtPriceX96: initialSqrtPriceX96,
                token: token
            }));

            IPoolManager(poolManager).unlock(callbackData);
        }

        bytes32 poolId = keccak256(abi.encode(key));
        emit UniswapV4LiquidityMigrated(poolId, token, ethAmount, tokenAmount, initialSqrtPriceX96);

        return address(uint160(uint256(poolId)));
    }

    /**
     * @notice Uniswap v4 unlock callback to execute liquidity addition and settle tokens
     */
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == poolManager, "Only PoolManager callback");

        CallbackData memory cb = abi.decode(data, (CallbackData));

        // Estimate liquidity delta
        int256 liquidityDelta = int256(cb.ethAmount * 10000);

        // Modify liquidity in full range: tickLower to tickUpper
        // In Uniswap v4, LP is permanently locked by burning the claim
        IPoolManager(poolManager).modifyLiquidity(
            cb.key,
            ModifyLiquidityParams({
                tickLower: MIN_TICK_60,
                tickUpper: MAX_TICK_60,
                liquidityDelta: liquidityDelta,
                salt: keccak256(abi.encode(DEAD_ADDRESS, block.timestamp))
            }),
            ""
        );

        // Settle Native ETH
        IPoolManager(poolManager).settle{value: cb.ethAmount}();

        // Settle ERC20 Token
        IERC20(cb.token).transfer(poolManager, cb.tokenAmount);
        IPoolManager(poolManager).settle();

        return "";
    }

    receive() external payable {}
}
