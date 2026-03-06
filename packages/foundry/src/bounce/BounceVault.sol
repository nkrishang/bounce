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
    uint256 internal constant SENIOR_RATIO = 4; // 80:20 => matched senior = 4x matched junior

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
        // Matched bucket (waterfall: 40/60 profit split, junior-first loss)
        uint256 matchedTokensAssigned;
        uint256 matchedTokensRemaining;
        uint256 matchedSeniorPrincipalRemaining;
        uint256 matchedJuniorPrincipalRemaining;
        // Unmatched bucket (regular bet: 100% to owner, no counterparty)
        uint256 unmatchedTokensAssigned;
        uint256 unmatchedTokensRemaining;
        uint256 unmatchedPrincipalRemaining;
        // Cash
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
    // Internal structs (memory only)
    // ============================================

    struct MatchInfo {
        uint256 sP;
        uint256 jP;
        uint256 totalP;
        uint256 matchedS;
        uint256 matchedJ;
        uint256 matchedP;
        uint256 unmatchedS;
        uint256 unmatchedJ;
        uint256 unmatchedP;
    }

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

        // Compute matched/unmatched deployed NAV parts for this tranche.
        (uint256 sM, uint256 jM, uint256 sU, uint256 jU) = _currentDeployedNAVParts();

        uint256 trancheMatchedNAV = (tranche == PositionTranche.Senior) ? sM : jM;
        uint256 trancheUnmatchedNAV = (tranche == PositionTranche.Senior) ? sU : jU;

        // Pro-rata exit values for the exiting shares.
        uint256 matchedExitValue = FixedPointMathLib.mulDiv(trancheMatchedNAV, shares, tShares);
        uint256 unmatchedExitValue = FixedPointMathLib.mulDiv(trancheUnmatchedNAV, shares, tShares);

        MatchInfo memory m = _matchInfo();

        // --- Matched token assignment (micro-pod via waterfall payout-per-token) ---
        uint256 tokensMatched = 0;
        uint256 matchedSExit = 0;
        uint256 matchedJExit = 0;

        if (matchedExitValue > 0 && lastExecutionPrice > 0 && m.matchedP > 0) {
            uint256 payoutMatched = _matchedPayoutPerToken(tranche, m);
            if (payoutMatched > 0) {
                tokensMatched = FixedPointMathLib.mulDivUp(matchedExitValue, PRICE_SCALE, payoutMatched);
            }
            // Cap at matched token supply.
            uint256 matchedTokensAvail = _bucketTokens(m.matchedP, m.totalP);
            if (tokensMatched > matchedTokensAvail) tokensMatched = matchedTokensAvail;

            // Remove proportional principal from BOTH tranches within matched bucket.
            if (tokensMatched > 0 && matchedTokensAvail > 0) {
                matchedSExit = FixedPointMathLib.mulDiv(m.matchedS, tokensMatched, matchedTokensAvail);
                matchedJExit = FixedPointMathLib.mulDiv(m.matchedJ, tokensMatched, matchedTokensAvail);
                senior.principal -= matchedSExit;
                junior.principal -= matchedJExit;
            }
        }

        // --- Unmatched token assignment (full market price, no counterparty) ---
        uint256 tokensUnmatched = 0;
        uint256 unmatchedExit = 0;

        if (unmatchedExitValue > 0 && lastExecutionPrice > 0) {
            tokensUnmatched = FixedPointMathLib.mulDivUp(unmatchedExitValue, PRICE_SCALE, lastExecutionPrice);

            // Cap at unmatched token supply for this tranche.
            uint256 unmatchedP_tranche = (tranche == PositionTranche.Senior) ? m.unmatchedS : m.unmatchedJ;
            uint256 unmatchedTokensAvail = _bucketTokens(unmatchedP_tranche, m.totalP);
            if (tokensUnmatched > unmatchedTokensAvail) tokensUnmatched = unmatchedTokensAvail;

            // Remove principal only from exiting tranche (no counterparty in unmatched).
            if (tokensUnmatched > 0 && unmatchedTokensAvail > 0) {
                unmatchedExit = FixedPointMathLib.mulDiv(unmatchedP_tranche, tokensUnmatched, unmatchedTokensAvail);
                if (tranche == PositionTranche.Senior) {
                    senior.principal -= unmatchedExit;
                } else {
                    junior.principal -= unmatchedExit;
                }
            }
        }

        conditionTokenAmount = tokensMatched + tokensUnmatched;

        // Cap at actual vault balance.
        uint256 vaultBal = IConditionalTokensMinimal(CTF).balanceOf(address(this), outcomeTokenId);
        if (conditionTokenAmount > vaultBal) conditionTokenAmount = vaultBal;

        // Reserve pro-rata claim on tranche usdcCash.
        uint256 reservedCash = 0;
        if (ts.usdcCash > 0) {
            reservedCash = FixedPointMathLib.mulDiv(ts.usdcCash, shares, tShares);
            ts.usdcCash -= reservedCash;
        }

        // Burn shares.
        shareBalanceOf[owner][tranche] = ownerBal - shares;
        ts.totalShares = tShares - shares;

        // Update total outcome tokens and transfer.
        if (conditionTokenAmount > 0) {
            totalOutcomeTokens -= conditionTokenAmount;
            IConditionalTokensMinimal(CTF)
                .safeTransferFrom(address(this), receiver, outcomeTokenId, conditionTokenAmount, bytes(""));
        }

        // Create pending exit with matched/unmatched buckets.
        pe.active = true;
        pe.owner = owner;
        pe.tranche = tranche;
        pe.receiver = receiver;
        pe.shares = shares;
        pe.matchedTokensAssigned = tokensMatched;
        pe.matchedTokensRemaining = tokensMatched;
        pe.matchedSeniorPrincipalRemaining = matchedSExit;
        pe.matchedJuniorPrincipalRemaining = matchedJExit;
        pe.unmatchedTokensAssigned = tokensUnmatched;
        pe.unmatchedTokensRemaining = tokensUnmatched;
        pe.unmatchedPrincipalRemaining = unmatchedExit;
        pe.reservedCash = reservedCash;
        pe.reservedCashPaid = false;

        pendingExitByReceiver[receiver] = PendingExitRef({owner: owner, tranche: tranche});
    }

    // ============================================
    // Settle exit
    // ============================================

    /// @notice Settles exit proceeds: matched portion uses waterfall split, unmatched goes 100% to owner.
    /// @dev Supports partial fills — can be called multiple times for the same pending exit.
    ///      Sold tokens are allocated pro-rata between matched/unmatched by remaining token counts.
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

        // Cash-only exit (no tokens were assigned in either bucket).
        uint256 totalTokensAssigned = pe.matchedTokensAssigned + pe.unmatchedTokensAssigned;
        if (totalTokensAssigned == 0) {
            if (ownerAmount > 0) SafeTransferLib.safeTransfer(USDC, owner, ownerAmount);
            _clearPendingExit(owner, tranche);
            return (ownerAmount, 0);
        }

        // Infer tokens sold since last settle by checking receiver balance.
        uint256 tokensBefore = pe.matchedTokensRemaining + pe.unmatchedTokensRemaining;
        uint256 tokensNow = IConditionalTokensMinimal(CTF).balanceOf(pe.receiver, outcomeTokenId);
        uint256 tokensSold = tokensBefore > tokensNow ? tokensBefore - tokensNow : 0;

        if (tokensSold > 0) {
            // Update price from this fill.
            if (usdcProceeds > 0) {
                lastExecutionPrice = FixedPointMathLib.mulDiv(usdcProceeds, PRICE_SCALE, tokensSold);
            } else {
                lastExecutionPrice = 0;
            }

            // Allocate sold tokens between matched/unmatched pro-rata by remaining counts.
            uint256 matchedSold = FixedPointMathLib.mulDiv(pe.matchedTokensRemaining, tokensSold, tokensBefore);
            uint256 unmatchedSold = tokensSold - matchedSold;

            // Allocate proceeds pro-rata by sold token counts.
            uint256 matchedProceeds = FixedPointMathLib.mulDiv(usdcProceeds, matchedSold, tokensSold);
            uint256 unmatchedProceeds = usdcProceeds - matchedProceeds;

            // --- Settle matched portion (waterfall) ---
            if (matchedSold > 0 && pe.matchedTokensRemaining > 0) {
                uint256 sPrinSold = FixedPointMathLib.mulDiv(
                    pe.matchedSeniorPrincipalRemaining, matchedSold, pe.matchedTokensRemaining
                );
                uint256 jPrinSold = FixedPointMathLib.mulDiv(
                    pe.matchedJuniorPrincipalRemaining, matchedSold, pe.matchedTokensRemaining
                );

                pe.matchedSeniorPrincipalRemaining -= sPrinSold;
                pe.matchedJuniorPrincipalRemaining -= jPrinSold;
                pe.matchedTokensRemaining -= matchedSold;

                (uint256 sChunk, uint256 jChunk) = _splitProceeds(matchedProceeds, sPrinSold, jPrinSold);

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

            // --- Settle unmatched portion (100% to owner) ---
            if (unmatchedSold > 0 && pe.unmatchedTokensRemaining > 0) {
                uint256 unmatchedPrinSold = FixedPointMathLib.mulDiv(
                    pe.unmatchedPrincipalRemaining, unmatchedSold, pe.unmatchedTokensRemaining
                );
                pe.unmatchedPrincipalRemaining -= unmatchedPrinSold;
                pe.unmatchedTokensRemaining -= unmatchedSold;

                ownerAmount += unmatchedProceeds;
            }
        }

        // Handle dust write-off.
        uint256 totalRemaining = pe.matchedTokensRemaining + pe.unmatchedTokensRemaining;
        if (totalRemaining > 0 && totalRemaining <= DUST_THRESHOLD) {
            // Write off matched dust via waterfall.
            if (pe.matchedTokensRemaining > 0) {
                (uint256 sChunk, uint256 jChunk) =
                    _splitProceeds(0, pe.matchedSeniorPrincipalRemaining, pe.matchedJuniorPrincipalRemaining);

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

            pe.matchedSeniorPrincipalRemaining = 0;
            pe.matchedJuniorPrincipalRemaining = 0;
            pe.matchedTokensRemaining = 0;
            pe.unmatchedPrincipalRemaining = 0;
            pe.unmatchedTokensRemaining = 0;
        }

        // Pay owner.
        if (ownerAmount > 0) SafeTransferLib.safeTransfer(USDC, owner, ownerAmount);

        // Clean up if fully settled.
        if (pe.matchedTokensRemaining + pe.unmatchedTokensRemaining == 0) {
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

    /// @dev Computes 80:20 matching from current principals. Only one side can have unmatched capital.
    function _matchInfo() internal view returns (MatchInfo memory m) {
        m.sP = senior.principal;
        m.jP = junior.principal;
        m.totalP = m.sP + m.jP;
        if (m.totalP == 0) return m;

        if (m.sP < m.jP * SENIOR_RATIO) {
            // Senior is scarce: all senior matched, junior capped at sP/4.
            m.matchedS = m.sP;
            m.matchedJ = m.sP / SENIOR_RATIO;
        } else {
            // Junior is scarce (or balanced): all junior matched, senior capped at jP*4.
            m.matchedJ = m.jP;
            m.matchedS = m.jP * SENIOR_RATIO;
        }

        m.matchedP = m.matchedS + m.matchedJ;
        m.unmatchedS = m.sP - m.matchedS;
        m.unmatchedJ = m.jP - m.matchedJ;
        m.unmatchedP = m.unmatchedS + m.unmatchedJ;
    }

    /// @dev Returns the conceptual token count for a principal bucket (principal-weighted).
    function _bucketTokens(uint256 bucketP, uint256 totalP) internal view returns (uint256) {
        if (totalOutcomeTokens == 0 || bucketP == 0 || totalP == 0) return 0;
        return FixedPointMathLib.mulDiv(totalOutcomeTokens, bucketP, totalP);
    }

    /// @dev Splits deployed value into matched (waterfall) and unmatched (pro-rata) NAV per tranche.
    function _currentDeployedNAVParts()
        internal
        view
        returns (uint256 sMatchedNAV, uint256 jMatchedNAV, uint256 sUnmatchedNAV, uint256 jUnmatchedNAV)
    {
        uint256 dv = _deployedValue();
        MatchInfo memory m = _matchInfo();
        if (dv == 0 || m.totalP == 0) return (0, 0, 0, 0);

        // Split deployed value between matched and unmatched by principal weight.
        uint256 matchedDV = FixedPointMathLib.mulDiv(dv, m.matchedP, m.totalP);
        uint256 unmatchedDV = dv - matchedDV;

        // Matched bucket: waterfall split (40/60 profit, junior-first loss).
        if (matchedDV > 0 && m.matchedP > 0) {
            (sMatchedNAV, jMatchedNAV) = _splitProceeds(matchedDV, m.matchedS, m.matchedJ);
        }

        // Unmatched bucket: pro-rata to the excess side (no tranching).
        if (unmatchedDV > 0 && m.unmatchedP > 0) {
            sUnmatchedNAV = FixedPointMathLib.mulDiv(unmatchedDV, m.unmatchedS, m.unmatchedP);
            jUnmatchedNAV = unmatchedDV - sUnmatchedNAV;
        }
    }

    /// @dev Returns total deployed NAV per tranche (matched + unmatched).
    function _currentDeployedNAVs() internal view returns (uint256 sNAV, uint256 jNAV) {
        (uint256 sM, uint256 jM, uint256 sU, uint256 jU) = _currentDeployedNAVParts();
        sNAV = sM + sU;
        jNAV = jM + jU;
    }

    function _trancheTotalNAV(PositionTranche t) internal view returns (uint256) {
        (uint256 sD, uint256 jD) = _currentDeployedNAVs();
        if (t == PositionTranche.Senior) return sD + senior.usdcCash;
        return jD + junior.usdcCash;
    }

    /// @dev Per-token payout for a tranche within the matched bucket at current price.
    ///      Used to compute the matched micro-pod size in redeem().
    function _matchedPayoutPerToken(PositionTranche t, MatchInfo memory m) internal view returns (uint256) {
        if (lastExecutionPrice == 0 || totalOutcomeTokens == 0 || m.totalP == 0 || m.matchedP == 0) return 0;

        uint256 matchedTokens = _bucketTokens(m.matchedP, m.totalP);
        if (matchedTokens == 0) return 0;

        uint256 sPrinPerToken = FixedPointMathLib.mulDiv(m.matchedS, PRICE_SCALE, matchedTokens);
        uint256 jPrinPerToken = FixedPointMathLib.mulDiv(m.matchedJ, PRICE_SCALE, matchedTokens);
        uint256 totalPrinPerToken = sPrinPerToken + jPrinPerToken;

        // Edge cases within matched bucket (both should be >0 when matchedP>0, but guard anyway).
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
                if (t == PositionTranche.Junior) return 0;
                return lastExecutionPrice;
            } else {
                if (t == PositionTranche.Junior) return jPrinPerToken - lossPerToken;
                return sPrinPerToken;
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
                uint256 totalRemaining = pe.matchedTokensRemaining + pe.unmatchedTokensRemaining;
                if (pe.active && pe.receiver == from && value == totalRemaining) {
                    // Restore tranche state.
                    TrancheState storage ts = _tranche(pe.tranche);
                    ts.totalShares += pe.shares;
                    shareBalanceOf[pe.owner][pe.tranche] += pe.shares;

                    if (!pe.reservedCashPaid && pe.reservedCash > 0) {
                        ts.usdcCash += pe.reservedCash;
                    }

                    // Restore matched pool state (both tranches' principals).
                    senior.principal += pe.matchedSeniorPrincipalRemaining;
                    junior.principal += pe.matchedJuniorPrincipalRemaining;

                    // Restore unmatched principal (only the exiting tranche).
                    if (pe.unmatchedPrincipalRemaining > 0) {
                        if (pe.tranche == PositionTranche.Senior) {
                            senior.principal += pe.unmatchedPrincipalRemaining;
                        } else {
                            junior.principal += pe.unmatchedPrincipalRemaining;
                        }
                    }

                    // Restore total outcome tokens.
                    totalOutcomeTokens += totalRemaining;

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
