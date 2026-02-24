// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGnosisSafeMinimal
/// @notice Minimal interface for Gnosis Safe module and ownership operations.
/// @dev Used by Bounce to execute transactions via the module path and verify Safe configuration.
interface IGnosisSafeMinimal {
    /// @notice Executes a transaction from an enabled module.
    /// @dev Module execution bypasses the Guard — no checkTransaction is called.
    /// @param to Destination address of the transaction.
    /// @param value Native token value of the transaction.
    /// @param data Data payload of the transaction.
    /// @param operation Operation type: 0 = Call, 1 = DelegateCall.
    /// @return success Whether the transaction succeeded.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success);

    /// @notice Checks whether a module is enabled for the Safe.
    /// @param module The module address to check.
    /// @return Whether the module is enabled.
    function isModuleEnabled(address module) external view returns (bool);

    /// @notice Checks whether an address is an owner of the Safe.
    /// @param owner The address to check.
    /// @return Whether the address is an owner.
    function isOwner(address owner) external view returns (bool);

    /// @notice Reads raw storage from the Safe (inherited from StorageAccessible).
    /// @dev Used to read the guard address from the isolated keccak storage slot.
    /// @param offset The storage slot offset to read from.
    /// @param length The number of 32-byte words to read.
    /// @return Raw bytes of the storage contents.
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
}
