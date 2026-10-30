// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IArcLanceP2P} from "./interfaces/IArcLanceP2P.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcLanceP2P
 * @notice P2P marketplace for constructor-configured, six-decimal Arc USDC.
 * Sellers escrow USDC when publishing Sell ads or taking Buy ads. Buyers pay
 * fiat off-chain and mark orders paid; sellers confirm to release escrow.
 * Unpaid orders can be cancelled; paid orders can be disputed by either party.
 * The arbiter awards disputed escrow to the buyer or seller. The owner selects
 * the arbiter and may pause new ads/orders, without blocking existing exits.
 */
contract ArcLanceP2P is IArcLanceP2P, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 private immutable _usdc;
    address private _arbiter;
    uint256 public override adCount;
    uint256 public override orderCount;

    mapping(uint256 => Ad) private _ads;
    mapping(uint256 => Order) private _orders;
    mapping(address => uint256[]) private _accountOrderIds;
    mapping(address => uint256) private _completedOrders;
    mapping(address => uint256) private _totalOrders;
    mapping(address => uint256) private _disputedOrders;

    event ArbiterUpdated(address indexed previousArbiter, address indexed newArbiter);
    event DisputeResolved(uint256 indexed orderId, address indexed arbiter, bool releasedToBuyer, uint256 amount);

    constructor(address initialOwner, address usdc_, address arbiter_)
        Ownable(_validateOwner(initialOwner))
    {
        if (usdc_ == address(0) || arbiter_ == address(0)) revert InvalidInput();
        _usdc = IERC20(usdc_);
        _arbiter = arbiter_;
    }

    function createAd(AdInput calldata input)
        external override whenNotPaused nonReentrant returns (uint256 adId)
    {
        bytes32 currencyHash = keccak256(bytes(input.currency));
        if (
            input.side > uint8(AdSide.Buy)
                || (currencyHash != keccak256("PKR") && currencyHash != keccak256("INR")
                    && currencyHash != keccak256("BDT") && currencyHash != keccak256("NGN"))
                || input.amount == 0 || input.price == 0 || input.minLimit == 0
                || input.minLimit > input.maxLimit || input.maxLimit > input.amount
                || input.paymentMethods == 0 || input.paymentMethods > 63
                || input.paymentWindowMinutes < 15 || input.paymentWindowMinutes > 60
                || bytes(input.paymentDetails).length == 0 || bytes(input.paymentDetails).length > 500
        ) revert InvalidInput();

        adId = adCount++;
        Ad storage ad = _ads[adId];
        ad.owner = msg.sender;
        ad.side = input.side;
        ad.currency = input.currency;
        ad.amount = input.amount;
        ad.remaining = input.amount;
        ad.price = input.price;
        ad.minLimit = input.minLimit;
        ad.maxLimit = input.maxLimit;
        ad.paymentMethods = input.paymentMethods;
        ad.paymentWindowMinutes = input.paymentWindowMinutes;
        // WARNING: paymentDetails stored on-chain is PUBLIC; testnet demo only.
        // Never include real bank credentials or other sensitive personal data.
        ad.paymentDetails = input.paymentDetails;
        ad.active = true;
        ad.createdAt = uint64(block.timestamp);

        if (input.side == uint8(AdSide.Sell)) {
            _usdc.safeTransferFrom(msg.sender, address(this), input.amount);
        }
        emit AdCreated(adId, msg.sender, input.side, input.currency, input.amount, input.price);
    }

    function cancelAd(uint256 adId) external override nonReentrant {
        Ad storage ad = _existingAd(adId);
        if (msg.sender != ad.owner) revert NotAuthorized();
        if (!ad.active) revert AdUnavailable();

        uint256 refund = ad.remaining;
        ad.active = false;
        ad.remaining = 0;

        if (ad.side == uint8(AdSide.Sell) && refund != 0) {
            _usdc.safeTransfer(ad.owner, refund);
        }
        emit AdCancelled(adId);
    }

    function createOrder(uint256 adId, uint256 amount)
        external override whenNotPaused nonReentrant returns (uint256 orderId)
    {
        Ad storage ad = _existingAd(adId);
        if (!ad.active) revert AdUnavailable();
        if (msg.sender == ad.owner) revert NotAuthorized();
        if (amount == 0 || amount > ad.remaining) revert AdUnavailable();
        if (amount > ad.maxLimit || (amount < ad.minLimit && amount != ad.remaining)) {
            revert InvalidInput();
        }

        bool isSell = ad.side == uint8(AdSide.Sell);
        address buyer = isSell ? msg.sender : ad.owner;
        address seller = isSell ? ad.owner : msg.sender;
        ad.remaining -= amount;
        orderId = orderCount++;
        Order storage order = _orders[orderId];
        order.adId = adId;
        order.buyer = buyer;
        order.seller = seller;
        order.amount = amount;
        order.fiatAmount = amount * ad.price / 1e6;
        order.status = uint8(OrderStatus.Created);
        order.createdAt = uint64(block.timestamp);
        order.expiresAt = uint64(block.timestamp + uint256(ad.paymentWindowMinutes) * 60);
        _accountOrderIds[buyer].push(orderId);
        _accountOrderIds[seller].push(orderId);
        _totalOrders[seller]++;

        if (!isSell) {
            _usdc.safeTransferFrom(seller, address(this), amount);
        }
        emit OrderCreated(orderId, adId, buyer, seller, amount);
    }

    function markPaid(uint256 orderId, string calldata paymentReference) external override {
        Order storage order = _existingOrder(orderId);
        if (msg.sender != order.buyer) revert NotAuthorized();
        if (order.status != uint8(OrderStatus.Created)) revert InvalidStatus();
        if (block.timestamp > order.expiresAt) revert WindowExpired();
        if (bytes(paymentReference).length == 0 || bytes(paymentReference).length > 100) {
            revert InvalidInput();
        }

        order.paidAt = uint64(block.timestamp);
        order.paymentReference = paymentReference;
        order.status = uint8(OrderStatus.Paid);
        emit OrderPaid(orderId, paymentReference);
    }

    function confirmPayment(uint256 orderId) external override nonReentrant {
        Order storage order = _existingOrder(orderId);
        if (msg.sender != order.seller) revert NotAuthorized();
        if (order.status != uint8(OrderStatus.Paid)) revert InvalidStatus();

        order.status = uint8(OrderStatus.Completed);
        _completedOrders[order.seller]++;
        _usdc.safeTransfer(order.buyer, order.amount);
        emit OrderCompleted(orderId);
    }

    function cancelOrder(uint256 orderId) external override nonReentrant {
        Order storage order = _existingOrder(orderId);
        if (order.status != uint8(OrderStatus.Created)) revert InvalidStatus();
        if (msg.sender != order.buyer && block.timestamp <= order.expiresAt) {
            revert WindowNotExpired();
        }

        order.status = uint8(OrderStatus.Cancelled);
        Ad storage ad = _ads[order.adId];
        if (ad.active) {
            ad.remaining += order.amount;
        }
        if (ad.side == uint8(AdSide.Buy) || !ad.active) {
            _usdc.safeTransfer(order.seller, order.amount);
        }
        emit OrderCancelled(orderId);
    }

    function openDispute(uint256 orderId, string calldata reason) external override {
        Order storage order = _existingOrder(orderId);
        if (msg.sender != order.buyer && msg.sender != order.seller) revert NotAuthorized();
        if (order.status != uint8(OrderStatus.Paid)) revert InvalidStatus();
        if (bytes(reason).length == 0 || bytes(reason).length > 280) revert InvalidInput();

        order.status = uint8(OrderStatus.Disputed);
        _disputedOrders[order.seller]++;
        emit OrderDisputed(orderId, msg.sender, reason);
    }

    function getAd(uint256 adId) external view override returns (Ad memory) {
        return _existingAd(adId);
    }

    function getOrder(uint256 orderId) external view override returns (Order memory) {
        return _existingOrder(orderId);
    }

    function orderIdsOf(address account) external view override returns (uint256[] memory) {
        return _accountOrderIds[account];
    }

    function sellerStats(address seller) external view override returns (
        uint256 completedOrders, uint256 totalOrders, uint256 disputedOrders
    ) {
        return (_completedOrders[seller], _totalOrders[seller], _disputedOrders[seller]);
    }

    function arbiter() external view returns (address) {
        return _arbiter;
    }

    function setArbiter(address newArbiter) external onlyOwner {
        if (newArbiter == address(0)) revert InvalidInput();
        address previousArbiter = _arbiter;
        _arbiter = newArbiter;
        emit ArbiterUpdated(previousArbiter, newArbiter);
    }

    function resolveDispute(uint256 orderId, bool releaseToBuyer) external nonReentrant {
        if (msg.sender != _arbiter) revert NotAuthorized();
        Order storage order = _existingOrder(orderId);
        if (order.status != uint8(OrderStatus.Disputed)) revert InvalidStatus();

        order.status = releaseToBuyer ? uint8(OrderStatus.Completed) : uint8(OrderStatus.Cancelled);
        address recipient = releaseToBuyer ? order.buyer : order.seller;
        _usdc.safeTransfer(recipient, order.amount);
        emit DisputeResolved(orderId, msg.sender, releaseToBuyer, order.amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _existingAd(uint256 adId) private view returns (Ad storage ad) {
        if (adId >= adCount) revert NotFound();
        return _ads[adId];
    }

    function _existingOrder(uint256 orderId) private view returns (Order storage order) {
        if (orderId >= orderCount) revert NotFound();
        return _orders[orderId];
    }

    // Validate before Ownable's constructor so a zero initial owner uses InvalidInput.
    function _validateOwner(address initialOwner) private pure returns (address) {
        if (initialOwner == address(0)) revert InvalidInput();
        return initialOwner;
    }
}
