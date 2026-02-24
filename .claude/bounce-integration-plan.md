# Bounce Frontend-Backend Integration Plan

> Full rewrite of the app around the Bounce singleton smart contract for Polymarket prediction markets. The old ERC-20 token trading project (home page, trade escrows, token swaps) is deprecated and can be freely deleted/replaced.

---

## Architecture Shift

**Before:** Proposal = JSON row in `apps/api/data/proposals.json` + V2 contract calls + USDC in Safe  
**After:** Bet = Bounce on-chain state (source of truth) + Postgres metadata for off-chain fields + USDC escrowed in Bounce contract

**Key invariant:** Once Bounce is installed as Guard on a Safe, **all direct Safe transactions revert**. Every Safe interaction must go through Bounce module calls. The `execSafeTransaction` helper in `lib/safe.ts` can ONLY be used for the initial onboarding configuration (before guard is set).

## What Gets Deleted

The old ERC-20 token trading project is deprecated. The following can be freely removed/replaced:

**API routes & services (delete):**
- `routes/trade.routes.ts`, `routes/swap.routes.ts`, `routes/token.routes.ts` — old escrow/swap/token endpoints
- `services/trade.service.ts`, `services/token.service.ts`, `services/trending.service.ts` — old ERC-20 logic
- `services/proposal.service.ts` — JSON file storage (replaced by Postgres + on-chain)
- `routes/proposal.routes.ts` — old proposal CRUD
- `data/proposals.json` — file-based storage

**Web pages & components (delete):**
- `app/create-trade/`, `app/my-trades/`, `app/trade/` — old ERC-20 pages
- `components/create-trade-form.tsx`, `create-trade-modal.tsx`, `invest-content.tsx`, `invest-modal.tsx`, `sell-modal.tsx` — old modals
- `components/trade-card.tsx`, `trade-grid.tsx`, `trade-row.tsx`, `trade-proposal-card.tsx`, `trade-proposals-carousel.tsx`, `my-trade-card.tsx` — old cards
- `components/token-avatar.tsx`, `token-selector.tsx`, `token-slot-machine.tsx`, `trending-tokens-table.tsx` — token UI
- `components/contribution-input.tsx`, `hero-section.tsx` — old home page
- `app/page.tsx` — old home page (replace with redirect to `/polymarket` or new landing)

**Web hooks (delete):**
- `use-create-trade.ts`, `use-fund-trade.ts`, `use-sell-trade.ts`, `use-withdraw.ts` — old escrow hooks
- `use-create-thesis.ts`, `use-fund-thesis.ts` — old V2 contract hooks  
- `use-place-order.ts` — incomplete CLOB stub (replaced by Stream F)
- `use-token.ts`, `use-token-list.ts`, `use-verify-token.ts`, `use-position-value.ts` — old token hooks

**Web lib (delete):**
- `lib/safe.ts` — `execSafeTransaction` (direct Safe tx; incompatible after Bounce guard install)
- `lib/trade-cache.ts`, `lib/trade-math.ts` — old trade math

**Shared types (replace):**
- `types.ts` — `TradeData`, `TradeEscrowState`, `TradeView`, `TradeStatus`, `TokenMeta`, `TradeMetadata` all get deleted
- `polymarket-types.ts` — `ProposalStatus`, `Proposal` get replaced with new Bounce types

**Contracts package (clean up):**
- `abis.ts`, `addresses.ts` — old `TradeEscrowFactoryAbi`, `TradeEscrowAbi`, `ADDRESSES_BY_CHAIN` (keep Polymarket ABIs/addresses)
- `chain.ts` — keep, but can simplify to Polygon-only if desired

**Keep:**
- `routes/polymarket.routes.ts` — Gamma API proxy (keep and extend)
- `routes/health.routes.ts` — health check
- `lib/redis.ts`, `lib/cache.ts`, `lib/logger.ts`, `lib/viem.ts` — infrastructure (keep, update viem.ts)
- `hooks/use-auth.ts`, `hooks/use-wallet.ts`, `hooks/use-polymarket-markets.ts`, `hooks/use-proposals.ts` (refactor) — auth/data hooks
- `lib/api.ts`, `lib/transaction.ts`, `lib/polymarket-safe.ts`, `lib/utils.ts` — utilities
- `components/polymarket/*` — refactor these
- `components/navbar.tsx`, `components/providers.tsx`, `components/wallet-modal.tsx`, `components/empty-state.tsx`, `components/countdown-timer.tsx`, `components/how-it-works-modal.tsx`, `components/linkify-text.tsx` — shared UI
- `app/polymarket/page.tsx`, `app/my-bets/page.tsx` — main pages (refactor)
- `shared/utils.ts`, `shared/zero-x.ts`, `shared/constants.ts` — utilities (update constants)

