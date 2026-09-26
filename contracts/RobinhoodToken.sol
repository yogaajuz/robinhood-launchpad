// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

/**
 * @title RobinhoodToken
 * @notice Standard 1B supply token designed for the Robinhood Chain Fair Launchpad with configurable tax settings.
 */
contract RobinhoodToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens

    // Tax configuration stored for transparency and indexing
    uint256 public immutable creatorTaxBps; // In basis points (e.g. 200 = 2%)
    uint256 public immutable holderTaxBps;  // In basis points (e.g. 200 = 2%)

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    address public immutable bondingCurve;
    address public immutable creator;
    string public metadataUri;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _metadataUri,
        address _creator,
        address _bondingCurve,
        uint256 _creatorTaxBps,
        uint256 _holderTaxBps
    ) {
        require(_bondingCurve != address(0), "Invalid bonding curve");
        name = _name;
        symbol = _symbol;
        metadataUri = _metadataUri;
        creator = _creator;
        bondingCurve = _bondingCurve;
        creatorTaxBps = _creatorTaxBps;
        holderTaxBps = _holderTaxBps;

        // Allocate entire 1 Billion supply to the bonding curve
        _balances[_bondingCurve] = TOTAL_SUPPLY;
        emit Transfer(address(0), _bondingCurve, TOTAL_SUPPLY);
    }

    function totalSupply() external pure override returns (uint256) {
        return TOTAL_SUPPLY;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from zero address");
        require(recipient != address(0), "ERC20: transfer to zero address");
        require(_balances[sender] >= amount, "ERC20: transfer amount exceeds balance");

        unchecked {
            _balances[sender] -= amount;
            _balances[recipient] += amount;
        }

        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from zero address");
        require(spender != address(0), "ERC20: approve to zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
