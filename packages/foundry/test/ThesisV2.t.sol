// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ThesisManager} from "../src/thesis/ThesisManager.sol";
import {ThesisGuardV2} from "../src/thesis/ThesisGuardV2.sol";
import {ThesisSettlementV2} from "../src/thesis/ThesisSettlementV2.sol";
import {ThesisFactoryV2} from "../src/thesis/ThesisFactoryV2.sol";
import {IThesisManager} from "../src/thesis/interfaces/IThesisManager.sol";
import {Operation} from "../src/thesis/interfaces/IGuard.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCTF} from "./mocks/MockCTF.sol";
import {MockSafe} from "./mocks/MockSafe.sol";

/// @title ThesisV2Test
/// @notice Comprehensive unit tests for Thesis Protocol V2 contracts
contract ThesisV2Test is Test {
    // Contracts under test
    ThesisManager public manager;
    ThesisFactoryV2 public factory;
    ThesisGuardV2 public guard;
    ThesisSettlementV2 public settlement;

    // Mocks
    MockERC20 public usdc;
    MockCTF public ctf;
    MockSafe public safe;

    // Test addresses
    address public owner;
    address public proposer;
    address public funder;
    address public randomUser;

    // Polymarket addresses (constants in contracts)
    address public constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;
    address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;
    address public constant USDC_ADDRESS = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    // Test constants
    uint256 public constant TOTAL_CAPITAL = 1_000_000; // 1 USDC (6 decimals)
    uint256 public constant PROPOSER_CAPITAL_BPS = 2000; // 20%
    uint256 public constant PROPOSER_PROFIT_SHARE_BPS = 3000; // 30%

    function setUp() public {
        // Setup test accounts
        owner = makeAddr("owner");
        proposer = makeAddr("proposer");
        funder = makeAddr("funder");
        randomUser = makeAddr("randomUser");

        // Deploy mock USDC at the expected Polygon address
        usdc = new MockERC20("USDC", "USDC", 6);
        vm.etch(USDC_ADDRESS, address(usdc).code);
        usdc = MockERC20(USDC_ADDRESS);

        // Deploy mock CTF at expected address
        ctf = new MockCTF();
        vm.etch(CTF, address(ctf).code);
        ctf = MockCTF(CTF);

        // Deploy MockSafe with proposer as owner
        safe = new MockSafe(proposer);

        // Deploy ThesisManager
        vm.prank(owner);
        manager = new ThesisManager(owner);

        // Deploy ThesisFactoryV2
        factory = new ThesisFactoryV2(address(manager));

        // Set factory in manager
        vm.prank(owner);
        manager.setFactory(address(factory));

        // Mint USDC to test accounts
        usdc.mint(proposer, 10_000_000); // 10 USDC
        usdc.mint(funder, 10_000_000); // 10 USDC
        usdc.mint(address(safe), 10_000_000); // 10 USDC in Safe
    }

    // ============================================
    // ThesisManager Tests
    // ============================================

    function test_Manager_InitialState() public view {
        assertEq(manager.owner(), owner);
        assertEq(manager.factory(), address(factory));
    }

    function test_Manager_SetFactory() public {
        address newFactory = makeAddr("newFactory");

        vm.prank(owner);
        manager.setFactory(newFactory);

        assertEq(manager.factory(), newFactory);
    }

    function test_Manager_SetFactory_OnlyOwner() public {
        address newFactory = makeAddr("newFactory");

        vm.prank(randomUser);
        vm.expectRevert(ThesisManager.NotOwner.selector);
        manager.setFactory(newFactory);
    }

    function test_Manager_RegisterSettlement() public {
        address mockSettlement = makeAddr("settlement");

        vm.prank(address(factory));
        manager.registerSettlement(address(safe), mockSettlement, TOTAL_CAPITAL);

        assertTrue(manager.isActiveSettlement(address(safe), mockSettlement));
        assertEq(manager.settlementApprovalCap(address(safe), mockSettlement), TOTAL_CAPITAL);
        assertEq(manager.exchangeApprovalCap(address(safe)), TOTAL_CAPITAL);
    }

    function test_Manager_RegisterSettlement_OnlyFactory() public {
        address mockSettlement = makeAddr("settlement");

        vm.prank(randomUser);
        vm.expectRevert(ThesisManager.NotFactory.selector);
        manager.registerSettlement(address(safe), mockSettlement, TOTAL_CAPITAL);
    }

    function test_Manager_RegisterSettlement_AlreadyActive() public {
        address mockSettlement = makeAddr("settlement");

        vm.startPrank(address(factory));
        manager.registerSettlement(address(safe), mockSettlement, TOTAL_CAPITAL);

        vm.expectRevert(ThesisManager.SettlementAlreadyActive.selector);
        manager.registerSettlement(address(safe), mockSettlement, TOTAL_CAPITAL);
        vm.stopPrank();
    }

    function test_Manager_DeactivateSettlement() public {
        address mockSettlement = makeAddr("settlement");

        vm.prank(address(factory));
        manager.registerSettlement(address(safe), mockSettlement, TOTAL_CAPITAL);

        assertTrue(manager.isActiveSettlement(address(safe), mockSettlement));

        // Settlement can deactivate itself
        vm.prank(mockSettlement);
        manager.deactivateSettlement(address(safe), mockSettlement);

        assertFalse(manager.isActiveSettlement(address(safe), mockSettlement));
        assertEq(manager.settlementApprovalCap(address(safe), mockSettlement), 0);
        assertEq(manager.exchangeApprovalCap(address(safe)), 0);
    }

    function test_Manager_DeactivateSettlement_NotActive() public {
        address mockSettlement = makeAddr("settlement");

        vm.prank(mockSettlement);
        vm.expectRevert(ThesisManager.SettlementNotActive.selector);
        manager.deactivateSettlement(address(safe), mockSettlement);
    }

    function test_Manager_MultipleSettlements_CapsAccumulate() public {
        address settlement1 = makeAddr("settlement1");
        address settlement2 = makeAddr("settlement2");

        vm.startPrank(address(factory));
        manager.registerSettlement(address(safe), settlement1, 1_000_000);
        manager.registerSettlement(address(safe), settlement2, 2_000_000);
        vm.stopPrank();

        assertEq(manager.exchangeApprovalCap(address(safe)), 3_000_000);

        // Deactivate one
        vm.prank(settlement1);
        manager.deactivateSettlement(address(safe), settlement1);

        assertEq(manager.exchangeApprovalCap(address(safe)), 2_000_000);
    }

    function test_Manager_SetGuardApproval() public {
        address guardAddr = makeAddr("guard");

        vm.prank(owner);
        manager.setGuardApproval(guardAddr, true);

        assertTrue(manager.isApprovedGuard(address(safe), guardAddr));

        vm.prank(owner);
        manager.setGuardApproval(guardAddr, false);

        assertFalse(manager.isApprovedGuard(address(safe), guardAddr));
    }

    function test_Manager_TransferOwnership() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        manager.transferOwnership(newOwner);

        assertEq(manager.owner(), newOwner);
    }

    // ============================================
    // ThesisFactoryV2 Tests
    // ============================================

    function test_Factory_CreateThesis() public {
        vm.prank(owner);
        ThesisSettlementV2 newSettlement = factory.createThesis(
            address(safe),
            funder,
            proposer,
            TOTAL_CAPITAL
        );

        assertEq(address(newSettlement.safe()), address(safe));
        assertEq(newSettlement.funder(), funder);
        assertEq(newSettlement.proposer(), proposer);
        assertEq(newSettlement.totalCapital(), TOTAL_CAPITAL);
        assertTrue(manager.isActiveSettlement(address(safe), address(newSettlement)));
    }

    function test_Factory_CreateThesisWithParams() public {
        uint256 customProposerCapitalBps = 3000; // 30%
        uint256 customProposerProfitShareBps = 4000; // 40%

        vm.prank(owner);
        ThesisSettlementV2 newSettlement = factory.createThesisWithParams(
            address(safe),
            funder,
            proposer,
            TOTAL_CAPITAL,
            customProposerCapitalBps,
            customProposerProfitShareBps
        );

        assertEq(newSettlement.proposerCapitalBps(), customProposerCapitalBps);
        assertEq(newSettlement.proposerProfitShareBps(), customProposerProfitShareBps);
    }

    function test_Factory_DeployGuard() public {
        vm.prank(owner);
        ThesisGuardV2 newGuard = factory.deployGuard(address(safe));

        assertEq(address(newGuard.safe()), address(safe));
        assertEq(address(newGuard.manager()), address(manager));
    }

    function test_Factory_MultipleThesesSameSafe() public {
        // Create first thesis
        vm.prank(owner);
        ThesisSettlementV2 settlement1 = factory.createThesis(
            address(safe),
            funder,
            proposer,
            1_000_000
        );

        // Create second thesis with same Safe
        vm.prank(owner);
        ThesisSettlementV2 settlement2 = factory.createThesis(
            address(safe),
            funder,
            proposer,
            2_000_000
        );

        assertTrue(manager.isActiveSettlement(address(safe), address(settlement1)));
        assertTrue(manager.isActiveSettlement(address(safe), address(settlement2)));
        assertEq(manager.exchangeApprovalCap(address(safe)), 3_000_000);
    }

    // ============================================
    // ThesisGuardV2 Tests
    // ============================================

    function _setupGuardWithSettlement() internal returns (ThesisGuardV2, ThesisSettlementV2) {
        // Deploy guard
        vm.prank(owner);
        ThesisGuardV2 testGuard = factory.deployGuard(address(safe));

        // Create settlement
        vm.prank(owner);
        ThesisSettlementV2 testSettlement = factory.createThesis(
            address(safe),
            funder,
            proposer,
            TOTAL_CAPITAL
        );

        // Set guard on Safe
        safe.setGuard(address(testGuard));

        return (testGuard, testSettlement);
    }

    function test_Guard_BlocksDelegateCall() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            TOTAL_CAPITAL
        );

        vm.expectRevert(ThesisGuardV2.DelegateCallNotAllowed.selector);
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.DelegateCall,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksValueTransfer() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            TOTAL_CAPITAL
        );

        vm.expectRevert(ThesisGuardV2.ValueNotAllowed.selector);
        testGuard.checkTransaction(
            USDC_ADDRESS,
            1 ether, // Non-zero value
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksEmptyData() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        vm.expectRevert(abi.encodeWithSelector(ThesisGuardV2.UnauthorizedCall.selector, USDC_ADDRESS, bytes4(0)));
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            "", // Empty data
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsUSDCApproveToExchange() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            TOTAL_CAPITAL
        );

        // Should not revert
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsUSDCApproveToNegRiskExchange() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            NEG_RISK_CTF_EXCHANGE,
            TOTAL_CAPITAL
        );

        // Should not revert
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksUSDCApproveExceedingCap() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        uint256 excessAmount = TOTAL_CAPITAL + 1;
        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            excessAmount
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.ApprovalExceedsMax.selector,
            excessAmount,
            TOTAL_CAPITAL
        ));
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksUSDCApproveToUnauthorizedSpender() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        address unauthorizedSpender = makeAddr("unauthorized");
        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            unauthorizedSpender,
            TOTAL_CAPITAL
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.UnauthorizedApproval.selector,
            unauthorizedSpender
        ));
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsUSDCApproveToActiveSettlement() public {
        (ThesisGuardV2 testGuard, ThesisSettlementV2 testSettlement) = _setupGuardWithSettlement();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(testSettlement),
            TOTAL_CAPITAL
        );

        // Should not revert
        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsCTFSetApprovalForAll() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        bytes memory setApprovalData = abi.encodeWithSignature(
            "setApprovalForAll(address,bool)",
            CTF_EXCHANGE,
            true
        );

        // Should not revert
        testGuard.checkTransaction(
            CTF,
            0,
            setApprovalData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksCTFSetApprovalForAllUnauthorized() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        address unauthorizedOperator = makeAddr("unauthorized");
        bytes memory setApprovalData = abi.encodeWithSignature(
            "setApprovalForAll(address,bool)",
            unauthorizedOperator,
            true
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.UnauthorizedSetApprovalForAll.selector,
            unauthorizedOperator
        ));
        testGuard.checkTransaction(
            CTF,
            0,
            setApprovalData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsCTFRedeemPositions() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        uint256[] memory indexSets = new uint256[](1);
        indexSets[0] = 1;

        bytes memory redeemData = abi.encodeWithSignature(
            "redeemPositions(address,bytes32,bytes32,uint256[])",
            USDC_ADDRESS,
            bytes32(0),
            keccak256("condition"),
            indexSets
        );

        // Should not revert
        testGuard.checkTransaction(
            CTF,
            0,
            redeemData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsCTFMergePositions() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;

        bytes memory mergeData = abi.encodeWithSignature(
            "mergePositions(address,bytes32,bytes32,uint256[],uint256)",
            USDC_ADDRESS,
            bytes32(0),
            keccak256("condition"),
            partition,
            1000
        );

        // Should not revert
        testGuard.checkTransaction(
            CTF,
            0,
            mergeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsDistributeToActiveSettlement() public {
        (ThesisGuardV2 testGuard, ThesisSettlementV2 testSettlement) = _setupGuardWithSettlement();

        bytes memory distributeData = abi.encodeWithSignature(
            "distribute(address)",
            address(safe)
        );

        // Should not revert
        testGuard.checkTransaction(
            address(testSettlement),
            0,
            distributeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksDistributeToInactiveSettlement() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        address inactiveSettlement = makeAddr("inactiveSettlement");
        bytes memory distributeData = abi.encodeWithSignature(
            "distribute(address)",
            address(safe)
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.SettlementNotActive.selector,
            inactiveSettlement
        ));
        testGuard.checkTransaction(
            inactiveSettlement,
            0,
            distributeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksDistributeWithWrongTarget() public {
        (ThesisGuardV2 testGuard, ThesisSettlementV2 testSettlement) = _setupGuardWithSettlement();

        address wrongSafe = makeAddr("wrongSafe");
        bytes memory distributeData = abi.encodeWithSignature(
            "distribute(address)",
            wrongSafe
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.InvalidDistributeTarget.selector,
            wrongSafe
        ));
        testGuard.checkTransaction(
            address(testSettlement),
            0,
            distributeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksSelfCallExceptSetGuard() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        // Try to call addOwnerWithThreshold (random self-call)
        bytes memory randomSelfCall = abi.encodeWithSignature(
            "addOwnerWithThreshold(address,uint256)",
            randomUser,
            1
        );

        vm.expectRevert(ThesisGuardV2.SelfCallNotAllowed.selector);
        testGuard.checkTransaction(
            address(safe),
            0,
            randomSelfCall,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_AllowsSetGuardWithApprovedGuard() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        // Deploy a new approved guard
        address newGuard = makeAddr("newGuard");
        vm.prank(owner);
        manager.setGuardApproval(newGuard, true);

        bytes memory setGuardData = abi.encodeWithSignature(
            "setGuard(address)",
            newGuard
        );

        // Should not revert
        testGuard.checkTransaction(
            address(safe),
            0,
            setGuardData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksSetGuardWithUnapprovedGuard() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        address unapprovedGuard = makeAddr("unapprovedGuard");
        bytes memory setGuardData = abi.encodeWithSignature(
            "setGuard(address)",
            unapprovedGuard
        );

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.GuardNotApproved.selector,
            unapprovedGuard
        ));
        testGuard.checkTransaction(
            address(safe),
            0,
            setGuardData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_BlocksUnauthorizedCall() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        address randomContract = makeAddr("randomContract");
        bytes memory randomCall = abi.encodeWithSignature("doSomething()");

        vm.expectRevert(abi.encodeWithSelector(
            ThesisGuardV2.UnauthorizedCall.selector,
            randomContract,
            bytes4(keccak256("doSomething()"))
        ));
        testGuard.checkTransaction(
            randomContract,
            0,
            randomCall,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)
        );
    }

    function test_Guard_SupportsInterface() public {
        (ThesisGuardV2 testGuard, ) = _setupGuardWithSettlement();

        // Check IGuard interface
        bytes4 guardInterfaceId = 0xe6d7a83a;
        assertTrue(testGuard.supportsInterface(guardInterfaceId));
    }

    // ============================================
    // ThesisSettlementV2 Tests
    // ============================================

    function _setupSettlement() internal returns (ThesisSettlementV2) {
        vm.prank(owner);
        ThesisSettlementV2 testSettlement = factory.createThesis(
            address(safe),
            funder,
            proposer,
            TOTAL_CAPITAL
        );

        // Approve settlement to transfer from Safe
        vm.prank(address(safe));
        usdc.approve(address(testSettlement), type(uint256).max);

        return testSettlement;
    }

    function test_Settlement_InitialState() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        assertEq(testSettlement.safe(), address(safe));
        assertEq(testSettlement.funder(), funder);
        assertEq(testSettlement.proposer(), proposer);
        assertEq(testSettlement.totalCapital(), TOTAL_CAPITAL);
        assertEq(testSettlement.proposerCapitalBps(), PROPOSER_CAPITAL_BPS);
        assertEq(testSettlement.proposerProfitShareBps(), PROPOSER_PROFIT_SHARE_BPS);
        assertFalse(testSettlement.distributed());
    }

    function test_Settlement_DistributeProfit() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        // Set Safe balance to exactly 2x capital (100% profit)
        uint256 currentBalance = usdc.balanceOf(address(safe));
        usdc.burn(address(safe), currentBalance);

        uint256 profit = TOTAL_CAPITAL; // 100% profit
        uint256 totalBalance = TOTAL_CAPITAL + profit;
        usdc.mint(address(safe), totalBalance);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 proposerBalanceBefore = usdc.balanceOf(proposer);

        // Distribute as proposer
        vm.prank(proposer);
        testSettlement.distribute(address(safe));

        // Calculate expected amounts
        uint256 proposerCapital = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10000;
        uint256 funderCapital = TOTAL_CAPITAL - proposerCapital;
        uint256 proposerProfitShare = (profit * PROPOSER_PROFIT_SHARE_BPS) / 10000;
        uint256 funderProfitShare = profit - proposerProfitShare;

        uint256 expectedProposerAmount = proposerCapital + proposerProfitShare;
        uint256 expectedFunderAmount = funderCapital + funderProfitShare;

        assertEq(usdc.balanceOf(proposer), proposerBalanceBefore + expectedProposerAmount);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + expectedFunderAmount);
        assertTrue(testSettlement.distributed());
    }

    function test_Settlement_DistributeLoss_ProposerAbsorbs() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        // Set Safe balance to less than capital (loss within proposer's share)
        uint256 loss = 100_000; // 10% loss (within proposer's 20%)
        uint256 safeBalance = TOTAL_CAPITAL - loss;

        // Burn excess from Safe
        usdc.burn(address(safe), usdc.balanceOf(address(safe)) - safeBalance);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 proposerBalanceBefore = usdc.balanceOf(proposer);

        vm.prank(funder);
        testSettlement.distribute(address(safe));

        // Proposer absorbs entire loss
        uint256 proposerCapital = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10000;
        uint256 funderCapital = TOTAL_CAPITAL - proposerCapital;

        uint256 expectedProposerAmount = proposerCapital - loss;
        uint256 expectedFunderAmount = funderCapital;

        assertEq(usdc.balanceOf(proposer), proposerBalanceBefore + expectedProposerAmount);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + expectedFunderAmount);
    }

    function test_Settlement_DistributeLoss_FunderAbsorbs() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        // Set Safe balance to much less than capital (loss exceeds proposer's share)
        uint256 proposerCapital = (TOTAL_CAPITAL * PROPOSER_CAPITAL_BPS) / 10000;
        uint256 loss = proposerCapital + 100_000; // Loss exceeds proposer's capital
        uint256 safeBalance = TOTAL_CAPITAL - loss;

        // Burn excess from Safe
        usdc.burn(address(safe), usdc.balanceOf(address(safe)) - safeBalance);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 proposerBalanceBefore = usdc.balanceOf(proposer);

        vm.prank(funder);
        testSettlement.distribute(address(safe));

        // Proposer loses everything, funder absorbs rest
        uint256 funderCapital = TOTAL_CAPITAL - proposerCapital;
        uint256 funderLoss = loss - proposerCapital;

        uint256 expectedProposerAmount = 0;
        uint256 expectedFunderAmount = funderCapital - funderLoss;

        assertEq(usdc.balanceOf(proposer), proposerBalanceBefore + expectedProposerAmount);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + expectedFunderAmount);
    }

    function test_Settlement_DistributeOnlyAuthorized() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        vm.prank(randomUser);
        vm.expectRevert(ThesisSettlementV2.NotAuthorized.selector);
        testSettlement.distribute(address(safe));
    }

    function test_Settlement_DistributeWrongSafe() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        address wrongSafe = makeAddr("wrongSafe");

        vm.prank(proposer);
        vm.expectRevert(ThesisSettlementV2.WrongSafe.selector);
        testSettlement.distribute(wrongSafe);
    }

    function test_Settlement_DistributeAlreadyDistributed() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        vm.prank(proposer);
        testSettlement.distribute(address(safe));

        vm.prank(proposer);
        vm.expectRevert(ThesisSettlementV2.AlreadyDistributed.selector);
        testSettlement.distribute(address(safe));
    }

    function test_Settlement_DistributeDeactivatesInManager() public {
        ThesisSettlementV2 testSettlement = _setupSettlement();

        assertTrue(manager.isActiveSettlement(address(safe), address(testSettlement)));
        assertEq(manager.exchangeApprovalCap(address(safe)), TOTAL_CAPITAL);

        vm.prank(proposer);
        testSettlement.distribute(address(safe));

        assertFalse(manager.isActiveSettlement(address(safe), address(testSettlement)));
        assertEq(manager.exchangeApprovalCap(address(safe)), 0);
    }

    // ============================================
    // Integration Tests: Safe + Guard + Settlement
    // ============================================

    function test_Integration_FullFlow() public {
        // 1. Deploy guard and set on Safe
        vm.prank(owner);
        ThesisGuardV2 testGuard = factory.deployGuard(address(safe));
        safe.setGuard(address(testGuard));

        // 2. Create thesis (registers with manager)
        vm.prank(owner);
        ThesisSettlementV2 testSettlement = factory.createThesis(
            address(safe),
            funder,
            proposer,
            TOTAL_CAPITAL
        );

        // 3. Verify guard allows USDC approve to CTF Exchange
        bytes memory approveExchangeData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            TOTAL_CAPITAL
        );

        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveExchangeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", proposer
        );

        // 4. Verify guard allows CTF setApprovalForAll
        bytes memory setApprovalData = abi.encodeWithSignature(
            "setApprovalForAll(address,bool)",
            CTF_EXCHANGE,
            true
        );

        testGuard.checkTransaction(
            CTF,
            0,
            setApprovalData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", proposer
        );

        // 5. Verify guard allows settlement approval
        bytes memory approveSettlementData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(testSettlement),
            TOTAL_CAPITAL
        );

        testGuard.checkTransaction(
            USDC_ADDRESS,
            0,
            approveSettlementData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", proposer
        );

        // 6. Verify guard allows distribute call
        bytes memory distributeData = abi.encodeWithSignature(
            "distribute(address)",
            address(safe)
        );

        testGuard.checkTransaction(
            address(testSettlement),
            0,
            distributeData,
            Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", proposer
        );

        // 7. Actually perform distribute
        uint256 currentBalance = usdc.balanceOf(address(safe));
        usdc.burn(address(safe), currentBalance);
        usdc.mint(address(safe), TOTAL_CAPITAL);

        vm.prank(address(safe));
        usdc.approve(address(testSettlement), TOTAL_CAPITAL);

        vm.prank(proposer);
        testSettlement.distribute(address(safe));

        // Verify settlement is deactivated
        assertFalse(manager.isActiveSettlement(address(safe), address(testSettlement)));
    }

    function test_Integration_BlockedTransactions() public {
        // Setup
        vm.prank(owner);
        ThesisGuardV2 testGuard = factory.deployGuard(address(safe));
        safe.setGuard(address(testGuard));

        vm.prank(owner);
        factory.createThesis(address(safe), funder, proposer, TOTAL_CAPITAL);

        // Try to approve unauthorized spender - should revert
        bytes memory approveUnauthorized = abi.encodeWithSignature(
            "approve(address,uint256)",
            randomUser,
            TOTAL_CAPITAL
        );

        vm.prank(proposer);
        vm.expectRevert();
        safe.execTransaction(USDC_ADDRESS, 0, approveUnauthorized, Operation.Call);

        // Try value transfer - should revert
        vm.prank(proposer);
        vm.expectRevert();
        safe.execTransaction(randomUser, 1 ether, "", Operation.Call);
    }

    function test_Integration_MultipleTheses() public {
        // Setup guard
        vm.prank(owner);
        ThesisGuardV2 testGuard = factory.deployGuard(address(safe));
        safe.setGuard(address(testGuard));

        // Create two theses
        vm.prank(owner);
        ThesisSettlementV2 settlement1 = factory.createThesis(
            address(safe),
            funder,
            proposer,
            1_000_000
        );

        vm.prank(owner);
        ThesisSettlementV2 settlement2 = factory.createThesis(
            address(safe),
            funder,
            proposer,
            2_000_000
        );

        // Exchange cap should be sum
        assertEq(manager.exchangeApprovalCap(address(safe)), 3_000_000);

        // Approve exchange for full amount
        bytes memory approveExchangeData = abi.encodeWithSignature(
            "approve(address,uint256)",
            CTF_EXCHANGE,
            3_000_000
        );

        vm.prank(proposer);
        safe.execTransaction(USDC_ADDRESS, 0, approveExchangeData, Operation.Call);

        // Approve and distribute settlement1
        vm.prank(address(safe));
        usdc.approve(address(settlement1), type(uint256).max);

        vm.prank(proposer);
        settlement1.distribute(address(safe));

        // Exchange cap should decrease
        assertEq(manager.exchangeApprovalCap(address(safe)), 2_000_000);

        // settlement2 is still active
        assertTrue(manager.isActiveSettlement(address(safe), address(settlement2)));
    }
}
