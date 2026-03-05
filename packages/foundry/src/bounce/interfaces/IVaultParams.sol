// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct VaultParams {
    /// @notice Unique ID for the Polymarket bet market.
    bytes32 conditionId;

    /// @notice Outcome of the bet. (e.g. 0 = Yes, 1 = No, etc.)
    uint8 outcomeIndex;

    /// @notice ERC-1155 token ID of the outcome position.
    uint256 outcomeTokenId;

    /// @notice The Polymarket exchange contract for the bet.
    address exchange;
}
