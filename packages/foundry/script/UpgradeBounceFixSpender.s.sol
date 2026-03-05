// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Bounce} from "../src/bounce/Bounce.sol";

/// @title UpgradeBounceFixSpender
/// @notice Upgrades Bounce to fix the _usdcSpender bug and atomically corrects
///         the corrupted bet's usdcSpent via upgradeToAndCall.
contract UpgradeBounceFixSpender is Script {
    function run() external {
        address proxy = address(0xdC015EEbF0f2DAbB1EdF856902879A626e82B62d);
        uint256 betId = uint256(1);
        uint256 newUsdcSpent = uint256(49999999);
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Bounce Upgrade + correctUsdcSpent ===");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxy);
        console.log("Bet ID:", betId);
        console.log("newUsdcSpent:", newUsdcSpent);
        console.log("Chain ID:", block.chainid);

        // Pre-checks.
        Bounce bounce = Bounce(proxy);
        console.log("Current owner:", bounce.owner());
        console.log("Current version:", bounce.version());

        Bounce.Bet memory betBefore = bounce.getBet(betId);
        console.log("Bet status:", uint256(betBefore.status));
        console.log("Bet usdcSpent (before):", betBefore.usdcSpent);
        console.log("Bet escrowUSDC:", betBefore.escrowUSDC);
        console.log("Bet totalCapital:", betBefore.totalCapital);
        console.log("Bet positionShares:", betBefore.positionShares);

        require(bounce.owner() == deployer, "Deployer is not owner");
        require(betBefore.usdcSpent == 0, "usdcSpent already non-zero");
        require(betBefore.escrowUSDC + newUsdcSpent == betBefore.totalCapital, "Accounting invariant violated");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation.
        Bounce newImpl = new Bounce();
        console.log("New implementation:", address(newImpl));

        // Step 2: Upgrade + atomically correct the corrupted bet.
        bytes memory correctionCall = abi.encodeCall(Bounce.correctUsdcSpent, (betId, newUsdcSpent));
        Bounce(proxy).upgradeToAndCall(address(newImpl), correctionCall);
        console.log("upgradeToAndCall completed");

        vm.stopBroadcast();

        // Post-checks.
        Bounce bounceAfter = Bounce(proxy);
        Bounce.Bet memory betAfter = bounceAfter.getBet(betId);

        console.log("Post-upgrade version:", bounceAfter.version());
        console.log("Bet usdcSpent (after):", betAfter.usdcSpent);

        require(betAfter.usdcSpent == newUsdcSpent, "Correction failed");
        require(bounceAfter.owner() == deployer, "Owner changed");
        require(bounceAfter.nextBetId() >= 1, "nextBetId invalid");

        console.log("=== Upgrade + correction successful ===");
    }
}
