// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "lib/solady/src/tokens/ERC20.sol";
import "lib/solady/src/utils/SafeTransferLib.sol";
import "src/TradeData.sol";
import "src/TradeEscrowFactory.sol";

contract TradeEscrow {
    ///// ERRORS /////

    error InvalidAddress();
    error InsufficientBalance();
    error InvalidExpirationTimestamp();
    error AlreadyBought();
    error AlreadySold();
    error NotBoughtYet();
    error NotSoldYet();
    error OnlyFunderOrProposer();
    error TradeExpired();
    error TradeNotExpired();
    error AlreadyWithdrawn();
    error NothingToWithdraw();
    error SwapFailed();
    error InsufficientOutput();

    ///// EVENTS /////

    event BuyPerformed(address indexed funder, uint256 sellIn, uint256 buyOut);
    event SellPerformed(uint256 buyIn, uint256 sellOut);
    event Withdraw(address indexed who, address indexed token, uint256 amount);

    ///// CONSTANTS /////

    // 0x AllowanceHolder on Monad (Cancun hardfork chains)
    address public constant ZERO_X_ALLOWANCE_HOLDER = 0x0000000000001fF3684f28c67538d4D072C22734;

    ///// IMMUTABLES /////

    address public immutable factory;

    ///// STATE /////

    bool public buyPerformed;
    bool public sellPerformed;
    bool public withdrawFunderPerformed;
    bool public withdrawProposerPerformed;

    address public funder;
    uint256 public proposerContribution;
    uint256 public funderContribution;
    uint256 public totalSellIn;
    uint256 public buyTokenAmount;
    uint256 public finalSellAmount;
    uint256 public proposerPayout;
    uint256 public funderPayout;

    ///// INITIALIZATION /////

    constructor(address _factory) {
        factory = _factory;
    }

    ///// INTERNAL SWAP HELPER /////

    /// @notice Execute a swap via 0x protocol
    /// @param tokenIn The token to sell
    /// @param tokenOut The token to buy
    /// @param amountIn The amount of tokenIn to sell
    /// @param amountOutMin The minimum amount of tokenOut to receive
    /// @param swapTarget The 0x Settler contract address (from quote response)
    /// @param swapCallData The swap calldata (from quote response)
    /// @return amountOut The actual amount of tokenOut received
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address swapTarget,
        bytes calldata swapCallData
    ) internal returns (uint256 amountOut) {
        // Record balances before swap
        uint256 tokenInBefore = ERC20(tokenIn).balanceOf(address(this));
        uint256 tokenOutBefore = ERC20(tokenOut).balanceOf(address(this));

        // Approve 0x AllowanceHolder to spend tokenIn
        // Reset to 0 first for USDT-like tokens that require it
        SafeTransferLib.safeApprove(tokenIn, ZERO_X_ALLOWANCE_HOLDER, 0);
        SafeTransferLib.safeApprove(tokenIn, ZERO_X_ALLOWANCE_HOLDER, amountIn);

        // Execute swap via 0x Settler
        (bool success, ) = swapTarget.call(swapCallData);
        if (!success) {
            revert SwapFailed();
        }

        // Calculate balances after swap
        uint256 tokenInAfter = ERC20(tokenIn).balanceOf(address(this));
        uint256 tokenOutAfter = ERC20(tokenOut).balanceOf(address(this));

        // Verify output meets minimum
        amountOut = tokenOutAfter - tokenOutBefore;
        if (amountOut < amountOutMin) {
            revert InsufficientOutput();
        }

        // Reset approval to 0 for safety
        SafeTransferLib.safeApprove(tokenIn, ZERO_X_ALLOWANCE_HOLDER, 0);
    }

    ///// BUY /////

    /// @notice Fund the trade by providing the funder's 80% contribution and executing the buy swap
    /// @param amountOutMin Minimum amount of buyToken to receive (slippage protection)
    /// @param swapTarget The 0x Settler contract address (from quote response)
    /// @param swapCallData The swap calldata (from quote response)
    function buy(
        uint256 amountOutMin,
        address swapTarget,
        bytes calldata swapCallData
    ) external {
        // Fetch trade data from factory
        TradeData memory td = TradeEscrowFactory(factory).getTradeEscrowData(address(this));

        // Check: trade not already bought
        if (buyPerformed) {
            revert AlreadyBought();
        }

        // Check: trade not expired
        if (block.timestamp > td.expirationTimestamp) {
            revert TradeExpired();
        }

        // Calculate contributions (sellAmount is 20%, need to pull 80% from funder)
        proposerContribution = td.sellAmount;
        funderContribution = proposerContribution * 4;
        totalSellIn = proposerContribution + funderContribution;

        // Effects: update state
        buyPerformed = true;
        funder = msg.sender;

        // Interactions: pull funder's 80% contribution
        SafeTransferLib.safeTransferFrom(td.sellToken, msg.sender, address(this), funderContribution);

        // Execute swap via 0x
        buyTokenAmount = _executeSwap(
            td.sellToken,
            td.buyToken,
            totalSellIn,
            amountOutMin,
            swapTarget,
            swapCallData
        );

        emit BuyPerformed(funder, totalSellIn, buyTokenAmount);
    }

    ///// SELL /////

    /// @notice Sell the buyToken back to sellToken and compute payouts
    /// @param amountOutMin Minimum amount of sellToken to receive (slippage protection)
    /// @param swapTarget The 0x Settler contract address (from quote response)
    /// @param swapCallData The swap calldata (from quote response)
    function sell(
        uint256 amountOutMin,
        address swapTarget,
        bytes calldata swapCallData
    ) external {
        // Fetch trade data from factory
        TradeData memory td = TradeEscrowFactory(factory).getTradeEscrowData(address(this));

        // Check: buy has been performed
        if (!buyPerformed) {
            revert NotBoughtYet();
        }

        // Check: not already sold
        if (sellPerformed) {
            revert AlreadySold();
        }

        // Check: only funder or proposer can sell
        if (msg.sender != funder && msg.sender != td.proposer) {
            revert OnlyFunderOrProposer();
        }

        // Effects: update state
        sellPerformed = true;

        // Get current buyToken balance (use actual balance, not stored amount)
        uint256 buyTokenBalance = ERC20(td.buyToken).balanceOf(address(this));

        // Execute swap via 0x
        finalSellAmount = _executeSwap(
            td.buyToken,
            td.sellToken,
            buyTokenBalance,
            amountOutMin,
            swapTarget,
            swapCallData
        );

        // Compute payouts based on profit/loss
        _computePayouts();

        emit SellPerformed(buyTokenBalance, finalSellAmount);
    }

    function _computePayouts() internal {
        // P = proposer's contribution (20%)
        // F = funder's contribution (80%)
        // S = total sell in (P + F = 100%)
        // R = final sell amount (what we got back)

        uint256 P = proposerContribution;
        uint256 S = totalSellIn;
        uint256 R = finalSellAmount;

        if (R >= S) {
            // Profit scenario
            uint256 profit = R - S;
            // Proposer gets 30% of profit (20% share + 10% carry)
            // Funder gets 70% of profit
            // Plus they each get their principal back
            proposerPayout = P + (profit * 30) / 100;
            funderPayout = R - proposerPayout;
        } else {
            // Loss scenario
            uint256 loss = S - R;
            if (loss >= P) {
                // Loss exceeds proposer's contribution - proposer loses everything
                // Funder gets whatever is left
                proposerPayout = 0;
                funderPayout = R;
            } else {
                // Proposer absorbs the loss first
                proposerPayout = P - loss;
                funderPayout = R - proposerPayout;
            }
        }
    }

    ///// WITHDRAW /////

    function withdrawProposer() external {
        // Fetch trade data from factory
        TradeData memory td = TradeEscrowFactory(factory).getTradeEscrowData(address(this));

        // Check: caller is proposer
        if (msg.sender != td.proposer) {
            revert OnlyFunderOrProposer();
        }

        // Check: not already withdrawn
        if (withdrawProposerPerformed) {
            revert AlreadyWithdrawn();
        }

        uint256 amount;

        if (!buyPerformed) {
            // Case A: Buy never happened - proposer can withdraw after expiry
            if (block.timestamp <= td.expirationTimestamp) {
                revert TradeNotExpired();
            }
            amount = td.sellAmount;
        } else if (sellPerformed) {
            // Case B: Sell happened - proposer can withdraw their payout
            if (proposerPayout == 0) {
                revert NothingToWithdraw();
            }
            amount = proposerPayout;
        } else {
            // Buy happened but sell hasn't - proposer can't withdraw yet
            revert NotSoldYet();
        }

        // Effects: update state
        withdrawProposerPerformed = true;

        // Interactions: transfer tokens
        SafeTransferLib.safeTransfer(td.sellToken, td.proposer, amount);

        emit Withdraw(td.proposer, td.sellToken, amount);
    }

    function withdrawFunder() external {
        // Fetch trade data from factory
        TradeData memory td = TradeEscrowFactory(factory).getTradeEscrowData(address(this));

        // Check: caller is funder
        if (msg.sender != funder) {
            revert OnlyFunderOrProposer();
        }

        // Check: not already withdrawn
        if (withdrawFunderPerformed) {
            revert AlreadyWithdrawn();
        }

        // Check: sell has been performed
        if (!sellPerformed) {
            revert NotSoldYet();
        }

        // Check: funder has something to withdraw
        if (funderPayout == 0) {
            revert NothingToWithdraw();
        }

        // Effects: update state
        withdrawFunderPerformed = true;

        // Interactions: transfer tokens
        SafeTransferLib.safeTransfer(td.sellToken, funder, funderPayout);

        emit Withdraw(funder, td.sellToken, funderPayout);
    }
}
