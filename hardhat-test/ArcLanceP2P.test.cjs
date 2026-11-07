const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const USDC = (n) => ethers.parseUnits(String(n), 6);
const PRICE = (n) => ethers.parseUnits(String(n), 6); // fiat per 1 USDC, scaled by 1e6
// Order status values
const O = { Created: 0, Paid: 1, Completed: 2, Cancelled: 3, Disputed: 4 };
const SELL = 0;
const BUY = 1;

async function deployFixture() {
  const [owner, seller, buyer, arbiter, stranger, other] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USD Coin', 'USDC');
  const p2p = await (await ethers.getContractFactory('ArcLanceP2P')).deploy(owner.address, await usdc.getAddress(), arbiter.address);
  for (const s of [seller, buyer, other]) {
    await usdc.mint(s.address, USDC(10000));
    await usdc.connect(s).approve(await p2p.getAddress(), ethers.MaxUint256);
  }
  return { p2p, usdc, owner, seller, buyer, arbiter, stranger, other };
}

const adInput = (over = {}) => ({
  side: SELL,
  currency: 'PKR',
  amount: USDC(500),
  price: PRICE(281.5),
  minLimit: USDC(10),
  maxLimit: USDC(200),
  paymentMethods: 3, // bank transfer + JazzCash
  paymentWindowMinutes: 30,
  paymentDetails: 'Testnet demo account 0000',
  ...over,
});

async function sellAd(ctx, over) {
  await ctx.p2p.connect(ctx.seller).createAd(adInput(over));
  return 0;
}

