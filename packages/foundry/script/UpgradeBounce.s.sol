// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Bounce} from "../src/bounce/Bounce.sol";

/// @title UpgradeBounce
/// @notice Upgrades an existing Bounce UUPS proxy to a newly deployed implementation.
contract UpgradeBounce is Script {

    function run() external {
        address proxy = address(0x2170cD8cC9F6740cD36F825c1D9Ea4E7f21fe3e8);
        require(proxy != address(0), "Proxy is zero");

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Bounce Upgrade ===");
        console.log("Deployer:", deployer);
        console.log("Proxy (Bounce):", proxy);
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);

        // Pre-checks (read-only).
        Bounce bounceBefore = Bounce(proxy);
        console.log("Current owner:", bounceBefore.owner());
        console.log("Current nextBetId:", bounceBefore.nextBetId());
        console.log("Current version:", bounceBefore.version());

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation.
        Bounce newImpl = new Bounce();
        console.log("New implementation deployed:", address(newImpl));

        // Step 2: Upgrade proxy to new implementation (no initializer call needed).
        Bounce(proxy).upgradeToAndCall(address(newImpl), new bytes(0));
        console.log("Proxy upgraded via upgradeToAndCall");

        vm.stopBroadcast();

        // Post-checks.
        Bounce bounceAfter = Bounce(proxy);
        console.log("Post-upgrade owner:", bounceAfter.owner());
        console.log("Post-upgrade nextBetId:", bounceAfter.nextBetId());
        console.log("Post-upgrade version:", bounceAfter.version());

        require(bounceAfter.owner() == deployer, "Owner mismatch");
        require(bounceAfter.nextBetId() >= 1, "nextBetId invalid");
    }
}
