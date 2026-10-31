// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Non-custodial P2P USDC marketplace at P2P_ADDRESS (Arc Testnet). Enums and errors are not read by the frontend: it uses uint8 values and shows any revert message as-is.
interface IArcLanceP2P {
    /// Ad side, passed as uint8: Sell = advertiser sells USDC (locked at createAd), Buy = advertiser buys USDC (seller locks USDC at createOrder).
    enum AdSide { Sell, Buy }
    /// Order state, passed as uint8 (0 to 4).
    enum OrderStatus { Created, Paid, Completed, Cancelled, Disputed }

    /// Input to publish an ad: price is fiat per 1 USDC scaled by 1e6, amounts are USDC base units (6 decimals).
    struct AdInput { uint8 side; string currency; uint256 amount; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; }
    /// Stored ad: same fields as the input plus owner, remaining USDC, active flag and creation time.
    struct Ad { address owner; uint8 side; string currency; uint256 amount; uint256 remaining; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; bool active; uint64 createdAt; }
    /// Stored order: fiatAmount = amount * price / 1e6, expiresAt = createdAt + paymentWindowMinutes * 60.
    struct Order { uint256 adId; address buyer; address seller; uint256 amount; uint256 fiatAmount; uint8 status; uint64 createdAt; uint64 paidAt; uint64 expiresAt; string paymentReference; }

    /// Caller is not allowed to perform this action on this ad or order.
    error NotAuthorized();
    /// Amount, price, limits, currency, payment methods or window are invalid.
    error InvalidInput();
    /// Ad id or order id does not exist.
    error NotFound();
    /// Ad is not active or does not have enough remaining USDC.
    error AdUnavailable();
    /// Order status does not allow this action.
    error InvalidStatus();
    /// Payment window has expired.
    error WindowExpired();
    /// Payment window has not expired yet.
    error WindowNotExpired();

    /// Publish an ad; a Sell ad locks its USDC now (approve first).
    function createAd(AdInput calldata input) external returns (uint256 adId);
    /// Owner closes an ad and gets back any remaining locked USDC.
    function cancelAd(uint256 adId) external;
    /// Open an order on an ad; the seller's USDC is locked here when taking a Buy ad (approve first).
    function createOrder(uint256 adId, uint256 amount) external returns (uint256 orderId);
    /// Buyer reports the fiat payment with a reference; status Created to Paid.
    function markPaid(uint256 orderId, string calldata paymentReference) external;
    /// Seller confirms the fiat arrived; USDC is released to the buyer; status Paid to Completed.
    function confirmPayment(uint256 orderId) external;
    /// Buyer cancels an unpaid order, or anyone cancels it after the payment window; USDC returns to the seller or ad.
    function cancelOrder(uint256 orderId) external;
    /// Buyer or seller disputes a Paid order, with a reason; status Paid to Disputed.
    function openDispute(uint256 orderId, string calldata reason) external;

    /// Total number of ads created.
    function adCount() external view returns (uint256);
    /// Ad by id.
    function getAd(uint256 adId) external view returns (Ad memory);
    /// Total number of orders created.
    function orderCount() external view returns (uint256);
    /// Order by id.
    function getOrder(uint256 orderId) external view returns (Order memory);
    /// Order ids where the account is buyer or seller.
    function orderIdsOf(address account) external view returns (uint256[] memory);
    /// On-chain seller reputation counters used for the completion rate.
    function sellerStats(address seller) external view returns (uint256 completedOrders, uint256 totalOrders, uint256 disputedOrders);

    /// Emitted when an ad is published.
    event AdCreated(uint256 indexed adId, address indexed owner, uint8 side, string currency, uint256 amount, uint256 price);
    /// Emitted when an ad is cancelled.
    event AdCancelled(uint256 indexed adId);
    /// Emitted when an order is opened.
    event OrderCreated(uint256 indexed orderId, uint256 indexed adId, address indexed buyer, address seller, uint256 amount);
    /// Emitted when the buyer marks an order paid.
    event OrderPaid(uint256 indexed orderId, string paymentReference);
    /// Emitted when the seller confirms and USDC is released.
    event OrderCompleted(uint256 indexed orderId);
    /// Emitted when an order is cancelled.
    event OrderCancelled(uint256 indexed orderId);
    /// Emitted when an order is disputed, with the reason.
    event OrderDisputed(uint256 indexed orderId, address indexed by, string reason);
}
