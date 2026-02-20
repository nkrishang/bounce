// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ThesisSettlementV2} from "./ThesisSettlementV2.sol";
import {ThesisGuardV2} from "./ThesisGuardV2.sol";
import {ThesisManager} from "./ThesisManager.sol";

contract ThesisFactoryV2 {
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    uint256 public constant DEFAULT_PROPOSER_CAPITAL_BPS = 2000;
    uint256 public constant DEFAULT_PROPOSER_PROFIT_SHARE_BPS = 3000;
    ThesisManager public immutable manager;

    event ThesisCreated(address indexed safe, address indexed settlement, address funder, address proposer, uint256 totalCapital);
    event GuardDeployed(address indexed safe, address indexed guard);

    constructor(address _manager) {
        manager = ThesisManager(_manager);
    }

    function createThesis(address safe, address funder, address proposer, uint256 totalCapital) external returns (ThesisSettlementV2 settlement) {
        return createThesisWithParams(safe, funder, proposer, totalCapital, DEFAULT_PROPOSER_CAPITAL_BPS, DEFAULT_PROPOSER_PROFIT_SHARE_BPS);
    }

    function createThesisWithParams(
        address safe,
        address funder,
        address proposer,
        uint256 totalCapital,
        uint256 proposerCapitalBps,
        uint256 proposerProfitShareBps
    ) public returns (ThesisSettlementV2 settlement) {
        settlement = new ThesisSettlementV2(safe, address(manager), funder, proposer, USDC, totalCapital, proposerCapitalBps, proposerProfitShareBps);
        manager.registerSettlement(safe, address(settlement), totalCapital);
        emit ThesisCreated(safe, address(settlement), funder, proposer, totalCapital);
    }

    function deployGuard(address safe) external returns (ThesisGuardV2 guard) {
        guard = new ThesisGuardV2(address(manager), safe);
        manager.setSafeGuard(safe, address(guard));
        emit GuardDeployed(safe, address(guard));
    }
}
