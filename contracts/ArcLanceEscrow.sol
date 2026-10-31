// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IArcLanceEscrow} from "./interfaces/IArcLanceEscrow.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ArcLanceEscrow
 * @notice Clients fund milestone escrows in constructor-selected USDC or EURC.
 * Freelancers deliver milestones; clients approve and release them or open disputes.
 * Anyone may release delivered or approved milestones after the auto-release delay.
 * Only the arbiter may resolve disputes, paying the freelancer or refunding the client.
 * The owner selects the arbiter and may pause creation only; existing escrow flows
 * remain available while paused. Refunded milestones are terminal (Released), but
 * releasedAmount counts only payments made to the freelancer.
 */
contract ArcLanceEscrow is IArcLanceEscrow, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable usdc;
    address public immutable eurc;

    address private _arbiter;
    uint256 private _escrowCount;
    mapping(uint256 => EscrowInfo) private _escrows;
    mapping(uint256 => mapping(uint8 => Milestone)) private _milestones;
    mapping(address => uint256[]) private _clientEscrowIds;
    mapping(address => uint256[]) private _freelancerEscrowIds;

    event ArbiterUpdated(address indexed previousArbiter, address indexed newArbiter);
    event DisputeResolved(
        uint256 indexed id,
        uint8 index,
        address indexed arbiter,
        bool releasedToFreelancer,
        uint256 amount
    );

    constructor(address initialOwner, address usdc_, address eurc_, address arbiter_)
        Ownable(_validatedOwner(initialOwner))
    {
        if (
            usdc_ == address(0) || eurc_ == address(0) || arbiter_ == address(0)
                || usdc_ == eurc_
        ) revert InvalidInput();
        usdc = usdc_;
        eurc = eurc_;
        _arbiter = arbiter_;
    }

    function createEscrow(
        address freelancer,
        address token,
        string calldata title,
        MilestoneInput[] calldata milestones,
        uint32 autoReleaseDays
    ) external override whenNotPaused nonReentrant returns (uint256 id) {
        if (token != usdc && token != eurc) revert UnsupportedToken();
        if (
            freelancer == address(0) || freelancer == msg.sender
                || bytes(title).length == 0 || bytes(title).length > 100
                || milestones.length == 0 || milestones.length > 5
                || autoReleaseDays == 0 || autoReleaseDays > 90
        ) revert InvalidInput();

        uint256 total;
        for (uint256 i; i < milestones.length; ++i) {
            MilestoneInput calldata input = milestones[i];
            if (
                input.amount == 0 || bytes(input.description).length == 0
                    || bytes(input.description).length > 280
                    || input.amount > type(uint256).max - total
            ) revert InvalidInput();
            total += input.amount;
        }

        id = _escrowCount++;
        _escrows[id] = EscrowInfo({
            client: msg.sender,
            freelancer: freelancer,
            token: token,
            title: title,
            totalAmount: total,
            releasedAmount: 0,
            createdAt: uint64(block.timestamp),
            autoReleaseDays: autoReleaseDays,
            milestoneCount: uint8(milestones.length)
        });
        for (uint256 i; i < milestones.length; ++i) {
            _milestones[id][uint8(i)] = Milestone({
                amount: milestones[i].amount,
                description: milestones[i].description,
                status: uint8(MilestoneStatus.Funded),
                deliveredAt: 0,
                deliveryNote: "",
                approvedAt: 0,
                releasedAt: 0
            });
        }
        _clientEscrowIds[msg.sender].push(id);
        _freelancerEscrowIds[freelancer].push(id);

        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        emit EscrowCreated(id, msg.sender, freelancer, token, total, uint8(milestones.length));
    }

    function markDelivered(uint256 id, uint8 index, string calldata note) external override {
        (EscrowInfo storage escrow, Milestone storage milestone) = _getMilestone(id, index);
        if (msg.sender != escrow.freelancer) revert NotAuthorized();
        if (milestone.status != uint8(MilestoneStatus.Funded)) revert InvalidStatus();
        if (bytes(note).length == 0 || bytes(note).length > 280) revert InvalidInput();

        milestone.deliveredAt = uint64(block.timestamp);
        milestone.deliveryNote = note;
        milestone.status = uint8(MilestoneStatus.Delivered);
        emit MilestoneDelivered(id, index, note);
    }

    function approveMilestone(uint256 id, uint8 index) external override {
        (EscrowInfo storage escrow, Milestone storage milestone) = _getMilestone(id, index);
        if (msg.sender != escrow.client) revert NotAuthorized();
        if (milestone.status != uint8(MilestoneStatus.Delivered)) revert InvalidStatus();

        milestone.approvedAt = uint64(block.timestamp);
        milestone.status = uint8(MilestoneStatus.Approved);
        emit MilestoneApproved(id, index);
    }

    function releaseMilestone(uint256 id, uint8 index) external override nonReentrant {
        (EscrowInfo storage escrow, Milestone storage milestone) = _getMilestone(id, index);
        uint8 status = milestone.status;
        if (
            status != uint8(MilestoneStatus.Delivered)
                && status != uint8(MilestoneStatus.Approved)
        ) revert InvalidStatus();

        if (!(msg.sender == escrow.client && status == uint8(MilestoneStatus.Approved))) {
            uint256 releaseTime = uint256(milestone.deliveredAt)
                + uint256(escrow.autoReleaseDays) * 1 days;
            if (block.timestamp < releaseTime) {
                if (status == uint8(MilestoneStatus.Approved)) revert NotAuthorized();
                revert TooEarly();
            }
        }

        uint256 amount = milestone.amount;
        milestone.status = uint8(MilestoneStatus.Released);
        milestone.releasedAt = uint64(block.timestamp);
        escrow.releasedAmount += amount;

        IERC20(escrow.token).safeTransfer(escrow.freelancer, amount);
        emit MilestoneReleased(id, index, amount);
    }

    function disputeMilestone(uint256 id, uint8 index, string calldata reason) external override {
        (EscrowInfo storage escrow, Milestone storage milestone) = _getMilestone(id, index);
        if (msg.sender != escrow.client) revert NotAuthorized();
        uint8 status = milestone.status;
        if (
            status != uint8(MilestoneStatus.Funded)
                && status != uint8(MilestoneStatus.Delivered)
                && status != uint8(MilestoneStatus.Approved)
        ) revert InvalidStatus();
        if (bytes(reason).length == 0 || bytes(reason).length > 280) revert InvalidInput();

        milestone.status = uint8(MilestoneStatus.Disputed);
        emit MilestoneDisputed(id, index, msg.sender, reason);
    }

    function escrowCount() external view override returns (uint256) {
        return _escrowCount;
    }

    function getEscrow(uint256 id) external view override returns (EscrowInfo memory) {
        if (id >= _escrowCount) revert NotFound();
        return _escrows[id];
    }

    function getMilestone(uint256 id, uint8 index) external view override returns (Milestone memory) {
        (, Milestone storage milestone) = _getMilestone(id, index);
        return milestone;
    }

    function escrowIdsOf(address account, bool asClient)
        external
        view
        override
        returns (uint256[] memory)
    {
        if (asClient) return _clientEscrowIds[account];
        return _freelancerEscrowIds[account];
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

    function resolveDispute(uint256 id, uint8 index, bool releaseToFreelancer)
        external
        nonReentrant
    {
        if (msg.sender != _arbiter) revert NotAuthorized();
        (EscrowInfo storage escrow, Milestone storage milestone) = _getMilestone(id, index);
        if (milestone.status != uint8(MilestoneStatus.Disputed)) revert InvalidStatus();

        uint256 amount = milestone.amount;
        milestone.status = uint8(MilestoneStatus.Released);
        milestone.releasedAt = uint64(block.timestamp);
        if (releaseToFreelancer) escrow.releasedAmount += amount;
        address recipient = releaseToFreelancer ? escrow.freelancer : escrow.client;

        IERC20(escrow.token).safeTransfer(recipient, amount);
        if (releaseToFreelancer) emit MilestoneReleased(id, index, amount);
        emit DisputeResolved(id, index, msg.sender, releaseToFreelancer, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _getMilestone(uint256 id, uint8 index)
        private
        view
        returns (EscrowInfo storage escrow, Milestone storage milestone)
    {
        if (id >= _escrowCount) revert NotFound();
        escrow = _escrows[id];
        if (index >= escrow.milestoneCount) revert NotFound();
        milestone = _milestones[id][index];
    }

    // Validate before Ownable's constructor so a zero owner uses the interface error.
    function _validatedOwner(address initialOwner) private pure returns (address) {
        if (initialOwner == address(0)) revert InvalidInput();
        return initialOwner;
    }
}
