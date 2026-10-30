// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Interface the ArcLance frontend expects at ESCROW_ADDRESS (Arc Testnet).
 *
 * Money flow
 *  - createEscrow pulls the SUM of all milestone amounts from msg.sender (the client) with
 *    transferFrom. The frontend approves the escrow contract for exactly that total first.
 *  - The freelancer calls markDelivered. The client then approves and releases, or disputes.
 *  - Auto-release: once block.timestamp >= deliveredAt + autoReleaseDays * 1 days, ANYONE may call
 *    releaseMilestone for a Delivered milestone.
 *
 * Milestone status (uint8): 0 Funded, 1 Delivered, 2 Approved, 3 Released, 4 Disputed.
 * Allowed tokens: USDC and EURC on Arc Testnet (6 decimals). Reverts on any other token.
 * Milestone count: 1 to 5. Auto-release days: 1 to 90.
 */
interface IMilestoneEscrow {
    struct MilestoneInput {
        uint256 amount;       // token base units
        string description;
    }

    struct Milestone {
        uint256 amount;
        string description;
        uint8 status;
        uint64 deliveredAt;   // 0 until delivered
        string deliveryNote;  // note or link from the freelancer
        uint64 approvedAt;    // 0 until approved
        uint64 releasedAt;    // 0 until released
    }

    struct EscrowInfo {
        address client;
        address freelancer;
        address token;
        string title;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint64 createdAt;
        uint32 autoReleaseDays;
        uint8 milestoneCount;
    }

    // ── Writes ──
    function createEscrow(
        address freelancer,
        address token,
        string calldata title,
        MilestoneInput[] calldata milestones,
        uint32 autoReleaseDays
    ) external returns (uint256 id);

    function markDelivered(uint256 id, uint8 index, string calldata note) external;      // freelancer only
    function approveMilestone(uint256 id, uint8 index) external;                         // client only
    function releaseMilestone(uint256 id, uint8 index) external;                         // client, or anyone after auto-release time
    function disputeMilestone(uint256 id, uint8 index, string calldata reason) external; // client only

    // ── Reads ──
    function escrowCount() external view returns (uint256);
    function getEscrow(uint256 id) external view returns (EscrowInfo memory);
    function getMilestone(uint256 id, uint8 index) external view returns (Milestone memory);
    function escrowIdsOf(address account, bool asClient) external view returns (uint256[] memory);

    // ── Events ──
    event EscrowCreated(uint256 indexed id, address indexed client, address indexed freelancer, address token, uint256 total, uint8 milestones);
    event MilestoneDelivered(uint256 indexed id, uint8 index, string note);
    event MilestoneApproved(uint256 indexed id, uint8 index);
    event MilestoneReleased(uint256 indexed id, uint8 index, uint256 amount);
    event MilestoneDisputed(uint256 indexed id, uint8 index, address indexed by, string reason);
}