---

## Stream A — Contracts Package + Shared Types (Foundation)

**Goal:** Make Bounce first-class in `@bounce/contracts` and align all shared types/constants.

### A1. Add Bounce ABI + Address

- Generate `BounceAbi` from the Foundry artifacts (`packages/foundry/out/Bounce.sol/Bounce.json`) and export from `packages/contracts/src/polymarket-abis.ts`
- Add `BOUNCE` proxy address to `packages/contracts/src/polymarket-addresses.ts`
- Add `NEG_RISK_CTF_EXCHANGE` address (`0xC5d563A36AE78145C45a50134d48A1215220f80a`) to addresses
- Add Safe `enableModule` and `isModuleEnabled` to `GnosisSafeAbi`

### A2. Fix USDC Address Mismatch

- **Critical:** `Bounce.sol` uses `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (USDC.e on Polygon)
- `packages/shared/src/constants.ts` has Polygon USDC as `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (native USDC)
- `packages/contracts/src/polymarket-addresses.ts` correctly uses `0x2791...`
- **Action:** Unify to `0x2791...` everywhere — this is what Polymarket and Bounce use

### A3. Define New Shared Types

In `packages/shared/src/polymarket-types.ts`:

```typescript
// Mirror contract enum
export enum BetStatus {
  None = 0,
  Proposed = 1,
  Funded = 2,
  Traded = 3,
  Closed = 4,
  Cancelled = 5,
  Withdrawn = 6,
}

// On-chain bet struct (from Bounce.getBet)
export interface BetOnchain {
  safe: Address;
  proposer: Address;
  funder: Address;
  exchange: Address;
  conditionId: `0x${string}`;
  outcomeIndex: number;
  indexSet: bigint;
  positionId: bigint;
  slugHash: `0x${string}`;
  totalCapital: bigint;
  proposerCapitalBps: number;
  proposerProfitShareBps: number;
  escrowUSDC: bigint;
  usdcSpent: bigint;
  usdcReceived: bigint;
  positionShares: bigint;
  proposedAt: number;
  fundedAt: number;
  tradedAt: number;
  closedAt: number;
  withdrawnAt: number;
  expiresAt: number;
  status: BetStatus;
}

// Off-chain metadata (stored in Postgres)
export interface BetMetadata {
  chainId: number;
  betId: number;
  slug: string;
  conditionId: string;
  outcomeIndex: number;
  outcomeTokenId: string;  // CLOB token ID
  isYesOutcome: boolean;
  marketQuestion: string;
  marketImage?: string;
  outcomePrice: string;
  createdAt: string;
  updatedAt: string;
}

// Combined view for UI
export interface BetView {
  betId: number;
  bet: BetOnchain;
  metadata?: BetMetadata;
}
```

### A4. Remove/Deprecate Old Types

