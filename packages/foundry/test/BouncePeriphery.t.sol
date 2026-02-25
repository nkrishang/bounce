// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Bounce} from "../src/bounce/Bounce.sol";
import {BouncePeriphery} from "../src/bounce/BouncePeriphery.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCTF} from "./mocks/MockCTF.sol";
import {MockSafeModule} from "./mocks/MockSafeModule.sol";
import {MockExchange} from "./mocks/MockExchange.sol";

contract BouncePeripheryTest is Test {
    Bounce public bounce;
    BouncePeriphery public periphery;

    MockERC20 public usdc;
    MockCTF public ctf;
    MockSafeModule public safe;

    address public owner;
    address public proposer;
    address public funder;

    address public constant USDC_ADDRESS = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address public constant CTF_ADDR = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;

    uint256 public constant TOTAL_CAPITAL = 1_000_000;
    uint16 public constant PROPOSER_CAPITAL_BPS = 2000;
    uint16 public constant PROPOSER_PROFIT_SHARE_BPS = 3000;
    bytes32 public constant CONDITION_ID = bytes32(uint256(1));
    bytes32 public constant CONDITION_ID_2 = bytes32(uint256(2));
    uint8 public constant OUTCOME_INDEX = 0;
    uint256 public constant INDEX_SET = 1;
    string public constant SLUG = "test-market";

    uint256 public POSITION_ID;
    uint256 public POSITION_ID_2;

    function setUp() public {
        owner = makeAddr("owner");
        proposer = makeAddr("proposer");
        funder = makeAddr("funder");

        POSITION_ID = uint256(keccak256(abi.encode(CONDITION_ID, INDEX_SET)));
        POSITION_ID_2 = uint256(keccak256(abi.encode(CONDITION_ID_2, INDEX_SET)));

        usdc = new MockERC20("USDC", "USDC", 6);
        vm.etch(USDC_ADDRESS, address(usdc).code);
        usdc = MockERC20(USDC_ADDRESS);

        ctf = new MockCTF();
        vm.etch(CTF_ADDR, address(ctf).code);
        ctf = MockCTF(CTF_ADDR);
        ctf.setUsdc(USDC_ADDRESS);

        deployCodeTo(
            "MockExchange.sol:MockExchange", abi.encode(USDC_ADDRESS, CTF_ADDR, uint256(500_000)), CTF_EXCHANGE
        );

        Bounce impl = new Bounce();
        address proxy = LibClone.deployERC1967(address(impl));
        bounce = Bounce(proxy);
        bounce.initialize(owner);

        periphery = new BouncePeriphery(address(bounce));

        safe = new MockSafeModule(proposer);
        safe.enableModule(address(bounce));
        safe.setGuard(address(bounce));

        usdc.mint(proposer, 100_000_000);
        usdc.mint(funder, 100_000_000);
    }

    // ============================================
    // Helpers
    // ============================================

    function _proposeBet() internal returns (uint256 betId) {
        return _proposeBetWith(CONDITION_ID, POSITION_ID);
    }

    function _proposeBetWith(bytes32 conditionId, uint256 positionId) internal returns (uint256 betId) {
        vm.startPrank(proposer);
        usdc.approve(address(bounce), type(uint256).max);
        betId = bounce.proposeBet(
            address(safe),
            funder,
            CTF_EXCHANGE,
            conditionId,
            OUTCOME_INDEX,
            positionId,
            TOTAL_CAPITAL,
            PROPOSER_CAPITAL_BPS,
            PROPOSER_PROFIT_SHARE_BPS,
            0,
            SLUG
        );
        vm.stopPrank();
    }

    function _fundBet(uint256 betId) internal {
        vm.startPrank(funder);
        usdc.approve(address(bounce), type(uint256).max);
        bounce.fundBet(betId);
        vm.stopPrank();
    }

    // ============================================
    // By Proposer
    // ============================================

    function test_getBetsByProposer_single() public {
        uint256 betId = _proposeBet();

        assertEq(periphery.getBetsByProposerCount(proposer), 1);
        uint256[] memory bets = periphery.getBetsByProposer(proposer, 0, 1);
        assertEq(bets.length, 1);
        assertEq(bets[0], betId);
    }

    function test_getBetsByProposer_multiple() public {
        uint256 bet1 = _proposeBetWith(CONDITION_ID, POSITION_ID);
        uint256 bet2 = _proposeBetWith(CONDITION_ID_2, POSITION_ID_2);

        assertEq(periphery.getBetsByProposerCount(proposer), 2);
        uint256[] memory bets = periphery.getBetsByProposer(proposer, 0, 2);
        assertEq(bets[0], bet1);
        assertEq(bets[1], bet2);
    }

    function test_getBetsByProposer_zeroForUnknown() public view {
        assertEq(periphery.getBetsByProposerCount(address(0xdead)), 0);
    }

    // ============================================
    // By Funder
    // ============================================

    function test_getBetsByFunder_afterFunding() public {
        uint256 betId = _proposeBet();
        _fundBet(betId);

        assertEq(periphery.getBetsByFunderCount(funder), 1);
        uint256[] memory bets = periphery.getBetsByFunder(funder, 0, 1);
        assertEq(bets.length, 1);
        assertEq(bets[0], betId);
    }

    function test_getBetsByFunder_designatedBeforeFunding() public {
        uint256 betId = _proposeBet();
        // Funder was designated at propose time, so it shows up even before funding.
        assertEq(periphery.getBetsByFunderCount(funder), 1);
        uint256[] memory bets = periphery.getBetsByFunder(funder, 0, 1);
        assertEq(bets[0], betId);
    }

    function test_getBetsByFunder_zeroForUnknown() public view {
        assertEq(periphery.getBetsByFunderCount(address(0xdead)), 0);
    }

    // ============================================
    // By Safe
    // ============================================

    function test_getBetsBySafe() public {
        uint256 betId = _proposeBet();

        assertEq(periphery.getBetsBySafeCount(address(safe)), 1);
        uint256[] memory bets = periphery.getBetsBySafe(address(safe), 0, 1);
        assertEq(bets.length, 1);
        assertEq(bets[0], betId);
    }

    function test_getBetsBySafe_zeroForUnknown() public view {
        assertEq(periphery.getBetsBySafeCount(address(0xdead)), 0);
    }

    // ============================================
    // By ConditionId
    // ============================================

    function test_getBetsByConditionId() public {
        uint256 betId = _proposeBet();

        assertEq(periphery.getBetsByConditionIdCount(CONDITION_ID), 1);
        uint256[] memory bets = periphery.getBetsByConditionId(CONDITION_ID, 0, 1);
        assertEq(bets.length, 1);
        assertEq(bets[0], betId);
    }

    function test_getBetsByConditionId_zeroForUnknown() public view {
        assertEq(periphery.getBetsByConditionIdCount(bytes32(uint256(999))), 0);
    }

    // ============================================
    // Pagination
    // ============================================

    function test_pagination_slice() public {
        uint256 bet1 = _proposeBetWith(CONDITION_ID, POSITION_ID);
        uint256 bet2 = _proposeBetWith(CONDITION_ID_2, POSITION_ID_2);

        // Get second element only.
        uint256[] memory bets = periphery.getBetsByProposer(proposer, 1, 2);
        assertEq(bets.length, 1);
        assertEq(bets[0], bet2);

        // Get first element only.
        bets = periphery.getBetsByProposer(proposer, 0, 1);
        assertEq(bets.length, 1);
        assertEq(bets[0], bet1);
    }

    function test_pagination_emptySlice() public {
        _proposeBet();
        // [1, 1) is an empty slice.
        uint256[] memory bets = periphery.getBetsByProposer(proposer, 1, 1);
        assertEq(bets.length, 0);
    }

    function test_pagination_revertsOnInvalidRange() public {
        vm.expectRevert(abi.encodeWithSelector(BouncePeriphery.InvalidRange.selector, 2, 1));
        periphery.getBetsByProposer(proposer, 2, 1);
    }

    function test_pagination_revertsWhenEndExceedsCount() public {
        _proposeBet();
        // Only 1 match but requesting [0, 5).
        vm.expectRevert(abi.encodeWithSelector(BouncePeriphery.InvalidRange.selector, 0, 5));
        periphery.getBetsByProposer(proposer, 0, 5);
    }
}
