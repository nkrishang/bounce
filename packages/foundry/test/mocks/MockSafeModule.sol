// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IGuard, Operation} from "../../src/thesis/interfaces/IGuard.sol";

/// @title MockSafeModule
/// @notice Mock Gnosis Safe supporting module execution for testing Bounce.
/// @dev Supports execTransactionFromModule (bypasses guard), isModuleEnabled, isOwner.
///      execTransaction calls guard's checkTransaction (which will revert if Bounce is guard).
contract MockSafeModule {
    /// @notice List of Safe owners.
    address[] private _owners;

    /// @notice Mapping for O(1) owner lookups.
    mapping(address => bool) private _isOwner;

    /// @notice Set of enabled modules.
    mapping(address => bool) private _modules;

    /// @notice The installed guard address.
    address private _guard;

    /// @notice Transaction nonce.
    uint256 private _nonce;

    event ExecutionSuccess(bytes32 txHash);
    event ExecutionFailure(bytes32 txHash);
    event ExecutionFromModuleSuccess(address indexed module);
    event ExecutionFromModuleFailure(address indexed module);

    /// @notice Creates a MockSafeModule with a single owner.
    /// @param owner The initial Safe owner.
    constructor(address owner) {
        _owners.push(owner);
        _isOwner[owner] = true;
    }

    /// @notice Returns all Safe owners.
    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    /// @notice Checks whether an address is an owner.
    /// @param owner The address to check.
    /// @return Whether the address is an owner.
    function isOwner(address owner) external view returns (bool) {
        return _isOwner[owner];
    }

    /// @notice Returns the current nonce.
    function nonce() external view returns (uint256) {
        return _nonce;
    }

    /// @notice Returns the installed guard address.
    function getGuard() external view returns (address) {
        return _guard;
    }

    /// @notice Sets the guard on this Safe.
    /// @param guard The guard address.
    function setGuard(address guard) external {
        _guard = guard;
    }

    /// @notice Enables a module on this Safe.
    /// @param module The module address to enable.
    function enableModule(address module) external {
        _modules[module] = true;
    }

    /// @notice Disables a module on this Safe.
    /// @param module The module address to disable.
    function disableModule(address module) external {
        _modules[module] = false;
    }

    /// @notice Checks whether a module is enabled.
    /// @param module The module address to check.
    /// @return Whether the module is enabled.
    function isModuleEnabled(address module) external view returns (bool) {
        return _modules[module];
    }

    /// @notice Executes a transaction from an enabled module (bypasses guard).
    /// @dev This is the critical path Bounce uses. Module calls do NOT invoke guard hooks.
    /// @param to Destination address.
    /// @param value Native token value.
    /// @param data Calldata payload.
    /// @param operation Operation type: 0 = Call, 1 = DelegateCall.
    /// @return success Whether the call succeeded.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success)
    {
        // Only enabled modules can call this.
        require(_modules[msg.sender], "GS104");

        // Execute without guard checks (mirrors real Safe behavior).
        if (operation == 1) {
            (success,) = to.delegatecall(data);
        } else {
            (success,) = to.call{value: value}(data);
        }

        if (success) {
            emit ExecutionFromModuleSuccess(msg.sender);
        } else {
            emit ExecutionFromModuleFailure(msg.sender);
        }
    }

    /// @notice Simulates Safe's execTransaction with guard checks.
    /// @dev If Bounce is installed as guard, checkTransaction will always revert.
    /// @param to Destination address.
    /// @param value Native token value.
    /// @param data Calldata payload.
    /// @param operation Operation type enum.
    /// @return success Whether the call succeeded.
    function execTransaction(address to, uint256 value, bytes calldata data, Operation operation)
        external
        returns (bool success)
    {
        bytes32 txHash = keccak256(abi.encode(address(this), to, value, keccak256(data), operation, _nonce));

        // Guard check before execution — this will revert if Bounce is guard.
        if (_guard != address(0)) {
            IGuard(_guard)
                .checkTransaction(to, value, data, operation, 0, 0, 0, address(0), payable(address(0)), "", msg.sender);
        }

        // Execute the transaction.
        if (operation == Operation.DelegateCall) {
            (success,) = to.delegatecall(data);
        } else {
            (success,) = to.call{value: value}(data);
        }

        _nonce++;

        // Guard check after execution.
        if (_guard != address(0)) {
            IGuard(_guard).checkAfterExecution(txHash, success);
        }

        if (success) {
            emit ExecutionSuccess(txHash);
        } else {
            emit ExecutionFailure(txHash);
        }
    }

    /// @notice Allow receiving ETH.
    receive() external payable {}
}
