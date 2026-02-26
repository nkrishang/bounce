# Trade Execution Restructuring Plan

## Problem Statement

### What's broken today

`Bounce.executeTrade()` atomically:
1. Transfers USDC from Bounce escrow → Safe
2. Safe approves Polymarket CTF Exchange
3. Safe calls `tradeData` on the Exchange
4. Verifies shares were minted
5. Pulls leftover USDC back
6. Updates accounting

**Step 3 will always revert.** All trading functions on the Polymarket CTF Exchange (`fillOrder`, `fillOrders`, `matchOrders`) are gated by `onlyOperator`. Only Polymarket's matching engine can call them — the Safe cannot.

### Correct Polymarket trading flow

1. Maker (Safe) has USDC balance + allowance set for the Exchange
2. A user signs an EIP-712 order (`maker=Safe`, `signer=proposerEOA`, `signatureType=POLY_GNOSIS_SAFE`) and submits it to the CLOB API
3. Polymarket's operator matches the order off-chain
4. The operator settles on-chain by calling `matchOrders`/`fillOrder` (operator-only)
5. The Exchange pulls USDC from the Safe via `transferFrom` and transfers conditional tokens to the Safe

**Key insight:** The Bounce guard on the Safe only fires on `execTransaction` (owner-driven Safe txs). When the Exchange does `USDC.transferFrom(safe, ...)` during settlement, no guard hook is invoked — settlement is not blocked.

### Solution: Split `executeTrade` into `prepareTrade` + `finalizeTrade`

Replace the single atomic function with a two-phase async flow compatible with Polymarket's operator settlement model.

---

## New End-to-End Flow

| Step | Actor | Action | Where |
|------|-------|--------|-------|
| 1. Propose | Proposer (user) | `proposeBet` — USDC → Bounce escrow | On-chain (unchanged) |
| 2. Fund | Backer (user) | `fundBet` — USDC → Bounce escrow | On-chain (unchanged) |
| 3. Prepare | Backend wallet (automated) | `prepareTrade(betId)` — moves USDC to Safe, sets approvals | On-chain (NEW) |
| 4. Sign & Submit | Proposer (user) | Signs EIP-712 CLOB order, submits via backend proxy | Off-chain (NEW) |
| 5. Settlement | Polymarket operator | Matches order, pulls USDC from Safe, tokens arrive in Safe | On-chain (async) |
| 6. Finalize | Backend wallet (automated) | `finalizeTrade(betId)` — snapshots balances, updates accounting | On-chain (NEW) |

**User actions: only 3 total** — propose, fund, sign order. Everything else is automated.

### Why `prepareTrade` and `finalizeTrade` are permissionless

Both functions take only `betId` as input. All parameters (Safe address, amounts, exchange address) are deterministic from the on-chain bet struct. There is no user-supplied calldata that could be exploited. **Anyone calling them produces the same result**, which means the backend can automate steps 3 and 6.

### Why the proposer signs the CLOB order after funding (not at propose time)

Polymarket nonces are **strictly sequential** per maker (Safe):

```solidity
function isValidNonce(address usr, uint256 nonce) public view returns (bool) {
    return nonces[usr] == nonce; // Must match exactly
}
```

Each proposer has one Safe. If they sign orders for bets A, B, C with nonces 0, 1, 2 at propose time, they must be filled in that exact order. If bet B gets funded first, its order (nonce 1) can't execute because nonce 0 hasn't been consumed yet. Signing at step 4 (after funding + prepare) reads the fresh nonce and avoids this problem.

---

## 1. Contract Changes (`packages/foundry/src/bounce/Bounce.sol`)

### 1.1 Updated BetStatus Enum

```solidity
enum BetStatus {
    None,
    Proposed,
    Funded,
    Prepared,    // NEW: Safe funded + approvals set, awaiting CLOB settlement
    Traded,
    Closed,
    Cancelled,
    Withdrawn
}
```

### 1.2 New Bet Struct Fields

