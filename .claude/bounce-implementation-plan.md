# Bounce Singleton Contract — Implementation Plan

> Handoff document for implementing the new `Bounce` singleton smart contract that replaces the V2 contracts (ThesisFactoryV2, ThesisManager, ThesisGuardV2, ThesisSettlementV2).

---

## Architecture Overview

One upgradeable singleton contract called **Bounce** that acts as both a **Gnosis Safe Guard** and a **Gnosis Safe Module** for every user's Safe.

- **As Guard**: blindly reverts all direct Safe transactions. The Safe owner cannot do anything through the Safe directly.
- **As Module**: executes transactions on the Safe via `execTransactionFromModule`. All user actions (propose, fund, trade, sell, redeem, withdraw, cancel) are function calls on the Bounce contract.
- **Per-bet USDC escrow**: USDC is held inside the Bounce contract per-bet (not inside the Safe). The Safe is only used as a temporary execution context for Polymarket exchange interactions and holds ERC1155 conditional token positions.

### Why this design

- The Guard blocking everything means the Believer (Safe owner) cannot drain funds, set unauthorized approvals, or interact with arbitrary contracts.
- The Module path lets both Believer and Funder trigger actions (sell, redeem, withdraw), since module execution bypasses Safe owner signature requirements.
- Per-bet escrow inside Bounce solves multi-bet accounting: `usdc.balanceOf(safe)` is no longer used for settlement math. Each bet's `escrowUSDC` is the single source of truth.

### User Onboarding (2 transactions)

1. Deploy Gnosis Safe via Polymarket Safe Factory
2. One MultiSend tx: `enableModule(bounce)` + `setGuard(bounce)`

After this, the Safe is fully locked — all interactions go through Bounce.

---

## Contract Design

### File Structure

```
packages/foundry/src/bounce/
├── Bounce.sol                          # Main singleton contract
├── interfaces/
│   ├── IGnosisSafeMinimal.sol          # Minimal Safe interface for module execution
│   └── IConditionalTokensMinimal.sol   # Minimal CTF interface
packages/foundry/script/
│   └── DeployBounce.s.sol              # Deployment script
packages/foundry/test/
├── Bounce.t.sol                        # Test file
└── mocks/
    ├── MockSafeModule.sol              # Mock Safe supporting module execution
    ├── MockExchange.sol                # Mock Polymarket exchange
    ├── MockERC20.sol                   # Already exists
    └── MockCTF.sol                     # Extend existing mock
```

### Inheritance / Dependencies

Use Solady (already in `packages/foundry/lib/`):

```solidity
import {Ownable} from "solady/auth/Ownable.sol";
import {UUPSUpgradeable} from "solady/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
```

Also implement `IGuard` from `src/thesis/interfaces/IGuard.sol` (or copy into `src/bounce/interfaces/`).

### Constants (Polygon)

```solidity
address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
address public constant CTF  = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;
address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;
address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;
uint256 public constant BPS_DENOMINATOR = 10_000;
bytes4 private constant GUARD_INTERFACE_ID = 0xe6d7a83a; // Safe 1.3.0
```

---

## Core Types

### BetStatus Enum

```solidity
enum BetStatus {
    None,       // default / non-existent
    Proposed,   // proposer deposited their share into Bounce escrow
    Funded,     // funder deposited remaining share; escrow == totalCapital
    Traded,     // capital spent on exchange; safe holds conditional token position
    Closed,     // position fully exited (sold/redeemed); all USDC back in escrow
    Cancelled,  // proposer cancelled before funding; escrow returned
    Withdrawn   // payouts distributed to proposer and funder
}
```

Valid transitions:
```
Proposed → Funded → Traded → Closed → Withdrawn
Proposed → Cancelled
```

### Bet Struct

