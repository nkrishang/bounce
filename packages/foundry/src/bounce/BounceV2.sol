// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CREATE3} from "lib/solady/src/utils/CREATE3.sol";
import {ReentrancyGuard} from "lib/solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "lib/solady/src/utils/SafeTransferLib.sol";
import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

import {BounceVault} from "src/bounce/BounceVault.sol";
import {VaultParams} from "src/bounce/interfaces/IVaultParams.sol";
import {IGnosisSafeMinimal} from "src/bounce/interfaces/IGnosisSafeMinimal.sol";
import {IConditionalTokensMinimal} from "src/bounce/interfaces/IConditionalTokensMinimal.sol";

enum PositionStatus {
    Prepared,
    Purchased,
    Sold
}

struct Position {
    /// @notice The owner of the Polymarket gnosis safe of the position.
    address owner;

    /// @notice The Polymarket gnosis safe owner of the position.
    address safe;

    /// @notice Unique ID for the Polymarket bet market.
    bytes32 conditionId;

    /// @notice Outcome of the bet. (e.g. 0 = Yes, 1 = No, etc.)
    uint8 outcomeIndex;

    /// @notice ERC-1155 token ID of the outcome position.
    uint256 outcomeTokenId;

    /// @notice The Polymarket exchange contract for the bet.
    address exchange;

    /// @notice The bounce vault for the Polymarket market outcome.
    address vault;

    /// @notice The USDC reserved for purchasing position.
    uint256 reservedUsdcSpendAmount;

    /// @notice The USDC actually spent in purchasing position.
    uint256 actualUsdcSpendAmount;

    /// @notice The status of the position in relation to outcome token purchase.
    PositionStatus status;
}