Append to end of `Bet` struct (safe for UUPS upgrade — do NOT insert in the middle):

```solidity
uint256 inFlightUSDC;   // USDC moved to Safe awaiting settlement
uint40 preparedAt;       // timestamp of prepareTrade
```

**Accounting invariants:**
- After funding: `escrowUSDC == totalCapital`, `inFlightUSDC == 0`
- After prepare: `escrowUSDC == 0`, `inFlightUSDC == totalCapital`
- After finalize: `inFlightUSDC == 0`, `escrowUSDC == leftoverUSDC`, `usdcSpent += spent`, `positionShares += sharesDelta`

### 1.3 Concurrency Guard (per Safe)

Since nonces are sequential per maker (Safe), enforce one in-flight prepared trade per Safe:

```solidity
mapping(address => uint256) internal _preparedBetBySafe; // safe => betId (0 = none)
```

Rules:
- `prepareTrade`: require `_preparedBetBySafe[safe] == 0`, then set to `betId`
- `finalizeTrade` and `unprepareTrade`: clear to `0`

This prevents ambiguous USDC accounting when multiple bets share a Safe.

### 1.4 New Events

```solidity
event TradePrepared(uint256 indexed betId, address indexed safe, uint256 amountMoved);
event TradeFinalized(uint256 indexed betId, uint256 usdcSpentDelta, uint256 sharesDelta, uint256 usdcLeftoverReturned);
event TradeUnprepared(uint256 indexed betId, uint256 amountReturned);
```

### 1.5 New Functions

#### A) `prepareTrade(uint256 betId)` — permissionless

```solidity
function prepareTrade(uint256 betId) external nonReentrant {
    Bet storage bet = _bets[betId];

    // Must be Funded
    if (bet.status != BetStatus.Funded) revert InvalidStatus(bet.status, BetStatus.Funded);

    // Must not be expired
    if (bet.expiresAt != 0 && block.timestamp >= bet.expiresAt) revert BetExpired();

    address safe = bet.safe;
    address exchange = bet.exchange;

    // One prepared bet per Safe at a time
    if (_preparedBetBySafe[safe] != 0) revert SafeHasPreparedBet(_preparedBetBySafe[safe]);

    // Verify Safe is properly configured
    _assertSafeReady(safe);

    uint256 amount = bet.escrowUSDC;

    // Step 1: Transfer USDC from Bounce to Safe
    SafeTransferLib.safeTransfer(USDC, safe, amount);

    // Step 2: Safe approves Exchange for USDC spending
    _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.approve.selector, exchange, amount));

    // Step 3: Safe approves Exchange for conditional token transfers (needed for sell/close)
    if (!_ctfApprovalSet[safe][exchange]) {
        _execFromSafe(safe, CTF, abi.encodeWithSelector(
            IERC1155.setApprovalForAll.selector, exchange, true
        ));
        _ctfApprovalSet[safe][exchange] = true;
    }

    // Update accounting
    bet.escrowUSDC = 0;
    bet.inFlightUSDC = amount;
    bet.status = BetStatus.Prepared;
    bet.preparedAt = uint40(block.timestamp);
    _preparedBetBySafe[safe] = betId;

    emit TradePrepared(betId, safe, amount);
}
```

#### B) `finalizeTrade(uint256 betId)` — permissionless

