const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const USDC = (n) => ethers.parseUnits(String(n), 6);
const DAY = 24 * 60 * 60;
// Milestone status values
const S = { Funded: 0, Delivered: 1, Approved: 2, Released: 3, Disputed: 4 };

async function deployFixture() {
  const [owner, client, freelancer, arbiter, stranger, other] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USD Coin', 'USDC');
  const eurc = await (await ethers.getContractFactory('MockERC20')).deploy('Euro Coin', 'EURC');
  const escrow = await (await ethers.getContractFactory('ArcLanceEscrow')).deploy(
    owner.address, await usdc.getAddress(), await eurc.getAddress(), arbiter.address,
  );
  await usdc.mint(client.address, USDC(10000));
  await eurc.mint(client.address, USDC(10000));
  return { escrow, usdc, eurc, owner, client, freelancer, arbiter, stranger, other };
}

async function createDefault(ctx, { days = 7, token } = {}) {
  const { escrow, usdc, client, freelancer } = ctx;
  const tok = token || usdc;
  const milestones = [
    { amount: USDC(100), description: 'Design' },
    { amount: USDC(250), description: 'Build' },
  ];
  await tok.connect(client).approve(await escrow.getAddress(), USDC(350));
  const tx = await escrow.connect(client).createEscrow(freelancer.address, await tok.getAddress(), 'Website', milestones, days);
  return { tx, milestones };
}

