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
import {PositionStatus, PositionTranche, Position} from "src/bounce/interfaces/IPosition.sol";

struct Safe {
    /// @notice The address of the gnosis safe.
    address safeAddress;

    /// @notice Indicates whether safe has given one-time max USDC allowance to Polymarket via this contract.
    bool setup;

    /// @notice Indicates whether the safe has an active prepared bet.
    bool activeBet;
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

    /// @notice Emitted when a outcome token purchase is finalized.
    event FinalizedBuyOutcome(
        uint256 indexed positionId,
        bytes32 indexed conditionId,
        address indexed owner,
        uint256 usdcSpent,
        uint256 outcomeTokensPurchased
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

    /// @notice Thrown when setting up safe again.
    error SafeAlreadyPrepared();

    /// @notice Thrown when interacting with a safe not set up.
    error SafeNotPrepared();

    /// @notice Thrown when creating new position while the a bet is active for the position safe.
    error SafeBetActive();

    /// @notice Thrown when attempting to interact with a position in an incompatible status.
    error InvalidPositionStatus();

    /// @notice Thrown when attempting to interact with a position not owned.
    error InvalidPositionOwner();

    /// @notice Thrown when no USDC spend in outcome token purchase.
    error NoUsdcSpentInPurchase();

    /// @notice Thrown when no outcome tokens gained in purchase.
    error NoOutcomeTokensGainedInPurchase();

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

    /// @notice Mapping from safe => safe data.
    mapping(address safeAddress => Safe data) private safes_;

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
        // Check: safe not already setup.
        if (safes_[_safe].setup) revert SafeAlreadyPrepared();

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

        safes_[_safe].setup = true;

        emit SafeSetup(_safe, msg.sender);
    }

    // ============================================
    // Purchase outcome tokens for a market
    // ============================================

    function prepareBuyOutcomeJunior(
        address _safe,
        address _exchange,
        bytes32 _conditionId,
        uint8 _outcomeIndex,
        uint256 _outcomeTokenId,
        uint256 _usdcSpendAmount
    ) external nonReentrant returns (uint256 positionId) {
        return _prepareBuyOutcome(
            _safe, _exchange, _conditionId, _outcomeIndex, _outcomeTokenId, _usdcSpendAmount, PositionTranche.Junior
        );
    }

    function prepareBuyOutcomeSenior(
        address _safe,
        address _exchange,
        bytes32 _conditionId,
        uint8 _outcomeIndex,
        uint256 _outcomeTokenId,
        uint256 _usdcSpendAmount
    ) external nonReentrant returns (uint256 positionId) {
        return _prepareBuyOutcome(
            _safe, _exchange, _conditionId, _outcomeIndex, _outcomeTokenId, _usdcSpendAmount, PositionTranche.Senior
        );
    }

