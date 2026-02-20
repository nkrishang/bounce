# Polymarket Integration — Handoff Document

> Recovered from three prior conversation threads (T-019c1d9e-1c62-75b6-b315-1b1105d2771c, T-019c1dbb-8962-72fb-9b9a-9ee8ba0c7e38, T-019c1db2-26b9-7641-9d9f-44c056b062d3) that existed on a lost laptop's local branch. Consolidated in thread T-019c757f-f6a8-72a1-a858-c1d27472a282.

---

## Product Context

**Bounce Capital** lets users propose trades ("boosted buy") putting up 20% USDC capital, and another user funds the trade ("protected buy") providing 80%. Profit splits **60% proposer / 40% funder**. The proposer's 20% is **first-loss protection** for the funder.

The **Polymarket version** applies this same mechanic to Polymarket prediction market bets instead of token trades:

- **Believer** (proposer): Stakes 20%, earns 60% of profits, absorbs losses first
- **Backer** (funder): Funds 80%, earns 40% of profits, protected by Believer's stake

The Polymarket integration lives on a **separate `/polymarket` route**. Existing token trading code is completely untouched — only minimal additive changes to shared infrastructure (navbar, route registration, index exports).

---

## Architecture

### Monorepo Structure (pnpm workspaces)

| Package | Stack | Purpose |
|---------|-------|---------|
| `apps/web` | Next.js 16, React 19, Privy auth, TanStack Query, viem, framer-motion, Tailwind | Frontend |
| `apps/api` | Fastify 4, pino logger, Redis/in-memory cache, viem | Backend API |
| `packages/contracts` | TypeScript | ABIs + contract addresses |
| `packages/shared` | TypeScript | Types + utils |
| `packages/foundry` | Solidity | Smart contracts |

### On-Chain Architecture (Polygon, chainId: 137)

Each Polymarket bet operates through a **Gnosis Safe** wallet deployed via the Polymarket Safe Factory. The Safe holds the combined USDC capital and executes trades on the CTF Exchange.

**Flow:**
1. Believer proposes a bet → deploys Safe → deploys Guard → sets Guard on Safe → transfers 20% USDC to Safe → registers proposal in API
2. Backer funds the bet → transfers 80% USDC to Safe → calls `ThesisFactoryV2.createThesis()` on-chain → updates proposal status
3. (TODO) CLOB order is placed from Safe via CTF Exchange
4. (TODO) Position resolves → `ThesisSettlementV2.distribute()` splits proceeds

### Smart Contract Addresses (all Polygon)

| Contract | Address |
|----------|---------|
| ThesisFactoryV2 | `0xb325663003B12c28d19D39723c79596B86Ba3850` |
| ThesisManagerV2 | `0x53382C7Ec04899EcF38d746dC811ED63524B563e` |
| PolySafeFactory | `0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b` |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| USDC | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| Conditional Tokens | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |

**SAFE_INIT_CODE_HASH:** `0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf`

### External APIs

| API | Base URL | Usage |
|-----|----------|-------|
| Gamma API | `https://gamma-api.polymarket.com` | Event/market data (proxied through backend for CORS) |
| CLOB API | `https://clob.polymarket.com` | Order placement (TODO) |
| Polymarket Docs | `https://docs.polymarket.com/` | Reference |

---

## Files Created (22 new files)

### Packages Layer

**`packages/contracts/src/polymarket-addresses.ts`**
All Polymarket contract addresses as typed constants (`POLYMARKET_ADDRESSES` object with `THESIS_MANAGER`, `THESIS_FACTORY`, `POLYMARKET_SAFE_FACTORY`, `USDC`, `CTF_EXCHANGE`, `CONDITIONAL_TOKENS`, `SAFE_INIT_CODE_HASH`).

**`packages/contracts/src/polymarket-abis.ts`**
ABIs for all Polymarket contracts:
- `ThesisFactoryV2Abi` — `deployGuard(safe)`, `createThesis(proposer, funder, safe, totalCapital)`, `getSettlement(safe)`
- `ThesisManagerV2Abi` — `exchangeApprovalCap(settlement)`, `isActive(settlement)`
- `ThesisSettlementV2Abi` — `proposer()`, `funder()`, `safe()`, `totalCapital()`, `distribute()`, `isDistributed()`
- `ThesisGuardV2Abi` — `thesisManager()`
- `PolySafeFactoryAbi` — `createProxy(owner)` ⚠️ may not match actual contract
- `GnosisSafeAbi` — `execTransaction`, `getTransactionHash`, `nonce`, `setGuard`, `getOwners`, `isOwner`, `getThreshold`