```solidity
function finalizeTrade(uint256 betId) external nonReentrant {
    Bet storage bet = _bets[betId];

    if (bet.status != BetStatus.Prepared) revert InvalidStatus(bet.status, BetStatus.Prepared);

    address safe = bet.safe;
    _assertSafeReady(safe);

    // Snapshot current Safe balances
    uint256 sharesNow = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);
    uint256 usdcNow = IERC20(USDC).balanceOf(safe);

    // Verify shares were received
    uint256 sharesDelta = sharesNow - bet.positionShares;
    if (sharesDelta == 0) revert NoSharesMinted();

    // Compute USDC spent
    uint256 spent = bet.inFlightUSDC - usdcNow;

    // Pull leftover USDC from Safe back to Bounce
    if (usdcNow > 0) {
        _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), usdcNow));
    }

    // Reset USDC approval (hygiene)
    _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.approve.selector, bet.exchange, 0));

    // Update accounting
    bet.usdcSpent += spent;
    bet.positionShares = sharesNow;
    bet.escrowUSDC = usdcNow; // leftover returned to Bounce escrow
    bet.inFlightUSDC = 0;
    bet.status = BetStatus.Traded;
    bet.tradedAt = uint40(block.timestamp);
    _preparedBetBySafe[safe] = 0;

    emit TradeFinalized(betId, spent, sharesDelta, usdcNow);
}
```

#### C) `unprepareTrade(uint256 betId)` — permissionless (escape hatch)

Critical for operational recovery when CLOB orders fail/expire:

```solidity
function unprepareTrade(uint256 betId) external nonReentrant {
    Bet storage bet = _bets[betId];

    if (bet.status != BetStatus.Prepared) revert InvalidStatus(bet.status, BetStatus.Prepared);

    address safe = bet.safe;
    _assertSafeReady(safe);

    // Ensure no shares minted (trade hasn't settled)
    uint256 sharesNow = IConditionalTokensMinimal(CTF).balanceOf(safe, bet.positionId);
    if (sharesNow != bet.positionShares) revert TradeAlreadySettled();

    // Pull all USDC from Safe back to Bounce
    uint256 usdcNow = IERC20(USDC).balanceOf(safe);
    if (usdcNow > 0) {
        _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), usdcNow));
    }

    // Reset USDC approval
    _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.approve.selector, bet.exchange, 0));

    // Update accounting
    bet.escrowUSDC = usdcNow;
    bet.inFlightUSDC = 0;
    bet.status = BetStatus.Funded;
    _preparedBetBySafe[safe] = 0;

    emit TradeUnprepared(betId, usdcNow);
}
```

### 1.6 Deprecate `executeTrade`

Make it revert with a clear error:

```solidity
function executeTrade(uint256, uint256, bytes calldata) external pure {
    revert("executeTrade deprecated: use prepareTrade + finalizeTrade");
}
```

### 1.7 `sellPosition` Consideration

`sellPosition` also calls the exchange directly via `_execFromSafe` — it will fail under `onlyOperator` too. Options:

- **Recommended for now:** Disable `sellPosition` (revert with error). Only allow `redeemPosition` once the market resolves. Pre-resolution exit can be added later with a similar `prepareSell`/`finalizeSell` async pattern.
- **Later:** Mirror the prepare/finalize pattern for sell orders if pre-resolution exit is needed.

### 1.8 New Custom Errors

```solidity
error SafeHasPreparedBet(uint256 existingBetId);
error TradeAlreadySettled();
```

### 1.9 Test Updates (`packages/foundry/test/Bounce.t.sol`)

| Test | What to verify |
|------|---------------|
| `test_prepareTrade_happyPath` | Fund → prepare: Bounce escrow decreases, Safe USDC increases, allowance set, `setApprovalForAll` called, status = Prepared, `_preparedBetBySafe` set |
| `test_prepareTrade_revertIfNotFunded` | Only works from Funded status |
| `test_prepareTrade_revertIfExpired` | Expired bet can't be prepared |
| `test_prepareTrade_revertIfSafeAlreadyPrepared` | Second prepare on same Safe reverts with `SafeHasPreparedBet` |
| `test_finalizeTrade_happyPath` | After prepare + simulated settlement (mint shares to Safe, reduce USDC): correct accounting, status = Traded, leftover returned, mapping cleared |
| `test_finalizeTrade_revertNoShares` | If no shares arrived, reverts `NoSharesMinted` |
| `test_unprepareTrade_happyPath` | Prepared but no settlement: returns USDC to Bounce, status = Funded, mapping cleared |
| `test_unprepareTrade_revertIfSettled` | If shares already arrived, reverts `TradeAlreadySettled` |
| `test_concurrency_perSafe` | Two funded bets on same Safe: prepare first OK, prepare second reverts |

