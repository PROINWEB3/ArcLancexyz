import { parseAbi } from 'viem'

/**
 * Interface the ArcLance frontend expects from the P2P (USDC to local currency) contract (P2P_ADDRESS).
 *
 * Non-custodial: the seller's USDC is locked in this contract and released only to the buyer
 * after the seller confirms the fiat payment (or by dispute resolution).
 *
 * Ad side: 0 SELL (advertiser sells USDC, locks it when creating the ad),
 *          1 BUY  (advertiser buys USDC; the seller who takes the order locks USDC in createOrder).
 * price: fiat units per 1 USDC, scaled by 1e6.  Amounts: USDC base units (6 decimals).
 * paymentMethods bitmask: 1 Bank transfer, 2 JazzCash, 4 Easypaisa, 8 UPI, 16 bKash, 32 Mobile money.
 * Order status: 0 Created (waiting for payment), 1 Paid, 2 Completed, 3 Cancelled, 4 Disputed.
 */
export const P2P_ABI = parseAbi([
  'struct AdInput { uint8 side; string currency; uint256 amount; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; }',
  'struct Ad { address owner; uint8 side; string currency; uint256 amount; uint256 remaining; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; bool active; uint64 createdAt; }',
  'struct Order { uint256 adId; address buyer; address seller; uint256 amount; uint256 fiatAmount; uint8 status; uint64 createdAt; uint64 paidAt; uint64 expiresAt; string paymentReference; }',
  'function createAd(AdInput input) returns (uint256 adId)',
  'function cancelAd(uint256 adId)',
  'function createOrder(uint256 adId, uint256 amount) returns (uint256 orderId)',
  'function markPaid(uint256 orderId, string paymentReference)',
  'function confirmPayment(uint256 orderId)',
  'function cancelOrder(uint256 orderId)',
  'function openDispute(uint256 orderId, string reason)',
  'function adCount() view returns (uint256)',
  'function getAd(uint256 adId) view returns (Ad)',
  'function orderCount() view returns (uint256)',
  'function getOrder(uint256 orderId) view returns (Order)',
  'function orderIdsOf(address account) view returns (uint256[])',
  'function sellerStats(address seller) view returns (uint256 completedOrders, uint256 totalOrders, uint256 disputedOrders)',
  'event AdCreated(uint256 indexed adId, address indexed owner, uint8 side, string currency, uint256 amount, uint256 price)',
  'event AdCancelled(uint256 indexed adId)',
  'event OrderCreated(uint256 indexed orderId, uint256 indexed adId, address indexed buyer, address seller, uint256 amount)',
  'event OrderPaid(uint256 indexed orderId, string paymentReference)',
  'event OrderCompleted(uint256 indexed orderId)',
  'event OrderCancelled(uint256 indexed orderId)',
  'event OrderDisputed(uint256 indexed orderId, address indexed by, string reason)',
])

// Payment methods are defined per country in src/config/p2p-countries.ts. `paymentMethods` is a bitmask where bit i
// is the method at index i of that country's list; the contract only checks that it is between 1 and 63.

export const CURRENCIES = ['PKR', 'INR', 'BDT', 'NGN'] as const
export const ORDER_STATUS = ['Waiting for payment', 'Paid', 'Completed', 'Cancelled', 'Disputed'] as const