**`packages/shared/src/polymarket-types.ts`**
Types: `ProposalStatus` (union: `PROPOSED | FUNDED | ORDER_PLACED | MATCHED | SETTLED`), `Proposal` interface (id, proposer, funder, safe, guard, settlement, totalCapital, proposerContribution, conditionId, outcomeTokenId, isYesOutcome, marketSlug, marketQuestion, marketImage, outcomePrice, metadataUri, status, orderId, createdAt, updatedAt), `PolymarketToken`, `PolymarketMarket`, `PolymarketEvent`.

### API Layer

**`apps/api/src/services/proposal.service.ts`**
JSON-file-backed CRUD for proposals at `data/proposals.json`. Functions: `getAllProposals()`, `getProposalById(id)`, `getProposalsBySafe(safe)`, `getProposalsByUser(address)`, `createProposal(data)`, `updateProposal(id, updates)`. Auto-generates UUID and timestamps.

**`apps/api/src/routes/proposal.routes.ts`**
REST endpoints registered under `/proposals` prefix:
- `GET /` — List all, optional `?status=` and `?proposer=` filters
- `GET /:id` — Get by ID
- `GET /by-safe/:safe` — Get by Safe address
- `GET /by-user/:address` — Get by user (matches both proposer and funder)
- `POST /` — Create (requires: proposer, safe, conditionId, outcomeTokenId)
- `PATCH /:id` — Update partial fields

**`apps/api/src/routes/polymarket.routes.ts`**
Proxy routes registered under `/polymarket` prefix to avoid CORS issues with Gamma API. All responses cached for 60 seconds:
- `GET /events` — Proxies `gamma-api.polymarket.com/events` with `active=true`, `closed=false`, configurable `limit`, `offset`, `order`, `tag_id`
- `GET /events/:slug` — Proxies `gamma-api.polymarket.com/events/slug/:slug`
- `GET /markets` — Proxies `gamma-api.polymarket.com/markets`

### Web Lib Layer

**`apps/web/src/lib/polymarket-safe.ts`**
- `deriveSafeAddress(owner)` — Deterministic CREATE2 address derivation using `keccak256(abi.encode(owner))` as salt, `SAFE_INIT_CODE_HASH` as bytecode hash, `POLYMARKET_SAFE_FACTORY` as factory
- `isSafeDeployed(publicClient, safeAddress)` — Checks if bytecode exists at address
- `deployPolySafe(walletClient, publicClient, owner)` — Calls `PolySafeFactory.createProxy(owner)`, returns Safe address

**`apps/web/src/lib/safe.ts`**
- `signSafeTxHash(walletClient, account, safeTxHash)` — Signs a Safe transaction hash via `signMessage` with raw bytes, then adjusts `v` value by **+4** for EOA signatures (Safe signature type convention)
- `execSafeTransaction(walletClient, publicClient, safeAddress, owner, tx)` — Reads nonce, computes tx hash via `getTransactionHash`, signs it, calls `execTransaction` with 1M gas limit

### Web Hooks

**`apps/web/src/hooks/use-polymarket-markets.ts`**
- `usePolymarketEvents(options?)` — TanStack Query hook fetching from `/polymarket/events`, 60s stale time
- `usePolymarketEvent(slug)` — Single event by slug, conditionally enabled

**`apps/web/src/hooks/use-proposals.ts`**
- `useProposals(status?)` — Fetches from `/proposals`, optional status filter
- `useProposal(id)` — Single proposal by ID
- `useUserProposals(address)` — User's proposals (as proposer or funder)

**`apps/web/src/hooks/use-create-thesis.ts`**
Multi-step hook for Believers to propose a bet. Steps: `idle → deploying-safe → deploying-guard → setting-guard → approving → transferring → registering → success`. Uses Privy embedded wallet, switches to Polygon (137). Total capital = 5× proposer contribution. Registers proposal via `POST /proposals`.

**`apps/web/src/hooks/use-fund-thesis.ts`**
Multi-step hook for Backers to fund a proposal. Steps: `idle → approving → transferring → creating-thesis → updating → success`. Funder contribution = totalCapital − proposerContribution. Calls `ThesisFactoryV2.createThesis()` on-chain. Updates proposal status to `FUNDED` via `PATCH /proposals/:id`.

**`apps/web/src/hooks/use-place-order.ts`**
Partially implemented hook for placing CLOB orders. Steps: `idle → approving-exchange → deriving-creds → placing-order → success`. Currently only executes Step 1 (approving CTF Exchange from Safe to spend USDC). Steps 2-3 (credential derivation and CLOB order placement) are **TODO** — requires `@polymarket/clob-client` and `ethers@5`.

### Web Components (in `components/polymarket/`)

