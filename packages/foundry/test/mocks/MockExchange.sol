// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";
import {MockCTF} from "./MockCTF.sol";

/// @title MockExchange
/// @notice Mock Polymarket CTF Exchange for testing Bounce trade execution.
/// @dev Faithfully models real exchange behavior:
///      - buy: pulls USDC from caller via ERC20 transferFrom, mints CTF shares to caller
///      - sell: pulls CTF shares from caller via ERC1155 safeTransferFrom (requires approval),
///        transfers USDC to caller
///      See: github.com/Polymarket/ctf-exchange — the real exchange uses safeTransferFrom
///      to pull ERC1155 tokens, which requires the seller to have called
///      CTF.setApprovalForAll(exchange, true).
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
    /// @dev Pulls CTF shares from caller (Safe) via safeTransferFrom — requires
    ///      CTF.setApprovalForAll(exchange, true) to have been called by the Safe.
    ///      This matches real Polymarket exchange behavior where the exchange calls
    ///      CTF.safeTransferFrom(seller, exchange, tokenId, amount, "") to pull shares.
    /// @param positionId The ERC1155 token ID for the position.
    /// @param sharesToSell The number of shares to sell.
    function sell(uint256 positionId, uint256 sharesToSell) external {
        // Pull CTF shares from caller (the Safe) via safeTransferFrom.
        // This will revert if CTF.setApprovalForAll(exchange, true) hasn't been called.
        ctf.safeTransferFrom(msg.sender, address(this), positionId, sharesToSell, "");

        // Calculate USDC proceeds based on current price.
        uint256 usdcProceeds = (sharesToSell * pricePerShare) / 1e6;

        // Transfer USDC to caller (the Safe).
        if (usdcProceeds > 0) {
            usdc.transfer(msg.sender, usdcProceeds);
        }
    }
}
