// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum PositionStatus {
    Prepared,
    Purchased,
    Sold
}

enum PositionTranche {
    Junior,
    Senior
}

struct Position {
    /// @notice The owner of the Polymarket gnosis safe of the position.
    address owner;

    /// @notice The Polymarket gnosis safe owner of the position.
    address safe;

    /// @notice Unique ID for the Polymarket bet market.
    bytes32 conditionId;

    /// @notice Outcome of the bet. (e.g. 0 = Yes, 1 = No, etc.)
    uint8 outcomeIndex;

    /// @notice ERC-1155 token ID of the outcome position.
    uint256 outcomeTokenId;

    /// @notice The Polymarket exchange contract for the bet.
    address exchange;

    /// @notice The bounce vault for the Polymarket market outcome.
    address vault;

    /// @notice The USDC allowance afforded to the exchange of the market outcome.
    uint256 prePurchaseUsdcAllowance;

    /// @notice The safe condition token balance before purchasing market outcome tokens.
    uint256 prePurchaseConditionTokenBalance;

    /// @notice The condition tokens purchased.
    uint256 actualConditionTokensPurchased;

    /// @notice The USDC reserved for purchasing position.
    uint256 reservedUsdcSpendAmount;

    /// @notice The USDC actually spent in purchasing position.
    uint256 actualUsdcSpendAmount;

    /// @notice The status of the position in relation to outcome token purchase.
    PositionStatus status;

    /// @notice The tranche of the position in relation to the bounce vault.
    PositionTranche tranche;
}