```solidity
struct Bet {
    // --- Parties ---
    address safe;           // the Gnosis Safe holding positions
    address proposer;       // Believer — Safe owner, puts up first-loss capital
    address funder;         // Backer — funds remaining capital, gets downside protection
    address exchange;       // CTF_EXCHANGE or NEG_RISK_CTF_EXCHANGE

    // --- Market identification ---
    bytes32 conditionId;    // Polymarket condition ID for the market
    uint8 outcomeIndex;     // which outcome (0 = Yes, 1 = No, etc.)
    uint256 indexSet;       // 1 << outcomeIndex (used in redeemPositions)
    uint256 positionId;     // ERC1155 token ID for the outcome position
    bytes32 slugHash;       // keccak256(bytes(slug)) — for off-chain correlation

    // --- Economic parameters ---
    uint256 totalCapital;          // total USDC for the bet (6 decimals)
    uint16 proposerCapitalBps;     // e.g. 2000 (20%)
    uint16 proposerProfitShareBps; // e.g. 3000 (30% of profits to proposer)

    // --- Per-bet accounting ---
    uint256 escrowUSDC;     // USDC currently held in Bounce for this bet
    uint256 usdcSpent;      // cumulative USDC spent buying positions
    uint256 usdcReceived;   // cumulative USDC received from sells/redeems
    uint256 positionShares;  // current ERC1155 position balance attributed to this bet

    // --- Timestamps ---
    uint40 proposedAt;
    uint40 fundedAt;
    uint40 tradedAt;
    uint40 closedAt;
    uint40 withdrawnAt;

    // --- Status ---
    BetStatus status;
}
```

---

## State Variables

```solidity
// --- Bet storage ---
uint256 internal _nextBetId;  // starts at 1 after initialize()
mapping(uint256 => Bet) internal _bets;

// --- Indexes for lookups ---
mapping(address => uint256[]) internal _betsByProposer;
mapping(address => uint256[]) internal _betsByFunder;
mapping(address => uint256[]) internal _betsBySafe;

// --- Active bet uniqueness ---
// Prevents two simultaneous bets on same outcome in same Safe.
// key = keccak256(abi.encode(safe, exchange, conditionId, outcomeIndex))
mapping(bytes32 => uint256) internal _activeBetKeyToId;

// --- Safe-level bookkeeping ---
mapping(address => uint256) internal _activeBetCount;

// --- CTF approval tracking ---
// Tracks whether setApprovalForAll has been called for (safe, exchange)
mapping(address => mapping(address => bool)) internal _ctfApprovalSet;

// --- Upgrade safety ---
uint256[50] private __gap;
```

---

## Events

```solidity
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
    string slug  // full slug emitted in event for off-chain indexing
);
event BetFunded(uint256 indexed betId, address indexed funder, uint256 funderDeposit);
event BetCancelled(uint256 indexed betId);
event TradeExecuted(uint256 indexed betId, uint256 maxSpend, uint256 usdcSpentDelta, uint256 sharesDelta);
event PositionSold(uint256 indexed betId, uint256 sharesSold, uint256 usdcReceived);
event PositionRedeemed(uint256 indexed betId, uint256 usdcReceived);
event BetClosed(uint256 indexed betId, uint256 escrowUSDC);
event BetWithdrawn(uint256 indexed betId, uint256 totalReturned, uint256 proposerAmount, uint256 funderAmount);
event SafeCtfApprovalSet(address indexed safe, address indexed exchange);
```

---

## Custom Errors

```solidity
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
error ActiveBetExists(bytes32 key, uint256 existingBetId);
error NoSharesMinted();
error SlippageExceeded(uint256 received, uint256 minimum);
```

---

## Guard Implementation

### `checkTransaction(...)`

Always revert. This is the entire guard logic:

```solidity
function checkTransaction(
    address, uint256, bytes memory, Operation, uint256, uint256, uint256,
    address, address payable, bytes memory, address
) external pure override {
    revert DirectSafeTxDisabled();
}
```

### `checkAfterExecution(bytes32, bool)`

No-op:

```solidity
function checkAfterExecution(bytes32, bool) external pure override {}
```

### `supportsInterface(bytes4 interfaceId)`

Must return true for both interface IDs (Safe 1.3.0 compatibility):

```solidity
function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
    return interfaceId == type(IGuard).interfaceId || interfaceId == GUARD_INTERFACE_ID;
}
```

---

## Safe Module Execution

### Minimal Safe Interface

Create `IGnosisSafeMinimal.sol`:

```solidity
interface IGnosisSafeMinimal {
    function execTransactionFromModule(
        address to, uint256 value, bytes calldata data, uint8 operation
    ) external returns (bool success);
    function isModuleEnabled(address module) external view returns (bool);
    function isOwner(address owner) external view returns (bool);
}
```

Note: Safe's `execTransactionFromModule` uses `uint8` for operation (0 = Call, 1 = DelegateCall), not the `Operation` enum. Check Safe version for exact signature.

