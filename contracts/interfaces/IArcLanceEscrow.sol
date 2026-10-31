// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Milestone escrow at ESCROW_ADDRESS (Arc Testnet). Enums and errors are not read by the frontend: it uses uint8 values and shows any revert message as-is.
interface IArcLanceEscrow {
    /// Milestone state, passed as uint8 in every struct and call (0 to 4).
    enum MilestoneStatus { Funded, Delivered, Approved, Released, Disputed }

    /// Input for one milestone when creating an escrow (1 to 5 per escrow).
    struct MilestoneInput { uint256 amount; string description; }
    /// Stored milestone: amount in token base units, status as uint8, timestamps are 0 until set.
    struct Milestone { uint256 amount; string description; uint8 status; uint64 deliveredAt; string deliveryNote; uint64 approvedAt; uint64 releasedAt; }
    /// Escrow header: parties, token (USDC or EURC), title, totals, auto-release days and milestone count.
    struct EscrowInfo { address client; address freelancer; address token; string title; uint256 totalAmount; uint256 releasedAmount; uint64 createdAt; uint32 autoReleaseDays; uint8 milestoneCount; }

    /// Caller is not allowed to perform this action on this escrow or milestone.
    error NotAuthorized();
    /// Token is not USDC or EURC.
    error UnsupportedToken();
    /// Milestone count is not 1 to 5, an amount is 0, or autoReleaseDays is not 1 to 90.
    error InvalidInput();
    /// Escrow id or milestone index does not exist.
    error NotFound();
    /// Milestone status does not allow this action.
    error InvalidStatus();
    /// Auto-release time has not been reached yet.
    error TooEarly();

    /// Client creates and funds an escrow; pulls the sum of all milestone amounts with transferFrom (approve first).
    function createEscrow(address freelancer, address token, string calldata title, MilestoneInput[] calldata milestones, uint32 autoReleaseDays) external returns (uint256 id);
    /// Freelancer marks a Funded milestone as Delivered with a note or link.
    function markDelivered(uint256 id, uint8 index, string calldata note) external;
    /// Client approves a Delivered milestone.
    function approveMilestone(uint256 id, uint8 index) external;
    /// Client releases an Approved milestone; anyone may release a Delivered one after deliveredAt + autoReleaseDays days.
    function releaseMilestone(uint256 id, uint8 index) external;
    /// Client opens a dispute on a milestone that is not yet Released.
    function disputeMilestone(uint256 id, uint8 index, string calldata reason) external;

    /// Total number of escrows created.
    function escrowCount() external view returns (uint256);
    /// Escrow header by id.
    function getEscrow(uint256 id) external view returns (EscrowInfo memory);
    /// One milestone of an escrow by index.
    function getMilestone(uint256 id, uint8 index) external view returns (Milestone memory);
    /// Escrow ids where the account is the client (asClient true) or the freelancer (false).
    function escrowIdsOf(address account, bool asClient) external view returns (uint256[] memory);

    /// Emitted when an escrow is created and funded.
    event EscrowCreated(uint256 indexed id, address indexed client, address indexed freelancer, address token, uint256 total, uint8 milestones);
    /// Emitted when the freelancer marks a milestone delivered.
    event MilestoneDelivered(uint256 indexed id, uint8 index, string note);
    /// Emitted when the client approves a milestone.
    event MilestoneApproved(uint256 indexed id, uint8 index);
    /// Emitted when a milestone payment is sent to the freelancer.
    event MilestoneReleased(uint256 indexed id, uint8 index, uint256 amount);
    /// Emitted when a milestone is disputed, with the reason.
    event MilestoneDisputed(uint256 indexed id, uint8 index, address indexed by, string reason);
}
