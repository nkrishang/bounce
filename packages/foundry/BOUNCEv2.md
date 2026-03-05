# Bounce V2: Protocol Architecture Specification

## Purpose of This Document

This document is a complete technical specification for the Bounce V2 smart contract protocol. It is written to be fed directly to an LLM for implementation. Every design decision is explained with its rationale. Every edge case is covered. The implementing engineer or LLM should be able to build the full protocol from this document alone.

---

## 1. What Bounce V2 Does

Bounce V2 is a tranching protocol built on top of Polymarket. It allows users to deposit USDC into a vault associated with a specific Polymarket outcome token (e.g., a YES token for a given market). The vault splits depositors into two groups:

- **Senior depositors** accept a smaller share of profits in exchange for downside protection. They are the last to lose money.
- **Junior depositors** accept first-loss risk in exchange for leveraged upside. They are the first to lose money.

The vault pools capital from many depositors rather than matching them peer-to-peer. Both senior and junior depositors receive fungible ERC-4626 vault shares in return for their deposits. These shares can be redeemed at any time for USDC based on the current Net Asset Value (NAV) of the vault.

---

## 2. Core Protocol Parameters

These parameters are fixed. They do not change based on vault utilization.

| Parameter | Value | Description |
|---|---|---|
| Target utilization ratio | 80:20 | 80% of deployed capital is senior, 20% is junior |
| Senior profit share (α_s) | 40% | Senior receives 40% of gains on matched capital |
| Junior profit share (α_j) | 60% | Junior receives 60% of gains on matched capital |
| Loss absorption order | Junior first | Junior tranche absorbs losses before senior is touched |

---

## 3. Vault Architecture

### 3.1 One Vault Per Outcome Token

Each Bounce V2 vault is deployed for exactly one Polymarket outcome token. For example, one vault for the YES token of market X, a separate vault for the NO token of market X. Vaults are independent and do not share state.

### 3.2 Three Contracts Per Vault

Each vault is composed of three smart contracts:

**`BounceCorePool.sol`**
The engine. Holds all physical YES tokens and all idle USDC. Contains all accounting logic, NAV calculations, and liquidation execution. Is not itself tokenized. Not directly interacted with by users.

**`BounceSeniorVault.sol`** (ERC-4626)
The senior-facing interface. Users deposit USDC here and receive `bSen-[MARKET]` shares. Passes deposited USDC to `BounceCorePool`. On withdrawal, pulls USDC from `BounceCorePool` and returns it to the user. Implements full ERC-4626 interface.

**`BounceJuniorVault.sol`** (ERC-4626)
The junior-facing interface. Identical in structure to `BounceSeniorVault` but issues `bJun-[MARKET]` shares and interacts with the junior ledger in `BounceCorePool`.

---

## 4. State Variables in BounceCorePool

The following variables represent the complete state of the vault at any point in time.

```
// Token holdings
uint256 totalYesTokens           // Total YES tokens physically held in the vault

// Senior ledger
uint256 seniorPrincipalTotal     // Total USDC deposited by senior users (matched + unmatched)
uint256 seniorSharesTotal        // Total senior ERC-4626 shares outstanding
uint256 seniorMatchedPrincipal   // USDC worth of senior capital currently matched and deployed
uint256 seniorUsdcCash           // Idle USDC in the senior ledger (from counterparty exits)
uint256 seniorUnmatchedUsdc      // USDC deposited by senior but not yet matched to junior

// Junior ledger
uint256 juniorPrincipalTotal     // Total USDC deposited by junior users (matched + unmatched)
uint256 juniorSharesTotal        // Total junior ERC-4626 shares outstanding
uint256 juniorMatchedPrincipal   // USDC worth of junior capital currently matched and deployed
uint256 juniorUsdcCash           // Idle USDC in the junior ledger (from counterparty exits)
uint256 juniorUnmatchedUsdc      // USDC deposited by junior but not yet matched to senior

// Reference price
uint256 lastExecutionPrice       // Price of YES token at last buy/sell execution (18 decimals)
```

---

## 5. The Matching Mechanism

### 5.1 The 80:20 Rule

Capital is only deployed into YES tokens in matched pairs. For every $1 of junior capital deployed, $4 of senior capital must also be deployed alongside it. This maintains the 80:20 ratio.

