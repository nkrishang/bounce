// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultParams} from "src/bounce/interfaces/IVaultParams.sol";
import {PositionTranche} from "src/bounce/interfaces/IPosition.sol";

contract BounceVault {
    // ============================================
    // Immutables
    // ============================================

    /// @notice Unique ID for the Polymarket bet market.
    bytes32 conditionId;

    /// @notice Outcome of the bet. (e.g. 0 = Yes, 1 = No, etc.)
    uint8 outcomeIndex;

    /// @notice ERC-1155 token ID of the outcome position.
    uint256 outcomeTokenId;

    /// @notice The Polymarket exchange contract for the bet.
    address exchange;

    // ============================================
    // Constructor
    // ============================================

    constructor(VaultParams memory _vaultParams) {
        conditionId = _vaultParams.conditionId;
        outcomeIndex = _vaultParams.outcomeIndex;
        outcomeTokenId = _vaultParams.outcomeTokenId;
        exchange = _vaultParams.exchange;
    }

    // ============================================
    // Mint shares
    // ============================================

    function mint(address to, uint256 usdcAmount, uint256 outcomeTokensAmount, PositionTranche tranche) external {}
}
