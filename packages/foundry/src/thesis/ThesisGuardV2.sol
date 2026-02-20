// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGuard, Operation} from "./interfaces/IGuard.sol";
import {IThesisManager} from "./interfaces/IThesisManager.sol";

/// @title ThesisGuardV2
/// @notice Transaction guard that supports multiple bets per Safe via ThesisManager
/// @dev Queries the manager for active settlements and approval caps
contract ThesisGuardV2 is IGuard {
    /// @notice Polygon USDC address
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    /// @notice Polymarket Conditional Tokens Framework
    address public constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;

    /// @notice Polymarket CTF Exchange
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;

    /// @notice Polymarket Neg Risk CTF Exchange
    address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;

    /// @notice ThesisManager contract that tracks active settlements
    IThesisManager public immutable manager;

    /// @notice The Safe address this guard protects
    address public immutable safe;

    // Function selectors
    bytes4 private constant APPROVE_SELECTOR = 0x095ea7b3; // approve(address,uint256)
    bytes4 private constant SET_APPROVAL_FOR_ALL_SELECTOR = 0xa22cb465; // setApprovalForAll(address,bool)
    bytes4 private constant REDEEM_POSITIONS_SELECTOR = 0x01b7037c; // redeemPositions(address,bytes32,bytes32,uint256[])
    bytes4 private constant MERGE_POSITIONS_SELECTOR = 0x9e7212ad; // mergePositions(address,bytes32,bytes32,uint256[],uint256)
    bytes4 private constant DISTRIBUTE_SELECTOR = 0x63453ae1; // distribute(address)
    bytes4 private constant SET_GUARD_SELECTOR = 0xe19a9dd9; // setGuard(address)

    error DelegateCallNotAllowed();
    error SelfCallNotAllowed();
    error ValueNotAllowed();
    error UnauthorizedCall(address to, bytes4 selector);
    error UnauthorizedApproval(address spender);
    error UnauthorizedSetApprovalForAll(address operator);
    error InvalidDistributeTarget(address target);
    error InvalidCalldataLength();
    error ApprovalExceedsMax(uint256 amount, uint256 max);
    error SettlementNotActive(address settlement);
    error GuardNotApproved(address guard);

    // Guard interface ID that Safe 1.3.0 checks for
    bytes4 private constant GUARD_INTERFACE_ID = 0xe6d7a83a;

    /// @notice Creates a new ThesisGuardV2
    /// @param _manager Address of the ThesisManager contract
    /// @param _safe Address of the Safe this guard protects
    constructor(address _manager, address _safe) {
        manager = IThesisManager(_manager);
        safe = _safe;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IGuard).interfaceId || interfaceId == GUARD_INTERFACE_ID;
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external view override {
        if (operation == Operation.DelegateCall) {
            revert DelegateCallNotAllowed();
        }

        if (value != 0) {
            revert ValueNotAllowed();
        }

        if (data.length < 4) {
            revert UnauthorizedCall(to, bytes4(0));
        }

        bytes4 selector = bytes4(data);

        if (to == safe) {
            if (selector == SET_GUARD_SELECTOR) {
                if (data.length != 36) revert InvalidCalldataLength();
                address newGuard = _decodeAddress(data, 4);
                if (!manager.isApprovedGuard(safe, newGuard)) {
                    revert GuardNotApproved(newGuard);
                }
                return;
            }
            revert SelfCallNotAllowed();
        }

        if (to == USDC && selector == APPROVE_SELECTOR) {
            if (data.length != 68) revert InvalidCalldataLength();
            address spender = _decodeAddress(data, 4);
            uint256 amount = _decodeUint256(data, 36);

            if (spender == CTF_EXCHANGE || spender == NEG_RISK_CTF_EXCHANGE) {
                uint256 maxApproval = manager.exchangeApprovalCap(safe);
                if (amount > maxApproval) {
                    revert ApprovalExceedsMax(amount, maxApproval);
                }
                return;
            }

            if (manager.isActiveSettlement(safe, spender)) {
                uint256 maxApproval = manager.settlementApprovalCap(safe, spender);
                if (amount > maxApproval) {
                    revert ApprovalExceedsMax(amount, maxApproval);
                }
                return;
            }

            revert UnauthorizedApproval(spender);
        }

        if (to == CTF && selector == SET_APPROVAL_FOR_ALL_SELECTOR) {
            if (data.length != 68) revert InvalidCalldataLength();
            address operator = _decodeAddress(data, 4);
            if (operator != CTF_EXCHANGE && operator != NEG_RISK_CTF_EXCHANGE) {
                revert UnauthorizedSetApprovalForAll(operator);
            }
            return;
        }

        if (to == CTF && (selector == REDEEM_POSITIONS_SELECTOR || selector == MERGE_POSITIONS_SELECTOR)) {
            return;
        }

        if (selector == DISTRIBUTE_SELECTOR) {
            if (!manager.isActiveSettlement(safe, to)) {
                revert SettlementNotActive(to);
            }
            if (data.length != 36) revert InvalidCalldataLength();
            address target = _decodeAddress(data, 4);
            if (target != safe) {
                revert InvalidDistributeTarget(target);
            }
            return;
        }

        revert UnauthorizedCall(to, selector);
    }

    function checkAfterExecution(bytes32, bool) external pure override {}

    function _decodeAddress(bytes memory data, uint256 offset) private pure returns (address addr) {
        assembly {
            addr := mload(add(add(data, 32), offset))
        }
    }

    function _decodeUint256(bytes memory data, uint256 offset) private pure returns (uint256 value) {
        assembly {
            value := mload(add(add(data, 32), offset))
        }
    }
}