Unmatched capital on either side sits idle in its respective unmatched USDC ledger. It earns nothing. It has no YES token exposure. It redeems at par ($1 in, $1 out) until matched.

### 5.2 Matching on Deposit

When a new deposit arrives (either senior or junior), the protocol immediately attempts to match it against any available unmatched capital on the other side.

**New senior deposit arrives:**
1. Check `juniorUnmatchedUsdc`.
2. If junior unmatched exists, calculate how much senior can be matched against it at 80:20.
   - Max matchable senior = `juniorUnmatchedUsdc × 4`
3. Match `min(newSeniorDeposit, maxMatchableSenior)` of senior against the corresponding junior.
4. Deploy the matched total into YES tokens via `executeBuy()`.
5. Remaining senior goes into `seniorUnmatchedUsdc`.

**New junior deposit arrives:**
1. Check `seniorUnmatchedUsdc`.
2. If senior unmatched exists, calculate how much junior can be matched against it.
   - Max matchable junior = `seniorUnmatchedUsdc ÷ 4`
3. Match `min(newJuniorDeposit, maxMatchableJunior)` of junior against the corresponding senior.
4. Deploy matched total into YES tokens via `executeBuy()`.
5. Remaining junior goes into `juniorUnmatchedUsdc`.

---

## 6. Price Discovery and NAV Updates

### 6.1 The Lazy Oracle Model

The contract has no continuous access to YES token prices. Polymarket prices exist off-chain in the orderbook. The contract only learns the true price at the moment it executes a trade on Polymarket's CTF Exchange.

This is intentional and sufficient. The contract only needs to be correct at the moment of execution. Between executions, the stored `lastExecutionPrice` is stale, but this is a display problem, not a contract problem.

### 6.2 Price Update Triggers

`lastExecutionPrice` is updated exactly twice:

- After every `executeBuy()` — price = average fill price of the buy
- After every `executeSell()` — price = average fill price of the sell

No other mechanism updates the price. No oracle. No admin.

### 6.3 Frontend NAV Display

The frontend independently queries the Polymarket orderbook for the current mid-price and uses it to compute a live estimated NAV for display purposes. This estimated NAV may differ slightly from what the contract will execute at. This is expected and acceptable — it is how every DEX interface works.

---

## 7. NAV Calculation

NAV is calculated separately for senior and junior. The calculation runs in four steps.

### Step 1: Global Vault Value

```
deployedTokenValue = totalYesTokens × lastExecutionPrice
globalVaultValue = deployedTokenValue + seniorUsdcCash + juniorUsdcCash
                   + seniorUnmatchedUsdc + juniorUnmatchedUsdc
```

### Step 2: Deployed PnL

Only matched/deployed capital generates PnL. Unmatched USDC is always at par.

```
totalMatchedPrincipal = seniorMatchedPrincipal + juniorMatchedPrincipal
deployedValue = totalYesTokens × lastExecutionPrice
ΔV = deployedValue - totalMatchedPrincipal
```

### Step 3: Tranche PnL Split

**If ΔV ≥ 0 (profit):**
```
seniorDeployedNAV = seniorMatchedPrincipal + (0.4 × ΔV)
juniorDeployedNAV = juniorMatchedPrincipal + (0.6 × ΔV)
```

**If ΔV < 0 (loss):**
```
juniorDeployedNAV = max(0, juniorMatchedPrincipal + ΔV)
seniorDeployedNAV = min(seniorMatchedPrincipal, deployedValue)
```

Note: If `|ΔV| ≥ juniorMatchedPrincipal`, junior is wiped out and senior begins absorbing losses.

### Step 4: Total Tranche NAV and NAV Per Share

```
seniorTotalNAV = seniorDeployedNAV + seniorUsdcCash + seniorUnmatchedUsdc
juniorTotalNAV = juniorDeployedNAV + juniorUsdcCash + juniorUnmatchedUsdc

seniorNAVPerShare = seniorTotalNAV / seniorSharesTotal
juniorNAVPerShare = juniorTotalNAV / juniorSharesTotal
```

These are the values returned by the ERC-4626 `convertToAssets()` function on each vault facade.

---

## 8. Deposit Flow

### depositSenior(usdcAmount)

