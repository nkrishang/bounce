// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Bounce} from "./Bounce.sol";

/// @title BouncePeriphery
/// @notice Read-only periphery contract providing filtered query views over Bounce bets.
/// @dev Standalone contract (not upgradeable). Queries Bounce via getBet() and nextBetId().
///      All functions are view-only and intended for off-chain consumption via eth_call.
contract BouncePeriphery {
    /// @notice The Bounce proxy contract to query.
    Bounce public immutable bounce;

    error InvalidRange(uint256 start, uint256 end);

    /// @param bounce_ The Bounce proxy address.
    constructor(address bounce_) {
        bounce = Bounce(bounce_);
    }

    // ============================================
    // By Proposer
    // ============================================

    /// @notice Returns the number of bets created by a proposer.
    function getBetsByProposerCount(address proposer) external view returns (uint256 count) {
        uint256 total = bounce.nextBetId();
        for (uint256 i = 1; i < total; i++) {
            if (bounce.getBet(i).proposer == proposer) count++;
        }
    }

    /// @notice Returns a paginated slice [start, end) of bet IDs created by a proposer.
    function getBetsByProposer(address proposer, uint256 start, uint256 end) external view returns (uint256[] memory) {
        return _filterBy(_Field.Proposer, bytes32(uint256(uint160(proposer))), start, end);
    }

    // ============================================
    // By Funder
    // ============================================

    /// @notice Returns the number of bets funded by a funder.
    function getBetsByFunderCount(address funder) external view returns (uint256 count) {
        uint256 total = bounce.nextBetId();
        for (uint256 i = 1; i < total; i++) {
            if (bounce.getBet(i).funder == funder) count++;
        }
    }

    /// @notice Returns a paginated slice [start, end) of bet IDs funded by a funder.
    function getBetsByFunder(address funder, uint256 start, uint256 end) external view returns (uint256[] memory) {
        return _filterBy(_Field.Funder, bytes32(uint256(uint160(funder))), start, end);
    }

    // ============================================
    // By Safe
    // ============================================

    /// @notice Returns the number of bets associated with a Safe.
    function getBetsBySafeCount(address safe) external view returns (uint256 count) {
        uint256 total = bounce.nextBetId();
        for (uint256 i = 1; i < total; i++) {
            if (bounce.getBet(i).safe == safe) count++;
        }
    }

    /// @notice Returns a paginated slice [start, end) of bet IDs associated with a Safe.
    function getBetsBySafe(address safe, uint256 start, uint256 end) external view returns (uint256[] memory) {
        return _filterBy(_Field.Safe, bytes32(uint256(uint160(safe))), start, end);
    }

    // ============================================
    // By ConditionId
    // ============================================

    /// @notice Returns the number of bets for a given conditionId.
    function getBetsByConditionIdCount(bytes32 conditionId) external view returns (uint256 count) {
        uint256 total = bounce.nextBetId();
        for (uint256 i = 1; i < total; i++) {
            if (bounce.getBet(i).conditionId == conditionId) count++;
        }
    }

    /// @notice Returns a paginated slice [start, end) of bet IDs for a given conditionId.
    function getBetsByConditionId(bytes32 conditionId, uint256 start, uint256 end)
        external
        view
        returns (uint256[] memory)
    {
        return _filterBy(_Field.ConditionId, conditionId, start, end);
    }

    // ============================================
    // Internal
    // ============================================

    enum _Field {
        Proposer,
        Funder,
        Safe,
        ConditionId
    }

    /// @dev Single-pass filtered pagination. Skips `start` matches, collects until `end`.
    function _filterBy(_Field field, bytes32 value, uint256 start, uint256 end)
        internal
        view
        returns (uint256[] memory betIds)
    {
        if (start > end) revert InvalidRange(start, end);

        betIds = new uint256[](end - start);
        uint256 total = bounce.nextBetId();
        uint256 matchIndex;
        uint256 resultIndex;

        for (uint256 i = 1; i < total; i++) {
            if (_matches(bounce.getBet(i), field, value)) {
                if (matchIndex >= start) {
                    betIds[resultIndex++] = i;
                    if (resultIndex == betIds.length) return betIds;
                }
                matchIndex++;
            }
        }

        // If we didn't fill the array, end exceeded the match count.
        if (resultIndex < betIds.length) revert InvalidRange(start, end);
    }

    function _matches(Bounce.Bet memory bet, _Field field, bytes32 value) internal pure returns (bool) {
        if (field == _Field.Proposer) return bet.proposer == address(uint160(uint256(value)));
        if (field == _Field.Funder) return bet.funder == address(uint160(uint256(value)));
        if (field == _Field.Safe) return bet.safe == address(uint160(uint256(value)));
        return bet.conditionId == value;
    }
}
