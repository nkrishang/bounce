// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

struct TradeData {
    address proposer;
    uint96 expirationTimestamp;
    address sellToken;
    address buyToken;
    uint256 sellAmount;
    string metadataUri;
}
