// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {MockERC20} from "./MockERC20.sol";

/// @title MockCTF
/// @notice Mock Conditional Tokens Framework for testing Bounce.
/// @dev Supports ERC1155-like balanceOf, setApprovalForAll, mint, burn, and redeemPositions.
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

    /// @notice Sets approval for an operator.
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

    /// @notice Mints position shares to an account.
    /// @param account The recipient.
    /// @param tokenId The ERC1155 token ID.
    /// @param amount The number of shares to mint.
    function mint(address account, uint256 tokenId, uint256 amount) external {
        balanceOf[account][tokenId] += amount;
    }

    /// @notice Burns position shares from an account.
    /// @param account The account to burn from.
    /// @param tokenId The ERC1155 token ID.
    /// @param amount The number of shares to burn.
    function burn(address account, uint256 tokenId, uint256 amount) external {
        require(balanceOf[account][tokenId] >= amount, "CTF: insufficient balance");
        balanceOf[account][tokenId] -= amount;
    }

    /// @notice Redeems resolved positions for USDC.
    /// @dev Burns all shares of the specified outcomes and transfers USDC payout to caller.
    ///      For testing: uses payoutPerShare[conditionId] * shares burned.
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
                balanceOf[msg.sender][positionId] = 0;
                totalPayout += (shares * payoutPerShare[conditionId]) / 1e6;
            }
        }

        // Transfer USDC payout to caller.
        if (totalPayout > 0 && collateralToken != address(0)) {
            MockERC20(collateralToken).transfer(msg.sender, totalPayout);
        }
    }

    /// @notice ERC1155 safeTransferFrom (simplified mock).
    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external {}

    /// @notice Kept for backward compatibility with existing tests.
    function setPayoutDenominator(bytes32 conditionId, uint256 denominator) external {
        payoutPerShare[conditionId] = denominator;
    }

    /// @notice Legacy mergePositions (no-op for existing tests).
    function mergePositions(address, bytes32, bytes32, uint256[] calldata, uint256) external {}
}
