// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Bounce} from "../src/bounce/Bounce.sol";
import {BounceFactory} from "../src/bounce/BounceFactory.sol";
import {BouncePeriphery} from "../src/bounce/BouncePeriphery.sol";

/// @title DeployBounce
/// @notice Deploys the Bounce singleton contract via BounceFactory for atomic initialization.
contract DeployBounce is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Bounce Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy factory with deployer as the intended owner.
        BounceFactory factory = new BounceFactory(deployer);
        console.log("Factory deployed:", address(factory));

        // Step 2: Atomically deploy implementation + proxy + initialize.
        address proxy = factory.deploy();
        console.log("Bounce deployed atomically via factory");

        // Step 3: Deploy periphery contract pointing to the proxy.
        BouncePeriphery periphery = new BouncePeriphery(proxy);
        console.log("BouncePeriphery deployed:", address(periphery));

        vm.stopBroadcast();

        // Step 4: Sanity checks.
        Bounce bounce = Bounce(proxy);
        require(bounce.owner() == deployer, "Owner mismatch");
        require(bounce.nextBetId() == 1, "nextBetId mismatch");

        console.log("");
        console.log("=== Deployment Results ===");
        console.log("Factory:", address(factory));
        console.log("Proxy (Bounce):", proxy);
        console.log("Periphery:", address(periphery));
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
