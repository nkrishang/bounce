# Bounce V2 Protocol — Architecture & Workings Overview

> Complete technical overview of BounceV2 + BounceVault: a tranching protocol built on Polymarket prediction markets (CTF / Conditional Tokens) on Polygon.

---

## Constants, Units, and Conventions

### Tokens and Decimals

| Token | Decimals | Notes |
|-------|----------|-------|
| USDC (Polygon) | 6 | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| CTF outcome tokens (ERC-1155) | integer units | Dust threshold: `10_000` raw units |
| `PRICE_SCALE` | `1e18` | All price ratios stored in 18-decimal fixed point |

### Key Addresses (Polygon)

| Contract | Address |
|----------|---------|
| USDC | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| CTF | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |

---

## 1. Protocol Overview

Bounce V2 creates **tranched exposure** to a single Polymarket outcome token (e.g., "YES for Market X"), splitting users into two roles:

- **Senior tranche**: Receives **40% of profits** on deployed capital. Receives **downside protection** — junior absorbs losses first.
- **Junior tranche**: Receives **60% of profits**. Takes **first-loss risk** — junior NAV is reduced before senior NAV is touched.

### Two-Contract Architecture

1. **`BounceV2` (coordinator)** — Deploys/configures per-user Polymarket Gnosis Safes. Orchestrates the entire position lifecycle. Enforces "Safe can't transact directly" via guard. All user-facing entry points live here.

2. **`BounceVault` (per-outcome vault)** — Deployed per market outcome via CREATE3. Holds all outcome tokens and USDC. Implements tranched share accounting, NAV calculations, PnL splits, and the micro-pod exit model.

### Core Economic Rules

Let:
- `P_s` = senior principal (cost basis of currently-held tokens)
- `P_j` = junior principal
- `DV` = deployed value = `totalOutcomeTokens × lastExecutionPrice / 1e18`

**Profit regime (`DV ≥ P_s + P_j`):**
```
Δ = DV - (P_s + P_j)
Senior deployed NAV = P_s + 0.4 × Δ
Junior deployed NAV = DV - Senior deployed NAV  (equivalently P_j + 0.6 × Δ)
```

**Loss regime (`DV < P_s + P_j`):**
```
L = (P_s + P_j) - DV
If L ≥ P_j:  Junior NAV = 0,        Senior NAV = DV       (junior wiped)
If L < P_j:  Junior NAV = P_j - L,  Senior NAV = DV - Junior NAV  (senior protected)
```

---

## 2. Contract Roles

### 2.1 BounceV2 — Coordinator & Safe Orchestration

**Responsibilities:**
- **Vault creation** — Deterministically deploys a `BounceVault` for a specific outcome via CREATE3
- **Safe deployment & configuration** — Deploys Polymarket Safe, installs BounceV2 as Module (execute transactions) and Guard (block direct transactions), sets CTF approvals
- **Position lifecycle** — Manages the full prepare → off-chain CLOB → finalize pattern

**Why the prepare/finalize pattern exists:**
Polymarket's CLOB executes off-chain and settles on-chain later. BounceV2 must:
1. **Prepare**: move funds/approvals into Safe, record state
2. **Off-chain**: user/bot executes CLOB order; exchange settles by pulling from Safe
3. **Finalize**: detect results on-chain (via allowance/balance deltas) and update accounting

### 2.2 BounceVault — Accounting Engine

**Responsibilities:**
- Tracks two tranches: `senior: TrancheState` and `junior: TrancheState`
- Share accounting: `mint()` issues tranche-specific shares, `redeem()` burns shares and assigns token micro-pods
- Exit settlement: `settleExit()` splits USDC proceeds between tranches (supports partial fills)
- Cancellation restoration: `onERC1155Received()` restores all state if tokens are returned

**Unified Pool Model (critical design choice):**
The vault does **not** maintain separate token buckets per tranche. Instead:
- All outcome tokens pooled under `totalOutcomeTokens`
- Each tranche tracks `principal` (cost basis claim on pooled tokens) and `usdcCash` (realized USDC from counterparty exits)
- This is why micro-pods exist — you can't send "pro-rata tokens" without breaking tranche payoffs

---

## 3. Key Data Structures

### 3.1 BounceV2 Structs