### Internal Helpers

```solidity
/// @notice Validates that the Safe has Bounce installed as module and guard.
function _assertSafeReady(address safe) internal view {
    if (!IGnosisSafeMinimal(safe).isModuleEnabled(address(this))) revert ModuleNotEnabled(safe);
    // Note: getGuard() is not standard on all Safe versions. If unavailable,
    // skip this check or use a storage read on the guard slot.
}

/// @notice Executes a call from the Safe via the module path.
/// @dev Module execution bypasses the Guard — no checkTransaction is called.
function _execFromSafe(address safe, address to, bytes memory data) internal returns (bool) {
    bool ok = IGnosisSafeMinimal(safe).execTransactionFromModule(to, 0, data, 0);
    if (!ok) revert ExecFromModuleFailed(safe, to);
    return ok;
}
```

---

## Function Specifications

### `initialize(address owner_)`

- **Purpose**: Initialize proxy storage and ownership. Called once via proxy constructor.
- **Access**: Callable once (initializer pattern).
- **Steps**:
  1. Call `_initializeOwner(owner_)` (Solady Ownable)
  2. Set `_nextBetId = 1`
- **Errors**: Revert if already initialized.

### `proposeBet(...)`

```solidity
function proposeBet(
    address safe,
    address funder,               // address(0) = open to anyone
    address exchange,             // must be CTF_EXCHANGE or NEG_RISK_CTF_EXCHANGE
    bytes32 conditionId,
    uint8 outcomeIndex,
    uint256 positionId,
    uint256 totalCapital,
    uint16 proposerCapitalBps,
    uint16 proposerProfitShareBps,
    string calldata slug
) external nonReentrant returns (uint256 betId)
```

- **Access**: `msg.sender` must be a Safe owner (`safe.isOwner(msg.sender)`).
- **Preconditions**:
  - `safe != address(0)`, `totalCapital > 0`
  - `exchange` is `CTF_EXCHANGE` or `NEG_RISK_CTF_EXCHANGE`
  - `proposerCapitalBps <= 10000`, `proposerProfitShareBps <= 10000`
  - Safe has Bounce as module and guard (call `_assertSafeReady`)
  - No active bet with same key: `_activeBetKeyToId[keccak256(safe, exchange, conditionId, outcomeIndex)] == 0`
- **Steps**:
  1. Assign `betId = _nextBetId++`
  2. Compute `proposerDeposit = totalCapital * proposerCapitalBps / BPS_DENOMINATOR`
  3. Pull USDC from proposer into Bounce: `SafeTransferLib.safeTransferFrom(USDC, msg.sender, address(this), proposerDeposit)`
  4. Create Bet struct with status `Proposed`, `escrowUSDC = proposerDeposit`, `slugHash = keccak256(bytes(slug))`
  5. Update indexes: `_betsByProposer`, `_betsBySafe`, `_activeBetKeyToId`, `_activeBetCount`
  6. Emit `BetProposed` (include full `slug` string in event)
- **Returns**: `betId`

### `fundBet(uint256 betId)`

- **Access**: If `bet.funder != address(0)`, only that address. Otherwise, any address (first caller becomes funder).
- **Preconditions**: `status == Proposed`
- **Steps**:
  1. Compute `funderDeposit = totalCapital - (totalCapital * proposerCapitalBps / BPS_DENOMINATOR)`
  2. Pull USDC from funder into Bounce: `safeTransferFrom(USDC, msg.sender, address(this), funderDeposit)`
  3. Set `bet.funder = msg.sender` if not already set
  4. Update: `escrowUSDC += funderDeposit`, status = `Funded`, `fundedAt = block.timestamp`
  5. Update `_betsByFunder` index
  6. Emit `BetFunded`

### `cancelBet(uint256 betId)`

- **Access**: proposer only
- **Preconditions**: `status == Proposed`
- **Steps**:
  1. `refundAmount = bet.escrowUSDC`
  2. Set status = `Cancelled`, `escrowUSDC = 0`
  3. Clear `_activeBetKeyToId[key]`, decrement `_activeBetCount[safe]`
  4. Transfer USDC from Bounce to proposer: `safeTransfer(USDC, proposer, refundAmount)`
  5. Emit `BetCancelled`

### `executeTrade(uint256 betId, uint256 maxSpend, bytes calldata tradeData)`

