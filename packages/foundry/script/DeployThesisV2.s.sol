// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ThesisManager} from "../src/thesis/ThesisManager.sol";
import {ThesisFactoryV2} from "../src/thesis/ThesisFactoryV2.sol";

/// @title DeployThesisV2
/// @notice Deploys ThesisManager and ThesisFactoryV2 for multi-bet support
contract DeployThesisV2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Thesis Protocol V2 Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ThesisManager with deployer as owner
        ThesisManager manager = new ThesisManager(deployer);
        console.log("ThesisManager deployed to:", address(manager));

        // Deploy ThesisFactoryV2 with manager reference
        ThesisFactoryV2 factory = new ThesisFactoryV2(address(manager));
        console.log("ThesisFactoryV2 deployed to:", address(factory));

        // Set factory in manager
        manager.setFactory(address(factory));
        console.log("Factory set in manager");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Results ===");
        console.log("ThesisManager:", address(manager));
        console.log("ThesisFactoryV2:", address(factory));
        console.log("Manager owner:", manager.owner());
        console.log("Manager factory:", manager.factory());
        console.log("Factory manager:", address(factory.manager()));
        console.log("USDC:", factory.USDC());
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Update ADDRESSES.THESIS_MANAGER in test-thesis-flow-v2.ts");
        console.log("2. Update ADDRESSES.THESIS_FACTORY_V2 in test-thesis-flow-v2.ts");
        console.log("3. Run: pnpm --filter @thesis/scripts test:thesis-flow-v2");
    }
}