```solidity
struct Safe {
    bool setup;      // deployed + configured + approvals set?
    bool activeBet;  // in-flight prepared buy/exit/redeem?
}
```

```solidity
enum PositionStatus { Prepared, Purchased, PreparedExit, Closed, Cancelled }
enum PositionTranche { Junior, Senior }

struct Position {
    address owner;                              // safe owner
    address safe;                               // Polymarket gnosis safe
    bytes32 conditionId;                        // market condition
    uint8 outcomeIndex;                         // 0=Yes, 1=No, etc.
    uint256 outcomeTokenId;                     // ERC-1155 token ID
    address exchange;                           // Polymarket exchange
    address vault;                              // BounceVault address
    uint256 prePurchaseUsdcAllowance;           // allowance set before CLOB
    uint256 prePurchaseConditionTokenBalance;   // token balance before CLOB
    uint256 actualConditionTokensPurchased;     // tokens gained
    uint256 reservedUsdcSpendAmount;            // USDC reserved for buy
    uint256 actualUsdcSpendAmount;              // USDC actually spent
    uint256 shares;                             // vault shares received
    uint256 usdcReceived;                       // USDC received on exit
    uint256 conditionTokensForSale;             // tokens sent to Safe for sale
    PositionStatus status;
    PositionTranche tranche;
}
```

### 3.2 BounceVault Structs

```solidity
struct TrancheState {
    uint256 totalShares;  // total shares outstanding
    uint256 principal;    // cost basis for pooled tokens
    uint256 usdcCash;     // realized USDC from counterparty exits
}
```

```solidity
struct PendingExit {
    bool active;
    address owner;
    PositionTranche tranche;
    address receiver;                  // Safe that received tokens
    uint256 shares;
    uint256 tokensAssigned;            // tokens originally transferred
    uint256 tokensRemaining;           // tokens not yet sold/redeemed
    uint256 seniorPrincipalRemaining;  // chunk cost basis to settle
    uint256 juniorPrincipalRemaining;
    uint256 reservedCash;              // pro-rata reserved usdcCash
    bool reservedCashPaid;             // paid on first settleExit call
}
```

---

## 4. Complete Interaction Map (BounceV2 → BounceVault)

### 4.1 Deposits / Buys

**User calls** `prepareBuyOutcome{Senior,Junior}(safe, exchange, conditionId, outcomeIndex, outcomeTokenId, usdcSpendAmount)`
- Transfers USDC from user → Safe
- Sets per-trade allowance Safe → exchange
- Records Position with `status = Prepared`

**Off-chain**: CLOB fills, exchange pulls USDC from Safe, deposits ERC-1155 tokens into Safe.

**Finalize** via `finalizeBuyOutcome(positionId)`:
1. Detects: `usdcSpent = reserved - remainingAllowance`, `tokensPurchased = balanceNow - balanceBefore`
2. Safe → Vault: transfers purchased outcome tokens via `CTF.safeTransferFrom`
3. BounceV2 → BounceVault: `mint(to, usdcAmount, outcomeTokensAmount, tranche)` → returns shares
4. Refunds leftover USDC Safe → owner
5. Clears approvals, sets `status = Purchased`, clears `activeBet`

### 4.2 Exits / Sells

**Prepare** via `prepareExitOutcome(positionId)`:
1. BounceV2 → BounceVault: `redeem(owner, shares, tranche, receiver=safe)` → returns conditionTokenAmount
2. Vault burns shares, reserves pro-rata `usdcCash`, computes micro-pod, transfers tokens to Safe, creates `PendingExit`
3. Sets `status = PreparedExit`, records `conditionTokensForSale`

**Off-chain**: CLOB sells tokens, Safe receives USDC proceeds.

**Finalize** via `finalizeExitOutcome(positionId)`:
1. Detects tokens sold and USDC proceeds in Safe
2. Safe → Vault: transfers USDC proceeds
3. BounceV2 → BounceVault: `settleExit(owner, shares, tranche, usdcProceeds)` → returns (ownerAmount, counterpartyAmount)
4. Vault splits proceeds via `_splitProceeds`, pays owner, credits counterparty `usdcCash`
5. If tokens fully sold (or dust), closes position

### 4.3 Cancel Exit (restoration path)

