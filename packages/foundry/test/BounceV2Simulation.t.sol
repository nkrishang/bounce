// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BounceV2, Safe} from "../src/bounce/BounceV2.sol";
import {BounceVault} from "../src/bounce/BounceVault.sol";
import {VaultParams} from "../src/bounce/interfaces/IVaultParams.sol";
import {PositionStatus, PositionTranche, Position} from "../src/bounce/interfaces/IPosition.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCTF} from "./mocks/MockCTF.sol";
import {MockExchange} from "./mocks/MockExchange.sol";
import {MockSafeModule} from "./mocks/MockSafeModule.sol";
import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

contract BounceV2SimulationTest is Test {
    // ============================================
    // Constants (must match hardcoded addresses)
    // ============================================

    address constant USDC_ADDR = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address constant CTF_ADDR = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;
    address constant CTF_EXCHANGE_ADDR = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;

    bytes32 constant CONDITION_ID = keccak256("TEST_CONDITION");
    uint8 constant OUTCOME_INDEX = 0;
    uint256 constant BUY_PRICE = 500_000; // $0.50 in 6 decimals

    uint256 constant TOLERANCE = 1000; // 0.001 USDC rounding tolerance

    // ============================================
    // State
    // ============================================

    MockERC20 usdc;
    MockCTF ctf;
    MockExchange exchange;

    BounceV2 bounceV2;
    BounceVault vault;
    uint256 outcomeTokenId;

    // ============================================
    // Setup
    // ============================================

    function setUp() public {
        // Deploy mock USDC at hardcoded address.
        MockERC20 usdcImpl = new MockERC20("USDC", "USDC", 6);
        vm.etch(USDC_ADDR, address(usdcImpl).code);
        usdc = MockERC20(USDC_ADDR);

        // Deploy mock CTF at hardcoded address.
        MockCTF ctfImpl = new MockCTF();
        vm.etch(CTF_ADDR, address(ctfImpl).code);
        ctf = MockCTF(CTF_ADDR);
        ctf.setUsdc(USDC_ADDR);

        // Deploy mock exchange at hardcoded address (deployCodeTo preserves constructor storage).
        deployCodeTo(
            "MockExchange.sol:MockExchange",
            abi.encode(USDC_ADDR, CTF_ADDR, BUY_PRICE),
            CTF_EXCHANGE_ADDR
        );
        exchange = MockExchange(CTF_EXCHANGE_ADDR);

        // Fund exchange and CTF with USDC for payouts.
        usdc.mint(CTF_EXCHANGE_ADDR, 1_000_000e6);
        usdc.mint(CTF_ADDR, 1_000_000e6);

        // Deploy BounceV2.
        bounceV2 = new BounceV2();

        // Compute outcomeTokenId (must match MockCTF.redeemPositions logic).
        uint256 indexSet = uint256(1) << uint256(OUTCOME_INDEX);
        outcomeTokenId = uint256(keccak256(abi.encode(CONDITION_ID, indexSet)));

        // Create vault via BounceV2 (CREATE3 deterministic deployment).
        VaultParams memory params = VaultParams({
            conditionId: CONDITION_ID,
            outcomeIndex: OUTCOME_INDEX,
            outcomeTokenId: outcomeTokenId,
            exchange: CTF_EXCHANGE_ADDR,
            bounceV2: address(0) // Set by createVault()
        });
        address vaultAddr = bounceV2.createVault(params);
        vault = BounceVault(vaultAddr);
    }

    // ============================================
    // User setup helper
    // ============================================

    function _createUser(string memory name) internal returns (address user, MockSafeModule safe) {
        user = makeAddr(name);
        safe = new MockSafeModule(user);

        // Configure safe: enable BounceV2 as module and guard.
        safe.enableModule(address(bounceV2));
        safe.setGuard(address(bounceV2));

        // Bypass deploySafe: set safes_[safe].setup = true via vm.store.
        // BounceV2 storage: slot 0 = nextPositionId_, slot 1 = positions_, slot 2 = safes_.
        bytes32 slot = keccak256(abi.encode(address(safe), uint256(2)));
        vm.store(address(bounceV2), slot, bytes32(uint256(1)));

        // Grant CTF approval for exchange (normally done in deploySafe).
        vm.prank(address(safe));
        ctf.setApprovalForAll(CTF_EXCHANGE_ADDR, true);

        // Fund user with USDC and approve BounceV2.
        usdc.mint(user, 10_000e6);
        vm.prank(user);
        usdc.approve(address(bounceV2), type(uint256).max);
    }

    // ============================================
    // Simulation helpers
    // ============================================

    function _simulateBuy(
        address user,
        MockSafeModule safe,
        uint256 usdcAmount,
        PositionTranche tranche
    ) internal returns (uint256 positionId) {
        // Prepare buy.
        vm.prank(user);
        if (tranche == PositionTranche.Senior) {
            positionId = bounceV2.prepareBuyOutcomeSenior(
                address(safe), CTF_EXCHANGE_ADDR, CONDITION_ID, OUTCOME_INDEX, outcomeTokenId, usdcAmount
            );
        } else {
            positionId = bounceV2.prepareBuyOutcomeJunior(
                address(safe), CTF_EXCHANGE_ADDR, CONDITION_ID, OUTCOME_INDEX, outcomeTokenId, usdcAmount
            );
        }

        // Simulate exchange fill: safe calls exchange.buy.
        vm.prank(address(safe));
        exchange.buy(outcomeTokenId, usdcAmount);

        // Finalize: BounceV2 detects allowance consumed + tokens arrived, mints vault shares.
        bounceV2.finalizeBuyOutcome(positionId);
    }

    function _simulateSellExit(
        address user,
        uint256 positionId,
        uint256 sellPrice
    ) internal returns (uint256 payout) {
        Position memory pos = bounceV2.getPosition(positionId);
        address safe = pos.safe;

        // Prepare exit: vault.redeem() transfers tokens to safe.
        vm.prank(user);
        uint256 tokensForSale = bounceV2.prepareExitOutcome(positionId);

        if (tokensForSale == 0) {
            // Cash-only exit: finalize immediately.
            uint256 balBefore = usdc.balanceOf(user);
            bounceV2.finalizeExitOutcome(positionId);
            payout = usdc.balanceOf(user) - balBefore;
            return payout;
        }

        // Simulate exchange sell: zero out safe token balance, mint USDC proceeds.
        uint256 usdcProceeds = (tokensForSale * sellPrice) / 1e6;
        ctf.setBalance(address(safe), outcomeTokenId, 0);
        usdc.mint(address(safe), usdcProceeds);

        // Finalize exit: BounceV2 transfers USDC to vault, calls settleExit.
        uint256 balBefore = usdc.balanceOf(user);
        bounceV2.finalizeExitOutcome(positionId);
        payout = usdc.balanceOf(user) - balBefore;
    }

    function _simulateRedeem(
        address user,
        uint256 positionId,
        uint256 payoutPerShareVal
    ) internal returns (uint256 payout) {
        // Set resolution payout.
        ctf.setPayoutPerShare(CONDITION_ID, payoutPerShareVal);

        uint256 balBefore = usdc.balanceOf(user);
        vm.prank(user);
        bounceV2.redeemPosition(positionId);
        payout = usdc.balanceOf(user) - balBefore;
    }

    // ============================================
    // Logging helpers
    // ============================================

    function _fmt6(uint256 raw) internal pure returns (string memory) {
        uint256 whole = raw / 1e6;
        uint256 frac = (raw % 1e6) / 1e4;
        return string.concat(
            vm.toString(whole), ".", frac < 10 ? string.concat("0", vm.toString(frac)) : vm.toString(frac)
        );
    }

    function _fmtPrice(uint256 raw) internal pure returns (string memory) {
        uint256 whole = raw / 1e18;
        uint256 frac = (raw % 1e18) / 1e16;
        return string.concat(
            "$", vm.toString(whole), ".", frac < 10 ? string.concat("0", vm.toString(frac)) : vm.toString(frac)
        );
    }

    function _fmtPct(uint256 bps) internal pure returns (string memory) {
        uint256 whole = bps / 100;
        uint256 frac = bps % 100;
        return string.concat(
            vm.toString(whole), ".", frac < 10 ? string.concat("0", vm.toString(frac)) : vm.toString(frac), "%"
        );
    }

    function _logVaultState(string memory label) internal view {
        console.log(string.concat("--- Vault State: ", label, " ---"));
        (uint256 sTotalShares, uint256 sPrincipal, uint256 sUsdcCash) = vault.senior();
        (uint256 jTotalShares, uint256 jPrincipal, uint256 jUsdcCash) = vault.junior();
        console.log(string.concat("  Senior: shares=", _fmt6(sTotalShares), ", principal=$", _fmt6(sPrincipal), ", cash=$", _fmt6(sUsdcCash)));
        console.log(string.concat("  Junior: shares=", _fmt6(jTotalShares), ", principal=$", _fmt6(jPrincipal), ", cash=$", _fmt6(jUsdcCash)));
        console.log(string.concat("  totalOutcomeTokens=", _fmt6(vault.totalOutcomeTokens()), ", lastExecutionPrice=", _fmtPrice(vault.lastExecutionPrice())));
    }

    function _logMatchInfo() internal view {
        (,uint256 sPrincipal,) = vault.senior();
        (,uint256 jPrincipal,) = vault.junior();
        uint256 matchedS;
        uint256 matchedJ;
        uint256 unmatchedS;
        uint256 unmatchedJ;

        if (sPrincipal + jPrincipal > 0) {
            if (sPrincipal < jPrincipal * 4) {
                matchedS = sPrincipal;
                matchedJ = sPrincipal / 4;
            } else {
                matchedJ = jPrincipal;
                matchedS = jPrincipal * 4;
            }
            unmatchedS = sPrincipal - matchedS;
            unmatchedJ = jPrincipal - matchedJ;
        }

        console.log(string.concat("  Matching: matchedS=$", _fmt6(matchedS), ", matchedJ=$", _fmt6(matchedJ)));
        console.log(string.concat("  Matching: unmatchedS=$", _fmt6(unmatchedS), ", unmatchedJ=$", _fmt6(unmatchedJ)));

        if (jPrincipal > 0 && sPrincipal < jPrincipal * 4) {
            uint256 k_bps = (sPrincipal * 10_000) / (jPrincipal * 4);
            console.log(string.concat("  k (senior scarce) = ", _fmtPct(k_bps)));
        } else if (sPrincipal > 0 && jPrincipal > 0) {
            console.log("  Fully matched or junior scarce");
        }
    }

    function _logPnL(string memory name, uint256 deposited, uint256 received) internal pure {
        if (received >= deposited) {
            uint256 roiBps = deposited > 0 ? ((received - deposited) * 10_000) / deposited : 0;
            console.log(string.concat("  ", name, ": deposited=$", _fmt6(deposited), ", received=$", _fmt6(received)));
            console.log(string.concat("    ROI = ", _fmtPct(roiBps)));
        } else {
            uint256 lossBps = deposited > 0 ? ((deposited - received) * 10_000) / deposited : 0;
            console.log(string.concat("  ", name, ": deposited=$", _fmt6(deposited), ", received=$", _fmt6(received)));
            console.log(string.concat("    LOSS = ", _fmtPct(lossBps)));
        }
    }

    // ============================================
    // Test 1: Fully matched profit (3x / 0.5x)
    // ============================================

    function test_scenario1_fullyMatchedProfit() public {
        console.log("\n=== Scenario 1: Fully Matched Profit (3x junior / 0.5x senior) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Deposits: Alice 400 senior, Carol 100 junior at $0.50.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");
        _logMatchInfo();

        // Carol exits first at $0.60.
        exchange.setPrice(600_000);
        uint256 carolPayout = _simulateSellExit(carol, carolPosId, 600_000);
        console.log("\n  Carol exit (sell at $0.60):");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        // Alice exits (cash-only, her value is in usdcCash).
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 600_000);
        console.log("  Alice exit (cash-only):");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        // Conservation check.
        console.log(string.concat("\n  Total payouts: $", _fmt6(carolPayout + alicePayout), " (expected: $600.00)"));

        // Assertions.
        assertApproxEqAbs(carolPayout, 160e6, TOLERANCE, "Carol payout ~160");
        assertApproxEqAbs(alicePayout, 440e6, TOLERANCE, "Alice payout ~440");
        assertApproxEqAbs(carolPayout + alicePayout, 600e6, TOLERANCE, "Conservation");

        // Verify positions closed.
        assertEq(uint256(bounceV2.getPosition(carolPosId).status), uint256(PositionStatus.Closed));
        assertEq(uint256(bounceV2.getPosition(alicePosId).status), uint256(PositionStatus.Closed));
    }

    // ============================================
    // Test 2: Senior scarce profit (2x junior leverage)
    // ============================================

    function test_scenario2_seniorScarceProfit() public {
        console.log("\n=== Scenario 2: Senior Scarce Profit (2x junior leverage) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Alice 200 senior, Carol 100 junior. k = 200/(4*100) = 0.5.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 200e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");
        _logMatchInfo();

        // Carol exits at $0.60.
        exchange.setPrice(600_000);
        uint256 carolPayout = _simulateSellExit(carol, carolPosId, 600_000);
        console.log("\n  Carol exit (sell at $0.60):");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        // Alice exits (cash-only).
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 600_000);
        console.log("  Alice exit:");
        _logPnL("Alice (Senior)", 200e6, alicePayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(carolPayout + alicePayout), " (expected: $360.00)"));

        assertApproxEqAbs(carolPayout, 140e6, TOLERANCE, "Carol payout ~140");
        assertApproxEqAbs(alicePayout, 220e6, TOLERANCE, "Alice payout ~220");
        assertApproxEqAbs(carolPayout + alicePayout, 360e6, TOLERANCE, "Conservation");
    }

    // ============================================
    // Test 3: Junior scarce profit (0.75x senior leverage)
    // ============================================

    function test_scenario3_juniorScarceProfit() public {
        console.log("\n=== Scenario 3: Junior Scarce Profit (0.75x senior leverage) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Alice 800 senior, Carol 100 junior. matchedS=400, unmatchedS=400.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 800e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");
        _logMatchInfo();

        // Carol exits first at $0.60 (sells matched tokens).
        exchange.setPrice(600_000);
        uint256 carolPayout = _simulateSellExit(carol, carolPosId, 600_000);
        console.log("\n  Carol exit (sell at $0.60):");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        _logVaultState("After Carol exit");

        // Alice exits (has unmatched tokens + cash from Carol's matched settlement).
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 600_000);
        console.log("  Alice exit:");
        _logPnL("Alice (Senior)", 800e6, alicePayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(carolPayout + alicePayout), " (expected: $1080.00)"));

        assertApproxEqAbs(carolPayout, 160e6, TOLERANCE, "Carol payout ~160");
        assertApproxEqAbs(alicePayout, 920e6, TOLERANCE, "Alice payout ~920");
        assertApproxEqAbs(carolPayout + alicePayout, 1080e6, TOLERANCE, "Conservation");
    }

    // ============================================
    // Test 4: Loss waterfall — junior absorbs, senior protected
    // ============================================

    function test_scenario4_lossJuniorAbsorbs() public {
        console.log("\n=== Scenario 4: Loss Waterfall (junior absorbs, senior protected) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Fully matched: Alice 400 senior, Carol 100 junior.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");

        // Carol exits at $0.45 (10% loss).
        exchange.setPrice(450_000);
        uint256 carolPayout = _simulateSellExit(carol, carolPosId, 450_000);
        console.log("\n  Carol exit (sell at $0.45):");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        // Alice exits (cash-only).
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 450_000);
        console.log("  Alice exit:");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(carolPayout + alicePayout), " (expected: $450.00)"));

        assertApproxEqAbs(carolPayout, 50e6, TOLERANCE, "Carol payout ~50");
        assertApproxEqAbs(alicePayout, 400e6, TOLERANCE, "Alice payout ~400 (protected)");
    }

    // ============================================
    // Test 5: Loss waterfall — junior wiped out
    // ============================================

    function test_scenario5_juniorWipedOut() public {
        console.log("\n=== Scenario 5: Loss Waterfall (junior wiped out) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Fully matched.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");

        // Carol exits at $0.40 (20% loss = 100e6, exactly equals junior principal).
        exchange.setPrice(400_000);
        uint256 carolPayout = _simulateSellExit(carol, carolPosId, 400_000);
        console.log("\n  Carol exit (sell at $0.40):");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        // Alice exits.
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 400_000);
        console.log("  Alice exit:");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(carolPayout + alicePayout), " (expected: $400.00)"));

        assertApproxEqAbs(carolPayout, 0, TOLERANCE, "Carol payout ~0 (wiped)");
        assertApproxEqAbs(alicePayout, 400e6, TOLERANCE, "Alice payout ~400 (protected)");
    }

    // ============================================
    // Test 6: Pro-rata fairness — two juniors same ROI
    // ============================================

    function test_scenario6_proRataFairness() public {
        console.log("\n=== Scenario 6: Pro-Rata Fairness (two juniors, same ROI) ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address b1, MockSafeModule b1Safe) = _createUser("b1");
        (address b2, MockSafeModule b2Safe) = _createUser("b2");

        // Alice 400 senior, B1 60 junior, B2 40 junior. Fully matched (S=400, J=100).
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 b1PosId = _simulateBuy(b1, b1Safe, 60e6, PositionTranche.Junior);
        uint256 b2PosId = _simulateBuy(b2, b2Safe, 40e6, PositionTranche.Junior);

        _logVaultState("After deposits");
        _logMatchInfo();

        // B1 exits first at $0.60.
        exchange.setPrice(600_000);
        uint256 b1Payout = _simulateSellExit(b1, b1PosId, 600_000);
        console.log("\n  B1 exit (sell at $0.60):");
        _logPnL("B1 (Junior)", 60e6, b1Payout);

        _logVaultState("After B1 exit");

        // B2 exits second at $0.60.
        uint256 b2Payout = _simulateSellExit(b2, b2PosId, 600_000);
        console.log("  B2 exit (sell at $0.60):");
        _logPnL("B2 (Junior)", 40e6, b2Payout);

        // Alice exits (cash-only).
        uint256 alicePayout = _simulateSellExit(alice, alicePosId, 600_000);
        console.log("  Alice exit:");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        // Fairness: B1 and B2 should have identical ROI%.
        uint256 b1RoiBps = ((b1Payout - 60e6) * 10_000) / 60e6;
        uint256 b2RoiBps = ((b2Payout - 40e6) * 10_000) / 40e6;
        console.log(string.concat("\n  Fairness check: B1 ROI=", _fmtPct(b1RoiBps), ", B2 ROI=", _fmtPct(b2RoiBps)));
        console.log(string.concat("  Total payouts: $", _fmt6(b1Payout + b2Payout + alicePayout), " (expected: $600.00)"));

        // Both juniors get 60% ROI (3x on 20% move), senior gets 10%.
        assertApproxEqAbs(b1Payout, 96e6, TOLERANCE, "B1 payout ~96");
        assertApproxEqAbs(b2Payout, 64e6, TOLERANCE, "B2 payout ~64");
        assertApproxEqAbs(alicePayout, 440e6, TOLERANCE, "Alice payout ~440");
        assertApproxEqAbs(b1RoiBps, b2RoiBps, 100, "B1 and B2 ROI equal");
        assertApproxEqAbs(b1Payout + b2Payout + alicePayout, 600e6, TOLERANCE, "Conservation");
    }

    // ============================================
    // Test 7: Market resolution YES wins
    // ============================================

    function test_scenario7_resolutionYesWins() public {
        console.log("\n=== Scenario 7: Market Resolution YES Wins ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Fully matched: Alice 400 senior, Carol 100 junior.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");

        // Alice redeems first. payoutPerShare = 1_000_000 ($1/token).
        uint256 alicePayout = _simulateRedeem(alice, alicePosId, 1_000_000);
        console.log("\n  Alice redeem (YES wins at $1.00):");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        _logVaultState("After Alice redeem");

        // Carol redeems (cash-only, her value is in junior.usdcCash).
        uint256 carolPayout = _simulateRedeem(carol, carolPosId, 1_000_000);
        console.log("  Carol redeem:");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(alicePayout + carolPayout), " (expected: $1000.00)"));

        assertApproxEqAbs(alicePayout, 600e6, TOLERANCE, "Alice payout ~600 (50% ROI)");
        assertApproxEqAbs(carolPayout, 400e6, TOLERANCE, "Carol payout ~400 (300% ROI)");
        assertApproxEqAbs(alicePayout + carolPayout, 1000e6, TOLERANCE, "Conservation");
    }

    // ============================================
    // Test 8: Market resolution YES loses
    // ============================================

    function test_scenario8_resolutionYesLoses() public {
        console.log("\n=== Scenario 8: Market Resolution YES Loses ===");

        (address alice, MockSafeModule aliceSafe) = _createUser("alice");
        (address carol, MockSafeModule carolSafe) = _createUser("carol");

        // Fully matched.
        uint256 alicePosId = _simulateBuy(alice, aliceSafe, 400e6, PositionTranche.Senior);
        uint256 carolPosId = _simulateBuy(carol, carolSafe, 100e6, PositionTranche.Junior);

        _logVaultState("After deposits");

        // Alice redeems. payoutPerShare = 0 (YES loses, tokens worthless).
        uint256 alicePayout = _simulateRedeem(alice, alicePosId, 0);
        console.log("\n  Alice redeem (YES loses, $0.00):");
        _logPnL("Alice (Senior)", 400e6, alicePayout);

        // Carol redeems.
        uint256 carolPayout = _simulateRedeem(carol, carolPosId, 0);
        console.log("  Carol redeem:");
        _logPnL("Carol (Junior)", 100e6, carolPayout);

        console.log(string.concat("\n  Total payouts: $", _fmt6(alicePayout + carolPayout), " (expected: $0.00)"));

        assertEq(alicePayout, 0, "Alice payout 0");
        assertEq(carolPayout, 0, "Carol payout 0");

        // Verify positions closed cleanly.
        assertEq(uint256(bounceV2.getPosition(alicePosId).status), uint256(PositionStatus.Closed));
        assertEq(uint256(bounceV2.getPosition(carolPosId).status), uint256(PositionStatus.Closed));
    }
}