Use MockExchange to simulate settlement (mint shares to Safe, transferFrom USDC from Safe) in tests.

---

## 2. Shared Package Changes

### 2.1 `packages/shared/src/polymarket-types.ts`

#### Updated BetStatus enum

```typescript
export enum BetStatus {
    None = 0,
    Proposed = 1,
    Funded = 2,
    Prepared = 3,    // NEW
    Traded = 4,
    Closed = 5,
    Cancelled = 6,
    Withdrawn = 7,
}
```

#### Updated BetOnchain interface

Add new fields:

```typescript
export interface BetOnchain {
    // ... existing fields ...
    inFlightUSDC: bigint;    // NEW
    preparedAt: number;      // NEW
}
```

#### Update `normalizeBet()`

Add normalization for new fields:

```typescript
inFlightUSDC: raw.inFlightUSDC as bigint,
preparedAt: Number(raw.preparedAt),
```

#### New off-chain trade status type

```typescript
export interface BetTradeState {
    betId: number;
    prepareStatus: 'pending' | 'confirmed' | 'failed';
    prepareTxHash?: string;
    orderId?: string;
    clobStatus?: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED';
    finalizeStatus?: 'pending' | 'confirmed' | 'failed';
    finalizeTxHash?: string;
    lastError?: string;
    updatedAt: string;
}
```

### 2.2 `packages/contracts/src/polymarket-abis.ts`

Add new function ABIs to `BounceAbi`:

```typescript
// prepareTrade
{
    type: 'function',
    name: 'prepareTrade',
    inputs: [{ name: 'betId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
},
// finalizeTrade
{
    type: 'function',
    name: 'finalizeTrade',
    inputs: [{ name: 'betId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
},
// unprepareTrade
{
    type: 'function',
    name: 'unprepareTrade',
    inputs: [{ name: 'betId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
},
```

Add new events:

```typescript
{
    type: 'event',
    name: 'TradePrepared',
    inputs: [
        { name: 'betId', type: 'uint256', indexed: true },
        { name: 'safe', type: 'address', indexed: true },
        { name: 'amountMoved', type: 'uint256', indexed: false },
    ],
},
{
    type: 'event',
    name: 'TradeFinalized',
    inputs: [
        { name: 'betId', type: 'uint256', indexed: true },
        { name: 'usdcSpentDelta', type: 'uint256', indexed: false },
        { name: 'sharesDelta', type: 'uint256', indexed: false },
        { name: 'usdcLeftoverReturned', type: 'uint256', indexed: false },
    ],
},
{
    type: 'event',
    name: 'TradeUnprepared',
    inputs: [
        { name: 'betId', type: 'uint256', indexed: true },
        { name: 'amountReturned', type: 'uint256', indexed: false },
    ],
},
```

Add Exchange nonce ABI (needed for frontend order signing):

```typescript
export const CTFExchangeAbi = [
    {
        type: 'function',
        name: 'nonces',
        inputs: [{ name: 'usr', type: 'address', internalType: 'address' }],
        outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
        stateMutability: 'view',
    },
] as const;
```

Update `getBet` output components to include new fields (`inFlightUSDC`, `preparedAt`).

---

## 3. Backend Changes (`apps/api`)

### 3.1 Trade Orchestrator Service

**New file:** `apps/api/src/services/trade-orchestrator.ts`

Responsibilities:
1. Listen for `BetFunded` events → call `prepareTrade(betId)` via backend signer wallet
2. Listen for CLOB order `CONFIRMED` status → call `finalizeTrade(betId)` via backend signer wallet
3. Detect failed/expired orders → call `unprepareTrade(betId)`

**Implementation details:**
- Runs on server boot as a background process
- Uses viem `publicClient.watchContractEvent` (or polling) for `BetFunded` events
- Backend signer: a dedicated EOA with minimal POL for gas
- Idempotent: always check on-chain `bet.status` before sending tx
- Retry with exponential backoff on RPC errors
- Persist orchestrator state (which bets are being tracked, order IDs, statuses) in database

