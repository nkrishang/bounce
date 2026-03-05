// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultParams} from "src/bounce/interfaces/IVaultParams.sol";
import {PositionTranche} from "src/bounce/interfaces/IPosition.sol";
import {IConditionalTokensMinimal} from "src/bounce/interfaces/IConditionalTokensMinimal.sol";
import {SafeTransferLib} from "lib/solady/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "lib/solady/src/utils/FixedPointMathLib.sol";

contract BounceVault {
    // ============================================
    // Constants
    // ============================================

    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address public constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;

    uint256 internal constant PRICE_SCALE = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant SENIOR_PROFIT_BPS = 4_000; // 40%
    uint256 internal constant DUST_THRESHOLD = 10_000;

    // ============================================
    // Errors
    // ============================================

    error Unauthorized();
    error InvalidAmount();
    error InsufficientShares();
    error PendingExitExists();
    error NoPendingExit();
    error PendingExitShareMismatch();

    // ============================================
    // Immutables
    // ============================================

    address public immutable bounceV2;

    bytes32 public immutable conditionId;
    uint8 public immutable outcomeIndex;
    uint256 public immutable outcomeTokenId;
    address public immutable exchange;

    // ============================================
    // Storage
    // ============================================

    struct TrancheState {
        uint256 totalShares;
        uint256 principal;
        uint256 usdcCash;
    }

    TrancheState public senior;
    TrancheState public junior;

    uint256 public totalOutcomeTokens;
    uint256 public lastExecutionPrice;

    mapping(address owner => mapping(PositionTranche tranche => uint256)) public shareBalanceOf;

    struct PendingExit {
        bool active;
        address owner;
        PositionTranche tranche;
        address receiver;
        uint256 shares;
        uint256 tokensAssigned;
        uint256 tokensRemaining;
        uint256 seniorPrincipalRemaining;
        uint256 juniorPrincipalRemaining;
        uint256 reservedCash;
        bool reservedCashPaid;
    }

    mapping(address owner => mapping(PositionTranche tranche => PendingExit)) internal pendingExits;

    struct PendingExitRef {
        address owner;
        PositionTranche tranche;
    }

    mapping(address receiver => PendingExitRef) internal pendingExitByReceiver;

    // ============================================
    // Constructor
    // ============================================

    constructor(VaultParams memory _vaultParams) {
        bounceV2 = msg.sender;
        conditionId = _vaultParams.conditionId;
        outcomeIndex = _vaultParams.outcomeIndex;
        outcomeTokenId = _vaultParams.outcomeTokenId;
        exchange = _vaultParams.exchange;
    }

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyBounceV2() {
        if (msg.sender != bounceV2) revert Unauthorized();
        _;
    }

    // ============================================
    // Mint shares
    // ============================================

    function mint(address to, uint256 usdcAmount, uint256 outcomeTokensAmount, PositionTranche tranche)
        external
        onlyBounceV2
        returns (uint256 shares)
    {
        if (to == address(0) || usdcAmount == 0 || outcomeTokensAmount == 0) revert InvalidAmount();

        TrancheState storage ts = _tranche(tranche);

        // Update price BEFORE computing NAV so new depositors buy shares at the current
        // market price, not the stale price from a prior trade.
        lastExecutionPrice = FixedPointMathLib.mulDiv(usdcAmount, PRICE_SCALE, outcomeTokensAmount);

        uint256 nav = _trancheTotalNAV(tranche);

        if (ts.totalShares == 0 || nav == 0) {
            shares = usdcAmount;
        } else {
            shares = FixedPointMathLib.mulDiv(usdcAmount, ts.totalShares, nav);
            if (shares == 0) revert InvalidAmount();
        }

        ts.totalShares += shares;
        shareBalanceOf[to][tranche] += shares;

        ts.principal += usdcAmount;
        totalOutcomeTokens += outcomeTokensAmount;
    }

    // ============================================
    // Redeem shares
    // ============================================

    function redeem(address owner, uint256 shares, PositionTranche tranche, address receiver)
        external
        onlyBounceV2
        returns (uint256 conditionTokenAmount)
    {
        if (owner == address(0) || receiver == address(0) || shares == 0) revert InvalidAmount();

        PendingExit storage pe = pendingExits[owner][tranche];
        if (pe.active) revert PendingExitExists();

        TrancheState storage ts = _tranche(tranche);
        uint256 ownerBal = shareBalanceOf[owner][tranche];
        if (shares > ownerBal) revert InsufficientShares();

        uint256 tShares = ts.totalShares;
        if (tShares == 0) revert InsufficientShares();

        // Compute deployed NAV claim for the exiting shares.
        uint256 trancheDeployed = _trancheDeployedNAV(tranche);
        uint256 deployedExitValue = FixedPointMathLib.mulDiv(trancheDeployed, shares, tShares);

        // Convert deployed NAV to micro-pod token count.
        // The exiting tranche only receives their SHARE of sale proceeds (via _splitProceeds),
        // so we must sell enough tokens that the tranche's split equals deployedExitValue.
        // tokens = deployedExitValue / tranchePayoutPerToken
        if (lastExecutionPrice > 0 && deployedExitValue > 0) {
            uint256 payoutPerToken = _tranchePayoutPerToken(tranche);
            if (payoutPerToken > 0) {
                conditionTokenAmount = FixedPointMathLib.mulDivUp(deployedExitValue, PRICE_SCALE, payoutPerToken);
            }
            // Cap at actual vault balance.
            uint256 vaultBal = IConditionalTokensMinimal(CTF).balanceOf(address(this), outcomeTokenId);
            if (conditionTokenAmount > vaultBal) conditionTokenAmount = vaultBal;
        }

        // Reserve pro-rata claim on tranche usdcCash.
        uint256 reservedCash = 0;
        if (ts.usdcCash > 0) {
            reservedCash = FixedPointMathLib.mulDiv(ts.usdcCash, shares, tShares);
            ts.usdcCash -= reservedCash;
        }

        // Burn shares.
        shareBalanceOf[owner][tranche] = ownerBal - shares;
        ts.totalShares = tShares - shares;

        // Remove proportional principal from BOTH tranches (unified pool model).
        uint256 sPrincipalExit = 0;
        uint256 jPrincipalExit = 0;

        if (conditionTokenAmount > 0 && totalOutcomeTokens > 0) {
            sPrincipalExit = FixedPointMathLib.mulDiv(senior.principal, conditionTokenAmount, totalOutcomeTokens);
            jPrincipalExit = FixedPointMathLib.mulDiv(junior.principal, conditionTokenAmount, totalOutcomeTokens);

            senior.principal -= sPrincipalExit;
            junior.principal -= jPrincipalExit;
            totalOutcomeTokens -= conditionTokenAmount;

            // Transfer tokens to receiver (Safe).
            IConditionalTokensMinimal(CTF)
                .safeTransferFrom(address(this), receiver, outcomeTokenId, conditionTokenAmount, bytes(""));
        }

        // Create pending exit.
        pe.active = true;
        pe.owner = owner;
        pe.tranche = tranche;
        pe.receiver = receiver;
        pe.shares = shares;
        pe.tokensAssigned = conditionTokenAmount;
        pe.tokensRemaining = conditionTokenAmount;
        pe.seniorPrincipalRemaining = sPrincipalExit;
        pe.juniorPrincipalRemaining = jPrincipalExit;
        pe.reservedCash = reservedCash;
        pe.reservedCashPaid = false;

        pendingExitByReceiver[receiver] = PendingExitRef({owner: owner, tranche: tranche});
    }

    // ============================================
    // Settle exit
    // ============================================

    /// @notice Settles exit proceeds: accounts for tranche PnL split, holds counterparty amount, returns owner amount.
    /// @dev Supports partial fills — can be called multiple times for the same pending exit.
    ///      Pro-rates PnL split by tokens sold since last settle, not by shares.
    function settleExit(address owner, uint256 shares, PositionTranche tranche, uint256 usdcProceeds)
        external
        onlyBounceV2
        returns (uint256 ownerAmount, uint256 counterpartyAmount)
    {
        PendingExit storage pe = pendingExits[owner][tranche];
        if (!pe.active) revert NoPendingExit();
        if (pe.shares != shares) revert PendingExitShareMismatch();

        // Pay reserved tranche cash on first call.
        if (!pe.reservedCashPaid) {
            ownerAmount += pe.reservedCash;
            pe.reservedCash = 0;
            pe.reservedCashPaid = true;
        }

        // Cash-only exit (no tokens were assigned).
        if (pe.tokensAssigned == 0) {
            if (ownerAmount > 0) SafeTransferLib.safeTransfer(USDC, owner, ownerAmount);
            _clearPendingExit(owner, tranche);
            return (ownerAmount, 0);
        }

        // Infer tokens sold since last settle by checking receiver balance.
        uint256 tokensBefore = pe.tokensRemaining;
        uint256 tokensNow = IConditionalTokensMinimal(CTF).balanceOf(pe.receiver, outcomeTokenId);
        uint256 tokensSold = tokensBefore > tokensNow ? tokensBefore - tokensNow : 0;

        if (tokensSold > 0) {
            // Update price from this fill.
            if (usdcProceeds > 0) {
                lastExecutionPrice = FixedPointMathLib.mulDiv(usdcProceeds, PRICE_SCALE, tokensSold);
            } else {
                lastExecutionPrice = 0;
            }

            // Pro-rate principal sold from remaining exit principals.
            uint256 sPrinSold = FixedPointMathLib.mulDiv(pe.seniorPrincipalRemaining, tokensSold, tokensBefore);
            uint256 jPrinSold = FixedPointMathLib.mulDiv(pe.juniorPrincipalRemaining, tokensSold, tokensBefore);

            pe.seniorPrincipalRemaining -= sPrinSold;
            pe.juniorPrincipalRemaining -= jPrinSold;
            pe.tokensRemaining = tokensNow;

            // Split proceeds by tranching rules.
            (uint256 sChunk, uint256 jChunk) = _splitProceeds(usdcProceeds, sPrinSold, jPrinSold);

            if (tranche == PositionTranche.Senior) {
                ownerAmount += sChunk;
                counterpartyAmount += jChunk;
                junior.usdcCash += jChunk;
            } else {
                ownerAmount += jChunk;
                counterpartyAmount += sChunk;
                senior.usdcCash += sChunk;
            }
        }

        // Handle dust write-off.
        if (pe.tokensRemaining > 0 && pe.tokensRemaining <= DUST_THRESHOLD) {
            (uint256 sChunk, uint256 jChunk) =
                _splitProceeds(0, pe.seniorPrincipalRemaining, pe.juniorPrincipalRemaining);

            pe.seniorPrincipalRemaining = 0;
            pe.juniorPrincipalRemaining = 0;
            pe.tokensRemaining = 0;

            if (tranche == PositionTranche.Senior) {
                ownerAmount += sChunk;
                counterpartyAmount += jChunk;
                junior.usdcCash += jChunk;
            } else {
                ownerAmount += jChunk;
                counterpartyAmount += sChunk;
                senior.usdcCash += sChunk;
            }
        }

        // Pay owner.
        if (ownerAmount > 0) SafeTransferLib.safeTransfer(USDC, owner, ownerAmount);

        // Clean up if fully settled.
        if (pe.tokensRemaining == 0) {
            _clearPendingExit(owner, tranche);
        }
    }

    // ============================================
    // Internal helpers
    // ============================================

    function _tranche(PositionTranche t) internal view returns (TrancheState storage) {
        return t == PositionTranche.Senior ? senior : junior;
    }

    function _deployedValue() internal view returns (uint256) {
        if (totalOutcomeTokens == 0 || lastExecutionPrice == 0) return 0;
        return FixedPointMathLib.mulDiv(totalOutcomeTokens, lastExecutionPrice, PRICE_SCALE);
    }

    function _currentDeployedNAVs() internal view returns (uint256 sNAV, uint256 jNAV) {
        uint256 dv = _deployedValue();
        uint256 sP = senior.principal;
        uint256 jP = junior.principal;
        uint256 totalP = sP + jP;

        if (totalP == 0) return (0, 0);

        if (dv >= totalP) {
            uint256 delta = dv - totalP;
            uint256 sGain = FixedPointMathLib.mulDiv(delta, SENIOR_PROFIT_BPS, BPS);
            sNAV = sP + sGain;
            jNAV = dv - sNAV;
        } else {
            uint256 loss = totalP - dv;
            if (loss >= jP) {
                jNAV = 0;
                sNAV = dv;
            } else {
                jNAV = jP - loss;
                sNAV = dv - jNAV;
            }
        }
    }

    function _trancheTotalNAV(PositionTranche t) internal view returns (uint256) {
        (uint256 sD, uint256 jD) = _currentDeployedNAVs();
        if (t == PositionTranche.Senior) return sD + senior.usdcCash;
        return jD + junior.usdcCash;
    }

    function _trancheDeployedNAV(PositionTranche t) internal view returns (uint256) {
        (uint256 sD, uint256 jD) = _currentDeployedNAVs();
        return t == PositionTranche.Senior ? sD : jD;
    }

    /// @dev Returns the per-token payout for a tranche at current price, used to compute micro-pod size.
    ///      This is the inverse of _splitProceeds: how much USDC per token the tranche would receive
    ///      if tokens were sold at lastExecutionPrice.
    function _tranchePayoutPerToken(PositionTranche t) internal view returns (uint256) {
        if (totalOutcomeTokens == 0 || lastExecutionPrice == 0) return 0;

        // Per-token principal for each tranche (scaled by PRICE_SCALE).
        uint256 sPrinPerToken = FixedPointMathLib.mulDiv(senior.principal, PRICE_SCALE, totalOutcomeTokens);
        uint256 jPrinPerToken = FixedPointMathLib.mulDiv(junior.principal, PRICE_SCALE, totalOutcomeTokens);
        uint256 totalPrinPerToken = sPrinPerToken + jPrinPerToken;

        // Single-tranche edge cases: if counterparty has no principal, exiting tranche gets everything.
        if (sPrinPerToken == 0 && t == PositionTranche.Junior) return lastExecutionPrice;
        if (jPrinPerToken == 0 && t == PositionTranche.Senior) return lastExecutionPrice;

        if (lastExecutionPrice >= totalPrinPerToken) {
            // Profit regime.
            uint256 deltaPerToken = lastExecutionPrice - totalPrinPerToken;
            uint256 sGainPerToken = FixedPointMathLib.mulDiv(deltaPerToken, SENIOR_PROFIT_BPS, BPS);
            if (t == PositionTranche.Senior) {
                return sPrinPerToken + sGainPerToken;
            } else {
                return jPrinPerToken + (deltaPerToken - sGainPerToken);
            }
        } else {
            // Loss regime: junior absorbs first.
            uint256 lossPerToken = totalPrinPerToken - lastExecutionPrice;
            if (lossPerToken >= jPrinPerToken) {
                // Junior wiped.
                if (t == PositionTranche.Junior) return 0;
                return lastExecutionPrice; // Senior gets whatever remains.
            } else {
                // Junior absorbs partial loss.
                if (t == PositionTranche.Junior) return jPrinPerToken - lossPerToken;
                return sPrinPerToken; // Senior untouched.
            }
        }
    }

    /// @dev Splits proceeds between senior and junior for a chunk with given cost basis.
    ///      Profit: senior gets principal + 40% of gain. Junior gets principal + 60% of gain.
    ///      Loss: junior absorbs first. Senior protected until junior wiped.
    ///      If one tranche has no principal in the chunk, the other gets everything.
    function _splitProceeds(uint256 proceeds, uint256 sPrin, uint256 jPrin)
        internal
        pure
        returns (uint256 sAmount, uint256 jAmount)
    {
        uint256 totalPrin = sPrin + jPrin;

        if (totalPrin == 0) return (0, 0);
        if (sPrin == 0) return (0, proceeds);
        if (jPrin == 0) return (proceeds, 0);

        if (proceeds >= totalPrin) {
            uint256 delta = proceeds - totalPrin;
            uint256 sGain = FixedPointMathLib.mulDiv(delta, SENIOR_PROFIT_BPS, BPS);
            sAmount = sPrin + sGain;
            jAmount = proceeds - sAmount;
        } else {
            uint256 loss = totalPrin - proceeds;
            if (loss >= jPrin) {
                jAmount = 0;
                sAmount = proceeds;
            } else {
                jAmount = jPrin - loss;
                sAmount = proceeds - jAmount;
            }
        }
    }

    function _clearPendingExit(address owner, PositionTranche tranche) internal {
        address receiver = pendingExits[owner][tranche].receiver;
        delete pendingExitByReceiver[receiver];
        delete pendingExits[owner][tranche];
    }

    // ============================================
    // ERC1155 Receiver
    // ============================================

    /// @dev Handles cancellation: when tokens are returned from a receiver with an active pending exit,
    ///      restores shares, principal, totalOutcomeTokens, and reserved cash.
    function onERC1155Received(address, address from, uint256 id, uint256 value, bytes calldata)
        external
        returns (bytes4)
    {
        if (msg.sender == CTF && id == outcomeTokenId) {
            PendingExitRef storage ref = pendingExitByReceiver[from];
            if (ref.owner != address(0)) {
                PendingExit storage pe = pendingExits[ref.owner][ref.tranche];
                if (pe.active && pe.receiver == from && value == pe.tokensRemaining) {
                    // Restore tranche state.
                    TrancheState storage ts = _tranche(pe.tranche);
                    ts.totalShares += pe.shares;
                    shareBalanceOf[pe.owner][pe.tranche] += pe.shares;

                    if (!pe.reservedCashPaid && pe.reservedCash > 0) {
                        ts.usdcCash += pe.reservedCash;
                    }

                    // Restore pool state.
                    senior.principal += pe.seniorPrincipalRemaining;
                    junior.principal += pe.juniorPrincipalRemaining;
                    totalOutcomeTokens += pe.tokensRemaining;

                    // Clear pending exit.
                    delete pendingExitByReceiver[from];
                    delete pendingExits[ref.owner][ref.tranche];
                }
            }
        }
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
