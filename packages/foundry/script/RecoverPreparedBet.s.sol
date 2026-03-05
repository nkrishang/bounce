// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Bounce} from "../src/bounce/Bounce.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title RecoverPreparedBet
/// @notice Calls unprepareTrade to move USDC from Safe back to Bounce escrow.
/// @dev Must be run BEFORE the UUPS upgrade — the old contract checks allowance on
///      bet.exchange (NEG_RISK_CTF_EXCHANGE) which is still intact since CLOB never settled.
///      After this script, proposer or funder must call cancelBet(betId) separately.
contract RecoverPreparedBet is Script {
    function run() external {
        address proxy = address(0x2170cD8cC9F6740cD36F825c1D9Ea4E7f21fe3e8);
        uint256 betId = vm.envUint("BET_ID");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        Bounce bounce = Bounce(proxy);

        // Pre-checks.
        Bounce.Bet memory bet = bounce.getBet(betId);
        console.log("=== Recover Prepared Bet ===");
        console.log("Bet ID:", betId);
        console.log("Status (3=Prepared):", uint8(bet.status));
        console.log("Safe:", bet.safe);
        console.log("Proposer:", bet.proposer);
        console.log("Funder:", bet.funder);
        console.log("InFlightUSDC:", bet.inFlightUSDC);
        console.log("EscrowUSDC:", bet.escrowUSDC);
        console.log("Deployer:", deployer);

        require(uint8(bet.status) == 3, "Bet not in Prepared status");

        vm.startBroadcast(deployerPrivateKey);

        // unprepareTrade is permissionless — moves USDC from Safe back to Bounce escrow.
        console.log("");
        console.log("Calling unprepareTrade...");
        bounce.unprepareTrade(betId);

        vm.stopBroadcast();

        // Verify status is now Funded.
        Bounce.Bet memory betAfter = bounce.getBet(betId);
        require(uint8(betAfter.status) == 2, "unprepareTrade did not set Funded");
        console.log("unprepareTrade succeeded. Status now Funded.");
        console.log("EscrowUSDC after unprepare:", betAfter.escrowUSDC);

        console.log("");
        console.log("=== Next Step ===");
        console.log("Proposer or funder must call cancelBet(", betId, ") to withdraw USDC.");
    }
}
