// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "src/TradeData.sol";
import "src/TradeEscrow.sol";
import "lib/solady/src/utils/LibClone.sol";
import "lib/solady/src/auth/Ownable.sol";
import "lib/solady/src/tokens/ERC20.sol";
import "lib/solady/src/utils/EnumerableSetLib.sol";

contract TradeEscrowFactory is Ownable {
    using EnumerableSetLib for EnumerableSetLib.AddressSet;

    ///// ERRORS /////

    error InvalidAmount();
    error InvalidAddress();
    error InvalidExpirationTimestamp();

    ///// EVENTS /////

    event TradeEscrowCreated(
        address indexed tradeEscrow,
        address indexed proposer,
        uint96 expirationTimestamp,
        address sellToken,
        address indexed buyToken,
        uint256 sellAmount,
        string metadataUri
    );

    ///// IMMUTABLES /////

    address public immutable tradeEscrowImplementation;

    ///// STATE /////

    EnumerableSetLib.AddressSet private escrows;
    mapping(address escrow => TradeData data) private tradeData;

    ///// INITIALIZATION /////

    constructor(address _owner) {
        // Set ownership.
        _initializeOwner(_owner);

        // Deploy trade escrow implementation.
        tradeEscrowImplementation = address(new TradeEscrow(address(this)));
    }

    ///// CREATE TRADE ESCROW /////

    function createTradeEscrow(
        uint96 _expirationTimestamp,
        address _sellToken,
        address _buyToken,
        uint256 _sellAmount,
        string memory _metadataUri
    ) public returns (address tradeEscrow) {
        // Check: sellToken is not zero address.
        if (_sellToken == address(0)) {
            revert InvalidAddress();
        }

        // Check: buyToken is not zero address.
        if (_buyToken == address(0)) {
            revert InvalidAddress();
        }

        // Check: sellAmount is not zero and escrowed balance of sellToken is equal to sellAmount.
        if (_sellAmount == 0) {
            revert InvalidAmount();
        }

        // Check: expirationTimestamp is in the future.
        if (_expirationTimestamp <= block.timestamp) {
            revert InvalidExpirationTimestamp();
        }

        // Get proposer.
        address proposer = msg.sender;

        // Generate unique salt for trade escrow, which yields a deterministic address.
        bytes32 salt = _generateSalt(proposer, _expirationTimestamp, _sellToken, _buyToken, _sellAmount);

        // Deploy trade escrow contract at deterministic address.
        tradeEscrow = LibClone.cloneDeterministic(tradeEscrowImplementation, salt);

        // Pull tokens from proposer and transfer to trade escrow contract.
        ERC20(_sellToken).transferFrom(proposer, tradeEscrow, _sellAmount);

        // Store trade data.
        tradeData[tradeEscrow] =
            TradeData(proposer, _expirationTimestamp, _sellToken, _buyToken, _sellAmount, _metadataUri);
        escrows.add(tradeEscrow);

        emit TradeEscrowCreated(
            tradeEscrow, proposer, _expirationTimestamp, _sellToken, _buyToken, _sellAmount, _metadataUri
        );
    }

    ///// PREDICT TRADE ESCROW ADDRESS /////

    function predictTradeEscrowAddress(
        address _proposer,
        uint96 _expirationTimestamp,
        address _sellToken,
        address _buyToken,
        uint256 _sellAmount
    ) public view returns (address) {
        bytes32 salt = _generateSalt(_proposer, _expirationTimestamp, _sellToken, _buyToken, _sellAmount);
        return LibClone.predictDeterministicAddress(tradeEscrowImplementation, salt, address(this));
    }

    function _generateSalt(
        address _proposer,
        uint96 _expirationTimestamp,
        address _sellToken,
        address _buyToken,
        uint256 _sellAmount
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_proposer, _expirationTimestamp, _sellToken, _buyToken, _sellAmount));
    }

    ///// FETCH TRADE ESCROW DATA /////

    function getTradeEscrowData(address _tradeEscrow) public view returns (TradeData memory) {
        return tradeData[_tradeEscrow];
    }

    function getNumberOfTradeEscrows() public view returns (uint256) {
        return escrows.length();
    }

    function getAllTradeEscrows() public view returns (address[] memory) {
        return escrows.values();
    }

    function getAllTradeEscrowsOfProposer(address _proposer) public view returns (address[] memory) {
        address[] memory tradeEscrows = new address[](escrows.length());
        uint256 index = 0;
        for (uint256 i = 0; i < escrows.length(); i++) {
            address tradeEscrow = escrows.at(i);
            if (tradeData[tradeEscrow].proposer == _proposer) {
                tradeEscrows[index++] = tradeEscrow;
            }
        }
        return tradeEscrows;
    }
}
