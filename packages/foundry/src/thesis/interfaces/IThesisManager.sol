// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IThesisManager {
    function isActiveSettlement(address safe, address settlement) external view returns (bool);
    function settlementApprovalCap(address safe, address settlement) external view returns (uint256);
    function exchangeApprovalCap(address safe) external view returns (uint256);
    function isApprovedGuard(address safe, address guard) external view returns (bool);
    function registerSettlement(address safe, address settlement, uint256 cap) external;
    function deactivateSettlement(address safe, address settlement) external;
}
