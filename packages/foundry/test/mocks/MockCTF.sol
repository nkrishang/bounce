// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract MockCTF {
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    mapping(bytes32 => uint256) public payoutDenominator;

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function setBalance(address account, uint256 tokenId, uint256 amount) external {
        balanceOf[account][tokenId] = amount;
    }

    function setPayoutDenominator(bytes32 conditionId, uint256 denominator) external {
        payoutDenominator[conditionId] = denominator;
    }

    function redeemPositions(
        address,
        bytes32,
        bytes32,
        uint256[] calldata
    ) external {}

    function mergePositions(
        address,
        bytes32,
        bytes32,
        uint256[] calldata,
        uint256
    ) external {}

    function safeTransferFrom(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external {}
}
