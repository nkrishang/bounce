// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "lib/solady/src/tokens/ERC20.sol";
import "lib/solady/src/utils/SafeTransferLib.sol";
import "src/TradeData.sol";
import "src/TradeEscrowFactory.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

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

    ///// EVENTS /////

    event BuyPerformed(address indexed funder, uint256 sellIn, uint256 buyOut);
    event SellPerformed(uint256 buyIn, uint256 sellOut);
    event Withdraw(address indexed who, address indexed token, uint256 amount);

    ///// CONSTANTS /////

    // Uniswap V3 SwapRouter02 on Monad
    address public constant UNISWAP_V3_ROUTER = 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900;

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

    ///// BUY /////

    function buy(uint256 amountOutMin, uint24 poolFee) external {
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

        // Approve router to spend sell tokens
        SafeTransferLib.safeApprove(td.sellToken, UNISWAP_V3_ROUTER, totalSellIn);

        // Get buyToken balance before swap
        uint256 buyBalanceBefore = ERC20(td.buyToken).balanceOf(address(this));

        // Execute swap via Uniswap V3
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: td.sellToken,
            tokenOut: td.buyToken,
            fee: poolFee,
            recipient: address(this),
            amountIn: totalSellIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(params);

        // Calculate buyToken amount received
        uint256 buyBalanceAfter = ERC20(td.buyToken).balanceOf(address(this));
        buyTokenAmount = buyBalanceAfter - buyBalanceBefore;

        emit BuyPerformed(funder, totalSellIn, buyTokenAmount);
    }

    ///// SELL /////

    function sell(uint256 amountOutMin, uint24 poolFee) external {
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

        // Approve router to spend buyToken
        SafeTransferLib.safeApprove(td.buyToken, UNISWAP_V3_ROUTER, buyTokenBalance);

        // Get sellToken balance before swap
        uint256 sellBalanceBefore = ERC20(td.sellToken).balanceOf(address(this));

        // Execute swap via Uniswap V3
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: td.buyToken,
            tokenOut: td.sellToken,
            fee: poolFee,
            recipient: address(this),
            amountIn: buyTokenBalance,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(params);

        // Calculate sellToken amount received
        uint256 sellBalanceAfter = ERC20(td.sellToken).balanceOf(address(this));
        finalSellAmount = sellBalanceAfter - sellBalanceBefore;

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
            // Proposer gets original 20% + 30% of profit (10% carry + 20% share)
            // Actually per requirements: proposer gets 30% of total return, funder gets 70%
            // Wait, re-reading: "If profit, Bob gets his $20 + $10 carry" for 10% profit
            // $20 is his 20% of $100 profit = $20, plus $10 carry (10% of $100 profit)
            // So proposer gets: 20% of profit + 10% carry = 30% of profit
            // Funder gets: 70% of profit + their original 80% minus the 10% carry to proposer
            // Let me re-read: "Bob gets his $20 + $10 carry, and Alice gets $70"
            // Total $100 profit distributed: Bob $30, Alice $70
            // So proposer gets 30% of profit, funder gets 70% of profit
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
