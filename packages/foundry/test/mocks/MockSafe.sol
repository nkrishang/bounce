// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IGuard, Operation} from "../../src/thesis/interfaces/IGuard.sol";

/// @title MockSafe
/// @notice Mock Gnosis Safe for testing ThesisGuard
/// @dev Simulates Safe's transaction execution with guard checks
contract MockSafe {
    address[] private _owners;
    uint256 private _nonce;
    address private _guard;

    // Storage slot for guard (matches real Safe)
    bytes32 internal constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    event ExecutionSuccess(bytes32 txHash);
    event ExecutionFailure(bytes32 txHash);

    constructor(address owner) {
        _owners.push(owner);
    }

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    function nonce() external view returns (uint256) {
        return _nonce;
    }

    function getGuard() external view returns (address) {
        return _guard;
    }

    function setGuard(address guard) external {
        _guard = guard;
    }

    /// @notice Simulates Safe's execTransaction with guard checks
    /// @dev This is a simplified version for testing guard behavior
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation
    ) external returns (bool success) {
        bytes32 txHash = getTransactionHash(to, value, data, operation, _nonce);

        // Check guard before execution
        if (_guard != address(0)) {
            IGuard(_guard).checkTransaction(
                to,
                value,
                data,
                operation,
                0, // safeTxGas
                0, // baseGas
                0, // gasPrice
                address(0), // gasToken
                payable(address(0)), // refundReceiver
                "", // signatures
                msg.sender // msgSender
            );
        }

        // Execute the transaction
        if (operation == Operation.DelegateCall) {
            (success, ) = to.delegatecall(data);
        } else {
            (success, ) = to.call{value: value}(data);
        }

        // Increment nonce
        _nonce++;

        // Check guard after execution
        if (_guard != address(0)) {
            IGuard(_guard).checkAfterExecution(txHash, success);
        }

        if (success) {
            emit ExecutionSuccess(txHash);
        } else {
            emit ExecutionFailure(txHash);
        }
    }

    /// @notice Computes transaction hash (simplified)
    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        uint256 _txNonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(this),
                to,
                value,
                keccak256(data),
                operation,
                _txNonce
            )
        );
    }

    /// @notice Allow receiving ETH
    receive() external payable {}
}
