// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "lib/solady/src/tokens/ERC20.sol";

contract TradeEscrow {
    ///// ERRORS /////

    error InvalidAddress();
    error InsufficientBalance();
    error InvalidExpirationTimestamp();

    ///// IMMUTABLES /////

    address public immutable factory;

    ///// STATE /////

    bool public buyPerformed;
    bool public sellPerformed;
    bool public withdrawFunderPerformed;
    bool public withdrawProposerPerformed;

    ///// INITIALIZATION /////

    constructor(address _factory) {
        factory = _factory;
    }

    ///// BUY /////

    ///// SELL /////

    ///// WITHDRAW /////
}
