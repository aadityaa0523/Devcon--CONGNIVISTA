import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { VoxVault } from "../typechain-types";

const SESSION_KEY_DURATION = 30 * 60; // 30 minutes
const RECOVERY_TIMELOCK = 48 * 60 * 60; // 48 hours

/** Guardian commitments are keccak256(abi.encodePacked(address, salt)). */
function guardianCommitment(address: string, salt: string): string {
  return ethers.solidityPackedKeccak256(["address", "bytes32"], [address, salt]);
}

describe("VoxVault", () => {
  let voxVault: VoxVault;
  let owner: HardhatEthersSigner;
  let guardian: HardhatEthersSigner;
  let guardian2: HardhatEthersSigner;
  let sessionKey: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;

  const guardianSalt = ethers.id("guardian-one-salt");
  const guardian2Salt = ethers.id("guardian-two-salt");
  const enrolmentHash = ethers.id("enrolment-commitment");

  beforeEach(async () => {
    [owner, guardian, guardian2, sessionKey, stranger, recipient] =
      await ethers.getSigners();

    const factory = await ethers.getContractFactory("VoxVault");
    voxVault = await factory.deploy(
      owner.address,
      SESSION_KEY_DURATION,
      RECOVERY_TIMELOCK,
      [guardianCommitment(guardian.address, guardianSalt)]
    );
    await voxVault.waitForDeployment();
  });

  describe("deployment", () => {
    it("assigns ownership to the address passed in, not the deployer", async () => {
      // The deploy runs from owner here, but the constructor takes _owner
      // explicitly so a burner key can deploy on behalf of a real owner.
      expect(await voxVault.owner()).to.equal(owner.address);
    });

    it("stores the durations as immutables", async () => {
      expect(await voxVault.sessionKeyDuration()).to.equal(SESSION_KEY_DURATION);
      expect(await voxVault.recoveryTimelock()).to.equal(RECOVERY_TIMELOCK);
    });

    it("registers guardians supplied to the constructor", async () => {
      const commitment = guardianCommitment(guardian.address, guardianSalt);
      expect(await voxVault.guardianCommitments(commitment)).to.equal(true);
      expect(await voxVault.guardianCount()).to.equal(1);
    });

    it("rejects a zero session key duration", async () => {
      const factory = await ethers.getContractFactory("VoxVault");
      await expect(
        factory.deploy(owner.address, 0, RECOVERY_TIMELOCK, [])
      ).to.be.revertedWith("invalid session key duration");
    });
  });

  describe("biometric commitment", () => {
    it("lets the owner register a commitment", async () => {
      await expect(voxVault.connect(owner).registerBiometric(enrolmentHash))
        .to.emit(voxVault, "BiometricRegistered")
        .withArgs(owner.address, enrolmentHash, anyValue);

      expect(await voxVault.biometricCommitmentHash()).to.equal(enrolmentHash);
    });

    it("refuses a zero commitment", async () => {
      await expect(
        voxVault.connect(owner).registerBiometric(ethers.ZeroHash)
      ).to.be.revertedWith("invalid commitment");
    });

    it("rejects registration by anyone but the owner", async () => {
      await expect(
        voxVault.connect(stranger).registerBiometric(enrolmentHash)
      ).to.be.revertedWithCustomError(voxVault, "OwnableUnauthorizedAccount");
    });

    it("records a verification attempt without gating on it", async () => {
      await voxVault.connect(owner).registerBiometric(enrolmentHash);

      // A deliberately non-matching hash still succeeds: the contract logs the
      // client's verdict, it does not adjudicate it. This is the documented
      // trust model, not an oversight.
      const nonMatching = ethers.id("a-completely-different-capture");
      await expect(
        voxVault.connect(owner).recordVerificationAttempt(nonMatching, false)
      )
        .to.emit(voxVault, "BiometricVerificationAttempted")
        .withArgs(nonMatching, false, anyValue);
    });
  });

  describe("session keys", () => {
    it("registers a session key with an expiry one duration ahead", async () => {
      const tx = await voxVault
        .connect(owner)
        .registerSessionKey(sessionKey.address);
      const block = await ethers.provider.getBlock(tx.blockNumber!);

      const info = await voxVault.sessionKeys(sessionKey.address);
      expect(info.expiry).to.equal(BigInt(block!.timestamp + SESSION_KEY_DURATION));
      expect(info.revoked).to.equal(false);
    });

    it("rejects registration by a non-owner", async () => {
      await expect(
        voxVault.connect(stranger).registerSessionKey(sessionKey.address)
      ).to.be.revertedWithCustomError(voxVault, "OwnableUnauthorizedAccount");
    });

    it("lets an active session key execute a transfer", async () => {
      await owner.sendTransaction({
        to: await voxVault.getAddress(),
        value: ethers.parseEther("1"),
      });
      await voxVault.connect(owner).registerSessionKey(sessionKey.address);

      const before = await ethers.provider.getBalance(recipient.address);
      const amount = ethers.parseEther("0.25");

      await expect(
        voxVault.connect(sessionKey).execute(recipient.address, amount, "0x")
      )
        .to.emit(voxVault, "TransactionExecuted")
        .withArgs(sessionKey.address, recipient.address, amount, "0x");

      expect(await ethers.provider.getBalance(recipient.address)).to.equal(
        before + amount
      );
    });

    it("lets one authorisation cover several transactions", async () => {
      await owner.sendTransaction({
        to: await voxVault.getAddress(),
        value: ethers.parseEther("1"),
      });
      await voxVault.connect(owner).registerSessionKey(sessionKey.address);

      // The core UX claim: authorise once, transact repeatedly without re-signing.
      for (let i = 0; i < 3; i++) {
        await expect(
          voxVault
            .connect(sessionKey)
            .execute(recipient.address, ethers.parseEther("0.1"), "0x")
        ).to.emit(voxVault, "TransactionExecuted");
      }
    });

    it("stops accepting the session key once it expires", async () => {
      await owner.sendTransaction({
        to: await voxVault.getAddress(),
        value: ethers.parseEther("1"),
      });
      await voxVault.connect(owner).registerSessionKey(sessionKey.address);

      await time.increase(SESSION_KEY_DURATION + 1);

      await expect(
        voxVault
          .connect(sessionKey)
          .execute(recipient.address, ethers.parseEther("0.1"), "0x")
      ).to.be.revertedWith("not authorized");
    });

    it("honours revocation before expiry", async () => {
      await owner.sendTransaction({
        to: await voxVault.getAddress(),
        value: ethers.parseEther("1"),
      });
      await voxVault.connect(owner).registerSessionKey(sessionKey.address);

      await expect(voxVault.connect(owner).revokeSessionKey(sessionKey.address))
        .to.emit(voxVault, "SessionKeyRevoked")
        .withArgs(sessionKey.address);

      await expect(
        voxVault
          .connect(sessionKey)
          .execute(recipient.address, ethers.parseEther("0.1"), "0x")
      ).to.be.revertedWith("not authorized");
    });

    it("refuses execution from an address that was never a session key", async () => {
      await expect(
        voxVault.connect(stranger).execute(recipient.address, 0, "0x")
      ).to.be.revertedWith("not authorized");
    });
  });

  describe("guardians", () => {
    it("lets the owner add a guardian by commitment", async () => {
      const commitment = guardianCommitment(guardian2.address, guardian2Salt);

      await expect(voxVault.connect(owner).addGuardian(commitment))
        .to.emit(voxVault, "GuardianAdded")
        .withArgs(commitment);

      expect(await voxVault.guardianCommitments(commitment)).to.equal(true);
      expect(await voxVault.guardianCount()).to.equal(2);
    });

    it("rejects guardian management by a non-owner", async () => {
      await expect(
        voxVault
          .connect(stranger)
          .addGuardian(guardianCommitment(stranger.address, guardian2Salt))
      ).to.be.revertedWithCustomError(voxVault, "OwnableUnauthorizedAccount");
    });

    it("never accepts a raw guardian address as a commitment", async () => {
      // Privacy property: only the hash of (address, salt) is ever stored, so a
      // guardian's address cannot be recovered from calldata or storage without
      // knowing the salt.
      const rawAddressAsBytes32 = ethers.zeroPadValue(guardian.address, 32);
      expect(await voxVault.guardianCommitments(rawAddressAsBytes32)).to.equal(
        false
      );
    });

    it("lets the owner remove a guardian", async () => {
      const commitment = guardianCommitment(guardian.address, guardianSalt);
      await expect(voxVault.connect(owner).removeGuardian(commitment))
        .to.emit(voxVault, "GuardianRemoved")
        .withArgs(commitment);

      expect(await voxVault.guardianCommitments(commitment)).to.equal(false);
      expect(await voxVault.guardianCount()).to.equal(0);
    });
  });

  describe("social recovery", () => {
    it("lets a guardian holding the right salt open a recovery", async () => {
      await expect(
        voxVault
          .connect(guardian)
          .requestRecovery(stranger.address, guardianSalt)
      ).to.emit(voxVault, "RecoveryRequested");

      expect(await voxVault.pendingNewOwner()).to.equal(stranger.address);
      expect(await voxVault.recoveryRequestTime()).to.be.greaterThan(0);
    });

    it("rejects a caller who is not a guardian", async () => {
      await expect(
        voxVault
          .connect(stranger)
          .requestRecovery(stranger.address, guardianSalt)
      ).to.be.revertedWith("not a guardian");
    });

    it("rejects a genuine guardian presenting the wrong salt", async () => {
      // The salt is shared out-of-band; without it the commitment cannot be
      // reproduced, so guardianship cannot be proven.
      await expect(
        voxVault
          .connect(guardian)
          .requestRecovery(stranger.address, ethers.id("wrong-salt"))
      ).to.be.revertedWith("not a guardian");
    });

    it("refuses to execute before the timelock has elapsed", async () => {
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      await time.increase(RECOVERY_TIMELOCK - 60); // one minute short

      await expect(voxVault.executeRecovery()).to.be.revertedWith(
        "timelock not elapsed"
      );
    });

    it("transfers ownership once the timelock has elapsed", async () => {
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      await time.increase(RECOVERY_TIMELOCK + 1);

      await expect(voxVault.executeRecovery())
        .to.emit(voxVault, "RecoveryExecuted")
        .withArgs(owner.address, stranger.address);

      expect(await voxVault.owner()).to.equal(stranger.address);
      expect(await voxVault.recoveryRequestTime()).to.equal(0);
    });

    it("lets the owner cancel a pending recovery", async () => {
      await voxVault.connect(owner).registerBiometric(enrolmentHash);
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      await expect(voxVault.connect(owner).cancelRecovery(enrolmentHash))
        .to.emit(voxVault, "RecoveryCancelled")
        .withArgs(owner.address);

      expect(await voxVault.recoveryRequestTime()).to.equal(0);
      expect(await voxVault.owner()).to.equal(owner.address);
    });

    it("cancels even when the fresh capture hash differs from enrolment", async () => {
      // Regression guard. An earlier revision required freshHash == storedHash
      // here, which no genuine capture could ever satisfy — the owner would have
      // been permanently unable to stop a malicious recovery.
      await voxVault.connect(owner).registerBiometric(enrolmentHash);
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      const differentCapture = ethers.id("a-different-recording-entirely");
      await expect(voxVault.connect(owner).cancelRecovery(differentCapture)).to
        .emit(voxVault, "RecoveryCancelled");

      expect(await voxVault.recoveryRequestTime()).to.equal(0);
    });

    it("does not let a non-owner cancel", async () => {
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      await expect(
        voxVault.connect(guardian).cancelRecovery(enrolmentHash)
      ).to.be.revertedWithCustomError(voxVault, "OwnableUnauthorizedAccount");
    });

    it("rejects a second concurrent recovery request", async () => {
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);

      await expect(
        voxVault
          .connect(guardian)
          .requestRecovery(recipient.address, guardianSalt)
      ).to.be.revertedWith("recovery already pending");
    });

    it("lets the recovered owner cancel a subsequent recovery", async () => {
      // Ownership really moves: the new owner can exercise owner-only functions.
      await voxVault
        .connect(guardian)
        .requestRecovery(stranger.address, guardianSalt);
      await time.increase(RECOVERY_TIMELOCK + 1);
      await voxVault.executeRecovery();

      await voxVault
        .connect(guardian)
        .requestRecovery(recipient.address, guardianSalt);
      await expect(voxVault.connect(stranger).cancelRecovery(enrolmentHash)).to
        .emit(voxVault, "RecoveryCancelled");
    });
  });
});