1. Transfer `usdcAmount` USDC from user to `BounceCorePool`.
2. Calculate current `seniorNAVPerShare`.
3. Issue `usdcAmount / seniorNAVPerShare` shares to user via `BounceSeniorVault`.
4. Increment `seniorPrincipalTotal` by `usdcAmount`.
5. Attempt matching against `juniorUnmatchedUsdc`:
   - If junior unmatched exists, match and call `executeBuy(matchedTotal)`.
   - Update `seniorMatchedPrincipal` and `juniorMatchedPrincipal` accordingly.
   - Remaining unmatched senior goes into `seniorUnmatchedUsdc`.

### depositJunior(usdcAmount)

Identical to `depositSenior` with tranches reversed.

---

## 9. Withdrawal Flow

### withdrawSenior(shareAmount)

1. Calculate USDC owed: `usdcOwed = shareAmount × seniorNAVPerShare`.
2. Determine what portion of `usdcOwed` comes from unmatched vs deployed:
   - First draw from `seniorUnmatchedUsdc` (at par, no liquidation needed).
   - If more is needed, calculate how many YES tokens need to be sold to cover the remainder.
3. If token liquidation is needed:
   a. Calculate the micro-pod: the minimum number of YES tokens that, when sold, covers the senior's exit value. This must respect the 80:20 ratio — selling N tokens generates both a senior payout and a junior payout simultaneously.
   b. Call `executeSell(tokenAmount)`.
   c. Route senior's portion (`seniorDeployedNAV` share) to the withdrawing user.
   d. Route junior's portion (`juniorDeployedNAV` share) into `juniorUsdcCash`.
4. Burn `shareAmount` senior shares.
5. Decrement `seniorPrincipalTotal` and `seniorMatchedPrincipal` proportionally.

### withdrawJunior(shareAmount)

Identical with tranches reversed. Junior's counterparty exit value routes into `seniorUsdcCash`.

### Key Invariant on Withdrawal

When the protocol sells tokens to fulfill one user's exit, the counterparty's realized value does not disappear — it is stored as idle USDC in the counterparty's cash ledger. The counterparty's NAV is unaffected by the other side's exit. Their future withdrawal will draw from this cash ledger instead of requiring another token sale.

---

## 10. Resolution Flow

When the Polymarket market resolves, the Polymarket oracle sets the final price to either $1.00 (YES wins) or $0.00 (YES loses).

### Resolution: YES Wins ($1.00)

1. The vault redeems all remaining YES tokens via Polymarket's CTF Exchange contract at $1.00 each. No open market selling, zero slippage.
2. The redeemed USDC flows into the vault.
3. Final PnL is calculated and split 40:60 between matched senior and junior capital.
4. All unmatched USDC is returned at par.
5. Users burn their shares to claim their proportional slice of the final USDC pool.

### Resolution: YES Loses ($0.00)

1. All YES tokens become worthless. The vault makes no attempt to sell them.
2. Any USDC previously accumulated in the cash ledgers (from counterparty exits prior to resolution) is fully preserved. This is a critical property: users who exited early generated USDC that is safe regardless of resolution.
3. Users burn their shares to claim their proportional slice of surviving USDC cash. Shares backed only by YES tokens receive nothing.

---

## 11. The Two Execution Primitives

All interaction with Polymarket's CTF Exchange contract routes through exactly two internal functions.

### executeBuy(usdcAmount) → tokensReceived

- Approves Polymarket's CTF Exchange to spend `usdcAmount` USDC.
- Executes a market buy for YES tokens.
- Records `tokensReceived` and updates `totalYesTokens`.
- Updates `lastExecutionPrice = usdcAmount / tokensReceived`.
- Returns `tokensReceived`.

### executeSell(tokenAmount) → usdcReceived

- Approves Polymarket's CTF Exchange to spend `tokenAmount` YES tokens.
- Executes a market sell.
- Records `usdcReceived` and decrements `totalYesTokens`.
- Updates `lastExecutionPrice = usdcReceived / tokenAmount`.
- Returns `usdcReceived`.

Note on slippage: Slippage on open-market sells is implicit in the fill price. The actual `usdcReceived` may be less than the pre-trade estimated value. This reduced amount is what gets distributed between the exiting user and the counterparty's cash ledger. Slippage is effectively borne proportionally by both tranches through the payout functions.

