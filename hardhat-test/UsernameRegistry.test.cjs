const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('UsernameRegistry', function () {
  let registry;
  let alice, bob, carol;

  beforeEach(async function () {
    [alice, bob, carol] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('UsernameRegistry');
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  describe('valid registration, resolve, and nameOf', function () {
    it('registers valid names and resolves both directions', async function () {
      expect(await registry.resolve('alice-dev')).to.equal(ethers.ZeroAddress);
      expect(await registry.nameOf(alice.address)).to.equal('');

      await expect(registry.connect(alice).register('alice-dev'))
        .to.emit(registry, 'NameRegistered')
        .withArgs(alice.address, 'alice-dev');

      expect(await registry.resolve('alice-dev')).to.equal(alice.address);
      expect(await registry.nameOf(alice.address)).to.equal('alice-dev');
    });

    it('accepts boundary lengths (3 and 20 chars) and digits/internal hyphens', async function () {
      await registry.connect(alice).register('a1b');
      expect(await registry.resolve('a1b')).to.equal(alice.address);

      const twentyChars = 'abcde-12345-fghij-90'; // 20 characters
      expect(twentyChars.length).to.equal(20);
      await registry.connect(bob).register(twentyChars);
      expect(await registry.resolve(twentyChars)).to.equal(bob.address);
      expect(await registry.nameOf(bob.address)).to.equal(twentyChars);
    });

    it('returns zero address for unregistered names and empty string for unregistered addresses', async function () {
      expect(await registry.resolve('nobody')).to.equal(ethers.ZeroAddress);
      expect(await registry.nameOf(carol.address)).to.equal('');
    });
  });

  describe('duplicate name rejected', function () {
    it('reverts with NameTaken when another wallet registers an already taken name', async function () {
      await registry.connect(alice).register('freelancer');
      await expect(registry.connect(bob).register('freelancer'))
        .to.be.revertedWithCustomError(registry, 'NameTaken');
    });
  });

  describe('one name per wallet', function () {
    it('reverts with AlreadyHasName when a wallet tries to register a second name', async function () {
      await registry.connect(alice).register('first-name');
      await expect(registry.connect(alice).register('second-name'))
        .to.be.revertedWithCustomError(registry, 'AlreadyHasName');
    });
  });

  describe('invalid characters and lengths rejected', function () {
    it('rejects names shorter than 3 or longer than 20 characters', async function () {
      await expect(registry.connect(alice).register('')).to.be.revertedWithCustomError(registry, 'InvalidName');
      await expect(registry.connect(alice).register('a')).to.be.revertedWithCustomError(registry, 'InvalidName');
      await expect(registry.connect(alice).register('ab')).to.be.revertedWithCustomError(registry, 'InvalidName');
      const twentyOne = 'abcdefghij12345678901'; // 21 characters
      expect(twentyOne.length).to.equal(21);
      await expect(registry.connect(alice).register(twentyOne)).to.be.revertedWithCustomError(registry, 'InvalidName');
    });

    it('rejects names starting or ending with a hyphen', async function () {
      await expect(registry.connect(alice).register('-abc')).to.be.revertedWithCustomError(registry, 'InvalidName');
      await expect(registry.connect(alice).register('abc-')).to.be.revertedWithCustomError(registry, 'InvalidName');
      await expect(registry.connect(alice).register('-a-')).to.be.revertedWithCustomError(registry, 'InvalidName');
      await expect(registry.connect(alice).register('---')).to.be.revertedWithCustomError(registry, 'InvalidName');
    });

    it('rejects uppercase letters, spaces, underscores, @, dots, and non-ASCII characters', async function () {
      const invalidNames = [
        'Alice',
        'ALICE',
        'aliCe',
        'ali_ce',
        '@alice',
        'alice.arc',
        'ali ce',
        'alice!',
        'alïce',
      ];
      for (const bad of invalidNames) {
        await expect(registry.connect(alice).register(bad))
          .to.be.revertedWithCustomError(registry, 'InvalidName');
      }
    });
  });

  describe('release and re-registration', function () {
    it('allows owner to release their name and someone else to re-register it', async function () {
      await registry.connect(alice).register('studio');
      expect(await registry.resolve('studio')).to.equal(alice.address);

      await expect(registry.connect(alice).release())
        .to.emit(registry, 'NameReleased')
        .withArgs(alice.address, 'studio');

      expect(await registry.resolve('studio')).to.equal(ethers.ZeroAddress);
      expect(await registry.nameOf(alice.address)).to.equal('');

      // Someone else can now claim 'studio'
      await expect(registry.connect(bob).register('studio'))
        .to.emit(registry, 'NameRegistered')
        .withArgs(bob.address, 'studio');
      expect(await registry.resolve('studio')).to.equal(bob.address);
      expect(await registry.nameOf(bob.address)).to.equal('studio');

      // And Alice can register a new name after releasing
      await registry.connect(alice).register('alice2');
      expect(await registry.nameOf(alice.address)).to.equal('alice2');
    });

    it('reverts with NoNameRegistered if caller has no registered name', async function () {
      await expect(registry.connect(alice).release())
        .to.be.revertedWithCustomError(registry, 'NoNameRegistered');
    });
  });

  describe('reserved names', function () {
    it('rejects all constructor-reserved names at registration and leaves them unresolved', async function () {
      const reserved = ['arc', 'circle', 'usdc', 'eurc', 'admin', 'support', 'arclance'];
      for (const name of reserved) {
        expect(await registry.isReserved(name)).to.equal(true);
        await expect(registry.connect(alice).register(name))
          .to.be.revertedWithCustomError(registry, 'NameReserved');
        expect(await registry.resolve(name)).to.equal(ethers.ZeroAddress);
      }
    });
  });
});