describe('ArcLanceP2P', () => {
  describe('constructor', () => {
    it('stores USDC, owner and arbiter from the constructor', async () => {
      const { p2p, owner, arbiter } = await loadFixture(deployFixture);
      expect(await p2p.owner()).to.equal(owner.address);
      expect(await p2p.arbiter()).to.equal(arbiter.address);
    });

    it('rejects zero addresses', async () => {
      const { usdc, owner, arbiter } = await loadFixture(deployFixture);
      const F = await ethers.getContractFactory('ArcLanceP2P');
      const u = await usdc.getAddress();
      const Z = ethers.ZeroAddress;
      for (const args of [[Z, u, arbiter.address], [owner.address, Z, arbiter.address], [owner.address, u, Z]]) {
        await expect(F.deploy(...args)).to.be.revertedWithCustomError(F, 'InvalidInput');
      }
    });
  });

  describe('createAd', () => {
    it('a sell ad locks USDC and emits AdCreated', async () => {
      const { p2p, usdc, seller } = await loadFixture(deployFixture);
      await expect(p2p.connect(seller).createAd(adInput())).to.emit(p2p, 'AdCreated').withArgs(0, seller.address, SELL, 'PKR', USDC(500), PRICE(281.5));
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(USDC(500));
      expect(await p2p.adCount()).to.equal(1);
      const ad = await p2p.getAd(0);
      expect(ad.owner).to.equal(seller.address);
      expect(ad.remaining).to.equal(USDC(500));
      expect(ad.active).to.equal(true);
      expect(ad.paymentDetails).to.equal('Testnet demo account 0000');
    });

    it('a buy ad locks nothing', async () => {
      const { p2p, usdc, buyer } = await loadFixture(deployFixture);
      await p2p.connect(buyer).createAd(adInput({ side: BUY, currency: 'INR' }));
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(0);
      expect((await p2p.getAd(0)).currency).to.equal('INR');
    });

    it('validates every input, including zero amounts', async () => {
      const { p2p, seller } = await loadFixture(deployFixture);
      const bad = async (over) => expect(p2p.connect(seller).createAd(adInput(over))).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await bad({ amount: 0 });
      await bad({ price: 0 });
      await bad({ minLimit: 0 });
      await bad({ minLimit: USDC(300), maxLimit: USDC(200) });
      await bad({ maxLimit: USDC(501) });
      await bad({ side: 2 });
      await bad({ currency: 'USD' });
      await bad({ currency: '' });
      await bad({ paymentMethods: 0 });
      await bad({ paymentMethods: 64 });
      await bad({ paymentWindowMinutes: 14 });
      await bad({ paymentWindowMinutes: 61 });
      await bad({ paymentDetails: '' });
      await bad({ paymentDetails: 'x'.repeat(501) });
    });

    it('accepts all supported currencies', async () => {
      const { p2p, buyer } = await loadFixture(deployFixture);
      for (const c of ['PKR', 'INR', 'BDT', 'NGN']) await p2p.connect(buyer).createAd(adInput({ side: BUY, currency: c }));
      expect(await p2p.adCount()).to.equal(4);
    });
  });

  describe('happy path', () => {
    it('sell ad: order, paid, confirm releases USDC to the buyer and updates stats', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer } = ctx;
      await sellAd(ctx);
      await expect(p2p.connect(buyer).createOrder(0, USDC(50))).to.emit(p2p, 'OrderCreated').withArgs(0, 0, buyer.address, seller.address, USDC(50));
      let order = await p2p.getOrder(0);
      expect(order.buyer).to.equal(buyer.address);
      expect(order.seller).to.equal(seller.address);
      expect(order.fiatAmount).to.equal(USDC(50) * PRICE(281.5) / 1_000_000n);
      expect(order.status).to.equal(O.Created);
      expect(order.expiresAt - order.createdAt).to.equal(30n * 60n);
      expect((await p2p.getAd(0)).remaining).to.equal(USDC(450));
      expect(await p2p.orderIdsOf(buyer.address)).to.deep.equal([0n]);
      expect(await p2p.orderIdsOf(seller.address)).to.deep.equal([0n]);

      await expect(p2p.connect(buyer).markPaid(0, 'JC-12345')).to.emit(p2p, 'OrderPaid').withArgs(0, 'JC-12345');
      order = await p2p.getOrder(0);
      expect(order.status).to.equal(O.Paid);
      expect(order.paymentReference).to.equal('JC-12345');
      expect(order.paidAt).to.be.gt(0);

      const before = await usdc.balanceOf(buyer.address);
      await expect(p2p.connect(seller).confirmPayment(0)).to.emit(p2p, 'OrderCompleted').withArgs(0);
      expect(await usdc.balanceOf(buyer.address)).to.equal(before + USDC(50));
      expect((await p2p.getOrder(0)).status).to.equal(O.Completed);
      const stats = await p2p.sellerStats(seller.address);
      expect([stats.completedOrders, stats.totalOrders, stats.disputedOrders]).to.deep.equal([1n, 1n, 0n]);
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(USDC(450));
    });

    it('buy ad: the seller who takes the order locks USDC, then confirm pays the ad owner', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer } = ctx;
      await p2p.connect(buyer).createAd(adInput({ side: BUY }));
      const sellerBefore = await usdc.balanceOf(seller.address);
      await expect(p2p.connect(seller).createOrder(0, USDC(40))).to.emit(p2p, 'OrderCreated').withArgs(0, 0, buyer.address, seller.address, USDC(40));
      expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore - USDC(40));
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(USDC(40));
      await p2p.connect(buyer).markPaid(0, 'BANK-1');
      const buyerBefore = await usdc.balanceOf(buyer.address);
      await p2p.connect(seller).confirmPayment(0);
      expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBefore + USDC(40));
      expect((await p2p.sellerStats(seller.address)).completedOrders).to.equal(1);
    });

    it('allows the final dust amount below the minimum', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, buyer } = ctx;
      await sellAd(ctx, { amount: USDC(205), maxLimit: USDC(200) });
      await p2p.connect(buyer).createOrder(0, USDC(200));
      await p2p.connect(buyer).createOrder(0, USDC(5));
      expect((await p2p.getAd(0)).remaining).to.equal(0);
    });
  });

  describe('order validation', () => {
    it('zero, oversized and out-of-range amounts are rejected', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, buyer } = ctx;
      await sellAd(ctx);
      await expect(p2p.connect(buyer).createOrder(0, 0)).to.be.revertedWithCustomError(p2p, 'AdUnavailable');
      await expect(p2p.connect(buyer).createOrder(0, USDC(501))).to.be.revertedWithCustomError(p2p, 'AdUnavailable');
      await expect(p2p.connect(buyer).createOrder(0, USDC(201))).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.connect(buyer).createOrder(0, USDC(9))).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.connect(buyer).createOrder(7, USDC(50))).to.be.revertedWithCustomError(p2p, 'NotFound');
    });

    it('markPaid needs a reference; missing ids revert', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, buyer } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await expect(p2p.connect(buyer).markPaid(0, '')).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.connect(buyer).markPaid(0, 'x'.repeat(101))).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.getOrder(9)).to.be.revertedWithCustomError(p2p, 'NotFound');
      await expect(p2p.getAd(9)).to.be.revertedWithCustomError(p2p, 'NotFound');
    });
  });

  describe('roles', () => {
    it('only the right role can call each function', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, seller, buyer, stranger, arbiter } = ctx;
      await sellAd(ctx);
      await expect(p2p.connect(seller).createOrder(0, USDC(50))).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await expect(p2p.connect(seller).markPaid(0, 'x')).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(stranger).markPaid(0, 'x')).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await p2p.connect(buyer).markPaid(0, 'ref');
      await expect(p2p.connect(buyer).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(stranger).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(stranger).openDispute(0, 'x')).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(stranger).cancelAd(0)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(buyer).cancelAd(0)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(seller).resolveDispute(0, true)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(arbiter).resolveDispute(0, true)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
    });

    it('owner-only admin functions', async () => {
      const { p2p, owner, stranger, other } = await loadFixture(deployFixture);
      await expect(p2p.connect(stranger).setArbiter(other.address)).to.be.revertedWithCustomError(p2p, 'OwnableUnauthorizedAccount');
      await expect(p2p.connect(stranger).pause()).to.be.revertedWithCustomError(p2p, 'OwnableUnauthorizedAccount');
      await expect(p2p.connect(owner).setArbiter(ethers.ZeroAddress)).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.connect(owner).setArbiter(other.address)).to.emit(p2p, 'ArbiterUpdated');
    });

    it('rejects actions in the wrong status', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, seller, buyer } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await expect(p2p.connect(seller).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await expect(p2p.connect(buyer).openDispute(0, 'x')).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await p2p.connect(buyer).markPaid(0, 'ref');
      await expect(p2p.connect(buyer).markPaid(0, 'again')).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await expect(p2p.connect(buyer).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await p2p.connect(seller).confirmPayment(0);
      await expect(p2p.connect(seller).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
    });
  });

  describe('payment window expiry', () => {
    it('before expiry only the buyer can cancel; after expiry anyone can', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer, stranger } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await expect(p2p.connect(stranger).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'WindowNotExpired');
      await expect(p2p.connect(seller).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'WindowNotExpired');
      await time.increase(30 * 60 + 1);
      await expect(p2p.connect(buyer).markPaid(0, 'late')).to.be.revertedWithCustomError(p2p, 'WindowExpired');
      await expect(p2p.connect(stranger).cancelOrder(0)).to.emit(p2p, 'OrderCancelled').withArgs(0);
      expect((await p2p.getOrder(0)).status).to.equal(O.Cancelled);
      // USDC stays locked for the seller on the ad and can be withdrawn with cancelAd
      expect((await p2p.getAd(0)).remaining).to.equal(USDC(500));
      const before = await usdc.balanceOf(seller.address);
      await p2p.connect(seller).cancelAd(0);
      expect(await usdc.balanceOf(seller.address)).to.equal(before + USDC(500));
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(0);
    });

    it('the buyer can cancel before expiry and the amount returns to the ad', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, buyer } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await expect(p2p.connect(buyer).cancelOrder(0)).to.emit(p2p, 'OrderCancelled');
      expect((await p2p.getAd(0)).remaining).to.equal(USDC(500));
    });

    it('paid order cannot be cancelled by expiry', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, seller, buyer, stranger } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await p2p.connect(buyer).markPaid(0, 'ref-123');
      await time.increase(30 * 60 + 1);
      await expect(p2p.connect(stranger).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await expect(p2p.connect(buyer).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      await expect(p2p.connect(seller).cancelOrder(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
      expect((await p2p.getOrder(0)).status).to.equal(O.Paid);
    });

    it('buy ad: funds go straight back to the seller when the buyer never pays', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer, stranger } = ctx;
      await p2p.connect(buyer).createAd(adInput({ side: BUY }));
      const before = await usdc.balanceOf(seller.address);
      await p2p.connect(seller).createOrder(0, USDC(40));
      await time.increase(30 * 60 + 1);
      await p2p.connect(stranger).cancelOrder(0);
      expect(await usdc.balanceOf(seller.address)).to.equal(before);
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(0);
    });

    it('if the ad was cancelled, an expired order refunds the seller directly', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer, stranger } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await p2p.connect(seller).cancelAd(0); // refunds the 450 left; the open order stays escrowed
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(USDC(50));
      await time.increase(30 * 60 + 1);
      const before = await usdc.balanceOf(seller.address);
      await p2p.connect(stranger).cancelOrder(0);
      expect(await usdc.balanceOf(seller.address)).to.equal(before + USDC(50));
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(0);
    });
  });

  describe('ads', () => {
    it('cancelAd refunds the remaining USDC and blocks new orders', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, usdc, seller, buyer } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      const before = await usdc.balanceOf(seller.address);
      await expect(p2p.connect(seller).cancelAd(0)).to.emit(p2p, 'AdCancelled').withArgs(0);
      expect(await usdc.balanceOf(seller.address)).to.equal(before + USDC(450));
      expect((await p2p.getAd(0)).active).to.equal(false);
      await expect(p2p.connect(seller).cancelAd(0)).to.be.revertedWithCustomError(p2p, 'AdUnavailable');
      await expect(p2p.connect(buyer).createOrder(0, USDC(50))).to.be.revertedWithCustomError(p2p, 'AdUnavailable');
      // the open order still completes normally
      await p2p.connect(buyer).markPaid(0, 'ref');
      await p2p.connect(seller).confirmPayment(0);
      expect(await usdc.balanceOf(await p2p.getAddress())).to.equal(0);
    });

    it('pause blocks new ads and orders but not exits', async () => {
      const ctx = await loadFixture(deployFixture);
      const { p2p, owner, seller, buyer } = ctx;
      await sellAd(ctx);
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await p2p.connect(owner).pause();
      await expect(p2p.connect(seller).createAd(adInput())).to.be.revertedWithCustomError(p2p, 'EnforcedPause');
      await expect(p2p.connect(buyer).createOrder(0, USDC(20))).to.be.revertedWithCustomError(p2p, 'EnforcedPause');
      await p2p.connect(buyer).markPaid(0, 'ref');
      await p2p.connect(seller).confirmPayment(0);
      await p2p.connect(seller).cancelAd(0);
      await p2p.connect(owner).unpause();
      await expect(p2p.connect(seller).createAd(adInput())).to.emit(p2p, 'AdCreated');
    });
  });

  describe('disputes', () => {
    async function paidOrder() {
      const ctx = await loadFixture(deployFixture);
      await sellAd(ctx);
      await ctx.p2p.connect(ctx.buyer).createOrder(0, USDC(50));
      await ctx.p2p.connect(ctx.buyer).markPaid(0, 'ref');
      return ctx;
    }

    it('buyer or seller can dispute a paid order, with a reason', async () => {
      const { p2p, buyer, seller } = await paidOrder();
      await expect(p2p.connect(seller).openDispute(0, '')).to.be.revertedWithCustomError(p2p, 'InvalidInput');
      await expect(p2p.connect(seller).openDispute(0, 'No money received')).to.emit(p2p, 'OrderDisputed').withArgs(0, seller.address, 'No money received');
      expect((await p2p.getOrder(0)).status).to.equal(O.Disputed);
      expect((await p2p.sellerStats(seller.address)).disputedOrders).to.equal(1);
      await expect(p2p.connect(buyer).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'NotAuthorized');
      await expect(p2p.connect(seller).confirmPayment(0)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
    });

    it('arbiter releases to the buyer', async () => {
      const { p2p, usdc, buyer, arbiter } = await paidOrder();
      await p2p.connect(buyer).openDispute(0, 'I paid');
      const before = await usdc.balanceOf(buyer.address);
      await expect(p2p.connect(arbiter).resolveDispute(0, true)).to.emit(p2p, 'DisputeResolved').withArgs(0, arbiter.address, true, USDC(50));
      expect(await usdc.balanceOf(buyer.address)).to.equal(before + USDC(50));
      expect((await p2p.getOrder(0)).status).to.equal(O.Completed);
      await expect(p2p.connect(arbiter).resolveDispute(0, true)).to.be.revertedWithCustomError(p2p, 'InvalidStatus');
    });

    it('arbiter returns the USDC to the seller', async () => {
      const { p2p, usdc, buyer, seller, arbiter } = await paidOrder();
      await p2p.connect(seller).openDispute(0, 'Buyer never paid');
      const before = await usdc.balanceOf(seller.address);
      await expect(p2p.connect(arbiter).resolveDispute(0, false)).to.emit(p2p, 'DisputeResolved').withArgs(0, arbiter.address, false, USDC(50));
      expect(await usdc.balanceOf(seller.address)).to.equal(before + USDC(50));
      expect((await p2p.getOrder(0)).status).to.equal(O.Cancelled);
      expect((await p2p.sellerStats(seller.address)).completedOrders).to.equal(0);
      expect(await usdc.balanceOf(buyer.address)).to.equal(USDC(10000));
    });
  });

  describe('reentrancy', () => {
    async function malicious() {
      const [owner, seller, buyer, arbiter] = await ethers.getSigners();
      const bad = await (await ethers.getContractFactory('ReentrantERC20')).deploy();
      const p2p = await (await ethers.getContractFactory('ArcLanceP2P')).deploy(owner.address, await bad.getAddress(), arbiter.address);
      for (const s of [seller, buyer]) {
        await bad.mint(s.address, USDC(1000));
        await bad.connect(s).approve(await p2p.getAddress(), ethers.MaxUint256);
      }
      await p2p.connect(seller).createAd(adInput());
      return { bad, p2p, seller, buyer, arbiter };
    }

    it('confirmPayment cannot be re-entered and pays once', async () => {
      const { bad, p2p, seller, buyer } = await malicious();
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await p2p.connect(buyer).markPaid(0, 'ref');
      await bad.arm(await p2p.getAddress(), p2p.interface.encodeFunctionData('confirmPayment', [0]));
      await p2p.connect(seller).confirmPayment(0);
      expect(await bad.attempted()).to.equal(true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect((await bad.lastReturn()).slice(0, 10)).to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
      expect(await bad.balanceOf(buyer.address)).to.equal(USDC(1050));
      expect(await bad.balanceOf(await p2p.getAddress())).to.equal(USDC(450));
    });

    it('cancelAd cannot be re-entered', async () => {
      const { bad, p2p, seller } = await malicious();
      await bad.arm(await p2p.getAddress(), p2p.interface.encodeFunctionData('cancelAd', [0]));
      await p2p.connect(seller).cancelAd(0);
      expect(await bad.lastSuccess()).to.equal(false);
      expect(await bad.balanceOf(seller.address)).to.equal(USDC(1000));
      expect(await bad.balanceOf(await p2p.getAddress())).to.equal(0);
    });

    it('createAd cannot be re-entered while locking USDC', async () => {
      const { bad, p2p, seller } = await malicious();
      await bad.arm(await p2p.getAddress(), p2p.interface.encodeFunctionData('createAd', [adInput()]));
      await p2p.connect(seller).createAd(adInput({ amount: USDC(300) }));
      expect(await bad.attempted()).to.equal(true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect(await p2p.adCount()).to.equal(2);
    });

    it('resolveDispute cannot be re-entered', async () => {
      const { bad, p2p, seller, buyer, arbiter } = await malicious();
      await p2p.connect(buyer).createOrder(0, USDC(50));
      await p2p.connect(buyer).markPaid(0, 'ref');
      await p2p.connect(seller).openDispute(0, 'x');
      await bad.arm(await p2p.getAddress(), p2p.interface.encodeFunctionData('resolveDispute', [0, true]));
      await p2p.connect(arbiter).resolveDispute(0, true);
      expect(await bad.lastSuccess()).to.equal(false);
      expect(await bad.balanceOf(buyer.address)).to.equal(USDC(1050));
    });
  });
});
