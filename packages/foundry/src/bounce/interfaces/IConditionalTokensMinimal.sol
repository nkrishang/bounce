// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IConditionalTokensMinimal
/// @notice Minimal interface for Polymarket's Conditional Tokens Framework (CTF).
/// @dev Used by Bounce to query position balances, manage approvals, and redeem positions.
interface IConditionalTokensMinimal {
    /// @notice Returns the balance of a specific ERC1155 token ID for an account.
    /// @param account The address to query.
    /// @param id The ERC1155 token ID (position ID).
    /// @return The token balance.
    function balanceOf(address account, uint256 id) external view returns (uint256);

    /// @notice Sets approval for an operator to manage all of the caller's tokens.
    /// @param operator The address to grant/revoke approval for.
    /// @param approved Whether to approve or revoke.
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Transfers `_value` amount of an `_id` from the `_from` address to the `_to` address specified (with safety call).
    /// @param from Source address
    /// @param to Target address
    /// @param id ID of the token type
    /// @param value Transfer amount
    /// @param data Additional data with no specified format, MUST be sent unaltered in call to `onERC1155Received` on `_to`
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;

    /// @notice Redeems resolved conditional token positions for collateral (USDC).
    /// @param collateralToken The collateral token address (USDC).
    /// @param parentCollectionId The parent collection ID (bytes32(0) for root).
    /// @param conditionId The condition ID of the resolved market.
    /// @param indexSets Array of index sets identifying outcomes to redeem.
    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external;
}