- **Access**: proposer only (prevents funder from submitting malicious trade calldata)
- **Preconditions**: `status == Funded` or `status == Traded`, `maxSpend > 0`, `maxSpend <= bet.escrowUSDC`
- **Steps**:
  1. Transfer `maxSpend` USDC from Bounce to Safe: `safeTransfer(USDC, safe, maxSpend)`
  2. Snapshot `usdcBefore = IERC20(USDC).balanceOf(safe)`, `sharesBefore = ICTF(CTF).balanceOf(safe, positionId)`
  3. Approve exchange from Safe: `_execFromSafe(safe, USDC, approve(exchange, maxSpend))`
  4. Execute trade from Safe: `_execFromSafe(safe, exchange, tradeData)`
  5. Reset approval to 0: `_execFromSafe(safe, USDC, approve(exchange, 0))`
  6. Snapshot `usdcAfter`, `sharesAfter`
  7. Compute: `spent = usdcBefore - usdcAfter` (require no underflow), `sharesDelta = sharesAfter - sharesBefore` (require > 0)
  8. Pull leftover back: if `leftover = maxSpend - spent > 0`, then `_execFromSafe(safe, USDC, transfer(address(this), leftover))`
  9. Update: `escrowUSDC -= spent`, `usdcSpent += spent`, `positionShares += sharesDelta`, status = `Traded` if first trade, set `tradedAt`
  10. Emit `TradeExecuted`

### `sellPosition(uint256 betId, uint256 sharesToSell, uint256 minUsdcOut, bytes calldata sellData)`

- **Access**: proposer OR funder
- **Preconditions**: `status == Traded`, `sharesToSell > 0 && sharesToSell <= bet.positionShares`
- **Steps**:
  1. Ensure CTF approvalForAll is set for (safe, exchange): if `!_ctfApprovalSet[safe][exchange]`, call `_execFromSafe(safe, CTF, setApprovalForAll(exchange, true))` and set flag
  2. Snapshot `usdcBefore`, `sharesBefore`
  3. Execute sell: `_execFromSafe(safe, exchange, sellData)`
  4. Snapshot `usdcAfter`, `sharesAfter`
  5. Compute: `usdcDelta = usdcAfter - usdcBefore` (require ≥ `minUsdcOut`), `sharesDelta = sharesBefore - sharesAfter` (require > 0)
  6. Pull USDC proceeds to Bounce: `_execFromSafe(safe, USDC, transfer(address(this), usdcDelta))`
  7. Update: `escrowUSDC += usdcDelta`, `usdcReceived += usdcDelta`, `positionShares -= sharesDelta`
  8. If `positionShares == 0`: set status = `Closed`, `closedAt = block.timestamp`, emit `BetClosed`
  9. Emit `PositionSold`

### `redeemPosition(uint256 betId)`

- **Access**: proposer OR funder
- **Preconditions**: `status == Traded`
- **Steps**:
  1. Snapshot `usdcBefore`, `sharesBefore`
  2. Call redeem from Safe: `_execFromSafe(safe, CTF, redeemPositions(USDC, bytes32(0), conditionId, [indexSet]))`
  3. Snapshot `usdcAfter`, `sharesAfter`
  4. `usdcDelta = usdcAfter - usdcBefore`
  5. Pull USDC to Bounce: `_execFromSafe(safe, USDC, transfer(address(this), usdcDelta))`
  6. Update: `escrowUSDC += usdcDelta`, `usdcReceived += usdcDelta`, `positionShares = sharesAfter`
  7. If `positionShares == 0`: set status = `Closed`, `closedAt`, emit `BetClosed`
  8. Emit `PositionRedeemed`

### `withdraw(uint256 betId)`

