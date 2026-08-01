import { ethers } from "ethers";
import VoxVaultAbi from "../abi/VoxVault.json";

/**
 * The ABI is generated — `npm run compile -w contracts` writes
 * src/abi/VoxVault.json via the postcompile hook. Never hand-edit it, and never
 * hand-maintain a parallel copy: an earlier revision did, and it drifted out of
 * sync with the contract within a day.
 */
export const VOX_VAULT_ABI = VoxVaultAbi;

export function getVoxVaultContract(
  address: string,
  runner: ethers.Signer | ethers.Provider
): ethers.Contract {
  if (!address || !ethers.isAddress(address)) {
    throw new Error(
      `VITE_CONTRACT_ADDRESS is missing or malformed: ${JSON.stringify(address)}`
    );
  }
  return new ethers.Contract(address, VOX_VAULT_ABI, runner);
}

/** Guardian commitments are keccak256(abi.encodePacked(address, salt)). */
export function computeGuardianCommitment(
  guardianAddress: string,
  salt: string
): string {
  return ethers.solidityPackedKeccak256(
    ["address", "bytes32"],
    [guardianAddress, salt]
  );
}

/** Fresh 32-byte salt, shared with a guardian out-of-band. */
export function generateGuardianSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export interface SessionKeyInfo {
  expiry: bigint;
  revoked: boolean;
}

export interface RecoveryStatus {
  requestTime: bigint;
  pendingNewOwner: string;
  confirmations: number;
  isActive: boolean;
}

export async function getOwner(contract: ethers.Contract): Promise<string> {
  return contract.owner();
}

export async function getBiometricCommitment(
  contract: ethers.Contract
): Promise<string> {
  return contract.biometricCommitmentHash();
}

export async function getSessionKeyInfo(
  contract: ethers.Contract,
  sessionKeyAddress: string
): Promise<SessionKeyInfo> {
  const info = await contract.sessionKeys(sessionKeyAddress);
  return { expiry: info[0], revoked: info[1] };
}

export async function getRecoveryStatus(
  contract: ethers.Contract
): Promise<RecoveryStatus> {
  const [requestTime, pendingNewOwner, confirmations] = await Promise.all([
    contract.recoveryRequestTime(),
    contract.pendingNewOwner(),
    contract.recoveryConfirmations(),
  ]);

  return {
    requestTime,
    pendingNewOwner,
    confirmations: Number(confirmations),
    isActive: requestTime > 0n,
  };
}

export async function getRecoveryTimelock(
  contract: ethers.Contract
): Promise<bigint> {
  return contract.recoveryTimelock();
}

export interface ChallengeState {
  challenge: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  isActive: boolean;
}

export async function getChallengeState(
  contract: ethers.Contract
): Promise<ChallengeState> {
  const [challenge, issuedAt, ttl] = await Promise.all([
    contract.currentChallenge(),
    contract.challengeIssuedAt(),
    contract.CHALLENGE_TTL(),
  ]);

  const expiresAt = issuedAt === 0n ? 0n : issuedAt + ttl;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  return {
    challenge,
    issuedAt,
    expiresAt,
    isActive: challenge !== 0n && expiresAt > nowSeconds,
  };
}