    /// @notice Prepares a purchase outcome tokens for a market.
    function _prepareBuyOutcome(
        address _safe,
        address _exchange,
        bytes32 _conditionId,
        uint8 _outcomeIndex,
        uint256 _outcomeTokenId,
        uint256 _usdcSpendAmount,
        PositionTranche _tranche
    ) internal returns (uint256 positionId) {
        // Check: safe not zero.
        if (_safe == address(0)) revert InvalidSafeAddress();
        // Check: safe is prepared.
        Safe storage safeData = safes_[_safe];
        if (!safeData.setup) revert SafeNotPrepared();
        // Check: no bet is active.
        if (safeData.activeBet) revert SafeBetActive();
        // Check: caller is owner of safe.
        address positionOwner = msg.sender;
        if (!IGnosisSafeMinimal(_safe).isOwner(positionOwner)) revert SafeNotOwner();
        // Check: safe has installed this contract as guard and module.
        _assertSafeReady(_safe);
        // Check: exchange is a polymarket exchange.
        if (_exchange != CTF_EXCHANGE && _exchange != NEG_RISK_CTF_EXCHANGE && _exchange != NEG_RISK_ADAPTER) {
            revert InvalidExchangeAddress();
        }
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
            prePurchaseUsdcAllowance: IERC20(USDC).allowance(_safe, _exchange),
            prePurchaseConditionTokenBalance: IConditionalTokensMinimal(CTF).balanceOf(_safe, _outcomeTokenId),
            actualConditionTokensPurchased: 0,
            reservedUsdcSpendAmount: _usdcSpendAmount,
            actualUsdcSpendAmount: 0,
            shares: 0,
            usdcReceived: 0,
            status: PositionStatus.Prepared,
            tranche: _tranche
        });
        positionId = nextPositionId_++;
        positions_[positionId] = pos;

        // Pull USDC from position owner into position safe.
        SafeTransferLib.safeTransferFrom({
            token: USDC, from: pos.owner, to: pos.safe, amount: pos.reservedUsdcSpendAmount
        });

        emit PreparedBuyOutcome(positionId, pos.conditionId, pos.owner, pos);
    }

    function finalizeBuyOutcome(uint256 _positionId) external nonReentrant {
        Position storage pos = positions_[_positionId];
        
        // Check: safe has installed this contract as guard and module.
        address safe = pos.safe;
        _assertSafeReady(safe);

        // Check: position is in prepared status only.
        if (pos.status != PositionStatus.Prepared) revert InvalidPositionStatus();

        // Check: non-zero USDC spent in purchasing tokens.
        uint256 usdcSpent = pos.prePurchaseUsdcAllowance - IERC20(USDC).allowance(safe, pos.exchange);
        if (usdcSpent == 0) revert NoUsdcSpentInPurchase();

        // Check: non-zero outcome tokens gained in purchase.
        uint256 outcomeTokensPurchased =
            IConditionalTokensMinimal(CTF).balanceOf(safe, pos.outcomeTokenId) - pos.prePurchaseConditionTokenBalance;
        if (outcomeTokensPurchased == 0) revert NoOutcomeTokensGainedInPurchase();

        // Pull outcome tokens purchased from safe to bounce vault.
        IConditionalTokensMinimal(CTF)
            .safeTransferFrom({
                from: safe, to: pos.vault, id: pos.outcomeTokenId, value: outcomeTokensPurchased, data: bytes("")
            });

        // Mint shares to position owner.
        uint256 shares = BounceVault(pos.vault)
            .mint({
                to: pos.owner, usdcAmount: usdcSpent, outcomeTokensAmount: outcomeTokensPurchased, tranche: pos.tranche
            });

        // Update position data.
        pos.actualUsdcSpendAmount = usdcSpent;
        pos.actualConditionTokensPurchased = outcomeTokensPurchased;
        pos.shares = shares;
        pos.status = PositionStatus.Purchased;

        // Refund leftover USDC back to position owner
        if (pos.reservedUsdcSpendAmount > usdcSpent) {
            uint256 usdcLeftover = pos.reservedUsdcSpendAmount - usdcSpent;
            uint256 usdcNow = IERC20(USDC).balanceOf(safe);
            uint256 toReturn = usdcLeftover > usdcNow ? usdcNow : usdcLeftover;
            if (toReturn > 0) {
                _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), toReturn));
            }
        }

        // Update safe data.
        safes_[safe].activeBet = false;

        emit FinalizedBuyOutcome(_positionId, pos.conditionId, pos.owner, usdcSpent, outcomeTokensPurchased);
    }

    // ============================================
    // Sell outcome tokens back for USDC
    // ============================================

    function prepareExitOutcome(uint256 _positionId) external nonReentrant returns (uint256 conditionTokenBalance) {
        Position storage pos = positions_[_positionId];
        
        // Check: safe has installed this contract as guard and module.
        address safe = pos.safe;
        _assertSafeReady(safe);

        // Check: caller is owner of safe.
        address positionOwner = msg.sender;
        if (!IGnosisSafeMinimal(safe).isOwner(positionOwner)) revert SafeNotOwner();

        // Check: position is in prepared status only.
        if (pos.status != PositionStatus.Purchased) revert InvalidPositionStatus();

        // Check: no bet is active.
        if (safes_[safe].activeBet) revert SafeBetActive();

        // Update safe data.
        safes_[safe].activeBet = true;

        // Update position data.
        pos.status = PositionStatus.PreparedExit;

        // Withdraw conditional tokens from vault.
        conditionTokenBalance = BounceVault(pos.vault).redeem({
            owner: positionOwner,
            shares: pos.shares,
            tranche: pos.tranche
        });

        // Transfer condition tokens to safe.
        IConditionalTokensMinimal(CTF)
            .safeTransferFrom({
                from: address(this), to: safe, id: pos.outcomeTokenId, value: conditionTokenBalance, data: bytes("")
            });

        emit PreparedExitOutcome();
    }

    function finalizeExitOutcome(uint256 _positionId) external nonReentrant {
        Position storage pos = positions_[_positionId];
        
        // Check: safe has installed this contract as guard and module.
        address safe = pos.safe;
        _assertSafeReady(safe);

        // Check: position is in prepared status only.
        if (pos.status != PositionStatus.PreparedExit) revert InvalidPositionStatus();

        // Check current share balance in the Safe.
        uint256 sharesNow = IConditionalTokensMinimal(CTF).balanceOf(safe, pos.outcomeTokenId);
        uint256 sharesSold = sharesNow < pos.shares ? pos.shares - sharesNow : 0;

        // Pull all USDC proceeds from Safe.
        uint256 usdcNow = IERC20(USDC).balanceOf(safe);
        if (usdcNow > 10_000) {
            _execFromSafe(safe, USDC, abi.encodeWithSelector(IERC20.transfer.selector, address(this), usdcNow));
        }

        // Update position data.
        pos.shares -= sharesSold;
        pos.usdcReceived += usdcNow;

        // If all shares sold (or only dust remains), transition to Closed.
        // Dust threshold: 10_000 raw units = 0.01 shares (USDC has 6 decimals).
        if (sharesNow <= 10_000) {
            pos.shares = 0;
            pos.status = PositionStatus.Closed;
            emit PositionClosed();
        }
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
