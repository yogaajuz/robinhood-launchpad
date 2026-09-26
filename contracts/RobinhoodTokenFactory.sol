// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RobinhoodBondingCurve.sol";

/**
 * @title RobinhoodTokenFactory
 * @notice Factory registry that deploys new tokens with configurable creator royalties and holder reflection taxes.
 */
contract RobinhoodTokenFactory {
    address public owner;
    address public feeRecipient;
    address public migrationRouter;

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
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not factory owner");
        _;
    }

    constructor(address _feeRecipient, address _migrationRouter) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        migrationRouter = _migrationRouter;
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

        // Deploy bonding curve which internally deploys the RobinhoodToken with tax metadata
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
            block.timestamp
        );

        // Optional: If creator sent ETH with deployment, perform an initial instant buy
        if (msg.value > 0) {
            curve.buyTokens{value: msg.value}(0);
        }
    }

    function totalLaunches() external view returns (uint256) {
        return allCurves.length;
    }

    function setFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Zero address");
        feeRecipient = _newRecipient;
    }

    function setMigrationRouter(address _newRouter) external onlyOwner {
        migrationRouter = _newRouter;
    }
}