contract BounceV2 is ReentrancyGuard {
    // ============================================
    // Events
    // ============================================

    /// @notice Emitted when a vault is created for a Polymarket market outcome.
    event NewVault(address indexed vault, VaultParams params);

    /// @notice Emitted when a safe's polymarket approvals are set up.
    event SafeSetup(address indexed safe, address indexed owner);

    /// @notice Emitted when a outcome token purchase is prepared.
    event PreparedBuyOutcome(
        uint256 indexed positionId, bytes32 indexed conditionId, address indexed owner, Position position
    );

    // ============================================
    // Errors
    // ============================================

    /// @notice Thrown when attempting to interact with a vault that is not deployed.
    error VaultDoesNotExist();

    /// @notice Thrown when attempting to interact with a null address as a gnosis safe.
    error InvalidSafeAddress();

    /// @notice Thrown when attempting to purchase tokens with zero USDC spend.
    error InvalidSpendAmount();

    /// @notice Thrown when attempting to interact with invalid Polymarket exchange.
    error InvalidExchangeAddress();

    /// @notice Thrown when attempting to interact with a safe not owned.
    error SafeNotOwner();

    /// @notice Thrown when attempting to interact with a safe which has not set this contract as a module.
    error SafeModuleNotEnabled();

    /// @notice Thrown when attempting to interact with a safe which has not set this contract as a guard.
    error SafeGuardNotInstalled();

    /// @notice Thrown when interaction with a safe from this contract fails.
    error SafeExecFromModuleFailed();

    // ============================================
    // Constants (Polygon)
    // ============================================

    /// @notice Polygon USDC address.
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    /// @notice Polymarket Conditional Tokens Framework address.
    address public constant CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045;

    /// @notice Polymarket CTF Exchange address.
    address public constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;

    /// @notice Polymarket Neg Risk CTF Exchange address.
    address public constant NEG_RISK_CTF_EXCHANGE = 0xC5d563A36AE78145C45a50134d48A1215220f80a;

    /// @notice Polymarket Neg Risk Adapter address.
    address public constant NEG_RISK_ADAPTER = 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296;

    /// @notice Basis points denominator (100% = 10,000 BPS).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Guard interface ID that Safe 1.3.0 checks for.
    bytes4 private constant GUARD_INTERFACE_ID = 0xe6d7a83a;

    /// @notice Safe 1.3.0 guard storage slot: keccak256("guard_manager.guard.address").
    uint256 private constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    // ============================================
    // Storage
    // ============================================

    /// @notice Increment-only counter for assigning position IDs.
    uint256 private nextPositionId_;

    /// @notice Mapping from unique position ID => position data.
    mapping(uint256 positionId => Position position) private positions_;

    // ============================================
    // Create vault for outcome in market.
    // ============================================

    /// @notice Creates vault for outcome in market at a deterministic address.
    function createVault(VaultParams memory _params) external returns (address vault) {
        bytes32 salt = keccak256(
            abi.encodePacked(_params.conditionId, _params.outcomeIndex, _params.outcomeTokenId, _params.exchange)
        );
        bytes memory initCode = abi.encodePacked(type(BounceVault).creationCode, abi.encode(_params));
        vault = CREATE3.deployDeterministic(initCode, salt);

        emit NewVault(vault, _params);
    }

    // ============================================
    // Setup gnosis safe for bounce actions
    // ============================================

    /// @notice A one-time function to approve Polymarket to spend a safe's USDC and conditional tokens.
    function setupSafe(address _safe) external nonReentrant {
        // Check: safe not zero.
        if (_safe == address(0)) revert InvalidSafeAddress();
        // Check: caller is owner of safe.
        if (!IGnosisSafeMinimal(_safe).isOwner(msg.sender)) revert SafeNotOwner();
        // Check: safe has installed this contract as guard and module.
        _assertSafeReady(_safe);

        // Approve USDC for all Polymarket exchanges.
        _execFromSafe({
            safe: _safe,
            to: USDC,
            data: abi.encodeWithSelector(IERC20.approve.selector, CTF_EXCHANGE, type(uint256).max)
        });
        _execFromSafe({
            safe: _safe,
            to: USDC,
            data: abi.encodeWithSelector(IERC20.approve.selector, NEG_RISK_CTF_EXCHANGE, type(uint256).max)
        });
        _execFromSafe({
            safe: _safe,
            to: USDC,
            data: abi.encodeWithSelector(IERC20.approve.selector, NEG_RISK_ADAPTER, type(uint256).max)
        });

        // Approve conditional token for all Polymarket exchanges.
        _execFromSafe({
            safe: _safe,
            to: CTF,
            data: abi.encodeWithSelector(IConditionalTokensMinimal.setApprovalForAll.selector, CTF_EXCHANGE, true)
        });
        _execFromSafe({
            safe: _safe,
            to: CTF,
            data: abi.encodeWithSelector(
                IConditionalTokensMinimal.setApprovalForAll.selector, NEG_RISK_CTF_EXCHANGE, true
            )
        });
        _execFromSafe({
            safe: _safe,
            to: CTF,
            data: abi.encodeWithSelector(IConditionalTokensMinimal.setApprovalForAll.selector, NEG_RISK_ADAPTER, true)
        });

        emit SafeSetup(_safe, msg.sender);
    }

    // ============================================
    // Purchase outcome tokens for a market
    // ============================================

    /// @notice Prepares a purchase outcome tokens for a market.
    function prepareBuyOutcome(
        address _safe,
        address _exchange,
        bytes32 _conditionId,
        uint8 _outcomeIndex,
        uint256 _outcomeTokenId,
        uint256 _usdcSpendAmount
    ) external nonReentrant returns (uint256 positionId) {
        // Check: safe not zero.
        if (_safe == address(0)) revert InvalidSafeAddress();
        // Check: usdc spend amount not zero.
        if (_usdcSpendAmount == 0) revert InvalidSpendAmount();
        // Check: exchange is a polymarket exchange.
        if (_exchange != CTF_EXCHANGE && _exchange != NEG_RISK_CTF_EXCHANGE && _exchange != NEG_RISK_ADAPTER) {
            revert InvalidExchangeAddress();
        }
        // Check: caller is owner of safe.
        address positionOwner = msg.sender;
        if (!IGnosisSafeMinimal(_safe).isOwner(positionOwner)) revert SafeNotOwner();
        // Check: safe has installed this contract as guard and module.
        _assertSafeReady(_safe);
        // Check: vault for the market outcome is deployed.
        address vault = _getVaultAddress({
            conditionId: _conditionId, outcomeIndex: _outcomeIndex, outcomeTokenId: _outcomeTokenId, exchange: _exchange
        });
        if (vault.code.length == 0) revert VaultDoesNotExist();

        // Store new position.
        Position memory pos = Position({
            owner: positionOwner,
            safe: _safe,
            conditionId: _conditionId,
            outcomeIndex: _outcomeIndex,
            outcomeTokenId: _outcomeTokenId,
            exchange: _exchange,
            vault: vault,
            reservedUsdcSpendAmount: _usdcSpendAmount,
            actualUsdcSpendAmount: 0,
            status: PositionStatus.Prepared
        });
        positionId = nextPositionId_++;
        positions_[positionId] = pos;

        // Pull USDC from position owner into position safe.
        SafeTransferLib.safeTransferFrom({
            token: USDC, from: pos.owner, to: pos.safe, amount: pos.reservedUsdcSpendAmount
        });

        emit PreparedBuyOutcome(positionId, pos.conditionId, pos.owner, pos);
    }

    // ============================================
    // Internal functions
    // ============================================

    function _execFromSafe(address safe, address to, bytes memory data) internal {
        bool ok = IGnosisSafeMinimal(safe).execTransactionFromModule(to, 0, data, 0);
        if (!ok) revert SafeExecFromModuleFailed();
    }

    function _assertSafeReady(address safe) internal view {
        if (!IGnosisSafeMinimal(safe).isModuleEnabled(address(this))) revert SafeModuleNotEnabled();
        bytes memory guardData = IGnosisSafeMinimal(safe).getStorageAt(GUARD_STORAGE_SLOT, 1);
        address guard = abi.decode(guardData, (address));
        if (guard != address(this)) revert SafeGuardNotInstalled();
    }

    function _getVaultAddress(bytes32 conditionId, uint8 outcomeIndex, uint256 outcomeTokenId, address exchange)
        internal
        view
        returns (address)
    {
        return CREATE3.predictDeterministicAddress(
            keccak256(abi.encodePacked(conditionId, outcomeIndex, outcomeTokenId, exchange))
        );
    }
}