- Mark `ProposalStatus`, `Proposal` types as `@deprecated` (don't delete yet — Stream H)

**Depends on:** Nothing  
**Blocks:** All other streams

---

## Stream B — Safe Onboarding Refactor

**Goal:** Replace "deploy Guard V2 + set Guard" with "configure Safe to use Bounce as Module + Guard", idempotent.

### B1. Implement Readiness Checks

In `apps/web/src/lib/polymarket-safe.ts`, add:

```typescript
export async function isBounceModuleEnabled(publicClient, safeAddress): Promise<boolean>
export async function isBounceGuardInstalled(publicClient, safeAddress): Promise<boolean>
```

- Module check: call `isModuleEnabled(BOUNCE_ADDRESS)` on the Safe
- Guard check: call `getStorageAt(safe, GUARD_STORAGE_SLOT)` and compare to Bounce address
  - Guard storage slot: `0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8`

### B2. Implement `ensureSafeReady`

```typescript
export async function ensureSafeReady(walletClient, publicClient, ownerAddress): Promise<Address> {
  // 1. Derive safe address
  // 2. Deploy if not deployed (existing deployPolySafe)
  // 3. Check if module enabled — if not, execSafeTransaction(enableModule(BOUNCE))
  // 4. Check if guard installed — if not, execSafeTransaction(setGuard(BOUNCE))
  //    ⚠️ Must set guard LAST — after guard is set, no more direct Safe txs
  // 5. Return safe address
}
```

**Important order:** `enableModule` FIRST, then `setGuard`. Once guard is set, `execSafeTransaction` will revert.

### B3. Create `useEnsureBounceSafe` Hook

```typescript
export function useEnsureBounceSafe() {
  // Returns: { safeAddress, isReady, isLoading, step, ensure() }
  // Steps: 'idle' | 'deploying-safe' | 'enabling-module' | 'setting-guard' | 'ready'
}
```

### B4. Wire Onboarding Banner

- On every page, show a dismissable "Set up your collaborative trading account" banner if:
  - User is authenticated AND
  - Safe doesn't exist or isn't fully configured
- On "3x Profit" or "20% Protection" button click, if Safe not ready:
  - Block the action, show onboarding modal, run `ensure()`, then proceed

**Depends on:** Stream A  
**Blocks:** Streams C, F, G

---

## Stream C — Replace Frontend Hooks (Propose / Fund / Cancel / Withdraw)

**Goal:** Replace `useCreateThesis`, `useFundThesis` with direct Bounce contract calls.

### C1. `useProposeBet` Hook

Replace `use-create-thesis.ts`:

```
Steps:
1. ensureSafeReady() (from Stream B)
2. Check USDC allowance for Bounce contract, approve if needed
3. Call Bounce.proposeBet(safe, funder, exchange, conditionId, outcomeIndex,
   positionId, totalCapital, proposerCapitalBps, proposerProfitShareBps,
   expiresAt, slug)
4. Parse tx receipt for BetProposed event → extract betId
5. POST /bets/:betId/metadata to API with off-chain fields
6. Invalidate query caches
```

**Parameter derivation notes:**
- `exchange`: Determine from market's `negRisk` field — if `true` use `NEG_RISK_CTF_EXCHANGE`, else `CTF_EXCHANGE`
- `outcomeIndex`: 0 for Yes, 1 for No (standard Polymarket)
- `positionId`: Compute from conditionId + outcomeIndex using CTF formula, or use `clobTokenIds` from Gamma API
- `proposerCapitalBps`: 2000 (20%)
- `proposerProfitShareBps`: 6000 (60% to proposer, which is "3x profit" since proposer puts 20% capital)
- `expiresAt`: Configurable, suggest 7 days from now as default
- `totalCapital`: `stakeAmount / 0.20` (user inputs their 20% stake)

### C2. `useFundBet` Hook

Replace `use-fund-thesis.ts`:

```
Steps:
1. Read bet on-chain via Bounce.getBet(betId) to get funder deposit amount
2. Check USDC allowance for Bounce, approve if needed
3. Call Bounce.fundBet(betId)
4. Invalidate query caches
```

No metadata update needed — funding is purely on-chain.

### C3. `useCancelBet` Hook

```
Steps:
1. Call Bounce.cancelBet(betId)
2. Invalidate query caches
```

Only proposer, only Proposed status.

### C4. `useWithdraw` Hook

Replace `use-withdraw.ts`:

```
Steps:
1. Call Bounce.withdraw(betId)
2. Invalidate query caches
```

Only proposer or funder, only Closed status, position must be empty.

### C5. `useRedeemPosition` Hook

```
Steps:
1. Call Bounce.redeemPosition(betId)
2. Invalidate query caches
```

Only proposer or funder, only Traded status. Transitions to Closed when all shares redeemed.

### C6. Update Propose/Fund Modals

- `propose-bet-modal.tsx`: Update step labels, add 1x vs 3x profit comparison, wipeout price display
- `fund-proposal-modal.tsx`: Update to read bet from on-chain, compute funder deposit

**Depends on:** Streams A, B  
**Blocks:** Stream G (partially)

---

## Stream D — Backend: Postgres Metadata + On-Chain Bet Reader

**Goal:** API becomes (1) Gamma proxy, (2) on-chain Bounce reader, (3) metadata store.

### D1. Add PostgreSQL

- Add `pg` (or `postgres`/`@neondatabase/serverless`) to `apps/api/package.json`
- Add Postgres connection config (Railway provides managed Postgres)
- Create migration system (simple SQL files in `apps/api/migrations/`)

**Schema:**

```sql
CREATE TABLE bet_metadata (
  chain_id INTEGER NOT NULL DEFAULT 137,
  bet_id BIGINT NOT NULL,
  slug TEXT,
  condition_id TEXT,
  outcome_index INTEGER,
  outcome_token_id TEXT,
  is_yes_outcome BOOLEAN,
  market_question TEXT,
  market_image TEXT,
  outcome_price TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chain_id, bet_id)
);

CREATE TABLE clob_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER NOT NULL DEFAULT 137,
  bet_id BIGINT NOT NULL,
  order_id TEXT,
  side TEXT NOT NULL, -- 'BUY' or 'SELL'
  token_id TEXT NOT NULL,
  price NUMERIC,
  size NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PLACED, FILLED, PARTIALLY_FILLED, CANCELLED, FAILED
  filled_size NUMERIC DEFAULT 0,
  trade_data BYTEA, -- encoded calldata for Bounce.executeTrade/sellPosition
  max_spend NUMERIC,
  min_usdc_out NUMERIC,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (chain_id, bet_id) REFERENCES bet_metadata(chain_id, bet_id)
);
```

### D2. On-Chain Bet Read Service (`bounce.service.ts`)

```typescript
// Reads bets from Bounce contract via multicall + caches in Redis
export async function getBet(betId: number): Promise<BetView>
export async function getBetsByConditionId(conditionId: string, start: number, end: number): Promise<BetView[]>
export async function getBetsByProposer(address: Address, start: number, end: number): Promise<BetView[]>
export async function getBetsByFunder(address: Address, start: number, end: number): Promise<BetView[]>
export async function getUserBets(address: Address): Promise<{ asProposer: BetView[], asFunder: BetView[] }>
```

Implementation pattern:
1. Call Bounce view functions (paginated) to get betIds
2. Multicall `getBet(betId)` for each
3. LEFT JOIN with `bet_metadata` from Postgres
4. Cache in Redis with 30s TTL

### D3. New API Routes (`bet.routes.ts`)

```
GET    /bets/:betId                              → getBet
GET    /bets/by-condition/:conditionId            → getBetsByConditionId
GET    /bets/by-user/:address?role=proposer|funder → getUserBets
POST   /bets/:betId/metadata                     → upsert metadata
POST   /bets/refresh                              → invalidate caches
```

### D4. Register New Routes

Update `apps/api/src/routes/index.ts` to register `betRoutes`.

**Depends on:** Stream A  
**Blocks:** Streams F, G

---

## Stream E — Event Indexing + Cache Invalidation (Optional, High Leverage)

**Goal:** Keep API cache consistent by consuming Bounce contract events.

### E1. Background Poller

In `apps/api`, add a background job:

```typescript
// Poll eth_getLogs for Bounce events every ~15 seconds
// Store last_processed_block in Postgres
// On each event: invalidate relevant Redis cache keys
```

Events to handle:
- `BetProposed` → auto-create metadata stub, invalidate proposer/conditionId caches
- `BetFunded` → invalidate bet cache, funder cache
- `TradeExecuted` → invalidate bet cache
- `PositionSold` / `PositionRedeemed` → invalidate bet cache
- `BetClosed` → invalidate bet cache
- `BetCancelled` → invalidate bet cache, proposer cache
- `BetWithdrawn` → invalidate bet cache

### E2. Reorg Safety

- Process with 5-block confirmation delay
- Store block hash, re-scan on hash mismatch

**Depends on:** Streams A, D  
**Blocks:** Nothing (nice-to-have optimization)

---

## Stream F — Polymarket CLOB Integration (Most Complex)

**Goal:** Full CLOB order lifecycle: create → poll → fill → produce `tradeData` for `Bounce.executeTrade` / `sellData` for `Bounce.sellPosition`.

### F0. Architecture Decision

**CLOB networking + order polling → API (server-side)**  
**Signing → Web (Privy embedded wallet)**

Rationale:
- No CORS issues with CLOB API from server
- No `@polymarket/clob-client` (ethers v5 dependency) in browser bundle
- Centralized rate limiting, retries, order persistence
- Server can poll order status without user having tab open

### F1. CLOB Credential Derivation

The Polymarket CLOB requires API credentials derived from a wallet signature. For Safe-based trading, this uses signature type 2 (`GNOSIS_SAFE`).

**Flow:**

```
1. Web: POST /clob/credentials/challenge
   API returns: { message, nonce, timestamp }

2. Web: User signs message with Privy wallet
   POST /clob/credentials/derive { safe, owner, signature, nonce }
   API: derives CLOB API key using @polymarket/clob-client server-side
   API: stores encrypted credentials in Postgres, returns { success }

3. Credentials cached per (safe, owner) pair, refreshed when expired
```

### F2. Buy Order Flow (executeTrade)

```
1. Web: POST /clob/orders { betId, tokenId, side: 'BUY', price, size }
   API: validates bet is Funded/Traded, creates order record in Postgres
   API: signs + places order on Polymarket CLOB using stored credentials
   API: returns { orderId }

2. Web: polls GET /clob/orders/:orderId
   API: polls CLOB for fill status, updates Postgres record
   Returns: { status, filledSize, ... }

3. When filled (or partially filled and user decides to proceed):
   Web: POST /clob/orders/:orderId/build-trade
   API: builds on-chain calldata from fill data
   Returns: { maxSpend, tradeData }

4. Web: calls Bounce.executeTrade(betId, maxSpend, tradeData)
```

### F3. Sell Order Flow (sellPosition)

```
1. Web: POST /clob/orders { betId, tokenId, side: 'SELL', price, size }
   API: validates bet is Traded, places sell order on CLOB
   Returns: { orderId }

2. Web: polls for fill

3. When filled:
   Web: POST /clob/orders/:orderId/build-sell
   API: builds sell calldata
   Returns: { minUsdcOut, sellData }

4. Web: calls Bounce.sellPosition(betId, minUsdcOut, sellData)
```

### F4. Building Exchange Calldata

The `tradeData` parameter for `Bounce.executeTrade` is the ABI-encoded call to the CTF Exchange's buy function. The `sellData` is the ABI-encoded call to the exchange's sell function.

These must match exactly what Polymarket's exchange contracts expect. Use `@polymarket/clob-client` server-side to generate the signed exchange orders and encode them.

**Key function signatures (CTF Exchange):**
```solidity
// Buy: fillOrder(Order order, uint256 fillAmount)
// Sell: fillOrder(Order order, uint256 fillAmount)
```

The Order struct and encoding must match Polymarket's exchange contract interface exactly.

### F5. Frontend Hooks

- `useExecuteTrade(betId)` — full flow: credentials → order → poll → build → execute
- `useSellPosition(betId)` — full flow: credentials → sell order → poll → build → sell

**Steps exposed to UI:**
```
'idle' | 'deriving-credentials' | 'placing-order' | 'polling' | 
'building-calldata' | 'executing-trade' | 'success' | 'error'
```

### F6. Error Handling & Edge Cases

- **Partial fills:** Build tradeData for filled portion only. Multiple executeTrade calls are supported by Bounce (Funded → Traded on first, stays Traded on subsequent).
- **Order timeout:** If order not filled within N minutes, auto-cancel on CLOB, allow retry.
- **CLOB API downtime:** Queue orders, retry with exponential backoff.
- **Price staleness:** Warn user if market price has moved significantly since they set their order.

**Depends on:** Streams A, D  
**Blocks:** Stream G (Funded tab CTA)

---

## Stream G — My Bets UX (4 Tabs + CTAs)

**Goal:** Redesign `/my-bets` page with 4 tabs reflecting the Bounce bet lifecycle.

### G1. Data Layer

Replace `useUserProposals` with new hooks:

```typescript
export function useMyBets(address: Address) {
  // Fetches from GET /bets/by-user/:address
  // Returns bets grouped by status category
  return useQuery({
    queryKey: ['my-bets', address],
    queryFn: async () => { /* ... */ },
  });
}
```

### G2. Tab Structure

| Tab | Bet Statuses | CTAs | Details Shown |
|-----|-------------|------|---------------|
| **Proposed** | `Proposed` | Preview, Share on X, Cancel | Stake amount, total capital, funder (if designated), expiry |
| **Funded** | `Funded` | Execute Trade (proposer only) | Total capital, proposer/funder, time since funded |
| **Active** | `Traded` | Sell Position, Redeem (if market resolved) | Position shares, current value, PnL, cost basis |
| **Settled** | `Closed`, `Withdrawn`, `Cancelled` | Withdraw (if Closed), — (if Withdrawn/Cancelled) | Final returns, proposer/funder split, timestamps |

### G3. PnL Display (Active Tab)

For active bets, show:
- **Cost basis:** `bet.usdcSpent` (total USDC spent buying)
- **Current value:** Requires querying current market price × `bet.positionShares` (from Gamma API or CLOB book endpoint)
- **Unrealized PnL:** `currentValue - usdcSpent`
- **Unspent escrow:** `bet.escrowUSDC` (capital not yet traded)

### G4. Propose Tab — Preview & Share

- **Preview:** Show the bet card as a funder would see it (reuse `ProposalCard` component)
- **Share on X:** Generate shareable URL like `bounceapp.xyz/polymarket?bet=<betId>` + pre-filled tweet text:
  - "I'm betting [Yes/No] on [marketQuestion] with 3x leverage on @bounceapp. Back me with 20% loss protection!"

### G5. Component Updates

- Replace `MyBetCard` to accept `BetView` instead of `Proposal`
- Add status-specific CTA buttons within the card
- Update status badges to reflect new `BetStatus` enum
- Add role badge (Believer/Backer) based on `bet.proposer === address` vs `bet.funder === address`

### G6. Proposals Carousel (Browse Markets Page)

- Replace `proposals-carousel.tsx` to fetch from `GET /bets/by-condition/:conditionId?status=Proposed`
- Show only `Proposed` status bets (available to fund)
- Wire "20% Protection" button to open `fund-proposal-modal` with the bet data

### G7. Propose Bet Modal Updates

Update `propose-bet-modal.tsx`:
- Add **1x vs 3x profit comparison:**
  ```
  Regular bet: You bet $10 → You win $X at current price
  Bounce 3x:   You bet $10 (20%) → Position = $50 → You win 60% of profits = $Y
  ```
- Add **wipeout price:** `currentPrice × 0.80` — the price at which proposer's first-loss capital is fully absorbed
- Update step labels for new flow

**Depends on:** Streams C, D, F  
**Blocks:** Nothing

---

## Stream H — Delete Old Code + Clean Slate

**Goal:** Delete all deprecated ERC-20 trading code and old V2 contract references. This is a hard cut — no backwards compatibility needed.

**Important:** The old code contains many reusable patterns. Before deleting, subagents working on other streams should **read the old code as reference** for:
- `propose-bet-modal.tsx` / `fund-proposal-modal.tsx` — modal structure, step-based loading UX, portal rendering
- `use-create-thesis.ts` / `use-fund-thesis.ts` — step-based hook pattern (idle → loading → success), Privy wallet integration, `sendAndConfirm` usage
- `my-bet-card.tsx` — card layout with role badges, status config pattern, trade structure bar
- `proposals-carousel.tsx` — horizontal scrollable carousel pattern for browsing proposals
- `market-card.tsx` — `BetRow` component with hover animations, chance gauge, "3x PROFIT" / "20% Protection" button styling
- `trade.service.ts` — multicall batching pattern (`chunk`, `CALLS_PER_BATCH`), parallel cache read/write with `mget`/`mset`
- `proposal.service.ts` — data shape (what fields are needed for off-chain metadata)
- `lib/transaction.ts` — `createClients`, `sendAndConfirm`, `getWalletAddress` utilities (these are kept)
- `lib/polymarket-safe.ts` — `deriveSafeAddress`, `isSafeDeployed`, `deployPolySafe` (these are kept)
- `lib/cache.ts` — cache abstraction with Redis + in-memory fallback (kept)

### H1. Delete Old Files

Execute the full deletion list from the "What Gets Deleted" section above. This includes:
- All old API routes/services (trade, swap, token, proposal)
- All old web pages (create-trade, my-trades, trade), components (trade cards, token UI, old modals), and hooks (escrow, thesis, token)
- Old lib files (safe.ts exec, trade-cache, trade-math)
- JSON data directory (`apps/api/data/`)

### H2. Clean Up Route Registration

Update `apps/api/src/routes/index.ts` to only register:
- `healthRoutes`
- `polymarketRoutes`
- `betRoutes` (new, from Stream D)
- `clobRoutes` (new, from Stream F)

### H3. Clean Up Shared Package

- Delete old types from `types.ts` (TradeData, TradeEscrowState, TradeView, etc.)
- Delete `Proposal`, `ProposalStatus` from `polymarket-types.ts` (replaced by new Bounce types)
- Delete `zero-x.ts` if only used by old swap logic
- Update `index.ts` exports

### H4. Clean Up Contracts Package

- Delete `TradeEscrowFactoryAbi`, `TradeEscrowAbi` from `abis.ts`
- Delete `ADDRESSES_BY_CHAIN` / `SUPPORTED_CHAIN_IDS` from `addresses.ts` if only used for old escrow chains
- Delete `ThesisFactoryV2Abi`, `ThesisManagerV2Abi`, `ThesisSettlementV2Abi`, `ThesisGuardV2Abi` from `polymarket-abis.ts` (replaced by `BounceAbi`)
- Simplify `chain.ts` to Polygon-only

### H5. Update Home Page

Replace `app/page.tsx` with redirect to `/polymarket` (or a new Polymarket-focused landing page).

### H6. Update Terminology

- "Thesis" → "Bet" everywhere
- "Proposal" → "Bet (Proposed)" where appropriate
- Keep "Believer" and "Backer" branding

**Should be done early** — clears the codebase so other streams don't have import confusion or dead code noise.  
**Depends on:** Stream A (so new types exist before old ones are deleted)  
**Blocks:** Nothing, but doing it first makes all other streams cleaner

---

## Stream I — Propose/Fund Math + UI Calculations

**Goal:** Ensure all financial calculations shown in the UI are correct and match the smart contract math exactly.

### I1. Profit Comparison (1x vs 3x)

```typescript
// User inputs stakeAmount (their 20% capital)
const proposerCapital = stakeAmount;
const totalCapital = stakeAmount * 5; // 20% → 100%
const funderCapital = totalCapital - proposerCapital;
const currentPrice = marketPrice; // e.g., 0.60 for "60 cents"
const tokensReceived = totalCapital / currentPrice;

// If market resolves YES (token worth $1):
const revenue = tokensReceived; // $1 per token
const profit = revenue - totalCapital;
const proposerProfitShare = profit * 0.60; // proposerProfitShareBps / 10000
const proposerTotalReturn = proposerCapital + proposerProfitShare;
const proposerMultiple = proposerTotalReturn / proposerCapital;

// Regular bet comparison:
const regularTokens = stakeAmount / currentPrice;
const regularProfit = regularTokens - stakeAmount;
```

### I2. Wipeout Price Calculation

```typescript
// Price at which proposer's capital is fully lost
// Loss = totalCapital - (totalCapital / currentPrice * wipeoutPrice)
// When loss = proposerCapital:
// proposerCapital = totalCapital * (1 - wipeoutPrice/currentPrice)
// wipeoutPrice = currentPrice * (1 - proposerCapitalBps/BPS_DENOMINATOR)
// With 20% capital: wipeoutPrice = currentPrice * 0.80
const wipeoutPrice = currentPrice * (1 - proposerCapitalBps / 10000);
```

### I3. Funder Protection Display

```typescript
// Funder suffers zero loss until price drops below wipeoutPrice
// At wipeout price, funder gets 100% back, proposer gets 0
const funderProtectionPct = proposerCapitalBps / 100; // e.g., 20%
```

**Depends on:** Nothing  
**Blocks:** Streams C, G (modal updates)

---

## Dependency Graph

```
Stream A (Foundation) ──→ Stream H (Delete old code) ──→ clean slate
  │
  ├── Stream B (Onboarding) ──→ Stream C (Hooks) ──→ Stream G (UI)
  ├── Stream D (Backend)    ──→ Stream F (CLOB)  ──→ Stream G (UI)
  └── Stream E (Events, optional)
  
Stream I (Math) ──→ Streams C, G (can be done in parallel with A)
```

**Recommended execution order:**
1. **A + I** in parallel (foundation + math — no dependencies)
2. **H** immediately after A (clean slate before building new)
3. **B + D** in parallel (onboarding + backend — independent of each other)
4. **C + F** in parallel (hooks + CLOB — depend on B/D respectively)
5. **G** last (UI — depends on C, D, F all being ready)
6. **E** anytime after D (nice-to-have optimization)

---

## Critical Pre-Flight Checks

1. **USDC address:** Confirm `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` is correct for Polymarket on Polygon (USDC.e, not native USDC)
2. **Bounce proxy address:** Confirm the deployed proxy address and add to config
3. **Safe compatibility:** Test that `enableModule` + `setGuard` work on Polymarket-deployed Safes (they use a custom factory)
4. **CLOB signature type:** Verify signature type 2 (GNOSIS_SAFE) works with Polymarket CLOB for Safe-based orders
5. **Exchange calldata format:** Test `executeTrade` with real Polymarket exchange calldata on a fork before production
