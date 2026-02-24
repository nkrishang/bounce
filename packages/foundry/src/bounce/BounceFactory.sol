// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibClone} from "solady/utils/LibClone.sol";
import {Bounce} from "./Bounce.sol";

/// @title BounceFactory
/// @notice Factory for atomic deployment of the Bounce singleton behind a UUPS proxy.
/// @dev Stores initialization params in the constructor. The deploy function deploys the
///      implementation, proxy, and initializes the proxy in a single transaction, preventing
///      front-running of the initialization call.
contract BounceFactory {
    /// @notice The owner address to initialize the Bounce proxy with.
    address public immutable owner;

    /// @notice The deployed Bounce proxy address (set after deploy).
    address public bounce;

    /// @notice Whether deploy has been called.
    bool public deployed;

    error AlreadyDeployed();

    event BounceDeployed(address indexed proxy, address indexed implementation, address indexed owner);

    /// @param owner_ The owner address for the Bounce contract.
    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Atomically deploys the Bounce implementation and UUPS proxy, then initializes.
    /// @dev Can only be called once. All three steps happen in a single transaction.
    /// @return proxy The address of the initialized Bounce proxy.
    function deploy() external returns (address proxy) {
        if (deployed) revert AlreadyDeployed();
        deployed = true;

        // Step 1: Deploy Bounce implementation.
        Bounce impl = new Bounce();

        // Step 2: Deploy ERC1967 proxy pointing to implementation.
        proxy = LibClone.deployERC1967(address(impl));

        // Step 3: Initialize proxy with stored owner.
        Bounce(proxy).initialize(owner);

        bounce = proxy;

        emit BounceDeployed(proxy, address(impl), owner);
    }
}
