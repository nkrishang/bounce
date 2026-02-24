// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Bounce} from "../src/bounce/Bounce.sol";
import {BounceFactory} from "../src/bounce/BounceFactory.sol";
import {IGuard, Operation} from "../src/thesis/interfaces/IGuard.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCTF} from "./mocks/MockCTF.sol";
import {MockSafeModule} from "./mocks/MockSafeModule.sol";
import {MockExchange} from "./mocks/MockExchange.sol";

/// @title BounceTest
/// @notice Comprehensive tests for the Bounce singleton contract.
contract BounceTest is Test {
    // Contracts under test
    Bounce public bounce;
    Bounce public bounceImpl;

    // Mocks
    MockERC20 public usdc;
    MockCTF public ctf;
    MockSafeModule public safe;
    MockExchange public exchange;

    // Test addresses
    address public owner;
    address public proposer;
    address public funder;
    address public randomUser;

    // Polymarket constants (must match Bounce contract)
    address public constant USDC_ADDRESS = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address public constant CTF_ADDR = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;
    address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;

    // Test constants
    uint256 public constant TOTAL_CAPITAL = 1_000_000; // 1 USDC (6 decimals)
    uint16 public constant PROPOSER_CAPITAL_BPS = 2000; // 20%
    uint16 public constant PROPOSER_PROFIT_SHARE_BPS = 3000; // 30%
    bytes32 public constant CONDITION_ID = bytes32(uint256(1));
    uint8 public constant OUTCOME_INDEX = 0;
    uint256 public constant INDEX_SET = 1; // 1 << 0
    string public constant SLUG = "test-market-slug";
    uint40 public constant EXPIRES_AT = 0; // no expiration by default

    // Computed position ID (matches MockCTF's redeemPositions computation)
    uint256 public POSITION_ID;

    function setUp() public {
        // Setup test accounts.
        owner = makeAddr("owner");
        proposer = makeAddr("proposer");
        funder = makeAddr("funder");
        randomUser = makeAddr("randomUser");

        // Compute POSITION_ID to match MockCTF's redeemPositions logic.
        POSITION_ID = uint256(keccak256(abi.encode(CONDITION_ID, INDEX_SET)));

        // Deploy mock USDC at the expected Polygon address.
        usdc = new MockERC20("USDC", "USDC", 6);
        vm.etch(USDC_ADDRESS, address(usdc).code);
        usdc = MockERC20(USDC_ADDRESS);

        // Deploy mock CTF at expected address.
        ctf = new MockCTF();
        vm.etch(CTF_ADDR, address(ctf).code);
        ctf = MockCTF(CTF_ADDR);
        // Set USDC reference for redemption payouts.
        ctf.setUsdc(USDC_ADDRESS);

        // Deploy MockExchange at CTF_EXCHANGE address with $0.50/share price.
        deployCodeTo(
            "MockExchange.sol:MockExchange", abi.encode(USDC_ADDRESS, CTF_ADDR, uint256(500_000)), CTF_EXCHANGE
        );
        exchange = MockExchange(CTF_EXCHANGE);

        // Deploy Bounce implementation and ERC1967 proxy.
        bounceImpl = new Bounce();
        address proxy = LibClone.deployERC1967(address(bounceImpl));
        bounce = Bounce(proxy);
        bounce.initialize(owner);

        // Deploy MockSafeModule with proposer as owner.
        safe = new MockSafeModule(proposer);

        // Setup Safe: enable Bounce as module and set as guard.
        safe.enableModule(address(bounce));
        safe.setGuard(address(bounce));

        // Mint USDC to test accounts.
        usdc.mint(proposer, 10_000_000); // 10 USDC
        usdc.mint(funder, 10_000_000); // 10 USDC

        // Mint USDC to exchange so it can pay out on sells.
        usdc.mint(CTF_EXCHANGE, 100_000_000); // 100 USDC

        // Mint USDC to CTF so it can pay out on redeems.
        usdc.mint(CTF_ADDR, 100_000_000); // 100 USDC
    }

    // ============================================
    // Helpers
    // ============================================

    /// @notice Proposes a standard bet with default parameters.
    function _proposeBet() internal returns (uint256 betId) {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    /// @notice Funds a bet as funder.
    function _fundBet(uint256 betId) internal {
        vm.startPrank(funder);
        usdc.approve(address(bounce), type(uint256).max);
        bounce.fundBet(betId);
        vm.stopPrank();
    }

    /// @notice Executes a trade spending maxSpend USDC.
    function _executeTrade(uint256 betId, uint256 maxSpend) internal {
        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, maxSpend);
        vm.prank(proposer);
        bounce.executeTrade(betId, maxSpend, tradeData);
    }

    /// @notice Sells all shares at current exchange price.
    function _sellAllShares(uint256 betId) internal {
        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);
        vm.prank(proposer);
        bounce.sellPosition(betId, 0, sellData);
    }

    /// @notice Full flow: propose, fund, trade all capital.
    function _proposeAndFundAndTrade() internal returns (uint256 betId) {
        betId = _proposeBet();
        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);
    }

    // ============================================
    // 1. Initialization & Ownership Tests
    // ============================================

    function test_initialize_setsOwnerAndNextBetId() public view {
        assertEq(bounce.owner(), owner);
        assertEq(bounce.nextBetId(), 1);
    }

    function test_initialize_cannotBeCalledTwice() public {
        vm.expectRevert();
        bounce.initialize(randomUser);
    }

    function test_version() public view {
        assertEq(bounce.version(), "1.0.0");
    }

    function test_transferOwnership() public {
        vm.prank(owner);
        bounce.transferOwnership(randomUser);
        assertEq(bounce.owner(), randomUser);
    }

    function test_transferOwnership_revertsIfNotOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        bounce.transferOwnership(randomUser);
    }

    function test_renounceOwnership() public {
        vm.prank(owner);
        bounce.renounceOwnership();
        assertEq(bounce.owner(), address(0));
    }

    function test_upgrade_onlyOwner() public {
        Bounce newImpl = new Bounce();
        vm.prank(randomUser);
        vm.expectRevert();
        bounce.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_preservesState() public {
        // Create a bet on V1.
        uint256 betId = _proposeBet();
        _fundBet(betId);

        Bounce.Bet memory betBefore = bounce.getBet(betId);

        // Deploy new implementation and upgrade.
        Bounce newImpl = new Bounce();
        vm.prank(owner);
        bounce.upgradeToAndCall(address(newImpl), "");

        // Verify all V1 bet data reads correctly after upgrade.
        Bounce.Bet memory betAfter = bounce.getBet(betId);
        assertEq(betAfter.safe, betBefore.safe);
        assertEq(betAfter.proposer, betBefore.proposer);
        assertEq(betAfter.funder, betBefore.funder);
        assertEq(betAfter.exchange, betBefore.exchange);
        assertEq(betAfter.conditionId, betBefore.conditionId);
        assertEq(betAfter.totalCapital, betBefore.totalCapital);
        assertEq(betAfter.escrowUSDC, betBefore.escrowUSDC);
        assertTrue(betAfter.status == betBefore.status);

        // Verify nextBetId preserved.
        assertEq(bounce.nextBetId(), 2);

        // Verify owner preserved.
        assertEq(bounce.owner(), owner);
    }

    // ============================================
    // 2. Guard Behavior Tests
    // ============================================

    function test_guard_revertsAllDirectSafeTx() public {
        // Attempt direct Safe transaction — should revert with DirectSafeTxDisabled.
        vm.prank(proposer);
        vm.expectRevert(Bounce.DirectSafeTxDisabled.selector);
        safe.execTransaction(
            address(usdc), 0, abi.encodeWithSelector(IERC20.transfer.selector, proposer, 100), Operation.Call
        );
    }

    function test_guard_supportsInterface() public view {
        // IGuard interface ID.
        assertTrue(bounce.supportsInterface(type(IGuard).interfaceId));
        // Safe 1.3.0 guard interface ID.
        assertTrue(bounce.supportsInterface(bytes4(0xe6d7a83a)));
        // Random interface ID should be false.
        assertFalse(bounce.supportsInterface(bytes4(0xdeadbeef)));
    }

    function test_guard_checkAfterExecution_noop() public view {
        // Calling checkAfterExecution directly should not revert.
        bounce.checkAfterExecution(bytes32(0), true);
    }

    function test_guard_verifiedInProposeBet() public {
        // Deploy new Safe without guard set.
        MockSafeModule noGuardSafe = new MockSafeModule(proposer);
        noGuardSafe.enableModule(address(bounce));
        // Do NOT set guard.

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(Bounce.GuardNotInstalled.selector, address(noGuardSafe)));
        bounce.proposeBet(
            address(noGuardSafe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_guard_verifiedInExecuteTrade() public {
        // Create bet with properly configured Safe.
        uint256 betId = _proposeBet();
        _fundBet(betId);

        // Remove guard from Safe.
        safe.setGuard(address(0));

        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, TOTAL_CAPITAL);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(Bounce.GuardNotInstalled.selector, address(safe)));
        bounce.executeTrade(betId, TOTAL_CAPITAL, tradeData);
    }

    function test_guard_verifiedInSellPosition() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Remove guard from Safe.
        safe.setGuard(address(0));

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(Bounce.GuardNotInstalled.selector, address(safe)));
        bounce.sellPosition(betId, 0, sellData);
    }

    function test_guard_verifiedInRedeemPosition() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Remove guard from Safe.
        safe.setGuard(address(0));

        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(Bounce.GuardNotInstalled.selector, address(safe)));
        bounce.redeemPosition(betId);
    }

    // ============================================
    // 3. proposeBet Tests
    // ============================================

    function test_proposeBet_happyPath() public {
        uint256 proposerBalanceBefore = usdc.balanceOf(proposer);
        uint256 betId = _proposeBet();

        assertEq(betId, 1);
        assertEq(bounce.nextBetId(), 2);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertEq(bet.safe, address(safe));
        assertEq(bet.proposer, proposer);
        assertEq(bet.funder, funder);
        assertEq(bet.exchange, CTF_EXCHANGE);
        assertEq(bet.conditionId, CONDITION_ID);
        assertEq(bet.outcomeIndex, OUTCOME_INDEX);
        assertEq(bet.positionId, POSITION_ID);
        assertEq(bet.totalCapital, TOTAL_CAPITAL);
        assertEq(bet.proposerCapitalBps, PROPOSER_CAPITAL_BPS);
        assertEq(bet.proposerProfitShareBps, PROPOSER_PROFIT_SHARE_BPS);
        assertTrue(bet.status == Bounce.BetStatus.Proposed);

        // Proposer deposited 20% of 1_000_000 = 200_000.
        uint256 expectedDeposit = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10_000;
        assertEq(bet.escrowUSDC, expectedDeposit);
        assertEq(usdc.balanceOf(proposer), proposerBalanceBefore - expectedDeposit);

        // Verify indexes.
        uint256[] memory proposerBets = bounce.getBetsByProposer(proposer);
        assertEq(proposerBets.length, 1);
        assertEq(proposerBets[0], betId);

        uint256[] memory safeBets = bounce.getBetsBySafe(address(safe));
        assertEq(safeBets.length, 1);
        assertEq(safeBets[0], betId);

        assertEq(bounce.getActiveBetCount(address(safe)), 1);
    }

    function test_proposeBet_revertsIfNotSafeOwner() public {
        vm.startPrank(randomUser);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(Bounce.SafeNotOwner.selector, address(safe), randomUser));
        bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_revertsIfModuleNotEnabled() public {
        // Deploy new Safe without enabling Bounce module.
        MockSafeModule newSafe = new MockSafeModule(proposer);
        newSafe.setGuard(address(bounce));

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(Bounce.ModuleNotEnabled.selector, address(newSafe)));
        bounce.proposeBet(
            address(newSafe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_revertsIfInvalidExchange() public {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(Bounce.InvalidExchange.selector, randomUser));
        bounce.proposeBet(
            address(safe),
            funder,
            randomUser,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_revertsIfInvalidBps() public {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(Bounce.InvalidBps.selector);
        bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            10_001,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_revertsIfZeroCapital() public {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(Bounce.ZeroAmount.selector);
        bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            0,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_revertsIfActiveBetExists() public {
        _proposeBet();

        // Attempt to propose the same bet again.
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert();
        bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();
    }

    function test_proposeBet_openFunder() public {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            address(0),
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertEq(bet.funder, address(0));
        assertTrue(bet.status == Bounce.BetStatus.Proposed);
    }

    function test_proposeBet_pullsUSDCFromProposer() public {
        uint256 balanceBefore = usdc.balanceOf(proposer);
        _proposeBet();
        uint256 expectedDeposit = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10_000;
        assertEq(usdc.balanceOf(proposer), balanceBefore - expectedDeposit);
        assertEq(usdc.balanceOf(address(bounce)), expectedDeposit);
    }

    // ============================================
    // 4. fundBet Tests
    // ============================================

    function test_fundBet_happyPath() public {
        uint256 betId = _proposeBet();
        uint256 funderBalanceBefore = usdc.balanceOf(funder);

        _fundBet(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Funded);
        assertEq(bet.escrowUSDC, TOTAL_CAPITAL);

        uint256 funderDeposit = TOTAL_CAPITAL - (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10_000;
        assertEq(usdc.balanceOf(funder), funderBalanceBefore - funderDeposit);
    }

    function test_fundBet_openFunder() public {
        // Propose with open funder.
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            address(0),
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            EXPIRES_AT,
            SLUG
        );
        vm.stopPrank();

        // Anyone can fund.
        _fundBet(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertEq(bet.funder, funder);
        assertTrue(bet.status == Bounce.BetStatus.Funded);
    }

    function test_fundBet_revertsIfDesignatedFunderMismatch() public {
        uint256 betId = _proposeBet();

        vm.startPrank(randomUser);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(Bounce.NotFunder.selector);
        bounce.fundBet(betId);
        vm.stopPrank();
    }

    function test_fundBet_revertsIfNotProposed() public {
        vm.startPrank(funder);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert();
        bounce.fundBet(999);
        vm.stopPrank();
    }

    function test_fundBet_revertsIfAlreadyFunded() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        vm.startPrank(funder);
        vm.expectRevert();
        bounce.fundBet(betId);
        vm.stopPrank();
    }

    // ============================================
    // 5. cancelBet Tests
    // ============================================

    function test_cancelBet_refundsProposer() public {
        uint256 balanceBefore = usdc.balanceOf(proposer);
        uint256 betId = _proposeBet();

        vm.prank(proposer);
        bounce.cancelBet(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Cancelled);
        assertEq(bet.escrowUSDC, 0);
        assertEq(usdc.balanceOf(proposer), balanceBefore);
        assertEq(bounce.getActiveBetCount(address(safe)), 0);
    }

    function test_cancelBet_revertsIfNotProposer() public {
        uint256 betId = _proposeBet();

        vm.prank(funder);
        vm.expectRevert(Bounce.NotProposer.selector);
        bounce.cancelBet(betId);
    }

    function test_cancelBet_revertsIfAlreadyFunded() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        vm.prank(proposer);
        vm.expectRevert();
        bounce.cancelBet(betId);
    }

    function test_cancelBet_clearsActiveKey() public {
        uint256 betId = _proposeBet();

        vm.prank(proposer);
        bounce.cancelBet(betId);

        // Should be able to propose the same bet again.
        _proposeBet();
        assertEq(bounce.getActiveBetCount(address(safe)), 1);
    }

    // ============================================
    // 6. executeTrade Tests
    // ============================================

    function test_executeTrade_happyPath() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        // Trade all capital.
        _executeTrade(betId, TOTAL_CAPITAL);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Traded);
        assertEq(bet.escrowUSDC, 0);
        assertEq(bet.usdcSpent, TOTAL_CAPITAL);
        // At $0.50/share: 1_000_000 USDC buys 2_000_000 shares.
        assertEq(bet.positionShares, 2_000_000);
        assertTrue(bet.tradedAt > 0);
    }

    function test_executeTrade_leftoverReturnedToEscrow() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        // Trade only half the capital.
        uint256 halfCapital = TOTAL_CAPITAL / 2;
        _executeTrade(betId, halfCapital);

        Bounce.Bet memory bet = bounce.getBet(betId);
        // Escrow should have the other half remaining.
        assertEq(bet.escrowUSDC, TOTAL_CAPITAL - halfCapital);
        assertEq(bet.usdcSpent, halfCapital);
    }

    function test_executeTrade_revertsIfNotProposer() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, TOTAL_CAPITAL);
        vm.prank(funder);
        vm.expectRevert(Bounce.NotProposer.selector);
        bounce.executeTrade(betId, TOTAL_CAPITAL, tradeData);
    }

    function test_executeTrade_revertsIfExceedsEscrow() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, TOTAL_CAPITAL + 1);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(Bounce.ExceedsEscrow.selector, TOTAL_CAPITAL + 1, TOTAL_CAPITAL));
        bounce.executeTrade(betId, TOTAL_CAPITAL + 1, tradeData);
    }

    function test_executeTrade_revertsIfNotFunded() public {
        uint256 betId = _proposeBet();

        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, 100);
        vm.prank(proposer);
        vm.expectRevert();
        bounce.executeTrade(betId, 100, tradeData);
    }

    function test_executeTrade_multipleTradesAccumulate() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        // Trade first half.
        uint256 halfCapital = TOTAL_CAPITAL / 2;
        _executeTrade(betId, halfCapital);

        Bounce.Bet memory bet1 = bounce.getBet(betId);
        assertEq(bet1.usdcSpent, halfCapital);
        uint256 firstShares = bet1.positionShares;

        // Trade second half.
        _executeTrade(betId, halfCapital);

        Bounce.Bet memory bet2 = bounce.getBet(betId);
        assertEq(bet2.usdcSpent, TOTAL_CAPITAL);
        assertEq(bet2.positionShares, firstShares * 2);
        assertEq(bet2.escrowUSDC, 0);
    }

    function test_executeTrade_approvalsResetToZero() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);

        // Verify exchange approval is 0 after trade.
        assertEq(usdc.allowance(address(safe), CTF_EXCHANGE), 0);
    }

    // ============================================
    // 7. sellPosition Tests
    // ============================================

    function test_sellPosition_happyPath() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Sell all shares at current price ($0.50).
        _sellAllShares(betId);

        Bounce.Bet memory betAfter = bounce.getBet(betId);
        assertEq(betAfter.positionShares, 0);
        assertTrue(betAfter.status == Bounce.BetStatus.Closed);
        // Sold 2_000_000 shares at $0.50 = 1_000_000 USDC.
        assertEq(betAfter.escrowUSDC, TOTAL_CAPITAL);
    }

    function test_sellPosition_proposerCanSell() public {
        uint256 betId = _proposeAndFundAndTrade();

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);

        vm.prank(proposer);
        bounce.sellPosition(betId, 0, sellData);

        Bounce.Bet memory betAfter = bounce.getBet(betId);
        assertTrue(betAfter.status == Bounce.BetStatus.Closed);
    }

    function test_sellPosition_funderCanSell() public {
        uint256 betId = _proposeAndFundAndTrade();

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);

        vm.prank(funder);
        bounce.sellPosition(betId, 0, sellData);

        Bounce.Bet memory betAfter = bounce.getBet(betId);
        assertTrue(betAfter.status == Bounce.BetStatus.Closed);
    }

    function test_sellPosition_closesWhenAllSharesSold() public {
        uint256 betId = _proposeAndFundAndTrade();
        _sellAllShares(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Closed);
        assertTrue(bet.closedAt > 0);
    }

    function test_sellPosition_revertsIfSlippage() public {
        uint256 betId = _proposeAndFundAndTrade();

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);

        uint256 impossibleMin = TOTAL_CAPITAL * 10;

        vm.prank(proposer);
        vm.expectRevert();
        bounce.sellPosition(betId, impossibleMin, sellData);
    }

    function test_sellPosition_revertsIfNotTraded() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, 100);
        vm.prank(proposer);
        vm.expectRevert();
        bounce.sellPosition(betId, 0, sellData);
    }

    function test_sellPosition_setsCTFApprovalOnFirstCall() public {
        uint256 betId = _proposeAndFundAndTrade();

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);

        // Expect SafeCtfApprovalSet event on first sell.
        vm.expectEmit(true, true, false, false);
        emit Bounce.SafeCtfApprovalSet(address(safe), CTF_EXCHANGE);

        vm.prank(proposer);
        bounce.sellPosition(betId, 0, sellData);
    }

    function test_sellPosition_revertsIfNotProposerOrFunder() public {
        uint256 betId = _proposeAndFundAndTrade();

        Bounce.Bet memory bet = bounce.getBet(betId);
        bytes memory sellData = abi.encodeWithSelector(MockExchange.sell.selector, POSITION_ID, bet.positionShares);

        vm.prank(randomUser);
        vm.expectRevert(Bounce.NotProposerOrFunder.selector);
        bounce.sellPosition(betId, 0, sellData);
    }

    // ============================================
    // 8. redeemPosition Tests
    // ============================================

    function test_redeemPosition_happyPath() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Set payout to $1/share (full win).
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(proposer);
        bounce.redeemPosition(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        // 2_000_000 shares * $1/share = 2_000_000 USDC.
        assertEq(bet.escrowUSDC, 2_000_000);
        assertEq(bet.positionShares, 0);
        assertTrue(bet.status == Bounce.BetStatus.Closed);
    }

    function test_redeemPosition_closesWhenFullyRedeemed() public {
        uint256 betId = _proposeAndFundAndTrade();
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(proposer);
        bounce.redeemPosition(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Closed);
        assertTrue(bet.closedAt > 0);
    }

    function test_redeemPosition_revertsIfNotTraded() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        vm.prank(proposer);
        vm.expectRevert();
        bounce.redeemPosition(betId);
    }

    function test_redeemPosition_proposerCanRedeem() public {
        uint256 betId = _proposeAndFundAndTrade();
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(proposer);
        bounce.redeemPosition(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Closed);
    }

    function test_redeemPosition_funderCanRedeem() public {
        uint256 betId = _proposeAndFundAndTrade();
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(funder);
        bounce.redeemPosition(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Closed);
    }

    function test_redeemPosition_revertsIfNotProposerOrFunder() public {
        uint256 betId = _proposeAndFundAndTrade();
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(randomUser);
        vm.expectRevert(Bounce.NotProposerOrFunder.selector);
        bounce.redeemPosition(betId);
    }

    // ============================================
    // 9. withdraw (Settlement Math) Tests
    // ============================================

    function test_withdraw_profitCase() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Change price to $0.75 (profit).
        exchange.setPrice(750_000);
        _sellAllShares(betId);

        Bounce.Bet memory betClosed = bounce.getBet(betId);
        // 2_000_000 shares * $0.75 = 1_500_000 USDC.
        assertEq(betClosed.escrowUSDC, 1_500_000);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // Profit = 500_000. ProposerProfit = 30% of 500_000 = 150_000.
        // ProposerAmount = 200_000 + 150_000 = 350_000.
        // FunderAmount = 800_000 + 350_000 = 1_150_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 350_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 1_150_000);

        Bounce.Bet memory betFinal = bounce.getBet(betId);
        assertTrue(betFinal.status == Bounce.BetStatus.Withdrawn);
        assertEq(betFinal.escrowUSDC, 0);
        assertEq(bounce.getActiveBetCount(address(safe)), 0);
    }

    function test_withdraw_profitCase_customBps() public {
        // Propose with 50% proposer capital, 50% profit share.
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe), funder, CTF_EXCHANGE, CONDITION_ID, OUTCOME_INDEX, POSITION_ID, TOTAL_CAPITAL, 5000, 5000, EXPIRES_AT, SLUG
        );
        vm.stopPrank();

        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);

        // Sell at $0.75 (profit).
        exchange.setPrice(750_000);
        _sellAllShares(betId);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // Profit = 500_000. ProposerProfit = 50% of 500_000 = 250_000.
        // ProposerCapital = 50% of 1_000_000 = 500_000.
        // ProposerAmount = 500_000 + 250_000 = 750_000.
        // FunderAmount = 500_000 + 250_000 = 750_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 750_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 750_000);
    }

    function test_withdraw_lossWithinProposerCapital() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Change price to $0.45 (10% loss).
        exchange.setPrice(450_000);
        _sellAllShares(betId);

        Bounce.Bet memory betClosed = bounce.getBet(betId);
        // 2_000_000 shares * $0.45 = 900_000 USDC.
        assertEq(betClosed.escrowUSDC, 900_000);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(funder);
        bounce.withdraw(betId);

        // Loss = 100_000. Within proposer's 200_000 capital.
        // ProposerAmount = 200_000 - 100_000 = 100_000.
        // FunderAmount = 800_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 100_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 800_000);
    }

    function test_withdraw_lossExceedsProposerCapital() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Change price to $0.25 (50% loss).
        exchange.setPrice(250_000);
        _sellAllShares(betId);

        Bounce.Bet memory betClosed = bounce.getBet(betId);
        // 2_000_000 shares * $0.25 = 500_000 USDC.
        assertEq(betClosed.escrowUSDC, 500_000);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // Loss = 500_000. Exceeds proposer's 200_000 capital.
        // ProposerAmount = 0.
        // FunderLoss = 500_000 - 200_000 = 300_000.
        // FunderAmount = 800_000 - 300_000 = 500_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore);
        assertEq(usdc.balanceOf(funder), funderBefore + 500_000);
    }

    function test_withdraw_breakEven() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Sell at same price ($0.50 — break even).
        _sellAllShares(betId);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // Break even: each gets their capital back.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 200_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 800_000);
    }

    function test_withdraw_totalLoss() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Set price to 0 (total loss).
        exchange.setPrice(0);
        _sellAllShares(betId);

        Bounce.Bet memory betClosed = bounce.getBet(betId);
        assertEq(betClosed.escrowUSDC, 0);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // Total loss: both get 0.
        assertEq(usdc.balanceOf(proposer), proposerBefore);
        assertEq(usdc.balanceOf(funder), funderBefore);
    }

    function test_withdraw_revertsIfNotClosed() public {
        uint256 betId = _proposeAndFundAndTrade();

        vm.prank(proposer);
        vm.expectRevert();
        bounce.withdraw(betId);
    }

    function test_withdraw_revertsIfNotProposerOrFunder() public {
        uint256 betId = _proposeAndFundAndTrade();
        _sellAllShares(betId);

        vm.prank(randomUser);
        vm.expectRevert(Bounce.NotProposerOrFunder.selector);
        bounce.withdraw(betId);
    }

    function test_withdraw_clearsActiveKeyAndCount() public {
        uint256 betId = _proposeAndFundAndTrade();
        _sellAllShares(betId);

        assertEq(bounce.getActiveBetCount(address(safe)), 1);

        vm.prank(proposer);
        bounce.withdraw(betId);

        assertEq(bounce.getActiveBetCount(address(safe)), 0);

        // Can propose same bet again.
        _proposeBet();
        assertEq(bounce.getActiveBetCount(address(safe)), 1);
    }

    function test_withdraw_revertsIfAlreadyWithdrawn() public {
        uint256 betId = _proposeAndFundAndTrade();
        _sellAllShares(betId);

        vm.prank(proposer);
        bounce.withdraw(betId);

        vm.prank(proposer);
        vm.expectRevert();
        bounce.withdraw(betId);
    }

    // ============================================
    // 10. Multi-bet Integration Tests
    // ============================================

    function test_multiBet_isolatedAccounting() public {
        // Deploy MockExchange at NEG_RISK address too for a second market.
        deployCodeTo(
            "MockExchange.sol:MockExchange", abi.encode(USDC_ADDRESS, CTF_ADDR, uint256(500_000)), NEG_RISK_CTF_EXCHANGE
        );
        MockExchange exchange2 = MockExchange(NEG_RISK_CTF_EXCHANGE);
        usdc.mint(NEG_RISK_CTF_EXCHANGE, 100_000_000);

        // Bet 1: standard bet.
        uint256 betId1 = _proposeBet();
        _fundBet(betId1);
        _executeTrade(betId1, TOTAL_CAPITAL);

        // Bet 2: different market on same Safe.
        bytes32 conditionId2 = bytes32(uint256(2));
        uint256 indexSet2 = 1;
        uint256 positionId2 = uint256(keccak256(abi.encode(conditionId2, indexSet2)));

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId2 = bounce.proposeBet(
            address(safe), funder, NEG_RISK_CTF_EXCHANGE, conditionId2, 0, positionId2, TOTAL_CAPITAL, PROPOSER_CAPITAL_BPS, PROPOSER_PROFIT_SHARE_BPS, EXPIRES_AT, "market-2"
        );
        vm.stopPrank();

        vm.startPrank(funder);
        usdc.approve(address(bounce), type(uint256).max);
        bounce.fundBet(betId2);
        vm.stopPrank();

        // Trade bet 2 on neg risk exchange.
        bytes memory tradeData2 = abi.encodeWithSelector(MockExchange.buy.selector, positionId2, TOTAL_CAPITAL);
        vm.prank(proposer);
        bounce.executeTrade(betId2, TOTAL_CAPITAL, tradeData2);

        // Verify both bets tracked independently.
        assertEq(bounce.getActiveBetCount(address(safe)), 2);

        Bounce.Bet memory bet1 = bounce.getBet(betId1);
        Bounce.Bet memory bet2 = bounce.getBet(betId2);
        assertEq(bet1.escrowUSDC, 0);
        assertEq(bet2.escrowUSDC, 0);
        assertEq(bet1.positionShares, 2_000_000);
        assertEq(bet2.positionShares, 2_000_000);

        // Sell bet 1 at profit.
        exchange.setPrice(750_000);
        _sellAllShares(betId1);

        // Bet 2 should be unaffected.
        Bounce.Bet memory bet2AfterSell1 = bounce.getBet(betId2);
        assertTrue(bet2AfterSell1.status == Bounce.BetStatus.Traded);
        assertEq(bet2AfterSell1.positionShares, 2_000_000);

        // Sell bet 2 at loss.
        exchange2.setPrice(250_000);
        Bounce.Bet memory bet2Data = bounce.getBet(betId2);
        bytes memory sellData2 = abi.encodeWithSelector(MockExchange.sell.selector, positionId2, bet2Data.positionShares);
        vm.prank(proposer);
        bounce.sellPosition(betId2, 0, sellData2);

        // Withdraw both independently.
        vm.prank(proposer);
        bounce.withdraw(betId1);
        vm.prank(proposer);
        bounce.withdraw(betId2);

        assertEq(bounce.getActiveBetCount(address(safe)), 0);
    }

    function test_multiBet_cannotCreateDuplicateActiveBet() public {
        _proposeBet();

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert();
        bounce.proposeBet(
            address(safe), funder, CTF_EXCHANGE, CONDITION_ID, OUTCOME_INDEX, POSITION_ID, TOTAL_CAPITAL, PROPOSER_CAPITAL_BPS, PROPOSER_PROFIT_SHARE_BPS, EXPIRES_AT, SLUG
        );
        vm.stopPrank();
    }

    function test_multiBet_canCreateSameMarketAfterWithdrawal() public {
        uint256 betId1 = _proposeAndFundAndTrade();
        _sellAllShares(betId1);
        vm.prank(proposer);
        bounce.withdraw(betId1);

        // Same market key should now be available.
        uint256 betId2 = _proposeBet();
        assertTrue(betId2 > betId1);
        assertEq(bounce.getActiveBetCount(address(safe)), 1);
    }

    function test_multiBet_activeBetCountTracking() public {
        assertEq(bounce.getActiveBetCount(address(safe)), 0);

        uint256 betId1 = _proposeBet();
        assertEq(bounce.getActiveBetCount(address(safe)), 1);

        // Second bet on different condition.
        bytes32 conditionId2 = bytes32(uint256(2));
        uint256 positionId2 = uint256(keccak256(abi.encode(conditionId2, uint256(1))));

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        bounce.proposeBet(
            address(safe), funder, CTF_EXCHANGE, conditionId2, 0, positionId2, TOTAL_CAPITAL, PROPOSER_CAPITAL_BPS, PROPOSER_PROFIT_SHARE_BPS, EXPIRES_AT, "market-2"
        );
        vm.stopPrank();
        assertEq(bounce.getActiveBetCount(address(safe)), 2);

        // Cancel bet 1.
        vm.prank(proposer);
        bounce.cancelBet(betId1);
        assertEq(bounce.getActiveBetCount(address(safe)), 1);
    }

    // ============================================
    // 11. Full Lifecycle Integration Tests
    // ============================================

    function test_fullLifecycle_profit() public {
        uint256 betId = _proposeBet();
        assertEq(bounce.getActiveBetCount(address(safe)), 1);

        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);

        // Sell at $0.75 (profit).
        exchange.setPrice(750_000);
        _sellAllShares(betId);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Withdrawn);
        assertEq(bounce.getActiveBetCount(address(safe)), 0);

        // Profit = 500_000. ProposerProfit = 150_000. FunderProfit = 350_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 350_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 1_150_000);
    }

    function test_fullLifecycle_loss() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);

        // Sell at $0.45 (loss within proposer capital).
        exchange.setPrice(450_000);
        _sellAllShares(betId);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(funder);
        bounce.withdraw(betId);

        assertEq(usdc.balanceOf(proposer), proposerBefore + 100_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 800_000);
    }

    function test_fullLifecycle_redeem() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);
        _executeTrade(betId, TOTAL_CAPITAL);

        // Set payout to $1/share and redeem.
        ctf.setPayoutPerShare(CONDITION_ID, 1_000_000);

        vm.prank(proposer);
        bounce.redeemPosition(betId);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.prank(proposer);
        bounce.withdraw(betId);

        // 2_000_000 USDC returned. Profit = 1_000_000.
        // ProposerProfit = 300_000. FunderProfit = 700_000.
        // ProposerAmount = 200_000 + 300_000 = 500_000.
        // FunderAmount = 800_000 + 700_000 = 1_500_000.
        assertEq(usdc.balanceOf(proposer), proposerBefore + 500_000);
        assertEq(usdc.balanceOf(funder), funderBefore + 1_500_000);
    }

    function test_fullLifecycle_cancel() public {
        uint256 proposerBefore = usdc.balanceOf(proposer);

        uint256 betId = _proposeBet();

        vm.prank(proposer);
        bounce.cancelBet(betId);

        assertEq(usdc.balanceOf(proposer), proposerBefore);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Cancelled);
        assertEq(bounce.getActiveBetCount(address(safe)), 0);
    }

    // ============================================
    // 12. Sweep Tests
    // ============================================

    function test_sweep_safeOwnerCanSweepWhenNoBets() public {
        // Mint some USDC to the Safe directly.
        usdc.mint(address(safe), 500_000);

        uint256 proposerBefore = usdc.balanceOf(proposer);

        vm.prank(proposer);
        bounce.sweepSafeToken(address(safe), USDC_ADDRESS, proposer, 500_000);

        assertEq(usdc.balanceOf(proposer), proposerBefore + 500_000);
    }

    function test_sweep_revertsIfActiveBets() public {
        _proposeBet();

        usdc.mint(address(safe), 500_000);

        vm.prank(proposer);
        vm.expectRevert();
        bounce.sweepSafeToken(address(safe), USDC_ADDRESS, proposer, 500_000);
    }

    function test_sweep_revertsIfNotSafeOwner() public {
        usdc.mint(address(safe), 500_000);

        vm.prank(randomUser);
        vm.expectRevert(abi.encodeWithSelector(Bounce.SafeNotOwner.selector, address(safe), randomUser));
        bounce.sweepSafeToken(address(safe), USDC_ADDRESS, randomUser, 500_000);
    }

    // ============================================
    // 13. Expiration Tests
    // ============================================

    function test_expiration_proposeBetStoresExpiresAt() public {
        uint40 futureExpiry = uint40(block.timestamp + 1 days);

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            futureExpiry,
            SLUG
        );
        vm.stopPrank();

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertEq(bet.expiresAt, futureExpiry);
    }

    function test_expiration_zeroMeansNoExpiration() public {
        uint256 betId = _proposeBet();

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertEq(bet.expiresAt, 0);

        // Fund and trade should work at any time.
        _fundBet(betId);

        vm.warp(block.timestamp + 365 days);
        _executeTrade(betId, TOTAL_CAPITAL);

        Bounce.Bet memory betAfter = bounce.getBet(betId);
        assertTrue(betAfter.status == Bounce.BetStatus.Traded);
    }

    function test_expiration_fundBetRevertsAfterExpiry() public {
        uint40 futureExpiry = uint40(block.timestamp + 1 days);

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            futureExpiry,
            SLUG
        );
        vm.stopPrank();

        // Warp past expiration.
        vm.warp(futureExpiry);

        vm.startPrank(funder);
        usdc.approve(address(bounce), type(uint256).max);
        vm.expectRevert(Bounce.BetExpired.selector);
        bounce.fundBet(betId);
        vm.stopPrank();
    }

    function test_expiration_executeTrade_revertsAfterExpiry() public {
        uint40 futureExpiry = uint40(block.timestamp + 1 days);

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            futureExpiry,
            SLUG
        );
        vm.stopPrank();

        _fundBet(betId);

        // Warp past expiration.
        vm.warp(futureExpiry);

        bytes memory tradeData = abi.encodeWithSelector(MockExchange.buy.selector, POSITION_ID, TOTAL_CAPITAL);
        vm.prank(proposer);
        vm.expectRevert(Bounce.BetExpired.selector);
        bounce.executeTrade(betId, TOTAL_CAPITAL, tradeData);
    }

    function test_expiration_cancelStillWorksAfterExpiry() public {
        uint40 futureExpiry = uint40(block.timestamp + 1 days);

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            futureExpiry,
            SLUG
        );
        vm.stopPrank();

        // Warp past expiration.
        vm.warp(futureExpiry + 1);

        uint256 proposerBefore = usdc.balanceOf(proposer);
        uint256 expectedDeposit = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10_000;

        vm.prank(proposer);
        bounce.cancelBet(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Cancelled);
        assertEq(usdc.balanceOf(proposer), proposerBefore + expectedDeposit);
    }

    function test_expiration_fundBeforeExpirySucceeds() public {
        uint40 futureExpiry = uint40(block.timestamp + 1 days);

        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        uint256 betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            CONDITION_ID,
            OUTCOME_INDEX,
            POSITION_ID,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            futureExpiry,
            SLUG
        );
        vm.stopPrank();

        // Warp to just before expiration.
        vm.warp(futureExpiry - 1);

        _fundBet(betId);

        Bounce.Bet memory bet = bounce.getBet(betId);
        assertTrue(bet.status == Bounce.BetStatus.Funded);
    }

    // ============================================
    // 14. BounceFactory Tests
    // ============================================

    function test_factory_deploysAtomically() public {
        BounceFactory factory = new BounceFactory(owner);

        assertFalse(factory.deployed());
        assertEq(factory.bounce(), address(0));

        address proxy = factory.deploy();

        assertTrue(factory.deployed());
        assertEq(factory.bounce(), proxy);

        Bounce deployed = Bounce(proxy);
        assertEq(deployed.owner(), owner);
        assertEq(deployed.nextBetId(), 1);
        assertEq(deployed.version(), "1.0.0");
    }

    function test_factory_cannotDeployTwice() public {
        BounceFactory factory = new BounceFactory(owner);
        factory.deploy();

        vm.expectRevert(BounceFactory.AlreadyDeployed.selector);
        factory.deploy();
    }

    function test_factory_cannotFrontRunInitialize() public {
        // Factory atomically deploys + initializes.
        // After deploy, calling initialize on the proxy should revert.
        BounceFactory factory = new BounceFactory(owner);
        address proxy = factory.deploy();

        vm.prank(randomUser);
        vm.expectRevert();
        Bounce(proxy).initialize(randomUser);
    }

    // ============================================
    // 15. CTF Approval Model Tests (Mock Fidelity)
    // ============================================

    function test_ctfApproval_sellRequiresApproval() public {
        uint256 betId = _proposeAndFundAndTrade();

        // Verify: before first sell, CTF approval is NOT set for (safe, exchange).
        assertFalse(ctf.isApprovedForAll(address(safe), CTF_EXCHANGE));

        // First sell should set approval via Bounce's lazy setup.
        _sellAllShares(betId);

        // After sell, approval should be set.
        assertTrue(ctf.isApprovedForAll(address(safe), CTF_EXCHANGE));
    }

    function test_ctfApproval_sellWithoutApprovalFails() public {
        // This test verifies the mock CTF enforces approvals on safeTransferFrom.
        // Directly calling exchange.sell without CTF approval should fail.
        ctf.mint(address(this), POSITION_ID, 1000);
        usdc.mint(CTF_EXCHANGE, 1_000_000);

        // Attempt sell without approval — should revert.
        vm.expectRevert("CTF: need operator approval");
        exchange.sell(POSITION_ID, 1000);
    }
}
