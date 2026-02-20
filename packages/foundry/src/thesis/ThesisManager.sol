// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IThesisManager} from "./interfaces/IThesisManager.sol";

/// @title ThesisManager
/// @notice Registry that tracks active settlements per Safe for multi-bet support
/// @dev The Guard queries this contract to validate approvals and settlement operations
contract ThesisManager is IThesisManager {
    /// @notice Configuration for an active settlement
    struct SettlementConfig {
        bool active;
        uint256 cap;
    }

    /// @notice Owner of the manager (can set factory and approve guards)
    address public owner;

    /// @notice Authorized factory that can register settlements
    address public factory;

    /// @notice Mapping: safe => settlement => config
    mapping(address => mapping(address => SettlementConfig)) public settlements;

    /// @notice Mapping: safe => total active cap (sum of all active settlement caps)
    mapping(address => uint256) public totalActiveCap;

    /// @notice Mapping: guard implementation => approved
    mapping(address => bool) public approvedGuardImplementations;

    /// @notice Mapping: safe => installed guard address
    mapping(address => address) public safeGuard;

    /// @notice Emitted when a settlement is registered
    event SettlementRegistered(address indexed safe, address indexed settlement, uint256 cap);

    /// @notice Emitted when a settlement is deactivated
    event SettlementDeactivated(address indexed safe, address indexed settlement);

    /// @notice Emitted when the factory is updated
    event FactoryUpdated(address indexed oldFactory, address indexed newFactory);

    /// @notice Emitted when a guard implementation is approved/revoked
    event GuardApprovalUpdated(address indexed guard, bool approved);

    /// @notice Emitted when a Safe's guard is recorded
    event SafeGuardSet(address indexed safe, address indexed guard);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotFactory();
    error NotAuthorized();
    error SettlementNotActive();
    error SettlementAlreadyActive();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    /// @notice Sets the authorized factory address
    /// @param _factory The new factory address
    function setFactory(address _factory) external onlyOwner {
        emit FactoryUpdated(factory, _factory);
        factory = _factory;
    }

    /// @notice Approves or revokes a guard implementation
    /// @param guard The guard implementation address
    /// @param approved Whether to approve or revoke
    function setGuardApproval(address guard, bool approved) external onlyOwner {
        approvedGuardImplementations[guard] = approved;
        emit GuardApprovalUpdated(guard, approved);
    }

    /// @notice Records the guard installed on a Safe (called by factory after setup)
    /// @param safe The Safe address
    /// @param guard The guard address
    function setSafeGuard(address safe, address guard) external onlyFactory {
        safeGuard[safe] = guard;
        emit SafeGuardSet(safe, guard);
    }

    /// @notice Transfers ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @inheritdoc IThesisManager
    function registerSettlement(address safe, address settlement, uint256 cap) external onlyFactory {
        if (settlements[safe][settlement].active) revert SettlementAlreadyActive();

        settlements[safe][settlement] = SettlementConfig({active: true, cap: cap});
        totalActiveCap[safe] += cap;

        emit SettlementRegistered(safe, settlement, cap);
    }

    /// @inheritdoc IThesisManager
    function deactivateSettlement(address safe, address settlement) external {
        SettlementConfig storage config = settlements[safe][settlement];
        if (!config.active) revert SettlementNotActive();

        // Only the settlement itself, the factory, or the owner can deactivate
        if (msg.sender != settlement && msg.sender != factory && msg.sender != owner) {
            revert NotAuthorized();
        }

        totalActiveCap[safe] -= config.cap;
        config.active = false;
        config.cap = 0;

        emit SettlementDeactivated(safe, settlement);
    }

    /// @inheritdoc IThesisManager
    function isActiveSettlement(address safe, address settlement) external view returns (bool) {
        return settlements[safe][settlement].active;
    }

    /// @inheritdoc IThesisManager
    function settlementApprovalCap(address safe, address settlement) external view returns (uint256) {
        SettlementConfig storage config = settlements[safe][settlement];
        return config.active ? config.cap : 0;
    }

    /// @inheritdoc IThesisManager
    function exchangeApprovalCap(address safe) external view returns (uint256) {
        return totalActiveCap[safe];
    }

    /// @inheritdoc IThesisManager
    function isApprovedGuard(address safe, address guard) external view returns (bool) {
        // A guard is approved if:
        // 1. It's an approved implementation, OR
        // 2. It's already the installed guard for this Safe (allows re-setting same guard)
        return approvedGuardImplementations[guard] || safeGuard[safe] == guard;
    }
}