---

## 12. Account Abstraction Layer

To enable single-signature multi-step transactions, Bounce V2 uses a non-custodial Smart Account architecture.

- On first connection, the frontend deploys a dedicated Gnosis Safe for the user via the Polymarket Safe Factory.
- The `BounceCorePool` contract is attached to the user's Safe as both a Module and a Transaction Guard.
- The user retains full ownership of their Safe. Bounce has permission to execute transaction bundles on the user's behalf.
- This allows a deposit to atomically: receive USDC → buy YES tokens → update ledger → issue shares — in a single user signature.

---

## 13. Worked Example Scenarios

The following scenarios use a single vault throughout. Parameters:

- YES token market: "Will X happen?"
- Target ratio: 80:20 Senior:Junior
- Profit split: 40:60 Senior:Junior
- Starting YES token price: $0.50

---

### Scenario A: Normal Deposits, Price Rises, All Exit

**Day 1:**

Alice deposits $800 as Senior. No junior exists yet, so her capital sits as `seniorUnmatchedUsdc = $800`. She receives 800 senior shares at $1.00/share.

Carol deposits $200 as Junior. Protocol detects $800 unmatched senior. Matches all: $800 senior + $200 junior = $1000 deployed. Calls `executeBuy($1000)`, receives 2000 YES tokens at $0.50. Updates `lastExecutionPrice = $0.50`.

Carol receives 200 junior shares at $1.00/share.

State: `totalYesTokens = 2000`, `seniorMatchedPrincipal = $800`, `juniorMatchedPrincipal = $200`.

**Day 5, price rises to $0.70:**

Bob deposits $100 as Junior. No unmatched senior exists, so Bob's capital sits as `juniorUnmatchedUsdc = $100`. Current `juniorNAVPerShare`:

```
deployedValue = 2000 × $0.70 = $1400
ΔV = $1400 - $1000 = +$400
juniorDeployedNAV = $200 + (0.6 × $400) = $440
juniorTotalNAV = $440 + $0 (cash) + $100 (unmatched) = $540
juniorSharesTotal = 200
juniorNAVPerShare = $540 / 200 = $2.70
```

Bob receives `$100 / $2.70 = 37.04` junior shares.

**Day 10, price rises to $0.80:**

All three users exit.

```
deployedValue = 2000 × $0.80 = $1600
ΔV = $1600 - $1000 = +$600
seniorDeployedNAV = $800 + (0.4 × $600) = $1040
juniorDeployedNAV = $200 + (0.6 × $600) = $560

seniorNAVPerShare = $1040 / 800 = $1.30
juniorNAVPerShare (deployed portion) = $560 / 200 = $2.80
```

For Bob's unmatched $100 (at par): distributed proportionally via share count.

Alice exits 800 shares: receives `800 × $1.30 = $1040`. Deposited $800. Profit +$240 (+30%).
Carol exits 200 shares: receives `200 × $2.80 = $560`. Deposited $200. Profit +$360 (+180%).
Bob exits 37.04 shares: receives ~$100 (his capital was unmatched, returned at par).

---

### Scenario B: Price Drops, Junior Partially Wiped

**Setup (same as Scenario A Day 1):** 2000 YES tokens, $800 senior matched, $200 junior matched, price $0.50.

**Price drops to $0.40:**

```
deployedValue = 2000 × $0.40 = $800
ΔV = $800 - $1000 = -$200

juniorDeployedNAV = max(0, $200 + (-$200)) = $0
seniorDeployedNAV = min($800, $800) = $800
```

Carol exits: receives $0. Completely wiped out.
Alice exits: receives $800. Deposited $800. Lost nothing.

Underlying moved -20%. Junior absorbed 100% of the loss. Senior is untouched.

---

### Scenario C: Price Drops Below Junior Buffer, Senior Takes Losses

**Setup:** Same as above.

**Price drops to $0.30:**

```
deployedValue = 2000 × $0.30 = $600
ΔV = $600 - $1000 = -$400

juniorDeployedNAV = max(0, $200 + (-$400)) = $0   // Junior wiped
seniorDeployedNAV = min($800, $600) = $600         // Senior takes remaining loss
```

Carol exits: receives $0.
Alice exits: receives $600. Deposited $800. Lost $200 (-25%).

