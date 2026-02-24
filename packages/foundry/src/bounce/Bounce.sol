// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "solady/auth/Ownable.sol";
import {UUPSUpgradeable} from "solady/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {EnumerableSetLib} from "solady/utils/EnumerableSetLib.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IGuard, Operation} from "../thesis/interfaces/IGuard.sol";
import {IGnosisSafeMinimal} from "./interfaces/IGnosisSafeMinimal.sol";
import {IConditionalTokensMinimal} from "./interfaces/IConditionalTokensMinimal.sol";

/// @title Bounce
/// @notice Upgradeable singleton contract that acts as both a Gnosis Safe Guard and Module.
/// @dev As Guard: blindly reverts all direct Safe transactions — the Safe owner cannot act directly.
///      As Module: executes all operations on the Safe via execTransactionFromModule.
///      Per-bet USDC escrow lives inside this contract, NOT inside the Safe.
contract Bounce is Ownable, UUPSUpgradeable, ReentrancyGuard, IGuard {
    using EnumerableSetLib for EnumerableSetLib.Uint256Set;
    // ============================================
    // Constants (Polygon)
    // ============================================

    /// @notice Polygon USDC address.
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    /// @notice Polymarket Conditional Tokens Framework address.
    address public constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;

    /// @notice Polymarket CTF Exchange address.
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;

    /// @notice Polymarket Neg Risk CTF Exchange address.
    address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;

    /// @notice Basis points denominator (100% = 10,000 BPS).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Guard interface ID that Safe 1.3.0 checks for.
    bytes4 private constant GUARD_INTERFACE_ID = 0xe6d7a83a;

    /// @notice Safe 1.3.0 guard storage slot: keccak256("guard_manager.guard.address").
    uint256 private constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    // ============================================
    // Enums
    // ============================================

    /// @notice Status of a bet through its lifecycle.
    enum BetStatus {
        None, // default / non-existent
        Proposed, // proposer deposited their share into Bounce escrow
        Funded, // funder deposited remaining share; escrow == totalCapital
        Traded, // capital spent on exchange; safe holds conditional token position
        Closed, // position fully exited (sold/redeemed); all USDC back in escrow
        Cancelled, // proposer cancelled before funding; escrow returned
        Withdrawn // payouts distributed to proposer and funder
    }

    // ============================================
    // Structs
    // ============================================

    /// @notice Full state of a single bet.
    struct Bet {
        // --- Parties ---
        address safe; // the Gnosis Safe holding positions
        address proposer; // Believer — Safe owner, puts up first-loss capital
        address funder; // Backer — funds remaining capital, gets downside protection
        address exchange; // CTF_EXCHANGE or NEG_RISK_CTF_EXCHANGE
        // --- Market identification ---
        bytes32 conditionId; // Polymarket condition ID for the market
        uint8 outcomeIndex; // which outcome (0 = Yes, 1 = No, etc.)
        uint256 indexSet; // 1 << outcomeIndex (used in redeemPositions)
        uint256 positionId; // ERC1155 token ID for the outcome position
        bytes32 slugHash; // keccak256(bytes(slug)) — for off-chain correlation
        // --- Economic parameters ---
        uint256 totalCapital; // total USDC for the bet (6 decimals)
        uint16 proposerCapitalBps; // e.g. 2000 (20%)
        uint16 proposerProfitShareBps; // e.g. 3000 (30% of profits to proposer)
        // --- Per-bet accounting ---
        uint256 escrowUSDC; // USDC currently held in Bounce for this bet
        uint256 usdcSpent; // cumulative USDC spent buying positions
        uint256 usdcReceived; // cumulative USDC received from sells/redeems
        uint256 positionShares; // current ERC1155 position balance attributed to this bet
        // --- Timestamps ---
        uint40 proposedAt;
        uint40 fundedAt;
        uint40 tradedAt;
        uint40 closedAt;
        uint40 withdrawnAt;
        uint40 expiresAt;
        // --- Status ---
        BetStatus status;
    }

    // ============================================
    // State Variables
    // ============================================

    /// @notice Auto-incrementing bet ID counter, starts at 1 after initialize().
    uint256 internal _nextBetId;

    /// @notice Mapping from bet ID to Bet struct.
    mapping(uint256 => Bet) internal _bets;

    /// @notice Index: proposer address => set of bet IDs.
    mapping(address => EnumerableSetLib.Uint256Set) internal _betsByProposer;

    /// @notice Index: funder address => set of bet IDs.
    mapping(address => EnumerableSetLib.Uint256Set) internal _betsByFunder;

    /// @notice Index: safe address => set of bet IDs.
    mapping(address => EnumerableSetLib.Uint256Set) internal _betsBySafe;

    /// @notice Prevents two simultaneous bets on same outcome in same Safe.
    /// @dev key = keccak256(abi.encode(safe, exchange, conditionId, outcomeIndex))
    mapping(bytes32 => uint256) internal _activeBetKeyToId;

    /// @notice Number of active (non-withdrawn, non-cancelled) bets per Safe.
    mapping(address => uint256) internal _activeBetCount;

    /// @notice Index: conditionId => set of bet IDs.
    mapping(bytes32 => EnumerableSetLib.Uint256Set) internal _betsByConditionId;

    /// @notice Tracks whether CTF setApprovalForAll has been called for (safe, exchange).
    mapping(address => mapping(address => bool)) internal _ctfApprovalSet;

    /// @notice Storage gap for future upgrades.
    uint256[50] private __gap;

    // ============================================
    // Events
    // ============================================

    event BetProposed(
        uint256 indexed betId,
        address indexed safe,
        address indexed proposer,
        address funder,
        address exchange,
        bytes32 conditionId,
        uint8 outcomeIndex,
        uint256 positionId,
        uint256 totalCapital,
        uint256 proposerDeposit,
        uint40 expiresAt,
        string slug
    );
    event BetFunded(uint256 indexed betId, address indexed funder, uint256 funderDeposit);
    event BetCancelled(uint256 indexed betId);
    event TradeExecuted(uint256 indexed betId, uint256 maxSpend, uint256 usdcSpentDelta, uint256 sharesDelta);
    event PositionSold(uint256 indexed betId, uint256 sharesSold, uint256 usdcReceived);
    event PositionRedeemed(uint256 indexed betId, uint256 usdcReceived);
    event BetClosed(uint256 indexed betId, uint256 escrowUSDC);
    event BetWithdrawn(uint256 indexed betId, uint256 totalReturned, uint256 proposerAmount, uint256 funderAmount);
    event SafeCtfApprovalSet(address indexed safe, address indexed exchange);

    // ============================================
    // Custom Errors
    // ============================================

    error DirectSafeTxDisabled();
    error NotAuthorized();
    error NotProposer();
    error NotFunder();
    error NotProposerOrFunder();
    error InvalidStatus(BetStatus current, BetStatus required);
    error InvalidExchange(address exchange);
    error InvalidBps();
    error ZeroAddress();
    error ZeroAmount();
    error SafeNotOwner(address safe, address caller);
    error ModuleNotEnabled(address safe);
    error GuardNotInstalled(address safe);
    error ExecFromModuleFailed(address safe, address to);
    error PositionNotEmpty(uint256 positionShares);
    error ExceedsEscrow(uint256 requested, uint256 available);
    error ExceedsShares(uint256 requested, uint256 available);
    error ActiveBetExists(bytes32 key, uint256 existingBetId);
    error NoSharesMinted();
    error NoSharesSold();
    error SlippageExceeded(uint256 received, uint256 minimum);
    error BetExpired();
    error InvalidRange(uint256 start, uint256 end);

    // ============================================
    // Initializer
    // ============================================

    /// @notice Initializes the proxy storage and ownership. Called once via proxy constructor.
    /// @param owner_ The initial contract owner.
    function initialize(address owner_) external {
        // Solady's _initializeOwner reverts if already called.
        _initializeOwner(owner_);
        // Bet IDs start at 1 so that 0 means "no bet".
        _nextBetId = 1;
    }

    // ============================================
    // Guard Implementation (IGuard)
    // ============================================

    /// @notice Always reverts — blocks all direct Safe transactions.
    /// @dev This is the entire guard logic. The Safe owner cannot do anything directly.
    function checkTransaction(
        address,
        uint256,
        bytes memory,
        Operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external pure override {
        revert DirectSafeTxDisabled();
    }

    /// @notice No-op post-execution hook.
    function checkAfterExecution(bytes32, bool) external pure override {}

    /// @notice Returns true for both IGuard and Safe 1.3.0 guard interface IDs.
    /// @param interfaceId The interface ID to check.
    /// @return Whether the interface is supported.
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IGuard).interfaceId || interfaceId == GUARD_INTERFACE_ID;
    }

    // ============================================
    // Core Functions
    // ============================================

    /// @notice Proposes a new bet. Proposer deposits their capital share into Bounce escrow.
    /// @param safe The Gnosis Safe that will hold positions.
    /// @param funder The designated funder address (address(0) = open to anyone).
    /// @param exchange Must be CTF_EXCHANGE or NEG_RISK_CTF_EXCHANGE.
    /// @param conditionId Polymarket condition ID for the market.
    /// @param outcomeIndex Which outcome to bet on (0 = Yes, 1 = No, etc.).
    /// @param positionId ERC1155 token ID for the outcome position.
    /// @param totalCapital Total USDC for the bet (6 decimals).
    /// @param proposerCapitalBps Proposer's capital share in BPS (e.g. 2000 = 20%).
    /// @param proposerProfitShareBps Proposer's profit share in BPS (e.g. 3000 = 30%).
    /// @param expiresAt Unix timestamp after which the bet can no longer be funded or traded.
    /// @param slug Human-readable market slug for off-chain indexing.
    /// @return betId The newly created bet ID.
    function proposeBet(
        address safe,
        address funder,
        address exchange,
        bytes32 conditionId,
        uint8 outcomeIndex,
        uint256 positionId,
        uint256 totalCapital,
        uint16 proposerCapitalBps,
        uint16 proposerProfitShareBps,
        uint40 expiresAt,
        string calldata slug
    ) external nonReentrant returns (uint256 betId) {
        // Validate inputs.
        if (safe == address(0)) revert ZeroAddress();
        if (totalCapital == 0) revert ZeroAmount();
        if (exchange != CTF_EXCHANGE && exchange != NEG_RISK_CTF_EXCHANGE) revert InvalidExchange(exchange);
        if (proposerCapitalBps > uint16(BPS_DENOMINATOR) || proposerProfitShareBps > uint16(BPS_DENOMINATOR)) {
            revert InvalidBps();
        }

        // Caller must be a Safe owner.
        if (!IGnosisSafeMinimal(safe).isOwner(msg.sender)) revert SafeNotOwner(safe, msg.sender);

        // Safe must have Bounce enabled as module.
        _assertSafeReady(safe);

        // Prevent duplicate active bets on same outcome in same Safe.
        bytes32 key = keccak256(abi.encode(safe, exchange, conditionId, outcomeIndex));
        if (_activeBetKeyToId[key] != 0) revert ActiveBetExists(key, _activeBetKeyToId[key]);

        // Assign bet ID and increment counter.
        betId = _nextBetId++;

        // Compute proposer's capital deposit.
        uint256 proposerDeposit = (totalCapital * proposerCapitalBps) / BPS_DENOMINATOR;

        // Pull USDC from proposer into Bounce escrow.
        SafeTransferLib.safeTransferFrom(USDC, msg.sender, address(this), proposerDeposit);

        // Create the bet struct.
        _bets[betId] = Bet({
            safe: safe,
            proposer: msg.sender,
            funder: funder,
            exchange: exchange,
            conditionId: conditionId,
            outcomeIndex: outcomeIndex,
            indexSet: uint256(1) << outcomeIndex,
            positionId: positionId,
            slugHash: keccak256(bytes(slug)),
            totalCapital: totalCapital,
            proposerCapitalBps: proposerCapitalBps,
            proposerProfitShareBps: proposerProfitShareBps,
            escrowUSDC: proposerDeposit,
            usdcSpent: 0,
            usdcReceived: 0,
            positionShares: 0,
            proposedAt: uint40(block.timestamp),
            fundedAt: 0,
            tradedAt: 0,
            closedAt: 0,
            withdrawnAt: 0,
            expiresAt: expiresAt,
            status: BetStatus.Proposed
        });

        // Update indexes.
        _betsByProposer[msg.sender].add(betId);
        _betsBySafe[safe].add(betId);
        _betsByConditionId[conditionId].add(betId);
        _activeBetKeyToId[key] = betId;
        _activeBetCount[safe]++;

        emit BetProposed(
            betId,
            safe,
            msg.sender,
            funder,
            exchange,
            conditionId,
            outcomeIndex,
            positionId,
            totalCapital,
            proposerDeposit,
            expiresAt,
            slug
        );
    }

    /// @notice Funds a proposed bet. Funder deposits remaining capital into Bounce escrow.
    /// @param betId The bet ID to fund.
    function fundBet(uint256 betId) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be in Proposed status.
        if (bet.status != BetStatus.Proposed) revert InvalidStatus(bet.status, BetStatus.Proposed);

        // Must not be expired.
        if (bet.expiresAt != 0 && block.timestamp >= bet.expiresAt) revert BetExpired();

        // If funder is designated, only that address can fund. Otherwise, first caller becomes funder.
        if (bet.funder != address(0) && bet.funder != msg.sender) revert NotFunder();
        if (bet.funder == address(0)) {
            bet.funder = msg.sender;
        }

        // Compute funder's deposit (remaining capital after proposer's share).
        uint256 proposerDeposit = (bet.totalCapital * bet.proposerCapitalBps) / BPS_DENOMINATOR;
        uint256 funderDeposit = bet.totalCapital - proposerDeposit;

        // Pull USDC from funder into Bounce escrow.
        SafeTransferLib.safeTransferFrom(USDC, msg.sender, address(this), funderDeposit);

        // Update bet state.
        bet.escrowUSDC += funderDeposit;
        bet.status = BetStatus.Funded;
        bet.fundedAt = uint40(block.timestamp);

        // Update funder index.
        _betsByFunder[msg.sender].add(betId);

        emit BetFunded(betId, msg.sender, funderDeposit);
    }

    /// @notice Cancels a proposed bet before it is funded. Refunds proposer.
    /// @param betId The bet ID to cancel.
    function cancelBet(uint256 betId) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be in Proposed status.
        if (bet.status != BetStatus.Proposed) revert InvalidStatus(bet.status, BetStatus.Proposed);

        // Only proposer can cancel.
        if (msg.sender != bet.proposer) revert NotProposer();

        // Cache refund amount before zeroing.
        uint256 refundAmount = bet.escrowUSDC;

        // Update state before external call (checks-effects-interactions).
        bet.status = BetStatus.Cancelled;
        bet.escrowUSDC = 0;

        // Clear active bet key and decrement count.
        bytes32 key = keccak256(abi.encode(bet.safe, bet.exchange, bet.conditionId, bet.outcomeIndex));
        delete _activeBetKeyToId[key];
        _activeBetCount[bet.safe]--;

        // Refund USDC to proposer.
        SafeTransferLib.safeTransfer(USDC, bet.proposer, refundAmount);

        emit BetCancelled(betId);
    }

    /// @notice Executes a trade on the Polymarket exchange via the Safe module path.
    /// @dev Sends USDC from Bounce to Safe, makes Safe approve & trade, pulls leftover back.
    /// @param betId The bet ID to trade.
    /// @param maxSpend Maximum USDC to spend on this trade.
    /// @param tradeData Encoded exchange calldata (e.g. CTF Exchange buy order).
    function executeTrade(uint256 betId, uint256 maxSpend, bytes calldata tradeData) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be Funded or Traded (allows multiple partial trades).
        if (bet.status != BetStatus.Funded && bet.status != BetStatus.Traded) {
            revert InvalidStatus(bet.status, BetStatus.Funded);
        }

        // Only proposer can execute trades (prevents funder from submitting malicious calldata).
        if (msg.sender != bet.proposer) revert NotProposer();

        // Must not be expired.
        if (bet.expiresAt != 0 && block.timestamp >= bet.expiresAt) revert BetExpired();

        // maxSpend must not exceed available escrow.
        if (maxSpend == 0) revert ZeroAmount();
        if (maxSpend > bet.escrowUSDC) revert ExceedsEscrow(maxSpend, bet.escrowUSDC);

        address safe = bet.safe;
        address exchange = bet.exchange;
        uint256 positionId = bet.positionId;

        // Verify Safe is properly configured (module enabled + guard installed).
        _assertSafeReady(safe);

        // Snapshot Safe balances BEFORE funding to detect baseline.
        uint256 safeUsdcBaseline = IERC20(USDC).balanceOf(safe);
        uint256 sharesBefore = IConditionalTokensMinimal(CTF).balanceOf(safe, positionId);

        // Step 1: Transfer maxSpend USDC from Bounce to Safe.
        SafeTransferLib.safeTransfer(USDC, safe, maxSpend);

        // Step 2: Safe approves exchange for exactly maxSpend.
        _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.approve.selector, exchange, maxSpend));

        // Step 3: Safe executes the trade on the exchange.
        _execFromSafe(safe, exchange, tradeData);

        // Step 4: Reset approval to 0 (approval hygiene).
        _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.approve.selector, exchange, 0));

        // Step 5: Snapshot balances after trade.
        uint256 safeUsdcAfter = IERC20(USDC).balanceOf(safe);
        uint256 sharesAfter = IConditionalTokensMinimal(CTF).balanceOf(safe, positionId);

        // Step 6: Compute actual spend and shares minted.
        // spent = (baseline + maxSpend) - safeUsdcAfter. Safe should not have spent pre-existing USDC.
        uint256 spent = (safeUsdcBaseline + maxSpend) - safeUsdcAfter;
        uint256 sharesDelta = sharesAfter - sharesBefore;
        if (sharesDelta == 0) revert NoSharesMinted();

        // Step 7: Pull leftover USDC back from Safe to Bounce.
        uint256 leftover = safeUsdcAfter - safeUsdcBaseline;
        if (leftover > 0) {
            _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), leftover));
        }

        // Step 8: Update bet accounting.
        bet.escrowUSDC -= spent;
        bet.usdcSpent += spent;
        bet.positionShares += sharesDelta;

        // Transition to Traded on first trade.
        if (bet.status == BetStatus.Funded) {
            bet.status = BetStatus.Traded;
            bet.tradedAt = uint40(block.timestamp);
        }

        emit TradeExecuted(betId, maxSpend, spent, sharesDelta);
    }

    /// @notice Sells conditional token positions on the exchange via the Safe module path.
    /// @dev Makes Safe sell on exchange, pulls USDC proceeds back to Bounce escrow.
    ///      Polymarket uses a CLOB (Central Limit Order Book), so partial fills are expected
    ///      when liquidity is insufficient. Call this function multiple times if needed.
    ///      The bet transitions to Closed only when all position shares are sold.
    /// @param betId The bet ID whose position to sell.
    /// @param minUsdcOut Minimum USDC to receive (slippage protection).
    /// @param sellData Encoded exchange calldata (e.g. CTF Exchange sell order).
    function sellPosition(uint256 betId, uint256 minUsdcOut, bytes calldata sellData) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be in Traded status.
        if (bet.status != BetStatus.Traded) revert InvalidStatus(bet.status, BetStatus.Traded);

        // Only proposer or funder can sell.
        if (msg.sender != bet.proposer && msg.sender != bet.funder) revert NotProposerOrFunder();

        address safe = bet.safe;
        address exchange = bet.exchange;

        // Verify Safe is properly configured (module enabled + guard installed).
        _assertSafeReady(safe);

        // Ensure CTF approval is set for (safe, exchange) — lazy one-time setup.
        if (!_ctfApprovalSet[safe][exchange]) {
            _execFromSafe(
                safe, CTF, abi.encodeWithSelector(IConditionalTokensMinimal.setApprovalForAll.selector, exchange, true)
            );
            _ctfApprovalSet[safe][exchange] = true;
            emit SafeCtfApprovalSet(safe, exchange);
        }

        // Snapshot balances before sell.
        uint256 usdcBefore = IERC20(USDC).balanceOf(safe);
        uint256 sharesBefore = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);

        // Execute sell from Safe.
        _execFromSafe(safe, exchange, sellData);

        // Snapshot balances after sell.
        uint256 usdcAfter = IERC20(USDC).balanceOf(safe);
        uint256 sharesAfter = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);

        // Validate: shares must have decreased.
        uint256 sharesSold = sharesBefore - sharesAfter;
        if (sharesSold == 0) revert NoSharesSold();

        // Validate: shares sold must not exceed tracked position (prevents accounting underflow).
        if (sharesSold > bet.positionShares) revert ExceedsShares(sharesSold, bet.positionShares);

        // Validate: USDC received meets slippage requirement.
        uint256 usdcDelta = usdcAfter - usdcBefore;
        if (usdcDelta < minUsdcOut) revert SlippageExceeded(usdcDelta, minUsdcOut);

        // Pull USDC proceeds from Safe back to Bounce escrow.
        if (usdcDelta > 0) {
            _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), usdcDelta));
        }

        // Update bet accounting using deltas.
        bet.escrowUSDC += usdcDelta;
        bet.usdcReceived += usdcDelta;
        bet.positionShares -= sharesSold;

        emit PositionSold(betId, sharesSold, usdcDelta);

        // If all shares sold, transition to Closed.
        if (bet.positionShares == 0) {
            bet.status = BetStatus.Closed;
            bet.closedAt = uint40(block.timestamp);
            emit BetClosed(betId, bet.escrowUSDC);
        }
    }

    /// @notice Redeems resolved conditional token positions for USDC via the Safe module path.
    /// @dev Calls CTF.redeemPositions from Safe, pulls USDC back to Bounce escrow.
    /// @param betId The bet ID whose position to redeem.
    function redeemPosition(uint256 betId) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be in Traded status.
        if (bet.status != BetStatus.Traded) revert InvalidStatus(bet.status, BetStatus.Traded);

        // Only proposer or funder can redeem.
        if (msg.sender != bet.proposer && msg.sender != bet.funder) revert NotProposerOrFunder();

        address safe = bet.safe;

        // Verify Safe is properly configured (module enabled + guard installed).
        _assertSafeReady(safe);

        // Snapshot balances before redeem.
        uint256 usdcBefore = IERC20(USDC).balanceOf(safe);
        uint256 sharesBefore = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);

        // Build indexSets array for redeemPositions call.
        uint256[] memory indexSets = new uint256[](1);
        indexSets[0] = bet.indexSet;

        // Execute redeemPositions from Safe.
        _execFromSafe(
            safe,
            CTF,
            abi.encodeWithSelector(
                IConditionalTokensMinimal.redeemPositions.selector, USDC, bytes32(0), bet.conditionId, indexSets
            )
        );

        // Snapshot balances after redeem.
        uint256 usdcAfter = IERC20(USDC).balanceOf(safe);
        uint256 sharesAfter = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);

        // Compute deltas.
        uint256 usdcDelta = usdcAfter - usdcBefore;
        uint256 sharesRedeemed = sharesBefore - sharesAfter;

        // Pull USDC proceeds from Safe back to Bounce escrow.
        if (usdcDelta > 0) {
            _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), usdcDelta));
        }

        // Update bet accounting using deltas.
        bet.escrowUSDC += usdcDelta;
        bet.usdcReceived += usdcDelta;
        bet.positionShares -= sharesRedeemed;

        emit PositionRedeemed(betId, usdcDelta);

        // If all shares redeemed, transition to Closed.
        if (bet.positionShares == 0) {
            bet.status = BetStatus.Closed;
            bet.closedAt = uint40(block.timestamp);
            emit BetClosed(betId, bet.escrowUSDC);
        }
    }

    /// @notice Distributes escrowed USDC to proposer and funder based on profit/loss math.
    /// @dev Proposer absorbs losses first (up to their capital). Profits split per BPS.
    /// @param betId The bet ID to withdraw from.
    function withdraw(uint256 betId) external nonReentrant {
        Bet storage bet = _bets[betId];

        // Must be in Closed status.
        if (bet.status != BetStatus.Closed) revert InvalidStatus(bet.status, BetStatus.Closed);

        // Position must be fully exited.
        if (bet.positionShares != 0) revert PositionNotEmpty(bet.positionShares);

        // Only proposer or funder can withdraw.
        if (msg.sender != bet.proposer && msg.sender != bet.funder) revert NotProposerOrFunder();

        // Total USDC available for distribution.
        uint256 totalReturned = bet.escrowUSDC;

        // Compute capital shares.
        uint256 proposerCapital = (bet.totalCapital * bet.proposerCapitalBps) / BPS_DENOMINATOR;
        uint256 funderCapital = bet.totalCapital - proposerCapital;

        uint256 proposerAmount;
        uint256 funderAmount;

        if (totalReturned >= bet.totalCapital) {
            // Profit case: split profits per proposerProfitShareBps.
            uint256 profit = totalReturned - bet.totalCapital;
            uint256 proposerProfit = (profit * bet.proposerProfitShareBps) / BPS_DENOMINATOR;
            uint256 funderProfit = profit - proposerProfit;
            proposerAmount = proposerCapital + proposerProfit;
            funderAmount = funderCapital + funderProfit;
        } else {
            // Loss case: proposer absorbs first, then funder.
            uint256 loss = bet.totalCapital - totalReturned;
            if (loss <= proposerCapital) {
                // Proposer absorbs all loss, funder gets full capital back.
                proposerAmount = proposerCapital - loss;
                funderAmount = funderCapital;
            } else {
                // Proposer wiped out, funder absorbs excess loss.
                proposerAmount = 0;
                uint256 funderLoss = loss - proposerCapital;
                funderAmount = funderCapital - funderLoss;
            }
        }

        // Update state before transfers (checks-effects-interactions).
        bet.status = BetStatus.Withdrawn;
        bet.escrowUSDC = 0;
        bet.withdrawnAt = uint40(block.timestamp);

        // Clear active bet key and decrement count.
        bytes32 key = keccak256(abi.encode(bet.safe, bet.exchange, bet.conditionId, bet.outcomeIndex));
        delete _activeBetKeyToId[key];
        _activeBetCount[bet.safe]--;

        // Transfer USDC to proposer and funder.
        if (proposerAmount > 0) {
            SafeTransferLib.safeTransfer(USDC, bet.proposer, proposerAmount);
        }
        if (funderAmount > 0) {
            SafeTransferLib.safeTransfer(USDC, bet.funder, funderAmount);
        }

        emit BetWithdrawn(betId, totalReturned, proposerAmount, funderAmount);
    }

    /// @notice Sweeps tokens from a Safe when no active bets remain (escape hatch).
    /// @dev Only callable by a Safe owner when activeBetCount is 0.
    /// @param safe The Safe to sweep from.
    /// @param token The token address to sweep.
    /// @param to The recipient address.
    /// @param amount The amount to sweep.
    function sweepSafeToken(address safe, address token, address to, uint256 amount) external nonReentrant {
        // Caller must be a Safe owner.
        if (!IGnosisSafeMinimal(safe).isOwner(msg.sender)) revert SafeNotOwner(safe, msg.sender);

        // No active bets allowed.
        if (_activeBetCount[safe] != 0) revert PositionNotEmpty(_activeBetCount[safe]);

        // Execute transfer from Safe.
        _execFromSafe(safe, token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    // ============================================
    // View Functions
    // ============================================

    /// @notice Returns the full Bet struct for a given bet ID.
    /// @param betId The bet ID to query.
    /// @return The Bet struct.
    function getBet(uint256 betId) external view returns (Bet memory) {
        return _bets[betId];
    }

    /// @notice Returns the number of bet IDs created by a proposer.
    /// @param proposer The proposer address.
    /// @return The number of bets.
    function getBetsByProposerCount(address proposer) external view returns (uint256) {
        return _betsByProposer[proposer].length();
    }

    /// @notice Returns a paginated slice of bet IDs created by a proposer.
    /// @param proposer The proposer address.
    /// @param start The start index (inclusive).
    /// @param end The end index (exclusive).
    /// @return betIds The slice of bet IDs.
    function getBetsByProposer(address proposer, uint256 start, uint256 end)
        external
        view
        returns (uint256[] memory betIds)
    {
        return _paginateSet(_betsByProposer[proposer], start, end);
    }

    /// @notice Returns the number of bet IDs funded by a funder.
    /// @param funder The funder address.
    /// @return The number of bets.
    function getBetsByFunderCount(address funder) external view returns (uint256) {
        return _betsByFunder[funder].length();
    }

    /// @notice Returns a paginated slice of bet IDs funded by a funder.
    /// @param funder The funder address.
    /// @param start The start index (inclusive).
    /// @param end The end index (exclusive).
    /// @return betIds The slice of bet IDs.
    function getBetsByFunder(address funder, uint256 start, uint256 end)
        external
        view
        returns (uint256[] memory betIds)
    {
        return _paginateSet(_betsByFunder[funder], start, end);
    }

    /// @notice Returns the number of bet IDs associated with a Safe.
    /// @param safe The Safe address.
    /// @return The number of bets.
    function getBetsBySafeCount(address safe) external view returns (uint256) {
        return _betsBySafe[safe].length();
    }

    /// @notice Returns a paginated slice of bet IDs associated with a Safe.
    /// @param safe The Safe address.
    /// @param start The start index (inclusive).
    /// @param end The end index (exclusive).
    /// @return betIds The slice of bet IDs.
    function getBetsBySafe(address safe, uint256 start, uint256 end)
        external
        view
        returns (uint256[] memory betIds)
    {
        return _paginateSet(_betsBySafe[safe], start, end);
    }

    /// @notice Returns the number of bet IDs for a given conditionId.
    /// @param conditionId The Polymarket condition ID.
    /// @return The number of bets.
    function getBetsByConditionIdCount(bytes32 conditionId) external view returns (uint256) {
        return _betsByConditionId[conditionId].length();
    }

    /// @notice Returns a paginated slice of bet IDs for a given conditionId.
    /// @param conditionId The Polymarket condition ID.
    /// @param start The start index (inclusive).
    /// @param end The end index (exclusive).
    /// @return betIds The slice of bet IDs.
    function getBetsByConditionId(bytes32 conditionId, uint256 start, uint256 end)
        external
        view
        returns (uint256[] memory betIds)
    {
        return _paginateSet(_betsByConditionId[conditionId], start, end);
    }

    /// @notice Returns the number of active bets for a Safe.
    /// @param safe The Safe address.
    /// @return The active bet count.
    function getActiveBetCount(address safe) external view returns (uint256) {
        return _activeBetCount[safe];
    }

    /// @notice Returns the next bet ID that will be assigned.
    /// @return The next bet ID.
    function nextBetId() external view returns (uint256) {
        return _nextBetId;
    }

    /// @notice Returns the contract version.
    /// @return The version string.
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // ============================================
    // Internal Helpers
    // ============================================

    /// @notice Returns a paginated slice [start, end) from an EnumerableSetLib.Uint256Set.
    /// @param set The set to paginate.
    /// @param start The start index (inclusive).
    /// @param end The end index (exclusive).
    /// @return betIds The slice of values.
    function _paginateSet(EnumerableSetLib.Uint256Set storage set, uint256 start, uint256 end)
        internal
        view
        returns (uint256[] memory betIds)
    {
        uint256 len = set.length();
        if (start > end || end > len) revert InvalidRange(start, end);
        betIds = new uint256[](end - start);
        for (uint256 i = start; i < end; i++) {
            betIds[i - start] = set.at(i);
        }
    }

    /// @notice Validates that the Safe has Bounce installed as both module and guard.
    /// @dev Reads the guard from Safe's isolated keccak storage slot via getStorageAt.
    /// @param safe The Safe address to check.
    function _assertSafeReady(address safe) internal view {
        if (!IGnosisSafeMinimal(safe).isModuleEnabled(address(this))) revert ModuleNotEnabled(safe);
        bytes memory guardData = IGnosisSafeMinimal(safe).getStorageAt(GUARD_STORAGE_SLOT, 1);
        address guard = abi.decode(guardData, (address));
        if (guard != address(this)) revert GuardNotInstalled(safe);
    }

    /// @notice Executes a call from the Safe via the module path.
    /// @dev Module execution bypasses the Guard — no checkTransaction is called.
    /// @param safe The Safe to execute from.
    /// @param to The destination address.
    /// @param data The calldata to execute.
    function _execFromSafe(address safe, address to, bytes memory data) internal {
        bool ok = IGnosisSafeMinimal(safe).execTransactionFromModule(to, 0, data, 0);
        if (!ok) revert ExecFromModuleFailed(safe, to);
    }

    /// @notice Enables Solady's double-initialization guard for _initializeOwner.
    /// @return guard Always returns true to prevent re-initialization.
    function _guardInitializeOwner() internal pure override returns (bool guard) {
        return true;
    }

    /// @notice Authorizes proxy upgrades — restricted to owner.
    /// @param newImplementation The new implementation address.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
