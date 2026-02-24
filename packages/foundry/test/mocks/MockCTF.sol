// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {MockERC20} from "./MockERC20.sol";

/// @title MockCTF
/// @notice Mock Conditional Tokens Framework for testing Bounce.
/// @dev Faithfully models real CTF authorization: safeTransferFrom enforces approval checks,
///      but redeemPositions/splitPosition/mergePositions only operate on msg.sender's own tokens
///      (no approval needed). See: github.com/gnosis/conditional-tokens-contracts
contract MockCTF {
    /// @notice Approval status: owner => operator => approved.
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    /// @notice Token balances: account => tokenId => balance.
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    /// @notice Payout numerator per condition: conditionId => payout per share (in USDC, 6 decimals).
    mapping(bytes32 => uint256) public payoutPerShare;

    /// @notice USDC address for redeem payouts.
    address public usdc;

    /// @notice Sets the USDC address for redemption payouts.
    /// @param _usdc The USDC token address.
    function setUsdc(address _usdc) external {
        usdc = _usdc;
    }

    /// @notice Sets approval for an operator to transfer tokens on behalf of msg.sender.
    /// @dev Matches real CTF: approval is required for safeTransferFrom when from != msg.sender.
    /// @param operator The operator address.
    /// @param approved Whether to approve or revoke.
    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    /// @notice Directly sets a balance for testing.
    /// @param account The account address.
    /// @param tokenId The ERC1155 token ID.
    /// @param amount The balance to set.
    function setBalance(address account, uint256 tokenId, uint256 amount) external {
        balanceOf[account][tokenId] = amount;
    }

    /// @notice Sets the payout per share for a condition (used in redeemPositions).
    /// @param conditionId The condition ID.
    /// @param _payoutPerShare Payout per share in USDC (6 decimals). e.g. 1_000_000 = $1.00/share.
    function setPayoutPerShare(bytes32 conditionId, uint256 _payoutPerShare) external {
        payoutPerShare[conditionId] = _payoutPerShare;
    }

    /// @notice Mints position shares to an account (callable by exchange mock during buys).
    /// @param account The recipient.
    /// @param tokenId The ERC1155 token ID.
    /// @param amount The number of shares to mint.
    function mint(address account, uint256 tokenId, uint256 amount) external {
        balanceOf[account][tokenId] += amount;
    }

    /// @notice ERC1155 safeTransferFrom with approval enforcement.
    /// @dev Matches real CTF: requires from == msg.sender OR isApprovedForAll[from][msg.sender].
    ///      The Polymarket exchange calls this to pull shares from the Safe during sells.
    /// @param from The token holder.
    /// @param to The recipient.
    /// @param id The ERC1155 token ID.
    /// @param amount The number of tokens to transfer.
    /// @param data Additional data (unused).
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        data; // silence unused warning
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "CTF: need operator approval");
        require(balanceOf[from][id] >= amount, "CTF: insufficient balance");
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
    }

    /// @notice Redeems resolved conditional token positions for collateral (USDC).
    /// @dev Faithfully models real CTF: operates on msg.sender's own balance only,
    ///      no approval check needed. Burns ALL shares for each position in indexSets.
    /// @param collateralToken The collateral token (USDC).
    /// @param parentCollectionId Unused (bytes32(0) for root).
    /// @param conditionId The resolved condition ID.
    /// @param indexSets Array of index sets identifying outcomes to redeem.
    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external {
        parentCollectionId; // silence unused warning

        uint256 totalPayout = 0;
        for (uint256 i = 0; i < indexSets.length; i++) {
            // Compute positionId from conditionId and indexSet (simplified mock).
            uint256 positionId = uint256(keccak256(abi.encode(conditionId, indexSets[i])));
            uint256 shares = balanceOf[msg.sender][positionId];
            if (shares > 0) {
                // Burns ALL shares (matches real CTF — no partial redemption).
                balanceOf[msg.sender][positionId] = 0;
                totalPayout += (shares * payoutPerShare[conditionId]) / 1e6;
            }
        }

        // Transfer USDC payout to caller.
        if (totalPayout > 0 && collateralToken != address(0)) {
            MockERC20(collateralToken).transfer(msg.sender, totalPayout);
        }
    }

    /// @notice Kept for backward compatibility with existing tests.
    function setPayoutDenominator(bytes32 conditionId, uint256 denominator) external {
        payoutPerShare[conditionId] = denominator;
    }

    /// @notice Legacy mergePositions (no-op for existing tests).
    function mergePositions(address, bytes32, bytes32, uint256[] calldata, uint256) external {}
}
