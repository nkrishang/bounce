// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CREATE3} from "lib/solady/src/utils/CREATE3.sol";
import {BounceVault} from "src/bounce/BounceVault.sol";
import {VaultParams} from "src/bounce/interfaces/IVaultParams.sol";

contract BounceV2 {

    // ============================================
    // Events
    // ============================================

    event NewVault(address indexed vault, VaultParams params);

    // ============================================
    // Create vault for outcome in market.
    // ============================================

    function createVault(
        VaultParams memory _params
    ) external returns (address vault) {
        bytes32 salt = keccak256(abi.encodePacked(
            _params.conditionId, 
            _params.outcomeIndex, 
            _params.outcomeTokenId, 
            _params.exchange
        ));
        bytes memory initCode = abi.encodePacked(
            type(BounceVault).creationCode,
            abi.encode(_params)
        );
        vault = CREATE3.deployDeterministic(initCode, salt);

        emit NewVault(vault, _params);
    }
}