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

    function mint(address to, uint256 usdcAmount, uint256 outcomeTokensAmount, PositionTranche tranche) external returns (uint256 shares) {}

    // ============================================
    // Redeem shares
    // ============================================

    function redeem(address owner, uint256 shares, PositionTranche tranche, address receiver) external returns (uint256 conditionTokenAmount) {
        
    }

    // ============================================
    // Settle exit
    // ============================================

    /// @notice Settles exit proceeds: accounts for tranche PnL split, holds counterparty amount, returns owner amount.
    /// @param owner The position owner exiting.
    /// @param shares The vault shares being redeemed.
    /// @param tranche The tranche of the exiting position.
    /// @param usdcProceeds Total USDC proceeds from the sale.
    /// @return ownerAmount USDC to send to the exiting position owner.
    /// @return counterpartyAmount USDC retained in vault for the counterparty tranche.
    function settleExit(address owner, uint256 shares, PositionTranche tranche, uint256 usdcProceeds)
        external
        returns (uint256 ownerAmount, uint256 counterpartyAmount)
    {}

    // ============================================
    // ERC1155 Receiver
    // ============================================

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
