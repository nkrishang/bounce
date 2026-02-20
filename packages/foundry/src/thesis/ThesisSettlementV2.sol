// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IThesisManager} from "./interfaces/IThesisManager.sol";

contract ThesisSettlementV2 {
    address public immutable safe;
    IThesisManager public immutable manager;
    address public immutable funder;
    address public immutable proposer;
    IERC20 public immutable usdc;
    uint256 public immutable proposerCapitalBps;
    uint256 public immutable proposerProfitShareBps;
    uint256 public immutable totalCapital;
    uint256 public constant BPS_DENOMINATOR = 10000;
    bool public distributed;

    event Distributed(address indexed safe, uint256 funderAmount, uint256 proposerAmount, uint256 totalBalance);
    event ProfitDistributed(uint256 profit, uint256 funderProfit, uint256 proposerProfit);
    event LossDistributed(uint256 loss, uint256 proposerLoss, uint256 funderLoss);

    error ZeroAddress();
    error TransferFailed();
    error ZeroCapital();
    error InvalidBps();
    error NotAuthorized();
    error AlreadyDistributed();
    error WrongSafe();

    constructor(
        address _safe,
        address _manager,
        address _funder,
        address _proposer,
        address _usdc,
        uint256 _totalCapital,
        uint256 _proposerCapitalBps,
        uint256 _proposerProfitShareBps
    ) {
        if (_safe == address(0) || _manager == address(0) || _funder == address(0) || _proposer == address(0) || _usdc == address(0)) revert ZeroAddress();
        if (_totalCapital == 0) revert ZeroCapital();
        if (_proposerCapitalBps > BPS_DENOMINATOR || _proposerProfitShareBps > BPS_DENOMINATOR) revert InvalidBps();

        safe = _safe;
        manager = IThesisManager(_manager);
        funder = _funder;
        proposer = _proposer;
        usdc = IERC20(_usdc);
        totalCapital = _totalCapital;
        proposerCapitalBps = _proposerCapitalBps;
        proposerProfitShareBps = _proposerProfitShareBps;
    }

    function distribute(address _safe) external {
        if (msg.sender != funder && msg.sender != proposer) revert NotAuthorized();
        if (_safe != safe) revert WrongSafe();
        if (distributed) revert AlreadyDistributed();

        distributed = true;
        uint256 balance = usdc.balanceOf(safe);
        uint256 proposerCapital = (totalCapital * proposerCapitalBps) / BPS_DENOMINATOR;
        uint256 funderCapital = totalCapital - proposerCapital;

        uint256 funderAmount;
        uint256 proposerAmount;

        if (balance >= totalCapital) {
            uint256 profit = balance - totalCapital;
            uint256 proposerProfit = (profit * proposerProfitShareBps) / BPS_DENOMINATOR;
            uint256 funderProfit = profit - proposerProfit;
            funderAmount = funderCapital + funderProfit;
            proposerAmount = proposerCapital + proposerProfit;
            emit ProfitDistributed(profit, funderProfit, proposerProfit);
        } else {
            uint256 loss = totalCapital - balance;
            if (loss <= proposerCapital) {
                proposerAmount = proposerCapital - loss;
                funderAmount = funderCapital;
                emit LossDistributed(loss, loss, 0);
            } else {
                proposerAmount = 0;
                uint256 funderLoss = loss - proposerCapital;
                funderAmount = funderCapital - funderLoss;
                emit LossDistributed(loss, proposerCapital, funderLoss);
            }
        }

        if (funderAmount > 0 && !usdc.transferFrom(safe, funder, funderAmount)) revert TransferFailed();
        if (proposerAmount > 0 && !usdc.transferFrom(safe, proposer, proposerAmount)) revert TransferFailed();

        emit Distributed(safe, funderAmount, proposerAmount, balance);
        manager.deactivateSettlement(safe, address(this));
    }
}
