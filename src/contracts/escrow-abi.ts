import { parseAbi } from 'viem'

/**
 * Interface the ArcLance frontend expects from the milestone escrow contract (ESCROW_ADDRESS).
 *
 * Money flow
 *  - createEscrow pulls the sum of all milestone amounts from the client with transferFrom
 *    (the client approves the escrow contract for that total first).
 *  - The freelancer calls markDelivered. The client then approves and releases, or disputes.
 *  - If the client does nothing for autoReleaseDays after delivery, anyone may call releaseMilestone.
 *
 * Milestone status values: 0 Funded, 1 Delivered, 2 Approved, 3 Released, 4 Disputed.
 */
export const ESCROW_ABI = parseAbi([
  'struct MilestoneInput { uint256 amount; string description; }',
  'struct Milestone { uint256 amount; string description; uint8 status; uint64 deliveredAt; string deliveryNote; uint64 approvedAt; uint64 releasedAt; }',
  'struct EscrowInfo { address client; address freelancer; address token; string title; uint256 totalAmount; uint256 releasedAmount; uint64 createdAt; uint32 autoReleaseDays; uint8 milestoneCount; }',
  'function createEscrow(address freelancer, address token, string title, MilestoneInput[] milestones, uint32 autoReleaseDays) returns (uint256 id)',
  'function markDelivered(uint256 id, uint8 index, string note)',
  'function approveMilestone(uint256 id, uint8 index)',
  'function releaseMilestone(uint256 id, uint8 index)',
  'function disputeMilestone(uint256 id, uint8 index, string reason)',
  'function escrowCount() view returns (uint256)',
  'function getEscrow(uint256 id) view returns (EscrowInfo)',
  'function getMilestone(uint256 id, uint8 index) view returns (Milestone)',
  'function escrowIdsOf(address account, bool asClient) view returns (uint256[])',
  'event EscrowCreated(uint256 indexed id, address indexed client, address indexed freelancer, address token, uint256 total, uint8 milestones)',
  'event MilestoneDelivered(uint256 indexed id, uint8 index, string note)',
  'event MilestoneApproved(uint256 indexed id, uint8 index)',
  'event MilestoneReleased(uint256 indexed id, uint8 index, uint256 amount)',
  'event MilestoneDisputed(uint256 indexed id, uint8 index, address indexed by, string reason)',
])

export const MILESTONE_STATUS = ['Funded', 'Delivered', 'Approved', 'Released', 'Disputed'] as const
