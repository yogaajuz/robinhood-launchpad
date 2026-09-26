// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

interface IDexFactory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IDexRouter {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function WETH() external pure returns (address);
}

/**
 * @title RobinhoodMigrationRouter
 * @notice Receives ETH and reserved tokens upon curve graduation, creates DEX pair, and burns LP tokens.
 */
contract RobinhoodMigrationRouter {
    address public immutable dexRouter;
    address public immutable dexFactory;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    event LiquidityMigrated(address indexed token, address indexed pair, uint256 ethAmount, uint256 tokenAmount, uint256 lpBurned);

    constructor(address _dexRouter, address _dexFactory) {
        dexRouter = _dexRouter;
        dexFactory = _dexFactory;
    }

    /**
     * @notice Called automatically by RobinhoodBondingCurve when graduation target is hit
     */
    function graduateAndMigrate(
        address token,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external payable returns (address pair) {
        require(msg.value >= ethAmount, "ETH amount mismatch");

        // Transfer tokens from bonding curve to this router
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        if (dexRouter != address(0) && dexFactory != address(0)) {
            // Approve DEX router to spend tokens
            IERC20(token).approve(dexRouter, tokenAmount);

            // Add liquidity to DEX pool, LP tokens sent directly to DEAD_ADDRESS (Permanent Lock)
            (, , uint256 liquidity) = IDexRouter(dexRouter).addLiquidityETH{value: ethAmount}(
                token,
                tokenAmount,
                0,
                0,
                DEAD_ADDRESS, // Burn LP tokens directly
                block.timestamp + 300
            );

            pair = IDexFactory(dexFactory).getPair(token, IDexRouter(dexRouter).WETH());
            emit LiquidityMigrated(token, pair, ethAmount, tokenAmount, liquidity);
        } else {
            // Standalone test mode: lock tokens and eth in contract
            emit LiquidityMigrated(token, DEAD_ADDRESS, ethAmount, tokenAmount, 0);
            pair = DEAD_ADDRESS;
        }
    }

    receive() external payable {}
}
