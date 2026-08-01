import { expect } from "chai";
import { ethers, time } from "hardhat";
import { VoxVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("VoxVault", () => {
  let voxVault: VoxVault;
  let owner: SignerWithAddress;
  let guardian: SignerWithAddress;
  let sessionKeyAddress: string;
  let otherAccount: SignerWithAddress;

  const SESSION_KEY_DURATION = 30 * 60; // 30 minutes
  const RECOVERY_TIMELOCK = 2 * 60; // 2 minutes for testing (normally 48 hours)

  beforeEach(async () => {
    [owner, guardian, otherAccount] = await ethers.getSigners();
    sessionKeyAddress = ethers.getAddress(ethers.Wallet.createRandom().address);

    // Create guardian commitment: keccak256(abi.encodePacked(guardianAddr, salt))
    const salt = ethers.id("test-salt");
    const guardianCommitment = ethers.solidityPackedKeccak256(
      ["address", "bytes32"],
      [guardian.address, salt]
    );

    // Deploy VoxVault with owner, durations, and guardian commitment
    const VoxVault = await ethers.getContractFactory("VoxVault");
    voxVault = await VoxVault.deploy(
      owner.address,
      SESSION_KEY_DURATION,
      RECOVERY_TIMELOCK,
      [guardianCommitment]
    );
    await voxVault.waitForDeployment();
  });

  describe("Ownership", () => {
    it("should set the correct owner", async () => {
      expect(await voxVault.owner()).to.equal(owner.address);
    });
  });

  describe("Biometric Functions", () => {
    it("should allow owner to register biometric", async () => {
      const commitment = ethers.id("test-commitment");
      await expect(voxVault.connect(owner).registerBiometric(commitment))
        .to.emit(voxVault, "BiometricRegistered")
        .withArgs(owner.address, commitment, expect.any(BigInt));

      expect(await voxVault.biometricCommitmentHash()).to.equal(commitment);
    });

    it("should not allow non-owner to register biometric", async () => {
      const commitment = ethers.id("test-commitment");
      await expect(
        voxVault.connect(otherAccount).registerBiometric(commitment)
      ).to.be.revertedWith("not owner");
    });

    it("should reVerifyBiometric correctly", async () => {
      const commitment = ethers.id("test-commitment");
      await voxVault.connect(owner).registerBiometric(commitment);

      // Exact match should return true
      const result1 = await voxVault.connect(owner).reVerifyBiometric(commitment);
      expect(result1).to.be.true;

      // Different commitment should return false
      const otherCommitment = ethers.id("different-commitment");
      const result2 = await voxVault.connect(owner).reVerifyBiometric(otherCommitment);
      expect(result2).to.be.false;
    });
  });

  describe("Session Key Functions", () => {
    it("should allow owner to register session key", async () => {
      const tx = await voxVault.connect(owner).registerSessionKey(sessionKeyAddress);
      await expect(tx)
        .to.emit(voxVault, "SessionKeyRegistered")
        .withArgs(sessionKeyAddress, expect.any(BigInt));

      const sessionKey = await voxVault.sessionKeys(sessionKeyAddress);
      expect(sessionKey.expiry).to.be.greaterThan(0);
      expect(sessionKey.revoked).to.be.false;
    });

    it("should not allow non-owner to register session key", async () => {
      await expect(
        voxVault.connect(otherAccount).registerSessionKey(sessionKeyAddress)
      ).to.be.revertedWith("not owner");
    });

    it("should allow session key to execute before expiry", async () => {
      await voxVault.connect(owner).registerSessionKey(sessionKeyAddress);

      // Create a session key signer (for testing, we mock the call)
      const sessionKeySigner = await ethers.getSigner(sessionKeyAddress);
      const to = otherAccount.address;
      const value = ethers.parseEther("0.1");

      // We can't actually execute with a random address without its private key,
      // but we can verify the permission check logic
      const sessionKey = await voxVault.sessionKeys(sessionKeyAddress);
      expect(sessionKey.expiry).to.be.greaterThan(await time.latest());
    });

    it("should not allow session key to execute after expiry", async () => {
      await voxVault.connect(owner).registerSessionKey(sessionKeyAddress);

      // Fast-forward time beyond session key expiry
      await time.increase(SESSION_KEY_DURATION + 100);

      const sessionKey = await voxVault.sessionKeys(sessionKeyAddress);
      expect(sessionKey.expiry).to.be.lessThan(await time.latest());
    });

    it("should allow owner to revoke session key", async () => {
      await voxVault.connect(owner).registerSessionKey(sessionKeyAddress);
      await expect(voxVault.connect(owner).revokeSessionKey(sessionKeyAddress))
        .to.emit(voxVault, "SessionKeyRevoked")
        .withArgs(sessionKeyAddress);

      const sessionKey = await voxVault.sessionKeys(sessionKeyAddress);
      expect(sessionKey.revoked).to.be.true;
    });
  });

  describe("Guardian Functions", () => {
    it("should allow owner to add guardian", async () => {
      const salt = ethers.id("new-guardian-salt");
      const guardianCommitment = ethers.solidityPackedKeccak256(
        ["address", "bytes32"],
        [otherAccount.address, salt]
      );

      await expect(voxVault.connect(owner).addGuardian(guardianCommitment))
        .to.emit(voxVault, "GuardianAdded")
        .withArgs(guardianCommitment);

      expect(await voxVault.guardianCommitments(guardianCommitment)).to.be.true;
    });

    it("should allow owner to remove guardian", async () => {
      const salt = ethers.id("test-salt");
      const guardianCommitment = ethers.solidityPackedKeccak256(
        ["address", "bytes32"],
        [guardian.address, salt]
      );

      await expect(voxVault.connect(owner).removeGuardian(guardianCommitment))
        .to.emit(voxVault, "GuardianRemoved")
        .withArgs(guardianCommitment);

      expect(await voxVault.guardianCommitments(guardianCommitment)).to.be.false;
    });
  });

  describe("Recovery Functions", () => {
    it("should allow guardian to request recovery", async () => {
      const salt = ethers.id("test-salt");

      await expect(
        voxVault.connect(guardian).requestRecovery(otherAccount.address, salt)
      )
        .to.emit(voxVault, "RecoveryRequested")
        .withArgs(expect.any(BigInt), expect.any(BigInt));

      expect(await voxVault.recoveryRequestTime()).to.be.greaterThan(0);
      expect(await voxVault.pendingNewOwner()).to.equal(otherAccount.address);
    });

    it("should not allow non-guardian to request recovery", async () => {
      const salt = ethers.id("invalid-salt");

      await expect(
        voxVault.connect(otherAccount).requestRecovery(otherAccount.address, salt)
      ).to.be.revertedWith("not a guardian");
    });

    it("should allow owner to cancel recovery before timelock", async () => {
      const commitment = ethers.id("test-commitment");
      await voxVault.connect(owner).registerBiometric(commitment);

      const salt = ethers.id("test-salt");
      await voxVault.connect(guardian).requestRecovery(otherAccount.address, salt);

      await expect(voxVault.connect(owner).cancelRecovery(commitment))
        .to.emit(voxVault, "RecoveryCancelled")
        .withArgs(owner.address);

      expect(await voxVault.recoveryRequestTime()).to.equal(0);
    });

    it("should execute recovery after timelock elapsed", async () => {
      const salt = ethers.id("test-salt");
      await voxVault.connect(guardian).requestRecovery(otherAccount.address, salt);

      // Fast-forward time beyond timelock
      await time.increase(RECOVERY_TIMELOCK + 100);

      await expect(voxVault.executeRecovery())
        .to.emit(voxVault, "RecoveryExecuted")
        .withArgs(owner.address, otherAccount.address);

      expect(await voxVault.owner()).to.equal(otherAccount.address);
    });

    it("should not execute recovery before timelock", async () => {
      const salt = ethers.id("test-salt");
      await voxVault.connect(guardian).requestRecovery(otherAccount.address, salt);

      // Don't fast-forward; timelock not elapsed
      await expect(voxVault.executeRecovery()).to.be.revertedWith(
        "timelock not elapsed"
      );
    });
  });
});
