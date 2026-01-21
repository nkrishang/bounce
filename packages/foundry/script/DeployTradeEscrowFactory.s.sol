// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {TradeEscrowFactory} from "../src/TradeEscrowFactory.sol";

contract DeployTradeEscrowFactoryScript is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy TradeEscrowFactory with deployer as owner
        // This also deploys the TradeEscrow implementation internally
        TradeEscrowFactory factory = new TradeEscrowFactory(deployer);

        vm.stopBroadcast();

        console.log("TradeEscrowFactory deployed at:", address(factory));
        console.log("TradeEscrow implementation deployed at:", factory.tradeEscrowImplementation());
    }
}