Underlying moved -40%. Alice lost 25% — meaningfully less than the 40% she would have lost holding the token outright. Junior acted as a partial buffer even in a catastrophic scenario.

---

### Scenario D: Junior Exits Early, Counterparty Value Preserved

**Setup:** Same as Scenario A Day 1. Price has risen to $0.60.

```
deployedValue = 2000 × $0.60 = $1200
ΔV = +$200

juniorDeployedNAV = $200 + (0.6 × $200) = $320
seniorDeployedNAV = $800 + (0.4 × $200) = $880
```

Carol exits all 200 junior shares. Protocol must sell tokens to pay her.

Micro-pod for Carol's exit:
- Carol is owed $320.
- At the 80:20 ratio, selling tokens worth $320 (junior's share) requires selling a pod worth $320 + $880 = $1,200... wait — we need to find the number of tokens N such that selling N tokens generates enough to pay both tranches.

Correct micro-pod calculation:
- Carol's $320 represents 60% of profits + 20% of principal on N tokens.
- The corresponding senior entitlement on those same N tokens is $880.
- Total proceeds from selling N tokens = $320 + $880 = $1200 USDC (which is exactly the current pod value: 2000 × $0.60).

All 2000 tokens are sold (since Carol holds all junior).

- Carol receives $320 USDC.
- $880 USDC is deposited into `seniorUsdcCash`.

Alice has not exited. Her $880 now sits safely as USDC in the senior cash ledger. Even if the market subsequently resolves NO (total loss), Alice's $880 is preserved. This is the key invariant: counterparty USDC cash is safe regardless of what happens to the underlying YES tokens afterward.

---

### Scenario E: Market Resolves YES Before Any Exits

**Setup:** 2000 YES tokens, $800 senior matched, $200 junior matched. Price was $0.50 at entry.

**Market resolves YES ($1.00):**

1. Vault redeems all 2000 tokens via Polymarket CTF Exchange at $1.00 = $2000 USDC. Zero slippage.
2. ΔV = $2000 - $1000 = +$1000.
3. Senior receives: $800 + (0.4 × $1000) = $1200.
4. Junior receives: $200 + (0.6 × $1000) = $800.

Alice burns 800 senior shares → receives $1200. Return: +50%.
Carol burns 200 junior shares → receives $800. Return: +300%.
Underlying moved +100%. Junior got 3x the underlying move.

---

### Scenario F: Market Resolves NO, Some Prior Counterparty Exits

**Setup:** 2000 YES tokens, $800 senior matched, $200 junior matched. In the past, Dave exited his senior position early, leaving $150 in `juniorUsdcCash`.

**Market resolves NO ($0.00):**

1. YES tokens are worthless. No redemption.
2. `juniorUsdcCash = $150` is fully preserved.
3. Junior depositors burn shares and claim their proportional slice of $150.
4. Senior depositors receive nothing from YES tokens (wiped), and nothing from junior cash (it belongs to junior ledger).

This demonstrates that early counterparty exits create a protected USDC reserve that survives even total loss outcomes.

---

## 14. What the Protocol Does Not Do

- It does not have dynamic profit splits or rate curves. α_s and α_j are fixed at 40:60.
- It does not force capital utilization. Excess capital on either side sits idle.
- It does not use external price oracles. Price is discovered through execution only.
- It does not custody keys. Users retain full ownership of their Gnosis Safe.
- It does not match specific users to each other. All capital is pooled.

---

## 15. Implementation Checklist

The following must be implemented and tested in order:

1. `executeBuy()` and `executeSell()` integration with Polymarket CTF Exchange contract.
2. `BounceCorePool` state variables and NAV calculation logic.
3. Matching logic on deposit (both senior and junior).
4. Micro-pod calculation on withdrawal.
5. USDC routing on withdrawal (to exiting user + counterparty cash ledger).
6. `BounceSeniorVault` and `BounceJuniorVault` ERC-4626 facades with `convertToAssets()` hooked into `BounceCorePool` NAV.
7. Resolution handler triggered by Polymarket oracle.
8. Gnosis Safe account abstraction integration.
9. Frontend live NAV estimation using independent Polymarket orderbook query.
10. Frontend display of matched vs unmatched capital per user position.