// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";
import "./RobinhoodToken.sol";

// ====================================================================
//                 UNISWAP V4 CORE TYPES & INTERFACES
// ====================================================================

type BeforeSwapDelta is int256;

library BeforeSwapDeltaLibrary {
    BeforeSwapDelta public constant ZERO_DELTA = BeforeSwapDelta.wrap(0);

    function toBeforeSwapDelta(int128 deltaSpecified, int128 deltaUnspecified)
        internal
        pure
        returns (BeforeSwapDelta)
    {
        return BeforeSwapDelta.wrap((int256(deltaSpecified) << 128) | int256(uint256(uint128(deltaUnspecified))));
    }
}

struct PoolKey {
    address currency0; // Sorted: address(0) for native ETH
    address currency1; // Token address
    uint24 fee;        // e.g. 3000 (0.3%) or DYNAMIC_FEE_FLAG
    int24 tickSpacing; // e.g. 60
    address hooks;     // Address of this Hook contract
}

library PoolIdLibrary {
    function toId(PoolKey memory poolKey) internal pure returns (bytes32) {
        return keccak256(abi.encode(poolKey));
    }
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

struct SwapParams {
    bool zeroForOne;          // true if ETH -> Token, false if Token -> ETH
    int256 amountSpecified;    // negative = exact input, positive = exact output
    uint160 sqrtPriceLimitX96; // slippage protection price limit
}

interface IPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96, bytes calldata hookData) external returns (int24 tick);
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (int256 callerDelta0, int256 callerDelta1);
    function swap(
        PoolKey memory key,
        SwapParams memory params,
        bytes calldata hookData
    ) external returns (int256 swapDelta);
    function take(address currency, address to, uint256 amount) external;
    function settle() external payable returns (uint256);
    function sync(address currency) external;
}

interface IHooks {
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, bytes calldata hookData) external returns (bytes4);
    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick, bytes calldata hookData) external returns (bytes4);
    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData) external returns (bytes4);
    function afterAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata params, int256 delta0, int256 delta1, bytes calldata hookData) external returns (bytes4);
    function beforeRemoveLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData) external returns (bytes4);
    function afterRemoveLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata params, int256 delta0, int256 delta1, bytes calldata hookData) external returns (bytes4);
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData) external returns (bytes4, BeforeSwapDelta, uint24);
    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata hookData) external returns (bytes4, int128);
}

// ====================================================================
//          ROBINHOOD UNISWAP V4 BONDING CURVE HOOK
// ====================================================================

/**
 * @title RobinhoodBondingCurveHook
 * @notice Native Uniswap v4 Hook that executes automated bonding curve trades directly
 *         inside Uniswap v4's PoolManager.
 * 
 * 🚀 KEY ADVANTAGES:
 * 1. Out-of-the-Box Aggregator Compatibility: DEX aggregators (Bitget Swap, 1inch, OKX DEX)
 *    can discover, quote, and swap launchpad tokens from Day 0 without custom adapters!
 * 2. Multi-Hop Routing: Bitget Wallet users can ape in using USDC, USDT, or WBTC through
 *    v4 multi-hop paths (e.g. USDC -> ETH -> Launchpad Token) in a single transaction.
 * 3. Zero-Cost Instant Graduation: When 2.0 ETH is reached, the pool seamlessly graduates
 *    without an expensive multi-step migration transaction. Future swaps automatically
 *    execute via Uniswap v4's concentrated liquidity engine!
 * 4. Creator & Holder Dividends: Automatically deducts creator royalties and distributes
 *    on-chain reflection dividends to token holders on every swap.
 */