- **Access**: proposer OR funder
- **Preconditions**: `status == Closed`, `positionShares == 0`
- **Steps**:
  1. `totalReturned = bet.escrowUSDC`
  2. Compute capital shares:
     - `proposerCapital = totalCapital * proposerCapitalBps / BPS_DENOMINATOR`
     - `funderCapital = totalCapital - proposerCapital`
  3. **Profit case** (`totalReturned >= totalCapital`):
     - `profit = totalReturned - totalCapital`
     - `proposerProfit = profit * proposerProfitShareBps / BPS_DENOMINATOR`
     - `funderProfit = profit - proposerProfit`
     - `proposerAmount = proposerCapital + proposerProfit`
     - `funderAmount = funderCapital + funderProfit`
  4. **Loss case** (`totalReturned < totalCapital`):
     - `loss = totalCapital - totalReturned`
     - If `loss <= proposerCapital`: proposer absorbs all loss
       - `proposerAmount = proposerCapital - loss`
       - `funderAmount = funderCapital`
     - If `loss > proposerCapital`: proposer wiped out, funder absorbs excess
       - `proposerAmount = 0`
       - `funderLoss = loss - proposerCapital`
       - `funderAmount = funderCapital - funderLoss`
  5. Set: status = `Withdrawn`, `escrowUSDC = 0`, `withdrawnAt = block.timestamp`
  6. Clear `_activeBetKeyToId[key]`, decrement `_activeBetCount[safe]`
  7. Transfer: `safeTransfer(USDC, proposer, proposerAmount)` and `safeTransfer(USDC, funder, funderAmount)`
  8. Emit `BetWithdrawn`

### View Functions

```solidity
function getBet(uint256 betId) external view returns (Bet memory);
function getBetsByProposer(address proposer) external view returns (uint256[] memory);
function getBetsByFunder(address funder) external view returns (uint256[] memory);
function getBetsBySafe(address safe) external view returns (uint256[] memory);
function getActiveBetCount(address safe) external view returns (uint256);
function nextBetId() external view returns (uint256);
```

### Admin / Upgrade Functions

- `_authorizeUpgrade(address newImplementation)` — restricted to `onlyOwner` (Solady pattern)
- Inherited `upgradeToAndCall` from Solady's `UUPSUpgradeable`

### Optional: Sweep Escape Hatch

For recovering tokens accidentally sent directly to the Safe:

```solidity
function sweepSafeToken(address safe, address token, address to, uint256 amount) external nonReentrant
```

- **Access**: `safe.isOwner(msg.sender)`
- **Preconditions**: `_activeBetCount[safe] == 0`
- **Steps**: `_execFromSafe(safe, token, transfer(to, amount))`

---

## Multi-bet Accounting: How It Works

The key insight: **USDC escrow lives in the Bounce contract, not in the Safe.**

```
┌─────────────────────────────────────────────┐
│ Bounce Contract                             │
│                                             │
│  Bet #1: escrowUSDC = 800                   │
│  Bet #2: escrowUSDC = 2000                  │
│  Bet #3: escrowUSDC = 0 (fully traded)      │
│                                             │
│  Total USDC held: 2800                      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ User's Gnosis Safe                          │
│                                             │
│  USDC: 0 (temporary only during trades)     │
│  CTF Position A (Bet #3): 500 shares        │
│  CTF Position B (Bet #1): 200 shares        │
└─────────────────────────────────────────────┘
```

**Trade flow (USDC temporarily enters Safe):**
1. Bounce sends `maxSpend` USDC to Safe
2. Safe approves exchange, executes trade
3. Bounce pulls leftover USDC back from Safe
4. Net: `escrowUSDC` decreases by actual spend, Safe gains position shares

**Sell/Redeem flow (USDC temporarily lands in Safe):**
1. Safe sells position or redeems → USDC lands in Safe
2. Bounce immediately pulls all USDC proceeds back from Safe to escrow
3. Net: `escrowUSDC` increases, position shares decrease

**Withdraw flow (USDC leaves Bounce to users):**
1. `escrowUSDC` is the exact amount available for this bet
2. Split per profit/loss math, transfer directly from Bounce to proposer/funder
3. No interaction with Safe needed

---

## USDC and Token Approval Strategy

### USDC Approvals (Safe → Exchange)

- **Per-trade, exact amount**: On each `executeTrade`, approve the exchange for exactly `maxSpend`, then reset to 0 after the trade completes.
- Never use infinite approvals.
- Sequence: `approve(exchange, maxSpend)` → trade → `approve(exchange, 0)`

### CTF setApprovalForAll (Safe → Exchange)

- Set once per (safe, exchange) pair, on first `sellPosition` call that needs it.
- Track via `_ctfApprovalSet[safe][exchange]` to avoid redundant calls.

---

## Deployment Script

Create `script/DeployBounce.s.sol`:

