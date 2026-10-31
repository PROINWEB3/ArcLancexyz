// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Interface the ArcLance frontend expects at P2P_ADDRESS (Arc Testnet).
 *
 * Non-custodial: the seller's USDC (ERC-20 interface, 6 decimals) is locked in this contract and is
 * released to the buyer only when the seller calls confirmPayment (or by dispute resolution).
 *
 * Ad side (uint8): 0 SELL  the advertiser sells USDC; USDC is locked in createAd.
 *                  1 BUY   the advertiser buys USDC; the seller who takes the order locks USDC in createOrder.
 * price: fiat units per 1 USDC, scaled by 1e6 (281.5 PKR per USDC = 281_500_000).
 * fiatAmount (in Order) = amount * price / 1e6, scaled by 1e6 like price.
 * paymentMethods bitmask: 1 Bank transfer, 2 JazzCash, 4 Easypaisa, 8 UPI, 16 bKash, 32 Mobile money.
 * currency: "PKR", "INR", "BDT" or "NGN".
 * Order status (uint8): 0 Created (waiting for payment), 1 Paid, 2 Completed, 3 Cancelled, 4 Disputed.
 * Order.expiresAt = createdAt + ad.paymentWindowMinutes * 60.
 * Callers approve the contract for the USDC they lock before createAd (SELL) or createOrder (on a BUY ad).
 */
interface IP2PEscrow {
    struct AdInput {
        uint8 side;
        string currency;
        uint256 amount;               // total USDC for the ad
        uint256 price;
        uint256 minLimit;             // min USDC per order
        uint256 maxLimit;             // max USDC per order
        uint32 paymentMethods;
        uint32 paymentWindowMinutes;  // the frontend offers 15, 30 or 60
        string paymentDetails;        // shown to the buyer; public onchain
    }

    struct Ad {
        address owner;
        uint8 side;
        string currency;
        uint256 amount;
        uint256 remaining;            // USDC still available for new orders
        uint256 price;
        uint256 minLimit;
        uint256 maxLimit;
        uint32 paymentMethods;
        uint32 paymentWindowMinutes;
        string paymentDetails;
        bool active;
        uint64 createdAt;
    }

    struct Order {
        uint256 adId;
        address buyer;
        address seller;
        uint256 amount;
        uint256 fiatAmount;
        uint8 status;
        uint64 createdAt;
        uint64 paidAt;                // 0 until marked paid
        uint64 expiresAt;
        string paymentReference;      // set by markPaid
    }

    // ── Writes ──
    function createAd(AdInput calldata input) external returns (uint256 adId);
    function cancelAd(uint256 adId) external;                                       // owner; refunds remaining USDC on a SELL ad
    function createOrder(uint256 adId, uint256 amount) external returns (uint256 orderId);
    function markPaid(uint256 orderId, string calldata paymentReference) external;  // buyer only, status 0 -> 1
    function confirmPayment(uint256 orderId) external;                              // seller only, status 1 -> 2, USDC to buyer
    function cancelOrder(uint256 orderId) external;                                 // buyer while status 0; anyone once expired and unpaid
    function openDispute(uint256 orderId, string calldata reason) external;         // buyer or seller, status 1 -> 4

    // ── Reads ──
    function adCount() external view returns (uint256);
    function getAd(uint256 adId) external view returns (Ad memory);
    function orderCount() external view returns (uint256);
    function getOrder(uint256 orderId) external view returns (Order memory);
    function orderIdsOf(address account) external view returns (uint256[] memory);
    function sellerStats(address seller) external view returns (uint256 completedOrders, uint256 totalOrders, uint256 disputedOrders);

    // ── Events ──
    event AdCreated(uint256 indexed adId, address indexed owner, uint8 side, string currency, uint256 amount, uint256 price);
    event AdCancelled(uint256 indexed adId);
    event OrderCreated(uint256 indexed orderId, uint256 indexed adId, address indexed buyer, address seller, uint256 amount);
    event OrderPaid(uint256 indexed orderId, string paymentReference);
    event OrderCompleted(uint256 indexed orderId);
    event OrderCancelled(uint256 indexed orderId);
    event OrderDisputed(uint256 indexed orderId, address indexed by, string reason);
}
