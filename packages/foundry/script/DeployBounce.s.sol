// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {Bounce} from "../src/bounce/Bounce.sol";

/// @title DeployBounce
/// @notice Deploys the Bounce singleton contract behind an ERC1967 UUPS proxy.
contract DeployBounce is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Bounce Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy Bounce implementation contract.
        Bounce impl = new Bounce();
        console.log("Implementation deployed:", address(impl));

        // Step 2: Deploy ERC1967 proxy pointing to implementation.
        address proxy = LibClone.deployERC1967(address(impl));
        console.log("Proxy deployed:", proxy);

        // Step 3: Initialize the proxy with deployer as owner.
        Bounce bounce = Bounce(proxy);
        bounce.initialize(deployer);
        console.log("Proxy initialized");

        vm.stopBroadcast();

        // Step 4: Sanity checks.
        require(bounce.owner() == deployer, "Owner mismatch");
        require(bounce.nextBetId() == 1, "nextBetId mismatch");

        console.log("");
        console.log("=== Deployment Results ===");
        console.log("Implementation:", address(impl));
        console.log("Proxy (Bounce):", proxy);
        console.log("Owner:", bounce.owner());
        console.log("Next Bet ID:", bounce.nextBetId());
        console.log("Version:", bounce.version());
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Users deploy Gnosis Safe via Polymarket Safe Factory");
        console.log("2. Users run MultiSend: enableModule(bounce) + setGuard(bounce)");
        console.log("3. All interactions go through the Bounce contract at:", proxy);
    }
}