`cancelExitOutcome(positionId)`:
1. Verifies no tokens sold, no USDC in Safe
2. Safe transfers tokens back to vault via `CTF.safeTransferFrom`
3. Vault's `onERC1155Received()` restores: shares, principals, totalOutcomeTokens, reserved cash
4. Position returns to `Purchased`

### 4.4 Cancel Buy

`cancelBuyOutcome(positionId)`:
1. Verifies allowance unchanged, token balance unchanged
2. Clears approvals, returns USDC Safe → owner
3. Position set to `Cancelled`

### 4.5 Redeem Resolved Markets

`redeemPosition(positionId)`:
1. `BounceVault.redeem()` → tokens to Safe, creates PendingExit
2. Safe executes `CTF.redeemPositions(USDC, bytes32(0), conditionId, indexSets)`
3. Measures `usdcDelta` and `tokensRedeemed`
4. Safe transfers `usdcDelta` to vault
5. `BounceVault.settleExit(..., usdcDelta)` applies tranching, pays owner
6. Position closes (does not revert on zero proceeds — handles NO-wins case)

---

## 5. NAV Calculation Deep Dive

### 5.1 Lazy Oracle Model

The contract has **no oracle**. It only learns token price when a trade finalizes:
- On `mint()` (buy finalized): `lastExecutionPrice = usdcAmount × 1e18 / outcomeTokensAmount`
- On `settleExit()` (sell fill): `lastExecutionPrice = usdcProceeds × 1e18 / tokensSold`

Between executions, the stored price is stale. This is intentional — the contract only needs correctness at execution time.

### 5.2 `_deployedValue()`

```
deployedValue = totalOutcomeTokens × lastExecutionPrice / 1e18
```

### 5.3 `_currentDeployedNAVs()` — Tranche Payoff Function

```
dv = deployedValue
sP = senior.principal
jP = junior.principal
totalP = sP + jP

If dv ≥ totalP (profit):
    Δ = dv - totalP
    sGain = Δ × 4000 / 10000
    sNAV = sP + sGain
    jNAV = dv - sNAV

If dv < totalP (loss):
    L = totalP - dv
    If L ≥ jP:  jNAV = 0, sNAV = dv         (junior wiped)
    Else:       jNAV = jP - L, sNAV = dv - jNAV  (senior protected)
```

### 5.4 Total NAV Per Tranche (includes cash ledger)

```
seniorTotalNAV = seniorDeployedNAV + senior.usdcCash
juniorTotalNAV = juniorDeployedNAV + junior.usdcCash
```

`usdcCash` is **real USDC** already realized from counterparty exits — no longer exposed to token price moves.

### 5.5 `_splitProceeds(proceeds, sPrin, jPrin)` — Settlement Rule

For a chunk of tokens with cost basis split `(sPrin, jPrin)`:
- **Profit**: both get principal back; gain split 40/60
- **Loss**: junior absorbs first; senior protected until junior wiped
- **Single-tranche chunk**: other side gets everything

### 5.6 `_tranchePayoutPerToken(tranche)` — Per-Token Payout

Answers: "If we sell one token at `lastExecutionPrice`, how many USDC does this tranche receive?"

```
sPrinPerToken = senior.principal × 1e18 / totalOutcomeTokens
jPrinPerToken = junior.principal × 1e18 / totalOutcomeTokens
totalPrinPerToken = sPrinPerToken + jPrinPerToken

If lastExecutionPrice ≥ totalPrinPerToken (profit):
    deltaPerToken = lastExecutionPrice - totalPrinPerToken
    sGainPerToken = deltaPerToken × 4000 / 10000
    Senior payout = sPrinPerToken + sGainPerToken
    Junior payout = jPrinPerToken + (deltaPerToken - sGainPerToken)

If lastExecutionPrice < totalPrinPerToken (loss):
    lossPerToken = totalPrinPerToken - lastExecutionPrice
    If lossPerToken ≥ jPrinPerToken:
        Junior payout = 0
        Senior payout = lastExecutionPrice
    Else:
        Junior payout = jPrinPerToken - lossPerToken
        Senior payout = sPrinPerToken (untouched)
```

---

## 6. The Micro-Pod Problem

### 6.1 The Problem