```solidity
// 1. Deploy Bounce implementation
Bounce impl = new Bounce();

// 2. Deploy ERC1967 proxy pointing to implementation, calling initialize
bytes memory initData = abi.encodeCall(Bounce.initialize, (owner));
ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

// 3. Cast proxy to Bounce
Bounce bounce = Bounce(address(proxy));

// 4. Sanity checks
assert(bounce.owner() == owner);
assert(bounce.nextBetId() == 1);

// 5. Log addresses
console.log("Implementation:", address(impl));
console.log("Proxy (Bounce):", address(proxy));
```

Use Solady's `ERC1967Proxy` or a minimal proxy. For the ERC1967Proxy import, check what's available in the Solady lib version in the repo — if not available, use OpenZeppelin's `ERC1967Proxy` or write a minimal one.

---

## Test Plan

### Mock Contracts Needed

**MockSafeModule** (extends/replaces existing MockSafe):
- Must support `execTransactionFromModule(to, value, data, operation) → bool`
- Must support `isModuleEnabled(address) → bool`
- Must support `isOwner(address) → bool`
- Must support `setGuard(address)` and `enableModule(address)` for setup
- `execTransactionFromModule` should: require module enabled, NOT call guard hooks, execute the call, return success
- `execTransaction` should: call guard's `checkTransaction` (which will revert)

**MockExchange**:
- On "buy" call: pull USDC from caller (Safe), mint CTF position shares to caller
- On "sell" call: burn CTF shares from caller, transfer USDC to caller
- Configurable price/amounts for testing profit/loss scenarios

**MockCTF** (extend existing):
- Must be ERC1155-like: `balanceOf(address, uint256) → uint256`
- Must support `setApprovalForAll(address, bool)`
- Must support `redeemPositions(address, bytes32, bytes32, uint256[])` — burns shares, transfers USDC to caller based on configurable payout
- Must support minting via exchange mock

### Test Categories

#### 1. Initialization & Ownership
- `test_initialize_setsOwnerAndNextBetId`
- `test_initialize_cannotBeCalledTwice`
- `test_transferOwnership`
- `test_renounceOwnership`
- `test_upgrade_onlyOwner`
- `test_upgrade_preservesState` — create a bet, upgrade to V2 impl, verify bet data intact

#### 2. Guard Behavior
- `test_guard_revertsAllDirectSafeTx` — install Bounce as guard, attempt `safe.execTransaction`, expect `DirectSafeTxDisabled`
- `test_guard_supportsInterface` — verify both interface IDs return true
- `test_guard_checkAfterExecution_noop`

#### 3. proposeBet
- `test_proposeBet_happyPath` — correct escrow, status, indexes, event
- `test_proposeBet_revertsIfNotSafeOwner`
- `test_proposeBet_revertsIfModuleNotEnabled`
- `test_proposeBet_revertsIfInvalidExchange`
- `test_proposeBet_revertsIfInvalidBps`
- `test_proposeBet_revertsIfZeroCapital`
- `test_proposeBet_revertsIfActiveBetExists` — same safe/exchange/condition/outcome
- `test_proposeBet_openFunder` — funder = address(0) allowed
- `test_proposeBet_pullsUSDCFromProposer`

#### 4. fundBet
- `test_fundBet_happyPath` — correct escrow = totalCapital, status Funded
- `test_fundBet_openFunder` — first caller becomes funder
- `test_fundBet_revertsIfDesignatedFunderMismatch`
- `test_fundBet_revertsIfNotProposed`
- `test_fundBet_revertsIfAlreadyFunded`

#### 5. cancelBet
- `test_cancelBet_refundsProposer`
- `test_cancelBet_revertsIfNotProposer`
- `test_cancelBet_revertsIfAlreadyFunded`
- `test_cancelBet_clearsActiveKey`

#### 6. executeTrade
- `test_executeTrade_happyPath` — escrow decreases, positionShares increases, status Traded
- `test_executeTrade_leftoverReturnedToEscrow` — maxSpend > actual spent
- `test_executeTrade_revertsIfNotProposer`
- `test_executeTrade_revertsIfExceedsEscrow`
- `test_executeTrade_revertsIfNoSharesMinted`
- `test_executeTrade_revertsIfNotFunded`
- `test_executeTrade_multipleTradesAccumulate` — call executeTrade twice, verify cumulative accounting
- `test_executeTrade_approvalsResetToZero` — verify exchange approval is 0 after trade