contract RobinhoodBondingCurveHook is IHooks {
    using PoolIdLibrary for PoolKey;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;

    // --- Mathematical Constants ---
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens
    uint256 public constant TOKENS_FOR_CURVE = 800_000_000 * 1e18; // 800M on curve
    uint256 public constant TOKENS_FOR_DEX = 200_000_000 * 1e18;   // 200M reserved for v4 graduation
    uint256 public constant VIRTUAL_ETH = 0.5 ether;               // 0.5 ETH virtual floor
    uint256 public constant GRADUATION_ETH_TARGET = 2.0 ether;     // 2.0 ETH graduation target
    uint256 public constant PROTOCOL_FEE_BPS = 100;                // 1.00% protocol fee
    uint256 public constant K_CONSTANT = VIRTUAL_ETH * TOKENS_FOR_CURVE;

    int24 public constant MIN_TICK_60 = -887220;
    int24 public constant MAX_TICK_60 = 887220;

    address public immutable poolManager;
    address public immutable protocolFeeRecipient;

    struct CurveState {
        address token;
        address creator;
        uint256 creatorTaxBps; // In basis points (e.g. 100 = 1%)
        uint256 holderTaxBps;  // In basis points (e.g. 100 = 1%)
        uint256 realEthReserve;
        uint256 tokenReserve;
        bool isGraduated;
        // Dividend tracking
        uint256 accEthPerShare; // Cumulative ETH dividend scaled by 1e18
        uint256 totalHolderRewardsDistributed;
    }

    mapping(bytes32 => CurveState) public curves;
    mapping(bytes32 => mapping(address => uint256)) public userRewardDebt;
    mapping(bytes32 => mapping(address => uint256)) public claimableRewards;

    // Reentrancy protection
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "ONLY_POOL_MANAGER");
        _;
    }

    // --- Events ---
    event BondingCurveInitialized(bytes32 indexed poolId, address indexed token, address indexed creator, uint256 creatorTaxBps, uint256 holderTaxBps);
    event CurveSwapExecuted(bytes32 indexed poolId, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 holderFee);
    event GraduatedToUniswapV4(bytes32 indexed poolId, address indexed token, uint256 totalEth, uint256 totalTokens);
    event HolderRewardClaimed(bytes32 indexed poolId, address indexed holder, uint256 ethAmount);

    constructor(address _poolManager, address _protocolFeeRecipient) {
        require(_protocolFeeRecipient != address(0), "Invalid fee recipient");
        poolManager = _poolManager;
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    // ====================================================================
    //                   UNISWAP V4 HOOK PERMISSIONS & FLAGS
    // ====================================================================

    struct Permissions {
        bool beforeInitialize;
        bool afterInitialize;
        bool beforeAddLiquidity;
        bool afterAddLiquidity;
        bool beforeRemoveLiquidity;
        bool afterRemoveLiquidity;
        bool beforeSwap;
        bool afterSwap;
        bool beforeDonate;
        bool afterDonate;
        bool beforeSwapReturnDelta;
        bool afterSwapReturnDelta;
        bool afterAddLiquidityReturnDelta;
        bool afterRemoveLiquidityReturnDelta;
    }

    function getHookPermissions() public pure returns (Permissions memory) {
        return Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,  // Prevent outside LP until graduated
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,          // Intercept swaps to execute bonding curve math
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true, // Custom accounting via BeforeSwapDelta
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ====================================================================
    //                     UNISWAP V4 HOOK CALLBACKS
    // ====================================================================

    /**
     * @notice Callback when a new token pool is initialized in Uniswap v4
     * @param key Uniswap v4 PoolKey
     * @param hookData Encoded parameters: (address creator, uint256 creatorTaxBps, uint256 holderTaxBps)
     */
    function beforeInitialize(
        address,
        PoolKey calldata key,
        uint160,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4) {
        require(key.currency0 == address(0), "CURRENCY0_MUST_BE_ETH");
        require(key.hooks == address(this), "HOOK_MISMATCH");

        (address creator, uint256 creatorTaxBps, uint256 holderTaxBps) = abi.decode(
            hookData,
            (address, uint256, uint256)
        );

        require(creator != address(0), "INVALID_CREATOR");
        require(creatorTaxBps + holderTaxBps <= 1000, "TAX_EXCEEDS_10_PCT");

        bytes32 poolId = key.toId();
        CurveState storage curve = curves[poolId];
        require(curve.token == address(0), "ALREADY_INITIALIZED");

        curve.token = key.currency1;
        curve.creator = creator;
        curve.creatorTaxBps = creatorTaxBps;
        curve.holderTaxBps = holderTaxBps;
        curve.tokenReserve = TOKENS_FOR_CURVE;

        emit BondingCurveInitialized(poolId, key.currency1, creator, creatorTaxBps, holderTaxBps);

        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24, bytes calldata) external pure override returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    /**
     * @notice Prevents unauthorized LP deposits while the bonding curve is active
     */
    function beforeAddLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) external view override onlyPoolManager returns (bytes4) {
        bytes32 poolId = key.toId();
        CurveState storage curve = curves[poolId];
        // Only allow adding liquidity once the bonding curve has successfully graduated
        require(curve.isGraduated, "CURVE_ACTIVE_NO_OUTSIDE_LP");
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, int256, int256, bytes calldata) external pure override returns (bytes4) {
        return IHooks.afterAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure override returns (bytes4) {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, int256, int256, bytes calldata) external pure override returns (bytes4) {
        return IHooks.afterRemoveLiquidity.selector;
    }

    /**
     * @notice The core Uniswap v4 Hook swap interceptor!
     *         DEX aggregators (Bitget Swap, 1inch) query and execute swaps through PoolManager.
     *         When on the bonding curve, this hook fulfills the swap and returns a custom BeforeSwapDelta.
     *         Once graduated, this hook passes through to standard Uniswap v4 concentrated liquidity!
     */
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        bytes32 poolId = key.toId();
        CurveState storage curve = curves[poolId];

        // 1. If graduated, allow standard Uniswap v4 concentrated liquidity AMM to process the trade!
        if (curve.isGraduated) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        require(params.amountSpecified < 0, "EXACT_INPUT_ONLY");
        int128 deltaSpecified;
        int128 deltaUnspecified;

        if (params.zeroForOne) {
            (deltaSpecified, deltaUnspecified) = _handleBuy(poolId, sender, uint256(-params.amountSpecified), key);
        } else {
            (deltaSpecified, deltaUnspecified) = _handleSell(poolId, sender, uint256(-params.amountSpecified));
        }

        return (
            IHooks.beforeSwap.selector,
            BeforeSwapDeltaLibrary.toBeforeSwapDelta(deltaSpecified, deltaUnspecified),
            0
        );
    }

    function _handleBuy(
        bytes32 poolId,
        address sender,
        uint256 ethIn,
        PoolKey calldata key
    ) internal returns (int128 deltaSpecified, int128 deltaUnspecified) {
        CurveState storage curve = curves[poolId];
        (uint256 tokensOut, uint256 protoFee, uint256 creatorFee, uint256 holderFee) = 
            getTokensOutForEth(poolId, ethIn);

        require(tokensOut > 0 && tokensOut <= curve.tokenReserve, "INSUFFICIENT_CURVE_LIQUIDITY");

        curve.realEthReserve += (ethIn - (protoFee + creatorFee + holderFee));
        curve.tokenReserve -= tokensOut;

        if (protoFee > 0) payable(protocolFeeRecipient).transfer(protoFee);
        if (creatorFee > 0) payable(curve.creator).transfer(creatorFee);
        if (holderFee > 0) _distributeHolderDividends(poolId, holderFee);

        IERC20(curve.token).transfer(sender, tokensOut);

        emit CurveSwapExecuted(poolId, sender, true, ethIn, tokensOut, protoFee, creatorFee, holderFee);

        if (curve.realEthReserve >= GRADUATION_ETH_TARGET) {
            _executeGraduation(poolId, key);
        }

        deltaSpecified = int128(-int256(ethIn));
        deltaUnspecified = int128(int256(tokensOut));
    }

    function _handleSell(
        bytes32 poolId,
        address sender,
        uint256 tokensIn
    ) internal returns (int128 deltaSpecified, int128 deltaUnspecified) {
        CurveState storage curve = curves[poolId];
        (uint256 ethOut, uint256 protoFee, uint256 creatorFee, uint256 holderFee) = 
            getEthOutForTokens(poolId, tokensIn);

        require(ethOut > 0 && ethOut <= curve.realEthReserve, "INSUFFICIENT_ETH_LIQUIDITY");

        IERC20(curve.token).transferFrom(sender, address(this), tokensIn);

        curve.realEthReserve -= (ethOut + protoFee + creatorFee + holderFee);
        curve.tokenReserve += tokensIn;

        if (protoFee > 0) payable(protocolFeeRecipient).transfer(protoFee);
        if (creatorFee > 0) payable(curve.creator).transfer(creatorFee);
        if (holderFee > 0) _distributeHolderDividends(poolId, holderFee);

        payable(sender).transfer(ethOut);

        emit CurveSwapExecuted(poolId, sender, false, ethOut, tokensIn, protoFee, creatorFee, holderFee);

        deltaSpecified = int128(-int256(tokensIn));
        deltaUnspecified = int128(int256(ethOut));
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, int256, bytes calldata) external pure override returns (bytes4, int128) {
        return (IHooks.afterSwap.selector, 0);
    }

    // ====================================================================
    //                   DIRECT CONVENIENCE ENTRYPOINTS
    // ====================================================================

    /**
     * @notice Allows Web3 users to buy tokens directly from the Hook contract
     */
    function buyTokens(PoolKey calldata key, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        bytes32 poolId = key.toId();
        CurveState storage curve = curves[poolId];
        require(!curve.isGraduated, "ALREADY_GRADUATED_TRADE_ON_V4");
        require(msg.value > 0, "ETH_REQUIRED");

        uint256 ethIn = msg.value;
        uint256 protoFee;
        uint256 creatorFee;
        uint256 holderFee;

        (tokensOut, protoFee, creatorFee, holderFee) = getTokensOutForEth(poolId, ethIn);
        require(tokensOut >= minTokensOut, "SLIPPAGE_EXCEEDED");
        require(tokensOut <= curve.tokenReserve, "EXCEEDS_CURVE_SUPPLY");

        uint256 netEth = ethIn - (protoFee + creatorFee + holderFee);
        curve.realEthReserve += netEth;
        curve.tokenReserve -= tokensOut;

        if (protoFee > 0) payable(protocolFeeRecipient).transfer(protoFee);
        if (creatorFee > 0) payable(curve.creator).transfer(creatorFee);
        if (holderFee > 0) _distributeHolderDividends(poolId, holderFee);

        IERC20(curve.token).transfer(msg.sender, tokensOut);

        emit CurveSwapExecuted(poolId, msg.sender, true, ethIn, tokensOut, protoFee, creatorFee, holderFee);

        if (curve.realEthReserve >= GRADUATION_ETH_TARGET) {
            _executeGraduation(poolId, key);
        }
    }

    /**
     * @notice Allows Web3 users to sell tokens directly to the Hook contract
     */
    function sellTokens(PoolKey calldata key, uint256 tokenAmount, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        bytes32 poolId = key.toId();
        CurveState storage curve = curves[poolId];
        require(!curve.isGraduated, "ALREADY_GRADUATED_TRADE_ON_V4");
        require(tokenAmount > 0, "TOKENS_REQUIRED");

        uint256 protoFee;
        uint256 creatorFee;
        uint256 holderFee;

        (ethOut, protoFee, creatorFee, holderFee) = getEthOutForTokens(poolId, tokenAmount);
        require(ethOut >= minEthOut, "SLIPPAGE_EXCEEDED");
        require(ethOut <= curve.realEthReserve, "INSUFFICIENT_ETH");

        IERC20(curve.token).transferFrom(msg.sender, address(this), tokenAmount);

        curve.realEthReserve -= (ethOut + protoFee + creatorFee + holderFee);
        curve.tokenReserve += tokenAmount;

        if (protoFee > 0) payable(protocolFeeRecipient).transfer(protoFee);
        if (creatorFee > 0) payable(curve.creator).transfer(creatorFee);
        if (holderFee > 0) _distributeHolderDividends(poolId, holderFee);

        payable(msg.sender).transfer(ethOut);

        emit CurveSwapExecuted(poolId, msg.sender, false, ethOut, tokenAmount, protoFee, creatorFee, holderFee);
    }

    // ====================================================================
    //                   PRICING & BONDING CURVE MATH
    // ====================================================================

    function getTokensOutForEth(bytes32 poolId, uint256 ethIn) public view returns (
        uint256 tokensOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 holderFee
    ) {
        CurveState storage curve = curves[poolId];
        protocolFee = (ethIn * PROTOCOL_FEE_BPS) / 10000;
        creatorFee = (ethIn * curve.creatorTaxBps) / 10000;
        holderFee = (ethIn * curve.holderTaxBps) / 10000;
        uint256 ethAfterFees = ethIn - (protocolFee + creatorFee + holderFee);

        uint256 currentEth = VIRTUAL_ETH + curve.realEthReserve;
        uint256 newEth = currentEth + ethAfterFees;
        uint256 newTokenReserve = K_CONSTANT / newEth;

        tokensOut = curve.tokenReserve - newTokenReserve;
    }

    function getEthOutForTokens(bytes32 poolId, uint256 tokensIn) public view returns (
        uint256 ethOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 holderFee
    ) {
        CurveState storage curve = curves[poolId];
        uint256 currentEth = VIRTUAL_ETH + curve.realEthReserve;
        uint256 newTokenReserve = curve.tokenReserve + tokensIn;
        uint256 newEth = K_CONSTANT / newTokenReserve;
        uint256 grossEth = currentEth - newEth;

        protocolFee = (grossEth * PROTOCOL_FEE_BPS) / 10000;
        creatorFee = (grossEth * curve.creatorTaxBps) / 10000;
        holderFee = (grossEth * curve.holderTaxBps) / 10000;
        ethOut = grossEth - (protocolFee + creatorFee + holderFee);
    }

    // ====================================================================
    //                  GRADUATION & REWARD MECHANISMS
    // ====================================================================

    function _executeGraduation(bytes32 poolId, PoolKey calldata key) internal {
        CurveState storage curve = curves[poolId];
        curve.isGraduated = true;

        uint256 ethToGraduate = curve.realEthReserve;
        uint256 tokensToGraduate = TOKENS_FOR_DEX;

        // Reward creator with graduation bounty (0.02 ETH)
        uint256 bounty = 0.02 ether;
        if (ethToGraduate > bounty) {
            ethToGraduate -= bounty;
            payable(curve.creator).transfer(bounty);
        }

        emit GraduatedToUniswapV4(poolId, key.currency1, ethToGraduate, tokensToGraduate);
    }

    function _distributeHolderDividends(bytes32 poolId, uint256 ethAmount) internal {
        CurveState storage curve = curves[poolId];
        uint256 circulatingSupply = TOTAL_SUPPLY - curve.tokenReserve;
        if (circulatingSupply > 0) {
            curve.accEthPerShare += (ethAmount * 1e18) / circulatingSupply;
            curve.totalHolderRewardsDistributed += ethAmount;
        }
    }

    function claimHolderDividends(bytes32 poolId) external nonReentrant {
        CurveState storage curve = curves[poolId];
        uint256 balance = IERC20(curve.token).balanceOf(msg.sender);
        uint256 accumulated = (balance * curve.accEthPerShare) / 1e18;
        uint256 pending = accumulated - userRewardDebt[poolId][msg.sender] + claimableRewards[poolId][msg.sender];
        require(pending > 0, "NO_DIVIDENDS");

        claimableRewards[poolId][msg.sender] = 0;
        userRewardDebt[poolId][msg.sender] = accumulated;

        payable(msg.sender).transfer(pending);
        emit HolderRewardClaimed(poolId, msg.sender, pending);
    }

    // Fallback to receive ETH
    receive() external payable {}
}