When a tranche exits, they receive only their **split** of sale proceeds — not the full proceeds. Naïvely computing `tokensToSell = exitValue / marketPrice` would underpay, because part of proceeds must go to the counterparty tranche.

### 6.2 The Solution

In `redeem()`:

1. Compute exiting shares' claim on deployed NAV:
   ```
   deployedExitValue = trancheDeployedNAV × shares / trancheTotalShares
   ```

2. Convert to required token amount:
   ```
   tokens = ceil(deployedExitValue / payoutPerToken)
   ```

This token amount is the "micro-pod" — enough tokens that the tranche's split of sale proceeds equals their NAV claim.

### 6.3 Worked Numerical Example

**Vault state:**
- `totalOutcomeTokens = 2000`
- `lastExecutionPrice = $0.60`
- `senior.principal = $800`, `junior.principal = $200`

**Per-token principal:**
- Senior: `800 / 2000 = $0.40/token`
- Junior: `200 / 2000 = $0.10/token`
- Total: `$0.50/token`

**At $0.60/token (profit):**
- Profit per token: `$0.60 - $0.50 = $0.10`
- Senior gain per token: `40% × $0.10 = $0.04`
- Junior gain per token: `$0.06`

**Per-token payout:**
- Senior: `$0.40 + $0.04 = $0.44/token`
- Junior: `$0.10 + $0.06 = $0.16/token`

**Senior exit with deployedExitValue = $88:**