**State tracking (add to existing DB or new table):**

```sql
CREATE TABLE trade_executions (
    bet_id INTEGER PRIMARY KEY,
    prepare_status TEXT DEFAULT 'pending',  -- pending | confirmed | failed
    prepare_tx_hash TEXT,
    order_id TEXT,
    clob_status TEXT,                       -- MATCHED | MINED | CONFIRMED | RETRYING | FAILED
    finalize_status TEXT,
    finalize_tx_hash TEXT,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 New Environment Variables

```env
BACKEND_SIGNER_PRIVATE_KEY=   # Hot key for backend wallet (minimal funds)
POLYGON_WS_RPC_URL=           # Optional: WebSocket for event watching
```

### 3.3 New API Routes

Add to `apps/api/src/routes/polymarket.routes.ts` (or new `clob.routes.ts`):

#### `POST /polymarket/clob/derive-api-key`

- Input: Proposer's L1 EIP-712 auth signature (signed in frontend)
- Backend derives CLOB API credentials from Polymarket
- Stores credentials keyed by user address (with TTL matching bet expiry)
- Returns: success acknowledgment

#### `POST /polymarket/clob/order`

- Auth: Privy access token (identify proposer)
- Input: `betId`, signed order payload (EIP-712 signature from proposer's Privy wallet)
- Backend validations:
  - Load bet on-chain, ensure `status == Prepared`
  - Ensure `order.maker == bet.safe`
  - Ensure `order.signer == bet.proposer`
  - Ensure `order.tokenId == bet.positionId`
- Forward to CLOB API with HMAC auth headers
- Store `orderId` in `trade_executions` table
- Returns: `{ orderId, status }`

#### `GET /polymarket/clob/order/:orderId`

- Proxies CLOB order status to frontend (no CLOB credentials exposed to browser)
- Returns: `{ orderId, status, size_matched, ... }`

#### `GET /bets/:betId/trade-status`

- Returns combined on-chain + off-chain trade state:
  - On-chain bet status
  - Backend-known orderId + CLOB status
  - Prepare/finalize tx hashes and statuses

### 3.4 CLOB Order Status Polling

The orchestrator polls CLOB order status for all submitted orders:

```
Every 5 seconds:
  For each order in "submitted" state:
    GET /polymarket/clob/order/:orderId
    If CONFIRMED → call finalizeTrade(betId)
    If FAILED → call unprepareTrade(betId)
    If RETRYING → continue polling
```

### 3.5 Settlement Detection (secondary confirmation)

After CLOB says `CONFIRMED`, before calling `finalizeTrade`:
- Query `CTF.balanceOf(safe, positionId)` on-chain
- Verify shares increased vs tracked `bet.positionShares`
- Only then call `finalizeTrade`

This protects against edge cases where CLOB API reports confirmed but on-chain state hasn't been indexed yet.

---

## 4. Frontend Changes (`apps/web`)

### 4.1 New Library: `apps/web/src/lib/polymarket-clob.ts`

EIP-712 order building and signing utilities:

```typescript
// EIP-712 domain for Polymarket CTF Exchange
export function getExchangeDomain(exchangeAddress: Address) {
    return {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: 137,
        verifyingContract: exchangeAddress,
    };
}

// EIP-712 Order type definition
export const ORDER_TYPES = {
    Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
    ],
};

// Build a BUY order for a funded bet
export function buildBuyOrder(params: {
    safe: Address;          // maker
    signer: Address;        // proposer EOA
    tokenId: string;        // outcome token position ID (from metadata)
    usdcAmount: bigint;     // total USDC to spend
    price: number;          // limit price (from order book)
    nonce: bigint;          // from Exchange.nonces(safe)
    expiration: number;     // unix timestamp (bet.expiresAt)
    exchange: Address;      // CTF_EXCHANGE or NEG_RISK_CTF_EXCHANGE
}): Order