**`market-card.tsx`**
Event card displaying title, image, volume, end date, and outcome probability bars. Each outcome is a clickable button that calls `onPropose()`. Handles token parsing from both array format (`market.tokens`) and JSON string format (`market.outcomes`/`market.outcome_prices`). Probability bars color-coded: green for Yes, red for No, purple for other outcomes. Expandable for events with 3+ markets.

**`market-grid.tsx`**
Grid layout (1/2/3 columns responsive) with loading spinner, error state, empty state, and pagination (Previous/Next). Fetches 20 events per page ordered by volume.

**`propose-bet-modal.tsx`**
Full-screen modal (portal) for Believers to propose a bet. Shows event info, outcome badge, stake input ($USDC, minimum $1), position breakdown (20% Believer / 80% Backer / Total), profit/loss scenarios. Multi-step CTA button with loading states. Requires Privy auth.

**`proposal-card.tsx`**
Fixed-width (360px) card for the proposals carousel. Shows market question, Yes/No badge, total position, protected amount, trade structure bar (20/80 split), proposer address. CTA: "Protected Buy — $X USDC" for PROPOSED status, or status badge for other states. Opens `FundProposalModal`.

**`fund-proposal-modal.tsx`**
Full-screen modal (portal) for Backers to fund a proposal. Shows market info, funding breakdown (Believer stake / Your funding / Total), profit/loss scenarios, warning about on-chain transfer. Multi-step CTA button. Requires Privy auth.

**`proposals-carousel.tsx`**
Horizontal scrolling carousel of active proposals (status=PROPOSED). Uses edge-fade mask gradient. Hidden when no proposals exist.

### Web Page

**`apps/web/src/app/polymarket/page.tsx`**
Main Polymarket page with `'use client'` and `force-dynamic`. Three sections:
1. **Hero** — Purple gradient background, "Bet on Real-World Events" heading, role pills (Believer: 60% Profit, Backer: 20% Protected)
2. **Active Proposals** — `ProposalsCarousel` component (for Backers)
3. **Browse Markets** — `MarketGrid` component (for Believers) with "For Believers" badge

State management lifts selected event/market/token/outcome/price to page level for the `ProposeBetModal`.

---

## Files Modified (minimal, additive only)

| File | Change |
|------|--------|
| `apps/web/src/components/navbar.tsx` | Added "Polymarket" nav link (desktop + mobile) |
| `apps/web/src/lib/api.ts` | Added `patch()` method to `ApiClient` class |
| `packages/contracts/src/index.ts` | Added 2 re-exports: `polymarket-addresses` and `polymarket-abis` |
| `packages/shared/src/index.ts` | Added 1 re-export: `polymarket-types` |
| `apps/api/src/routes/index.ts` | Registered `proposalRoutes` at `/proposals` and `polymarketRoutes` at `/polymarket` |

---

## Smart Contract Source Code (Recovered ✅)

The ThesisV2 Solidity source code was **recovered from prior conversation threads** and placed in `packages/foundry/src/thesis/`:

| File | Purpose |
|------|---------|
| `ThesisFactoryV2.sol` | Deploys Guards and Settlements, registers with ThesisManager |
| `ThesisManager.sol` | Registry tracking active settlements per Safe, manages approval caps |
| `ThesisSettlementV2.sol` | Holds proposer/funder/safe refs, distributes proceeds (30/70 profit split via BPS), auto-deactivates in manager |
| `ThesisGuardV2.sol` | Safe transaction guard restricting operations, queries ThesisManager for dynamic approval caps |
| `interfaces/IGuard.sol` | Guard interface with ERC165 support (required for Safe 1.3.0 compatibility) |
| `interfaces/IThesisManager.sol` | ThesisManager interface |

All contracts compile successfully via `forge build`.

---

## Unfinished Work

### 1. CLOB Order Placement (Critical)

`use-place-order.ts` has the flow structured but the actual `@polymarket/clob-client` calls are commented out as TODO.

**To complete:**
- `pnpm add @polymarket/clob-client ethers@5` in `apps/web`
- Implement `ClobClient` integration with **Signature Type 2** (`GNOSIS_SAFE`)
- The Safe address acts as the funder/signer for orders
- Reference the commented code in `use-place-order.ts` lines 85-100

### 2. Order Matching Polling

No polling mechanism exists to check if a CLOB order has been matched. Need to:
- Poll the Polymarket CLOB API for order status after placement
- Update proposal status from `ORDER_PLACED` to `MATCHED` when filled
- May need a backend cron/polling service for reliability

### 3. Sell Position Flow

