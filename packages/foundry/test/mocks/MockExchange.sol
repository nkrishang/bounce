// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";
import {MockCTF} from "./MockCTF.sol";

/// @title MockExchange
/// @notice Mock Polymarket CTF Exchange for testing Bounce trade execution.
/// @dev Simulates buy/sell operations: pulls USDC on buy and mints CTF shares,
///      burns CTF shares on sell and transfers USDC.
contract MockExchange {
    /// @notice The USDC token used for trading.
    MockERC20 public usdc;

    /// @notice The CTF contract for position tokens.
    MockCTF public ctf;

    /// @notice Price in USDC per share (6 decimals). e.g. 500_000 = $0.50 per share.
    uint256 public pricePerShare;

    /// @notice Creates a MockExchange.
    /// @param _usdc The mock USDC address.
    /// @param _ctf The mock CTF address.
    /// @param _pricePerShare Initial price per share in USDC (6 decimals).
    constructor(address _usdc, address _ctf, uint256 _pricePerShare) {
        usdc = MockERC20(_usdc);
        ctf = MockCTF(_ctf);
        pricePerShare = _pricePerShare;
    }

    /// @notice Updates the price per share for testing different scenarios.
    /// @param _pricePerShare New price per share in USDC (6 decimals).
    function setPrice(uint256 _pricePerShare) external {
        pricePerShare = _pricePerShare;
    }

    /// @notice Simulates buying conditional token shares.
    /// @dev Pulls USDC from caller (Safe), mints CTF position shares to caller.
    ///      The tradeData passed to Bounce.executeTrade should encode a call to this function.
    /// @param positionId The ERC1155 token ID for the position.
    /// @param usdcAmount The amount of USDC to spend.
    function buy(uint256 positionId, uint256 usdcAmount) external {
        // Pull USDC from caller (the Safe).
        usdc.transferFrom(msg.sender, address(this), usdcAmount);

        // Calculate shares minted based on price.
        uint256 shares = (usdcAmount * 1e6) / pricePerShare;

        // Mint CTF position shares to caller (the Safe).
        ctf.mint(msg.sender, positionId, shares);
    }

    /// @notice Simulates selling conditional token shares.
    /// @dev Burns CTF shares from caller (Safe), transfers USDC to caller.
    ///      Requires CTF.setApprovalForAll(exchange, true) to have been called.
    /// @param positionId The ERC1155 token ID for the position.
    /// @param sharesToSell The number of shares to sell.
    function sell(uint256 positionId, uint256 sharesToSell) external {
        // Burn CTF shares from caller (the Safe).
        ctf.burn(msg.sender, positionId, sharesToSell);

        // Calculate USDC proceeds based on current price.
        uint256 usdcProceeds = (sharesToSell * pricePerShare) / 1e6;

        // Transfer USDC to caller (the Safe).
        usdc.transfer(msg.sender, usdcProceeds);
    }
}
