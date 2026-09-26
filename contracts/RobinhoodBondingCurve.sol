// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";
import "./RobinhoodToken.sol";

interface IUniswapV4MigrationRouter {
    function graduateAndMigrate(address token, uint256 ethAmount, uint256 tokenAmount) external payable returns (address poolId);
}

/**
 * @title RobinhoodBondingCurve
 * @notice Automated Virtual AMM bonding curve with 2.0 ETH graduation target and Uniswap v4 LP migration.
 * @dev Employs a virtual constant-product curve: (realETH + virtualETH) * (tokenReserve) = k
 */
contract RobinhoodBondingCurve {
    // 1 Billion total tokens: 800M on curve, 200M reserved for Uniswap v4 graduation pool
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;
    uint256 public constant TOKENS_FOR_CURVE = 800_000_000 * 1e18;
    uint256 public constant TOKENS_FOR_DEX = 200_000_000 * 1e18;

    // Virtual reserves to establish pricing floor and 2.0 ETH graduation
    uint256 public constant VIRTUAL_ETH = 0.5 ether;
    uint256 public constant GRADUATION_ETH_TARGET = 2.0 ether; // Exactly 2 ETH target requested
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1.00% protocol fee
    uint256 public constant CREATOR_REWARD_ETH = 0.02 ether; // 0.02 ETH graduation bounty to creator

    uint256 public constant K_CONSTANT = VIRTUAL_ETH * TOKENS_FOR_CURVE;

    // Configurable Tax Settings chosen by Creator at launch (in basis points)
    uint256 public immutable creatorTaxBps; // e.g. 200 = 2% creator royalty
    uint256 public immutable holderTaxBps;  // e.g. 200 = 2% holder dividend reflection

    address public immutable factory;
    address public immutable feeRecipient;
    address public immutable creator;
    RobinhoodToken public immutable token;
    address public migrationRouter;

    uint256 public realEthReserve;
    uint256 public tokenReserve;
    bool public isGraduated;

    // --- Holder Reflection / Dividend State ---
    uint256 public accEthPerShare; // Cumulative ETH dividend per token, scaled by 1e18
    uint256 public totalHolderRewardsDistributed;
    mapping(address => uint256) public userRewardDebt;
    mapping(address => uint256) public claimableRewards;

    // Reentrancy guard
    uint256 private _status;
    modifier nonReentrant() {
        require(_status != 2, "ReentrancyGuard: reentrant call");
        _status = 2;
        _;
        _status = 1;
    }

    event TokensPurchased(address indexed buyer, uint256 ethPaid, uint256 tokensReceived, uint256 protocolFee, uint256 creatorTax, uint256 holderTax);
    event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethReturned, uint256 protocolFee, uint256 creatorTax, uint256 holderTax);
    event HolderRewardClaimed(address indexed holder, uint256 ethAmount);
    event UniswapV4Graduated(address indexed token, uint256 ethGraduated, uint256 tokensGraduated, address uniswapV4Pool);

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _metadataUri,
        address _creator,
        address _feeRecipient,
        address _migrationRouter,
        uint256 _creatorTaxBps,
        uint256 _holderTaxBps
    ) {
        require(_creator != address(0), "Invalid creator");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_creatorTaxBps + _holderTaxBps <= 1000, "Tax exceeds 10% maximum limit");

        factory = msg.sender;
        creator = _creator;
        feeRecipient = _feeRecipient;
        migrationRouter = _migrationRouter;
        creatorTaxBps = _creatorTaxBps;
        holderTaxBps = _holderTaxBps;

        // Deploy the ERC-20 token linked to this curve with tax metadata
        token = new RobinhoodToken(_name, _symbol, _metadataUri, _creator, address(this), _creatorTaxBps, _holderTaxBps);

        tokenReserve = TOKENS_FOR_CURVE;
        _status = 1;
    }

    /**
     * @notice Total fee percentage in basis points (Protocol 1% + Creator Tax + Holder Tax)
     */
    function getTotalFeeBps() public view returns (uint256) {
        return PROTOCOL_FEE_BPS + creatorTaxBps + holderTaxBps;
    }

    /**
     * @notice Calculate expected tokens out for a given ETH deposit
     */
    function getTokensOutForEth(uint256 ethIn) public view returns (
        uint256 tokensOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 holderFee
    ) {
        protocolFee = (ethIn * PROTOCOL_FEE_BPS) / 10000;
        creatorFee = (ethIn * creatorTaxBps) / 10000;
        holderFee = (ethIn * holderTaxBps) / 10000;
        uint256 ethAfterFees = ethIn - (protocolFee + creatorFee + holderFee);

        uint256 currentEth = VIRTUAL_ETH + realEthReserve;
        uint256 newEth = currentEth + ethAfterFees;
        uint256 newTokenReserve = K_CONSTANT / newEth;

        tokensOut = tokenReserve - newTokenReserve;
    }

    /**
     * @notice Calculate expected ETH out for a given token sale
     */
    function getEthOutForTokens(uint256 tokensIn) public view returns (
        uint256 netEthOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 holderFee
    ) {
        require(tokensIn <= (TOKENS_FOR_CURVE - tokenReserve), "Cannot sell more than bought");

        uint256 newTokenReserve = tokenReserve + tokensIn;
        uint256 newEth = K_CONSTANT / newTokenReserve;
        uint256 currentEth = VIRTUAL_ETH + realEthReserve;
        uint256 grossEthOut = currentEth - newEth;

        protocolFee = (grossEthOut * PROTOCOL_FEE_BPS) / 10000;
        creatorFee = (grossEthOut * creatorTaxBps) / 10000;
        holderFee = (grossEthOut * holderTaxBps) / 10000;

        netEthOut = grossEthOut - (protocolFee + creatorFee + holderFee);
    }

    /**
     * @notice Buy tokens with native ETH
     */
    function buyTokens(uint256 minTokensExpected) external payable nonReentrant {
        require(!isGraduated, "Curve already graduated");
        require(msg.value > 0, "No ETH sent");

        uint256 protocolFee = (msg.value * PROTOCOL_FEE_BPS) / 10000;
        uint256 creatorFee = (msg.value * creatorTaxBps) / 10000;
        uint256 holderFee = (msg.value * holderTaxBps) / 10000;
        uint256 ethAfterFees = msg.value - (protocolFee + creatorFee + holderFee);

        // 1. Send protocol fee to treasury
        (bool feeSuccess, ) = feeRecipient.call{value: protocolFee}("");
        require(feeSuccess, "Protocol fee transfer failed");

        // 2. Send creator royalty
        if (creatorFee > 0) {
            (bool creatorSuccess, ) = creator.call{value: creatorFee}("");
            creatorSuccess;
        }

        // 3. Accumulate holder reflection reward in ETH
        uint256 circulatingTokens = TOKENS_FOR_CURVE - tokenReserve;
        if (holderFee > 0 && circulatingTokens > 0) {
            accEthPerShare += (holderFee * 1e18) / circulatingTokens;
            totalHolderRewardsDistributed += holderFee;
        }

        // 4. Calculate bonding curve constant product swap
        uint256 currentEth = VIRTUAL_ETH + realEthReserve;
        uint256 newEth = currentEth + ethAfterFees;
        uint256 newTokenReserve = K_CONSTANT / newEth;

        uint256 tokensOut = tokenReserve - newTokenReserve;
        require(tokensOut >= minTokensExpected, "Slippage tolerance exceeded");
        require(tokensOut <= tokenReserve, "Insufficient curve reserve");

        realEthReserve += ethAfterFees;
        tokenReserve = newTokenReserve;

        // 5. Update buyer dividends & transfer tokens
        _updateUserDividends(msg.sender);
        token.transfer(msg.sender, tokensOut);
        userRewardDebt[msg.sender] = (token.balanceOf(msg.sender) * accEthPerShare) / 1e18;

        emit TokensPurchased(msg.sender, msg.value, tokensOut, protocolFee, creatorFee, holderFee);

        // 6. Check if 2.0 ETH graduation target is reached
        if (realEthReserve >= GRADUATION_ETH_TARGET) {
            _graduateToUniswapV4();
        }
    }

    /**
     * @notice Sell tokens back to the bonding curve for native ETH
     */
    function sellTokens(uint256 tokensIn, uint256 minEthExpected) external nonReentrant {
        require(!isGraduated, "Curve already graduated");
        require(tokensIn > 0, "Zero tokens");

        (uint256 netEthOut, uint256 protocolFee, uint256 creatorFee, uint256 holderFee) = getEthOutForTokens(tokensIn);
        require(netEthOut >= minEthExpected, "Slippage tolerance exceeded");
        uint256 totalEthDeducted = netEthOut + protocolFee + creatorFee + holderFee;
        require(totalEthDeducted <= realEthReserve, "Exceeds real reserve");

        _updateUserDividends(msg.sender);
        token.transferFrom(msg.sender, address(this), tokensIn);

        tokenReserve += tokensIn;
        realEthReserve -= totalEthDeducted;

        userRewardDebt[msg.sender] = (token.balanceOf(msg.sender) * accEthPerShare) / 1e18;

        // Route fees
        (bool feeSuccess, ) = feeRecipient.call{value: protocolFee}("");
        require(feeSuccess, "Protocol fee transfer failed");

        if (creatorFee > 0) {
            (bool creatorSuccess, ) = creator.call{value: creatorFee}("");
            creatorSuccess;
        }

        uint256 circulatingTokens = TOKENS_FOR_CURVE - tokenReserve;
        if (holderFee > 0 && circulatingTokens > 0) {
            accEthPerShare += (holderFee * 1e18) / circulatingTokens;
            totalHolderRewardsDistributed += holderFee;
        }

        // Return ETH to seller
        (bool ethSuccess, ) = msg.sender.call{value: netEthOut}("");
        require(ethSuccess, "ETH transfer failed");

        emit TokensSold(msg.sender, tokensIn, netEthOut, protocolFee, creatorFee, holderFee);
    }

    /**
     * @notice View pending ETH reflection rewards for any holder
     */
    function getPendingHolderRewards(address account) public view returns (uint256) {
        uint256 balance = token.balanceOf(account);
        uint256 pending = 0;
        if (balance > 0 && accEthPerShare > 0) {
            uint256 accumulated = (balance * accEthPerShare) / 1e18;
            if (accumulated > userRewardDebt[account]) {
                pending = accumulated - userRewardDebt[account];
            }
        }
        return claimableRewards[account] + pending;
    }

    /**
     * @notice Allows token holders to claim their accumulated ETH reflection dividends
     */
    function claimHolderRewards() external nonReentrant {
        _updateUserDividends(msg.sender);
        uint256 reward = claimableRewards[msg.sender];
        require(reward > 0, "No rewards to claim");

        claimableRewards[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: reward}("");
        require(success, "Reward transfer failed");

        emit HolderRewardClaimed(msg.sender, reward);
    }

    function _updateUserDividends(address account) internal {
        uint256 balance = token.balanceOf(account);
        if (balance > 0 && accEthPerShare > 0) {
            uint256 accumulated = (balance * accEthPerShare) / 1e18;
            if (accumulated > userRewardDebt[account]) {
                claimableRewards[account] += (accumulated - userRewardDebt[account]);
            }
        }
    }

    /**
     * @notice Automatic Liquidity Migration to Uniswap v4 once 2.0 ETH is reached
     */
    function _graduateToUniswapV4() internal {
        isGraduated = true;

        uint256 migrationEth = realEthReserve;
        if (migrationEth > CREATOR_REWARD_ETH) {
            migrationEth -= CREATOR_REWARD_ETH;
            (bool rewardSuccess, ) = creator.call{value: CREATOR_REWARD_ETH}("");
            rewardSuccess;
        }

        address v4Pool = address(0);
        if (migrationRouter != address(0)) {
            token.approve(migrationRouter, TOKENS_FOR_DEX);
            v4Pool = IUniswapV4MigrationRouter(migrationRouter).graduateAndMigrate{value: migrationEth}(
                address(token),
                migrationEth,
                TOKENS_FOR_DEX
            );
        }

        emit UniswapV4Graduated(address(token), migrationEth, TOKENS_FOR_DEX, v4Pool);
    }

    function getCurrentPrice() external view returns (uint256) {
        uint256 currentEth = VIRTUAL_ETH + realEthReserve;
        return (currentEth * currentEth * 1e18) / K_CONSTANT;
    }

    function getBondingProgress() external view returns (uint256) {
        if (isGraduated || realEthReserve >= GRADUATION_ETH_TARGET) return 10000;
        return (realEthReserve * 10000) / GRADUATION_ETH_TARGET;
    }

    receive() external payable {}
}