❌ Naïve: `$88 / $0.60 = 146.67 tokens` → wrong (senior doesn't get $0.60/token)

✅ Correct micro-pod: `$88 / $0.44 = 200 tokens`

Selling 200 tokens at $0.60 yields $120:
- Chunk principals: `sPrin = $80`, `jPrin = $20`
- Profit: `$120 - $100 = $20`
- Senior gets: `$80 + 40% × $20 = $88` ✓
- Junior gets: `$32` → goes to `junior.usdcCash`

---

## 7. Scenario Walkthroughs (Starting from Empty State)

### Conventions
- Outcome token initial price: **$0.50**
- Addresses: Alice (senior), Bob (junior)
- State notation shows key vault variables after each step

### State Template
```
senior: { totalShares, principal, usdcCash }
junior: { totalShares, principal, usdcCash }
totalOutcomeTokens
lastExecutionPrice
shareBalanceOf: { [owner][tranche]: amount }
```

---

### Path A: First Senior → First Junior → Price Rises → Both Exit at Profit

#### A0 — Empty State
```
senior: { 0, 0, 0 }
junior: { 0, 0, 0 }
totalOutcomeTokens = 0
lastExecutionPrice = 0
```

#### A1 — Alice deposits $800 as Senior (buy at $0.50)

**Calls:**
1. `prepareBuyOutcomeSenior(Safe(Alice), CTF_EXCHANGE, C, 0, T, 800e6)` → Position #1
2. Off-chain: CLOB fills at $0.50, spends 800 USDC, receives 1600 tokens
3. `finalizeBuyOutcome(1)` → Safe transfers 1600 tokens to vault

**Vault `mint(Alice, 800e6, 1600, Senior)`:**
- `lastExecutionPrice = 800 × 1e18 / 1600 = 0.50e18` (updated BEFORE NAV)
- First mint: `shares = usdcAmount = 800`

```
senior: { 800, 800, 0 }
junior: { 0, 0, 0 }
totalOutcomeTokens = 1600
lastExecutionPrice = 0.50e18
shareBalanceOf[Alice][Senior] = 800
```

#### A2 — Bob deposits $200 as Junior (buy at $0.50)

**Calls:**
1. `prepareBuyOutcomeJunior(Safe(Bob), CTF_EXCHANGE, C, 0, T, 200e6)` → Position #2
2. Off-chain: fills at $0.50, spends 200, receives 400 tokens
3. `finalizeBuyOutcome(2)`

**Vault `mint(Bob, 200e6, 400, Junior)`:**
- `lastExecutionPrice = 200 × 1e18 / 400 = 0.50e18` (unchanged)
- First junior mint: `shares = 200`

```
senior: { 800, 800, 0 }
junior: { 200, 200, 0 }
totalOutcomeTokens = 2000
lastExecutionPrice = 0.50e18
shareBalanceOf[Alice][Senior] = 800
shareBalanceOf[Bob][Junior] = 200
```

#### A3 — NAV Check at $0.70 (unrealized)

On-chain `lastExecutionPrice` is still $0.50. NAV only updates on execution. Frontend can show estimated NAV using off-chain mid-price.

If we computed at $0.70:
```
DV = 2000 × 0.70 = 1400
Δ = 1400 - 1000 = 400 (profit)
seniorDeployedNAV = 800 + 0.4 × 400 = 960
juniorDeployedNAV = 200 + 0.6 × 400 = 440
```

#### A4 — Alice exits (sell fills at $0.70)

**Calls:**
1. `prepareExitOutcome(1)` → calls `vault.redeem(Alice, 800, Senior, Safe(Alice))`

**Vault `redeem()` math (at lastExecutionPrice = $0.50):**
- `trancheDeployedNAV(Senior)`: at $0.50, DV = 1000, Δ = 0, seniorNAV = 800
- `deployedExitValue = 800 × 800 / 800 = 800`
- `payoutPerToken(Senior)`: at $0.50, no profit, senior payout = sPrinPerToken = $0.40
- `tokens = ceil(800 / 0.40) = 2000` (capped at vault balance = 2000)
- Burns 800 senior shares
- Removes proportional principal: `sPrinExit = 800 × 2000/2000 = 800`, `jPrinExit = 200 × 2000/2000 = 200`
- Transfers 2000 tokens to Safe(Alice)
- Creates PendingExit

2. Off-chain: all 2000 tokens sold at $0.70, Safe receives $1400

3. `finalizeExitOutcome(1)`:
   - `tokensNow = 0`, `tokensSold = 2000`
   - `usdcNow = 1400`
   - Safe transfers $1400 to vault
   - `vault.settleExit(Alice, 800, Senior, 1400)`

**Vault `settleExit()` math:**
- `lastExecutionPrice = 1400 × 1e18 / 2000 = 0.70e18`
- `sPrinSold = 800`, `jPrinSold = 200`
- `_splitProceeds(1400, 800, 200)`:
  - Profit: `1400 - 1000 = 400`
  - `sGain = 0.4 × 400 = 160`
  - `sAmount = 800 + 160 = 960`
  - `jAmount = 440`
- Alice (senior, owner) receives: **$960**
- Junior counterparty: `junior.usdcCash += 440`
- PendingExit cleared

```
senior: { 0, 0, 0 }
junior: { 200, 0, 440 }
totalOutcomeTokens = 0
lastExecutionPrice = 0.70e18
shareBalanceOf[Alice][Senior] = 0
shareBalanceOf[Bob][Junior] = 200
```

**Alice result: Deposited $800, received $960 → +$160 (+20%)**

#### A5 — Bob exits

1. `prepareExitOutcome(2)` → `vault.redeem(Bob, 200, Junior, Safe(Bob))`

**Vault `redeem()` math:**
- `totalOutcomeTokens = 0`, `lastExecutionPrice = 0.70e18`
- `deployedValue = 0` → `trancheDeployedNAV(Junior) = 0`
- `deployedExitValue = 0` → `conditionTokenAmount = 0` (no tokens to assign)
- `reservedCash = junior.usdcCash × 200/200 = 440`
- Burns 200 junior shares, creates PendingExit with `tokensAssigned = 0`

2. `finalizeExitOutcome(2)` → `vault.settleExit(Bob, 200, Junior, 0)`
   - Cash-only exit: Bob receives **$440** from reserved cash

```
senior: { 0, 0, 0 }
junior: { 0, 0, 0 }
totalOutcomeTokens = 0
lastExecutionPrice = 0.70e18
```

**Bob result: Deposited $200, received $440 → +$240 (+120%)**

---

### Path B: Price Drops → Exit at Loss (Junior Absorbed)

**Starting from A2 state** (2000 tokens, principals 800/200, price $0.50).

Suppose exit sells execute at **$0.40**.

**NAV at $0.40:**
```
DV = 2000 × 0.40 = 800
L = 1000 - 800 = 200
Junior principal = 200 → junior absorbs entire loss
juniorNAV = max(0, 200 - 200) = 0
seniorNAV = 800
```

**Outcomes:**
- Junior exits → receives **$0** (completely wiped)
- Senior exits → receives **$800** (fully protected)

Senior deposited $800, got $800 back. Underlying dropped 20%, senior lost nothing.

---

### Path C: Deep Loss → Senior Takes Losses

**Same starting state.** Exit at **$0.30**.

```
DV = 2000 × 0.30 = 600
L = 1000 - 600 = 400
Junior principal = 200 → wiped (absorbs first 200)
Remaining loss = 200 → senior absorbs
juniorNAV = 0
seniorNAV = 600
```

- Junior: **$0**
- Senior: **$600** (deposited $800, lost $200 = -25%)

Underlying dropped 40%. Senior lost only 25%. Junior acted as partial buffer.

---

### Path D: Junior Exits Early → Counterparty Cash → Senior Exits Later

**Starting from A2 state.** Price rises to $0.60.

```
DV = 2000 × 0.60 = 1200
Δ = 200
seniorNAV = 800 + 0.4 × 200 = 880
juniorNAV = 200 + 0.6 × 200 = 320
```

#### D1 — Bob (junior) exits

Bob's micro-pod calculation:
- `payoutPerToken(Junior)` at $0.60: `jPrinPerToken = $0.10`, profit/token = $0.10, jGain = $0.06
- Junior payout/token = `$0.10 + $0.06 = $0.16`
- `tokens = ceil(320 / 0.16) = 2000` (all tokens — junior holds all junior shares)

Selling 2000 tokens at $0.60 yields $1200:
- `_splitProceeds(1200, 800, 200)`: sAmount = 880, jAmount = 320
- Bob receives: **$320**
- `senior.usdcCash += 880`

```
senior: { 800, 0, 880 }
junior: { 0, 0, 0 }
totalOutcomeTokens = 0
```

#### D2 — Alice (senior) exits later

Alice's exit is now cash-only:
- `redeem()` finds `totalOutcomeTokens = 0`, so `conditionTokenAmount = 0`
- `reservedCash = 880`
- `settleExit()` pays $880 from reserved cash

**Alice result: Deposited $800, received $880 → +$80 (+10%)**

**Key insight:** Alice's $880 now sits as USDC cash, immune to future token price moves. Even if the market later resolves NO, the $880 is safe.

---

### Path E: Market Resolves YES → redeemPosition

**From A2 state.** Market resolves YES ($1.00/token).

**Alice calls `redeemPosition(1)`:**
1. `vault.redeem(Alice, 800, Senior, Safe(Alice))` → assigns 2000 tokens (all) to Safe
2. Safe calls `CTF.redeemPositions(...)` → 2000 tokens redeemed at $1.00 = $2000 USDC
3. `usdcDelta = 2000`
4. Safe transfers $2000 to vault
5. `vault.settleExit(Alice, 800, Senior, 2000)`
   - `_splitProceeds(2000, 800, 200)`: profit = 1000, sGain = 400
   - sAmount = 1200, jAmount = 800
   - Alice receives: **$1200**
   - `junior.usdcCash += 800`

**Bob calls `redeemPosition(2)`:**
- Cash-only exit, receives **$800**

**Results:**
- Alice: $800 → $1200 (+50%)
- Bob: $200 → $800 (+300%)
- Underlying moved +100%. Junior got 3× the move.

---

### Path F: Market Resolves NO → redeemPosition

**From A2 state.** Market resolves NO ($0.00/token).

**Alice calls `redeemPosition(1)`:**
1. `vault.redeem()` → tokens to Safe
2. `CTF.redeemPositions()` → tokens are worthless, `usdcDelta = 0`
3. `vault.settleExit(Alice, 800, Senior, 0)`
   - `_splitProceeds(0, 800, 200)`: total loss, junior wiped
   - sAmount = 0, jAmount = 0
   - Alice receives reserved cash only (if any)

If no prior counterparty exits: both receive **$0**.

If prior counterparty exits had created `usdcCash`: that USDC is preserved and distributed to the respective tranche's exiting shares.

---

### Path G: Prepare Exit → Cancel Exit → Return to Purchased

1. `prepareExitOutcome(positionId)`:
   - Vault burns shares, transfers tokens to Safe, creates PendingExit
   - Position status → `PreparedExit`

2. No CLOB sell occurs. Safe still holds all assigned tokens, no USDC.

3. `cancelExitOutcome(positionId)`:
   - Verifies: `tokensNow ≥ conditionTokensForSale` (no tokens sold)
   - Verifies: `usdcNow == 0` (no proceeds)
   - Safe transfers tokens back to vault via `CTF.safeTransferFrom`

4. Vault's `onERC1155Received()` fires:
   - Detects PendingExit for this receiver
   - Verifies `value == pe.tokensRemaining`
   - **Restores**: shares, principal (both tranches), totalOutcomeTokens, reserved cash
   - Clears PendingExit

5. BounceV2 sets: `status = Purchased`, `activeBet = false`

---

### Path H: Prepare Buy → Cancel Buy → Return USDC

1. `prepareBuyOutcome*(...)`:
   - USDC transferred user → Safe
   - Allowance set Safe → exchange
   - Position status → `Prepared`

2. No CLOB fill occurs.

3. `cancelBuyOutcome(positionId)`:
   - Verifies: allowance unchanged (exchange hasn't pulled USDC)
   - Verifies: token balance unchanged (no tokens received)
   - Clears all approvals
   - Transfers reserved USDC Safe → owner (capped at actual balance)
   - Position status → `Cancelled`, `activeBet = false`

---

### Path I: Partial CLOB Fill → Finalize → Still Open → Finalize Again

**Key mechanics:**
`settleExit()` infers tokens sold since last settle:
```
tokensSold = pe.tokensRemaining - CTF.balanceOf(receiver, outcomeTokenId)
```

**Timeline:**
1. `prepareExitOutcome()` → assigns 1000 tokens to Safe

2. First partial fill: 400 tokens sold, Safe has $220 USDC
3. `finalizeExitOutcome()`:
   - `tokensSold = 1000 - 600 = 400`
   - Settles 400-token chunk, pro-rates principal:
     - `sPrinSold = seniorPrinRemaining × 400/1000`
     - `jPrinSold = juniorPrinRemaining × 400/1000`
   - Updates `pe.tokensRemaining = 600`
   - Position stays open (tokens remain)

4. Second fill: 500 more tokens sold, Safe has $310 USDC
5. `finalizeExitOutcome()`:
   - `tokensSold = 600 - 100 = 500`
   - Settles 500-token chunk

6. Remaining `100 ≤ DUST_THRESHOLD (10_000)`? If raw units, then 100 tokens may be above or below threshold. If `≤ 10_000`:
   - Dust write-off: remaining principal settled at $0 proceeds
   - PendingExit cleared
   - Position closed

---

### Path J: Second Deposit After Price Move → Share Dilution Prevention

**The problem:** If `lastExecutionPrice` is stale ($0.50) but new depositor buys at $0.70, they'd get shares valued at $0.50 NAV — too many shares, diluting existing holders.

**The fix in `mint()`:**
```solidity
// Update price BEFORE computing NAV
lastExecutionPrice = usdcAmount × 1e18 / outcomeTokensAmount;
uint256 nav = _trancheTotalNAV(tranche);
shares = usdcAmount × totalShares / nav;
```

**Example:**
- Existing: 800 senior shares, principal $800, 1600 tokens, price $0.50
- Carol deposits $100 senior, buys 142.86 tokens at $0.70

In `mint()`:
1. `lastExecutionPrice = 100/142.86 = $0.70` (updated first!)
2. NAV at new price:
   - `DV = 1600 × 0.70 = 1120`
   - `seniorDeployedNAV = 800 + 0.4 × (1120 - 1000) = 848`
   - `seniorTotalNAV = 848`
3. `shares = 100 × 800 / 848 = 94.34` shares (fair dilution-free amount)

Without the fix, at stale $0.50: NAV = 800, shares = 100 × 800/800 = 100 shares → overpaid.

---

### Path K: Single Tranche Only (No Counterparty) → Exit

**Edge case:** Only senior deposits, no junior exists.

```
senior: { 800, 800, 0 }
junior: { 0, 0, 0 }
totalOutcomeTokens = 1600
lastExecutionPrice = 0.50e18
```

**In `_tranchePayoutPerToken(Senior)`:**
- `jPrinPerToken = 0` and tranche is Senior → returns `lastExecutionPrice` directly
- Senior gets **100% of proceeds** (no counterparty to split with)

**In `_splitProceeds(proceeds, sPrin, 0)`:**
- Returns `(proceeds, 0)` — all to senior

Single-tranche vault behaves like a normal pooled exposure with no tranching.

---

## 8. Key Invariants

1. **Only BounceV2 can mutate vault accounting** — `onlyBounceV2` modifier on `mint`, `redeem`, `settleExit`

2. **No concurrent Safe lifecycle** — `safes_[safe].activeBet` prevents overlapping prepared buy/exit/redeem flows

3. **Share conservation** — `tranche.totalShares == Σ shareBalanceOf[*][tranche]` (modulo pending exits where shares are burned and restored on cancel)

4. **Single active pending exit per (owner, tranche)** — `redeem()` reverts if `PendingExitExists()`

5. **Counterparty value preservation** — USDC proceeds attributable to the counterparty tranche are stored in `counterparty.usdcCash`, never lost

6. **Loss absorption order** — `_splitProceeds()` and `_currentDeployedNAVs()` enforce: junior losses first, senior protected until junior wiped

7. **Dust closure** — Tokens `≤ 10_000` are treated as dust, preventing stuck positions

8. **Guard enforcement** — Direct Safe transactions always revert via `checkTransaction()`, ensuring all Safe interactions go through BounceV2's module path

---

## 9. Edge Cases & Safety Mechanisms

### 9.1 Dust Threshold
- BounceV2: closes positions when Safe token balance `≤ 10_000`
- BounceVault: writes off dust principal in `settleExit()` when `tokensRemaining ≤ DUST_THRESHOLD`
- Prevents positions from getting stuck due to rounding remainders

### 9.2 Partial Fills
- `settleExit()` can be called multiple times for the same pending exit
- Settles based on incremental tokens sold since last call
- Pro-rates principal proportionally within the remaining exit amounts

### 9.3 Cancellation Restore Logic
- `onERC1155Received()` restores state **only if**:
  - Returned amount equals `pe.tokensRemaining` (exact match)
  - Receiver matches the pending exit's receiver
  - Pending exit exists and is active
- Prevents accidental or malicious partial restores

### 9.4 Buy Settlement Detection (Donation-Resistant)
- Uses **allowance delta** (not Safe balance) to detect USDC spent
- Also checks token balance delta to verify tokens were received
- Donating USDC to Safe cannot fake a "spent" amount

### 9.5 Exit Settlement Detection
- Uses token balance changes + Safe's USDC balance
- Donating USDC to Safe would be treated as proceeds and split (donor loses money — not a theft vector)
- Guard prevents owner from doing arbitrary Safe actions

### 9.6 Price Update Ordering
- `mint()` updates `lastExecutionPrice` **before** computing NAV
- Prevents stale-price share dilution on new deposits

---

## Appendix: Function Signatures

### BounceV2
```solidity
createVault(VaultParams memory) → address vault
deploySafe(factorySig, enableModuleSig, setGuardSig) → address safe
prepareBuyOutcomeJunior(safe, exchange, conditionId, outcomeIndex, outcomeTokenId, usdcSpendAmount) → uint256 positionId
prepareBuyOutcomeSenior(safe, exchange, conditionId, outcomeIndex, outcomeTokenId, usdcSpendAmount) → uint256 positionId
finalizeBuyOutcome(positionId)
cancelBuyOutcome(positionId)
prepareExitOutcome(positionId) → uint256 conditionTokenBalance
finalizeExitOutcome(positionId)
cancelExitOutcome(positionId)
redeemPosition(positionId)
getPosition(positionId) → Position
getSafe(safe) → Safe
nextPositionId() → uint256
predictSafeAddress(owner) → address
getVaultAddress(conditionId, outcomeIndex, outcomeTokenId, exchange) → address
```

### BounceVault
```solidity
mint(to, usdcAmount, outcomeTokensAmount, tranche) → uint256 shares
redeem(owner, shares, tranche, receiver) → uint256 conditionTokenAmount
settleExit(owner, shares, tranche, usdcProceeds) → (uint256 ownerAmount, uint256 counterpartyAmount)
onERC1155Received(operator, from, id, value, data) → bytes4
onERC1155BatchReceived(operator, from, ids, values, data) → bytes4
```
