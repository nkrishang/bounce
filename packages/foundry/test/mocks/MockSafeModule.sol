// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IGuard, Operation} from "../../src/thesis/interfaces/IGuard.sol";

/// @title MockSafeModule
/// @notice Mock Gnosis Safe supporting module execution for testing Bounce.
/// @dev Supports execTransactionFromModule (bypasses guard), isModuleEnabled, isOwner.
///      execTransaction calls guard's checkTransaction (which will revert if Bounce is guard).
///      Implements getStorageAt (from Safe's StorageAccessible) for guard slot reads.
contract MockSafeModule {
    /// @notice Safe 1.3.0 guard storage slot: keccak256("guard_manager.guard.address").
    uint256 private constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    /// @notice List of Safe owners.
    address[] private _owners;

    /// @notice Mapping for O(1) owner lookups.
    mapping(address => bool) private _isOwner;

    /// @notice Set of enabled modules.
    mapping(address => bool) private _modules;

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

    /// @notice Returns the installed guard address by reading the guard storage slot.
    function getGuard() external view returns (address guard) {
        assembly {
            guard := sload(GUARD_STORAGE_SLOT)
        }
    }

    /// @notice Sets the guard on this Safe, storing at the canonical keccak slot.
    /// @dev Mirrors real Safe behavior: guard is stored at an isolated keccak slot.
    /// @param guard The guard address.
    function setGuard(address guard) external {
        assembly {
            sstore(GUARD_STORAGE_SLOT, guard)
        }
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

    /// @notice Reads raw storage from the Safe (mirrors Safe's StorageAccessible.getStorageAt).
    /// @dev Returns `length` 32-byte words starting from slot `offset`.
    /// @param offset The storage slot to read from.
    /// @param length The number of 32-byte words to read.
    /// @return result Raw bytes of the storage contents.
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory result) {
        result = new bytes(length * 32);
        for (uint256 index = 0; index < length; index++) {
            assembly {
                let word := sload(add(offset, index))
                mstore(add(add(result, 0x20), mul(index, 0x20)), word)
            }
        }
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
        address guard;
        assembly {
            guard := sload(GUARD_STORAGE_SLOT)
        }
        if (guard != address(0)) {
            IGuard(guard)
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
        if (guard != address(0)) {
            IGuard(guard).checkAfterExecution(txHash, success);
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