// Sign an order with the user's Privy wallet
export async function signOrder(
    walletClient: WalletClient,
    order: Order,
    domain: EIP712Domain,
): Promise<`0x${string}`>

// Generate random salt
export function generateSalt(): bigint
```

### 4.2 New Hook: `apps/web/src/hooks/use-sign-and-submit-order.ts`

Core hook for the proposer's CTA button:

**Steps:** `idle → checking → signing → submitting → polling → confirmed | failed`

```typescript
type Step = 'idle' | 'checking' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';

export function useSignAndSubmitOrder() {
    // ...
    const signAndSubmit = async (betView: BetView) => {
        // 1. checking: Verify bet is Prepared, read fresh nonce from Exchange
        // 2. signing: Build order, sign EIP-712 with Privy wallet
        // 3. submitting: POST to backend /polymarket/clob/order
        // 4. polling: Poll /polymarket/clob/order/:orderId every 3-5s
        // 5. confirmed/failed: Based on CLOB status
    };

    return { signAndSubmit, step, isLoading, error, reset };
}
```

**Error handling:** Use `parseTransactionError` patterns for structured errors with `errorId`, `title`, `message`.

### 4.3 Updated Hook: `apps/web/src/hooks/use-execute-trade.ts`

Replace entirely or repurpose as a thin wrapper that delegates to the backend. The current `useExecuteTrade` is no longer needed since:
- `prepareTrade` is called by the backend
- `finalizeTrade` is called by the backend
- The frontend only handles CLOB order signing

### 4.4 New Hook: `apps/web/src/hooks/use-trade-status.ts`

Polls the backend for combined trade state:

```typescript
export function useTradeStatus(betId: number | undefined) {
    return useQuery({
        queryKey: ['trade-status', betId],
        queryFn: () => api.get<{ data: BetTradeState }>(`/bets/${betId}/trade-status`),
        enabled: betId !== undefined,
        refetchInterval: 5_000,  // poll every 5s while active
    });
}
```

### 4.5 UI Updates: `apps/web/src/components/polymarket/my-bet-card.tsx`

#### New status config entries

```typescript
[BetStatus.Prepared]: {
    label: 'Ready to Trade',
    color: '#f59e0b',  // amber
    bg: 'rgba(245, 158, 11, 0.08)',
    icon: TrendingUp,
},
```

#### New CTA logic

```typescript
const isProposer = address?.toLowerCase() === bet.proposer.toLowerCase();
const showSignOrderCta = bet.status === BetStatus.Prepared && role === 'believer' && isProposer;
const showPreparingIndicator = bet.status === BetStatus.Funded && role === 'believer';
const showAwaitingSettlement = bet.status === BetStatus.Prepared && tradeStatus?.orderId;
```

#### CTA rendering

- **Funded (believer):** "Preparing trade…" spinner (backend is calling `prepareTrade`)
- **Prepared (proposer, no order yet):** CTA button "Place Order" — opens signing flow
- **Prepared (order submitted):** "Awaiting settlement…" with CLOB status indicator (`MATCHED → MINED → CONFIRMED`)
- **Traded:** Existing "Active" view

#### Signing flow UX

Follow the existing stepper pattern from `fund-proposal-modal.tsx`:
1. Step indicator: `Sign Order → Submit → Awaiting Settlement`
2. Liquidity check before signing (reuse `useLiquidityCheck`)
3. Gas preflight NOT needed (signing is off-chain, no gas required from user)
4. Error display with structured errors
5. Success state with auto-transition to "Active" view

### 4.6 Liquidity Check Integration

Before showing the "Place Order" CTA, run the existing `useLiquidityCheck` hook to verify the order can fill. Display:
- ✅ "Market liquidity available — est. avg price X¢" (green)
- ⚠️ "Insufficient market liquidity" (red, disable CTA)
- 🔄 "Checking market liquidity…" (loading)

### 4.7 Query Invalidation

After order confirmed / finalize happens:
- Invalidate `['my-bets']`, `['bet', betId]`, `['trade-status', betId]`
- Invalidate `['walletBalances', address]`

---

## 5. Migration & Deployment

### 5.1 Contract Upgrade (UUPS)

1. Deploy new implementation with `prepareTrade`, `finalizeTrade`, `unprepareTrade`
2. Call `upgradeTo(newImplementation)` via owner
3. No initializer changes needed — only appending new fields/mappings (storage-safe)

### 5.2 Existing Bets

- Bets in `Funded`: can be prepared via `prepareTrade` post-upgrade
- Bets in `Traded`/`Closed`/`Withdrawn`: unaffected
- Bets in `Proposed`: unaffected

### 5.3 Deployment Order

1. Deploy upgraded Bounce contract
2. Update `@bounce/contracts` package (ABIs + addresses if changed)
3. Deploy backend with trade orchestrator (feature-flagged)
4. Deploy frontend with new CTA flow
5. Enable orchestrator feature flag

### 5.4 Monitoring & Alerting

- **Stuck Prepared bets:** Alert if a bet stays in `Prepared` for >30 minutes
- **Failed orders:** Alert on CLOB `FAILED` status, auto-unprepare
- **Backend signer balance:** Alert if POL balance drops below threshold
- **Orchestrator health:** Heartbeat monitoring

---

## 6. Implementation Order & Dependencies

### Phase 1 — Contracts (M)
- [ ] Add `Prepared` status + new Bet fields
- [ ] Add `_preparedBetBySafe` mapping
- [ ] Implement `prepareTrade`, `finalizeTrade`, `unprepareTrade`
- [ ] Deprecate `executeTrade` (revert)
- [ ] Add new events + custom errors
- [ ] Update Foundry tests

**Dependency:** None. Pure Solidity.

### Phase 2 — Shared Packages (S)
- [ ] Update `BetStatus` enum
- [ ] Update `BetOnchain` type + `normalizeBet()`
- [ ] Add `BetTradeState` type
- [ ] Update `@bounce/contracts` ABIs (Bounce + Exchange nonces)

**Dependency:** Contract interface finalized.

### Phase 3 — Backend (L)
- [ ] Add trade orchestrator service (event listener + tx sender)
- [ ] Add CLOB proxy routes (derive API key, submit order, poll status)
- [ ] Add `GET /bets/:betId/trade-status` route
- [ ] Add persistent trade state tracking (DB table)
- [ ] Add backend signer wallet configuration

**Dependency:** Shared packages updated.

### Phase 4 — Frontend (L)
- [ ] Create `polymarket-clob.ts` (EIP-712 helpers)
- [ ] Create `useSignAndSubmitOrder` hook
- [ ] Create `useTradeStatus` hook
- [ ] Update `my-bet-card.tsx` with new CTA flow
- [ ] Update status config for `Prepared` status
- [ ] Remove/replace `useExecuteTrade`

**Dependency:** Backend routes + shared types.

### Phase 5 — Staging & Rollout (M)
- [ ] Deploy upgraded contract
- [ ] Deploy backend with orchestrator
- [ ] Deploy frontend
- [ ] Monitor and iterate

---

## 7. Open Questions / Design Decisions

| Question | Recommendation |
|----------|---------------|
| Should `sellPosition` be disabled now? | Yes — disable and only support `redeemPosition`. Add async sell flow later if needed. |
| Should frontend have a manual "Prepare" fallback? | Yes — hidden behind "Advanced" or shown if backend auto-prepare fails after 60s. |
| CLOB API key storage: per-user or shared backend key? | Per-user (derived from proposer's L1 auth). Backend stores with TTL. |
| Order type for CLOB submission? | FOK (Fill-Or-Kill) for all-or-nothing execution on first attempt. Fall back to FAK if partial fills are acceptable. |
| Tick size handling? | Read from CLOB API per-market. Use exact integer math for order amounts. |