#### 7. sellPosition
- `test_sellPosition_happyPath` — escrow increases, shares decrease
- `test_sellPosition_proposerCanSell`
- `test_sellPosition_funderCanSell`
- `test_sellPosition_closesWhenAllSharesSold` — status becomes Closed
- `test_sellPosition_revertsIfSlippage` — usdcReceived < minUsdcOut
- `test_sellPosition_revertsIfNotTraded`
- `test_sellPosition_setsCTFApprovalOnFirstCall`

#### 8. redeemPosition
- `test_redeemPosition_happyPath` — redeems CTF shares to USDC, pulls to escrow
- `test_redeemPosition_closesWhenFullyRedeemed`
- `test_redeemPosition_revertsIfNotTraded`
- `test_redeemPosition_proposerCanRedeem`
- `test_redeemPosition_funderCanRedeem`

#### 9. withdraw (Settlement Math)
- `test_withdraw_profitCase` — 100% profit, verify 30/70 split
- `test_withdraw_profitCase_customBps` — non-default BPS
- `test_withdraw_lossWithinProposerCapital` — proposer absorbs, funder whole
- `test_withdraw_lossExceedsProposerCapital` — proposer gets 0, funder absorbs remainder
- `test_withdraw_breakEven` — totalReturned == totalCapital, each gets their capital back
- `test_withdraw_totalLoss` — totalReturned == 0, both get 0
- `test_withdraw_revertsIfNotClosed`
- `test_withdraw_revertsIfPositionNotEmpty`
- `test_withdraw_revertsIfAlreadyWithdrawn`
- `test_withdraw_revertsIfNotProposerOrFunder`
- `test_withdraw_clearsActiveKeyAndCount`

#### 10. Multi-bet Integration
- `test_multiBet_isolatedAccounting` — two bets on same Safe, different markets; trade/sell/withdraw each independently; verify no cross-contamination
- `test_multiBet_cannotCreateDuplicateActiveBet`
- `test_multiBet_canCreateSameMarketAfterWithdrawal` — after bet is withdrawn, same key can be reused
- `test_multiBet_activeBetCountTracking`

#### 11. Full Lifecycle Integration
- `test_fullLifecycle_profit` — propose → fund → trade → sell → withdraw (profit)
- `test_fullLifecycle_loss` — propose → fund → trade → sell → withdraw (loss)
- `test_fullLifecycle_redeem` — propose → fund → trade → redeem → withdraw
- `test_fullLifecycle_cancel` — propose → cancel

#### 12. Sweep Escape Hatch (if implemented)
- `test_sweep_safeOwnerCanSweepWhenNoBets`
- `test_sweep_revertsIfActiveBets`
- `test_sweep_revertsIfNotSafeOwner`

---

## Upgrade Management

### Deploying a New Implementation

1. Deploy new `BounceV2` implementation contract
2. Call `bounce.upgradeToAndCall(newImpl, "")` from owner

### Storage Compatibility Rules

- **Never reorder or remove existing state variables**
- **Only append** new variables before `__gap`
- Reduce `__gap` size by the number of new slots added
- If modifying the `Bet` struct: never reorder fields, only append new fields at the end
- Write a test that creates bets on V1, upgrades to V2, and verifies all V1 bet data reads correctly

### Recommended: Add a Version Getter

```solidity
function version() external pure returns (string memory) {
    return "1.0.0";
}
```

Update this in each new implementation for easy verification.

---

## Security Considerations

### Reentrancy
- Use `nonReentrant` (Solady's `ReentrancyGuard`) on all state-changing external functions
- Follow checks-effects-interactions pattern: update state before external calls

### Module Execution
- Always verify Safe has Bounce as module before executing
- Always check `execTransactionFromModule` return value — revert on false

### Approval Hygiene
- Reset USDC approvals to 0 after every trade
- Use exact amounts, never infinite approvals

### Upgrade Safety
- `_authorizeUpgrade` restricted to owner
- Consider adding a timelock for production
- Storage gaps for future expansion

### USDC Accounting Invariant
- At all times: `sum(bet.escrowUSDC for all active bets) <= IERC20(USDC).balanceOf(address(this))`
- The Bounce contract should never hold more USDC than the sum of all active escrows (equality may not hold if someone accidentally sends USDC to Bounce directly — those funds are unattributed and inaccessible)
