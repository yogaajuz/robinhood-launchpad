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

    event CreationFeeUpdated(uint256 newFee);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not factory owner");
        _;
    }

    constructor(address _feeRecipient, address _migrationRouter, uint256 _creationFee) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        migrationRouter = _migrationRouter;
        creationFee = _creationFee;
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
}