No UI or hook for selling a matched Polymarket position back to USDC through the CTF Exchange. Need to:
- Build a sell flow that redeems outcome tokens
- Execute sell via Safe transaction on CTF Exchange
- Update proposal status accordingly

### 4. Settlement/Withdrawal

`ThesisSettlementV2` has a `distribute()` function but no UI calls it. Need to:
- Build a settlement UI that calls `distribute()` after bet resolution
- Show final payout breakdown (60/40 split of profits, or loss absorption)
- Redeem conditional tokens first if the market has resolved

### 5. PolySafeFactory ABI Accuracy ⚠️

`PolySafeFactoryAbi` was simplified to `createProxy(address owner)` but the actual Polymarket factory contract at `0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b` may have a different function signature. **Must verify against the actual on-chain contract on Polygon** before testing.

### 6. My Bets Page

No equivalent of `/my-trades` for Polymarket proposals. Users need a page to:
- See their proposed bets (as Believer)
- See their funded bets (as Backer)
- Track bet status through the lifecycle
- Access settlement when bets resolve

### 7. Gamma API Response Parsing

`market-card.tsx` parses tokens from both array format and JSON string format (`outcomes`/`outcome_prices` fields) but this hasn't been validated against real Gamma API responses. The dual-parsing approach (lines 67-81) may need adjustment.

### 8. Error Handling

Hooks have basic `try/catch` with raw error messages. Missing:
- User-friendly error parsing (like the existing `parseTransactionError` utility)
- Specific handling for wallet rejection, insufficient funds, network errors
- Toast notifications for success/failure

### 9. Build Verification

Full `pnpm build` from root has not been verified. The package re-exports and type chains need compilation testing.

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Proposals stored in JSON file (`data/proposals.json`) | MVP simplicity, no database setup required |
| Gamma API proxied through backend | CORS restrictions on direct browser access |
| Safe addresses derived via CREATE2 | Deterministic — same owner always gets same Safe address |
| Safe tx signatures use `v + 4` adjustment | Gnosis Safe convention for EOA signatures via `eth_sign` |
| All operations Polygon-only (chainId: 137) | Polymarket contracts only exist on Polygon |
| Existing TradeEscrow system untouched | Complete separation of concerns, no risk to existing functionality |
| 20/80 split hardcoded at 5× multiplier | `totalCapital = proposerContribution * 5n` in create hook |

---

## Design Conventions

### Colors
| Role | Primary | Secondary | Dark |
|------|---------|-----------|------|
| Believer (Gold) | `#ECC25E` | `#D4AD4A` | `#C8A93E` |
| Backer (Blue) | `#61A6FB` | `#5B93D4` | `#4A80C4` |
| Polymarket (Purple) | `#8b5cf6` | `#a78bfa` | — |
| Yes outcome | `#22c55e` | `#4ade80` | — |
| No outcome | `#ef4444` | `#f87171` | — |

### UI Patterns
- All components use `'use client'` directive
- Framer-motion for animations (`motion.div`, `AnimatePresence`)
- Lucide-react for icons
- `font-mono` for numbers and prices
- `font-bold` / `font-extrabold` for headings
- Dark surface: `bg-dark-surface`, `border-dark-border`
- Modals rendered via `createPortal(…, document.body)` with backdrop blur
- Scrollbar lock on modal open (overflow: hidden + padding compensation)

---

## Verification Steps

1. `pnpm build` from root — verify all packages compile
2. Start API: `cd apps/api && pnpm dev` → verify `GET /polymarket/events` returns Gamma data
3. Start web: `cd apps/web && pnpm dev` → navigate to `/polymarket`
4. Verify market cards render with real Polymarket events
5. Click an outcome → verify propose bet modal opens with correct data
6. Test proposal creation flow (requires Privy auth + Polygon USDC)
7. Verify proposals carousel appears after creating a proposal
8. Test fund flow on a proposal (requires second account with USDC)

---

## Proposal Lifecycle State Machine

```
PROPOSED → FUNDED → ORDER_PLACED → MATCHED → SETTLED
   ↑          ↑          ↑              ↑          ↑
Believer   Backer    CLOB order     Order      distribute()
proposes   funds     placed via     fills on    on Settlement
           80%       Safe/CTF       Polymarket  contract
```

**Status transitions:**
- `PROPOSED`: Created by Believer via `use-create-thesis` → `POST /proposals`
- `FUNDED`: Backer calls `use-fund-thesis` → `ThesisFactoryV2.createThesis()` → `PATCH /proposals/:id`
- `ORDER_PLACED`: (TODO) `use-place-order` → `PATCH /proposals/:id`
- `MATCHED`: (TODO) polling detects order fill
- `SETTLED`: (TODO) `ThesisSettlementV2.distribute()` called