describe('ArcLanceEscrow', () => {
  describe('constructor', () => {
    it('stores tokens, owner and arbiter from the constructor', async () => {
      const { escrow, usdc, eurc, owner, arbiter } = await loadFixture(deployFixture);
      expect(await escrow.usdc()).to.equal(await usdc.getAddress());
      expect(await escrow.eurc()).to.equal(await eurc.getAddress());
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.arbiter()).to.equal(arbiter.address);
    });

    it('rejects zero addresses and identical tokens', async () => {
      const { usdc, eurc, owner, arbiter } = await loadFixture(deployFixture);
      const F = await ethers.getContractFactory('ArcLanceEscrow');
      const u = await usdc.getAddress();
      const e = await eurc.getAddress();
      const Z = ethers.ZeroAddress;
      for (const args of [[Z, u, e, arbiter.address], [owner.address, Z, e, arbiter.address], [owner.address, u, Z, arbiter.address], [owner.address, u, e, Z], [owner.address, u, u, arbiter.address]]) {
        await expect(F.deploy(...args)).to.be.revertedWithCustomError(F, 'InvalidInput');
      }
    });
  });

  describe('happy path', () => {
    it('create, deliver, approve and release pays the freelancer', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, usdc, client, freelancer } = ctx;
      const { tx } = await createDefault(ctx);
      await expect(tx).to.emit(escrow, 'EscrowCreated').withArgs(0, client.address, freelancer.address, await usdc.getAddress(), USDC(350), 2);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(USDC(350));
      expect(await escrow.escrowCount()).to.equal(1);
      expect(await escrow.escrowIdsOf(client.address, true)).to.deep.equal([0n]);
      expect(await escrow.escrowIdsOf(freelancer.address, false)).to.deep.equal([0n]);
      expect(await escrow.escrowIdsOf(client.address, false)).to.deep.equal([]);

      const info = await escrow.getEscrow(0);
      expect(info.client).to.equal(client.address);
      expect(info.totalAmount).to.equal(USDC(350));
      expect(info.milestoneCount).to.equal(2);
      expect(info.autoReleaseDays).to.equal(7);
      expect((await escrow.getMilestone(0, 0)).status).to.equal(S.Funded);

      await expect(escrow.connect(freelancer).markDelivered(0, 0, 'https://figma.com/x')).to.emit(escrow, 'MilestoneDelivered').withArgs(0, 0, 'https://figma.com/x');
      let m = await escrow.getMilestone(0, 0);
      expect(m.status).to.equal(S.Delivered);
      expect(m.deliveryNote).to.equal('https://figma.com/x');
      expect(m.deliveredAt).to.be.gt(0);

      await expect(escrow.connect(client).approveMilestone(0, 0)).to.emit(escrow, 'MilestoneApproved').withArgs(0, 0);
      expect((await escrow.getMilestone(0, 0)).status).to.equal(S.Approved);

      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.emit(escrow, 'MilestoneReleased').withArgs(0, 0, USDC(100));
      m = await escrow.getMilestone(0, 0);
      expect(m.status).to.equal(S.Released);
      expect(m.releasedAt).to.be.gt(0);
      expect(await usdc.balanceOf(freelancer.address)).to.equal(USDC(100));
      expect((await escrow.getEscrow(0)).releasedAmount).to.equal(USDC(100));
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(USDC(250));
    });

    it('completes every milestone and empties the escrow', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, usdc, client, freelancer } = ctx;
      await createDefault(ctx);
      for (const i of [0, 1]) {
        await escrow.connect(freelancer).markDelivered(0, i, 'done');
        await escrow.connect(client).approveMilestone(0, i);
        await escrow.connect(client).releaseMilestone(0, i);
      }
      expect(await usdc.balanceOf(freelancer.address)).to.equal(USDC(350));
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0);
      expect((await escrow.getEscrow(0)).releasedAmount).to.equal(USDC(350));
    });

    it('supports EURC escrows', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, eurc, client, freelancer } = ctx;
      await createDefault(ctx, { token: eurc });
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await escrow.connect(client).approveMilestone(0, 0);
      await escrow.connect(client).releaseMilestone(0, 0);
      expect(await eurc.balanceOf(freelancer.address)).to.equal(USDC(100));
    });
  });

  describe('input validation', () => {
    const ok = [{ amount: 1_000_000n, description: 'a' }];

    it('rejects zero amounts, empty or oversized milestone lists', async () => {
      const { escrow, usdc, client, freelancer } = await loadFixture(deployFixture);
      const token = await usdc.getAddress();
      const c = escrow.connect(client);
      await expect(c.createEscrow(freelancer.address, token, 'T', [{ amount: 0, description: 'a' }], 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'T', [ok[0], { amount: 0, description: 'b' }], 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'T', [], 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      const six = Array.from({ length: 6 }, () => ok[0]);
      await expect(c.createEscrow(freelancer.address, token, 'T', six, 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
    });

    it('rejects bad titles, descriptions, days, freelancer and unsupported tokens', async () => {
      const { escrow, usdc, client, freelancer, other } = await loadFixture(deployFixture);
      const token = await usdc.getAddress();
      const c = escrow.connect(client);
      await expect(c.createEscrow(freelancer.address, token, '', ok, 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'x'.repeat(101), ok, 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'T', [{ amount: 1, description: '' }], 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'T', ok, 0)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, token, 'T', ok, 91)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(ethers.ZeroAddress, token, 'T', ok, 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(client.address, token, 'T', ok, 7)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(c.createEscrow(freelancer.address, other.address, 'T', ok, 7)).to.be.revertedWithCustomError(escrow, 'UnsupportedToken');
    });

    it('rejects empty delivery notes and dispute reasons', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, client, freelancer } = ctx;
      await createDefault(ctx);
      await expect(escrow.connect(freelancer).markDelivered(0, 0, '')).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(escrow.connect(client).disputeMilestone(0, 0, '')).to.be.revertedWithCustomError(escrow, 'InvalidInput');
    });

    it('reverts without allowance and for missing ids or indexes', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, usdc, client, freelancer } = ctx;
      await expect(escrow.connect(client).createEscrow(freelancer.address, await usdc.getAddress(), 'T', ok, 7)).to.be.reverted;
      await createDefault(ctx);
      await expect(escrow.getEscrow(5)).to.be.revertedWithCustomError(escrow, 'NotFound');
      await expect(escrow.getMilestone(0, 2)).to.be.revertedWithCustomError(escrow, 'NotFound');
      await expect(escrow.connect(freelancer).markDelivered(9, 0, 'x')).to.be.revertedWithCustomError(escrow, 'NotFound');
      await expect(escrow.connect(client).approveMilestone(0, 7)).to.be.revertedWithCustomError(escrow, 'NotFound');
    });
  });

  describe('roles', () => {
    it('only the right role can call each function', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, client, freelancer, arbiter, stranger } = ctx;
      await createDefault(ctx);
      await expect(escrow.connect(client).markDelivered(0, 0, 'x')).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(stranger).markDelivered(0, 0, 'x')).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await expect(escrow.connect(freelancer).approveMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(stranger).approveMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(freelancer).disputeMilestone(0, 0, 'no')).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(stranger).disputeMilestone(0, 0, 'no')).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await escrow.connect(client).approveMilestone(0, 0);
      await expect(escrow.connect(stranger).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(freelancer).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(client).resolveDispute(0, 0, true)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(arbiter).resolveDispute(0, 0, true)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
    });

    it('owner-only admin functions', async () => {
      const { escrow, owner, stranger, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(stranger).setArbiter(other.address)).to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
      await expect(escrow.connect(stranger).pause()).to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
      await expect(escrow.connect(stranger).unpause()).to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
      await expect(escrow.connect(owner).setArbiter(ethers.ZeroAddress)).to.be.revertedWithCustomError(escrow, 'InvalidInput');
      await expect(escrow.connect(owner).setArbiter(other.address)).to.emit(escrow, 'ArbiterUpdated');
      expect(await escrow.arbiter()).to.equal(other.address);
    });
  });

  describe('status rules', () => {
    it('rejects actions in the wrong status', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, client, freelancer } = ctx;
      await createDefault(ctx);
      await expect(escrow.connect(client).approveMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await expect(escrow.connect(freelancer).markDelivered(0, 0, 'again')).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await escrow.connect(client).approveMilestone(0, 0);
      await expect(escrow.connect(client).approveMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await escrow.connect(client).releaseMilestone(0, 0);
      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await expect(escrow.connect(client).disputeMilestone(0, 0, 'late')).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
    });
  });

  describe('auto-release', () => {
    it('anyone can release a delivered milestone only after the configured days', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, usdc, client, freelancer, stranger } = ctx;
      await createDefault(ctx, { days: 3 });
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await expect(escrow.connect(stranger).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'TooEarly');
      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'TooEarly');
      await time.increase(3 * DAY - 60);
      await expect(escrow.connect(stranger).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'TooEarly');
      await time.increase(120);
      await expect(escrow.connect(stranger).releaseMilestone(0, 0)).to.emit(escrow, 'MilestoneReleased').withArgs(0, 0, USDC(100));
      expect(await usdc.balanceOf(freelancer.address)).to.equal(USDC(100));
    });

    it('also frees an approved milestone the client never released', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, client, freelancer, stranger } = ctx;
      await createDefault(ctx, { days: 1 });
      await escrow.connect(freelancer).markDelivered(0, 1, 'x');
      await escrow.connect(client).approveMilestone(0, 1);
      await expect(escrow.connect(stranger).releaseMilestone(0, 1)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await time.increase(DAY + 1);
      await expect(escrow.connect(stranger).releaseMilestone(0, 1)).to.emit(escrow, 'MilestoneReleased');
    });
  });

  describe('disputes', () => {
    async function disputed() {
      const ctx = await loadFixture(deployFixture);
      await createDefault(ctx);
      await ctx.escrow.connect(ctx.freelancer).markDelivered(0, 0, 'x');
      await expect(ctx.escrow.connect(ctx.client).disputeMilestone(0, 0, 'Not what we agreed')).to.emit(ctx.escrow, 'MilestoneDisputed').withArgs(0, 0, ctx.client.address, 'Not what we agreed');
      return ctx;
    }

    it('freezes the milestone until the arbiter decides', async () => {
      const { escrow, client, freelancer, stranger } = await disputed();
      expect((await escrow.getMilestone(0, 0)).status).to.equal(S.Disputed);
      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await expect(escrow.connect(freelancer).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
      await time.increase(30 * DAY);
      await expect(escrow.connect(stranger).releaseMilestone(0, 0)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
    });

    it('arbiter can pay the freelancer and emits events', async () => {
      const { escrow, usdc, freelancer, arbiter } = await disputed();
      await expect(escrow.connect(arbiter).resolveDispute(0, 0, true))
        .to.emit(escrow, 'DisputeResolved').withArgs(0, 0, arbiter.address, true, USDC(100))
        .and.to.emit(escrow, 'MilestoneReleased').withArgs(0, 0, USDC(100));
      expect(await usdc.balanceOf(freelancer.address)).to.equal(USDC(100));
      expect((await escrow.getEscrow(0)).releasedAmount).to.equal(USDC(100));
      expect((await escrow.getMilestone(0, 0)).status).to.equal(S.Released);
      await expect(escrow.connect(arbiter).resolveDispute(0, 0, true)).to.be.revertedWithCustomError(escrow, 'InvalidStatus');
    });

    it('arbiter can refund the client', async () => {
      const { escrow, usdc, client, arbiter } = await disputed();
      const before = await usdc.balanceOf(client.address);
      await expect(escrow.connect(arbiter).resolveDispute(0, 0, false))
        .to.emit(escrow, 'DisputeResolved').withArgs(0, 0, arbiter.address, false, USDC(100));
      expect(await usdc.balanceOf(client.address)).to.equal(before + USDC(100));
      expect((await escrow.getEscrow(0)).releasedAmount).to.equal(0);
      expect((await escrow.getMilestone(0, 0)).status).to.equal(S.Released);
    });

    it('a new arbiter takes over after setArbiter', async () => {
      const { escrow, owner, arbiter, other } = await disputed();
      await escrow.connect(owner).setArbiter(other.address);
      await expect(escrow.connect(arbiter).resolveDispute(0, 0, true)).to.be.revertedWithCustomError(escrow, 'NotAuthorized');
      await expect(escrow.connect(other).resolveDispute(0, 0, true)).to.emit(escrow, 'DisputeResolved');
    });

    it('only unreleased milestones with the right status can be resolved', async () => {
      const ctx = await loadFixture(deployFixture);
      await createDefault(ctx);
      await expect(ctx.escrow.connect(ctx.arbiter).resolveDispute(0, 0, true)).to.be.revertedWithCustomError(ctx.escrow, 'InvalidStatus');
      await expect(ctx.escrow.connect(ctx.arbiter).resolveDispute(3, 0, true)).to.be.revertedWithCustomError(ctx.escrow, 'NotFound');
    });
  });

  describe('pause', () => {
    it('blocks new escrows but never blocks releases or resolution', async () => {
      const ctx = await loadFixture(deployFixture);
      const { escrow, owner, client, freelancer, usdc } = ctx;
      await createDefault(ctx);
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await escrow.connect(client).approveMilestone(0, 0);
      await escrow.connect(owner).pause();
      await usdc.connect(client).approve(await escrow.getAddress(), USDC(5));
      await expect(escrow.connect(client).createEscrow(freelancer.address, await usdc.getAddress(), 'T', [{ amount: USDC(5), description: 'a' }], 7)).to.be.revertedWithCustomError(escrow, 'EnforcedPause');
      await expect(escrow.connect(client).releaseMilestone(0, 0)).to.emit(escrow, 'MilestoneReleased');
      await escrow.connect(owner).unpause();
      await expect(escrow.connect(client).createEscrow(freelancer.address, await usdc.getAddress(), 'T', [{ amount: USDC(5), description: 'a' }], 7)).to.emit(escrow, 'EscrowCreated');
    });
  });

  describe('reentrancy', () => {
    async function malicious() {
      const [owner, client, freelancer, arbiter] = await ethers.getSigners();
      const bad = await (await ethers.getContractFactory('ReentrantERC20')).deploy();
      const eurc = await (await ethers.getContractFactory('MockERC20')).deploy('Euro Coin', 'EURC');
      const escrow = await (await ethers.getContractFactory('ArcLanceEscrow')).deploy(owner.address, await bad.getAddress(), await eurc.getAddress(), arbiter.address);
      await bad.mint(client.address, USDC(1000));
      await bad.connect(client).approve(await escrow.getAddress(), USDC(1000));
      await escrow.connect(client).createEscrow(freelancer.address, await bad.getAddress(), 'T', [{ amount: USDC(100), description: 'a' }, { amount: USDC(100), description: 'b' }], 7);
      return { bad, escrow, client, freelancer };
    }

    it('release cannot be re-entered from a token callback and pays exactly once', async () => {
      const { bad, escrow, client, freelancer } = await malicious();
      await escrow.connect(freelancer).markDelivered(0, 0, 'x');
      await escrow.connect(client).approveMilestone(0, 0);
      await bad.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData('releaseMilestone', [0, 0]));
      await escrow.connect(client).releaseMilestone(0, 0);
      expect(await bad.attempted()).to.equal(true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect((await bad.lastReturn()).slice(0, 10)).to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
      expect(await bad.balanceOf(freelancer.address)).to.equal(USDC(100));
      expect(await bad.balanceOf(await escrow.getAddress())).to.equal(USDC(100));
    });

    it('createEscrow cannot be re-entered while pulling funds', async () => {
      const { bad, escrow, client, freelancer } = await malicious();
      const data = escrow.interface.encodeFunctionData('createEscrow', [freelancer.address, await bad.getAddress(), 'T2', [{ amount: USDC(1), description: 'a' }], 7]);
      await bad.arm(await escrow.getAddress(), data);
      await escrow.connect(client).createEscrow(freelancer.address, await bad.getAddress(), 'T3', [{ amount: USDC(10), description: 'a' }], 7);
      expect(await bad.attempted()).to.equal(true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect(await escrow.escrowCount()).to.equal(2);
    });

    it('resolveDispute cannot be re-entered', async () => {
      const { bad, escrow, client, freelancer } = await malicious();
      const [, , , arbiter] = await ethers.getSigners();
      await escrow.connect(client).disputeMilestone(0, 0, 'bad');
      await bad.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData('resolveDispute', [0, 0, true]));
      await escrow.connect(arbiter).resolveDispute(0, 0, true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect(await bad.balanceOf(freelancer.address)).to.equal(USDC(100));
    });
  });
});
