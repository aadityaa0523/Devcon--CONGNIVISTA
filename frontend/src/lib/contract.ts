import { ethers } from "ethers";

const CONTRACT_ABI = [
  "function registerBiometric(bytes32 commitmentHash) external",
  "function reVerifyBiometric(bytes32 freshCommitmentHash) external returns (bool)",
  "function owner() external view returns (address)",
  "function biometricCommitmentHash() external view returns (bytes32)",
  "function registerSessionKey(address sessionKeyAddr) external",
  "function revokeSessionKey(address sessionKeyAddr) external",
  "function sessionKeys(address) external view returns (tuple(uint256 expiry, bool revoked))",
  "function execute(address to, uint256 value, bytes calldata data) external payable returns (bytes memory)",
  "function addGuardian(bytes32 guardianCommitment) external",
  "function removeGuardian(bytes32 guardianCommitment) external",
  "function guardianCommitments(bytes32) external view returns (bool)",
  "function requestRecovery(address proposedNewOwner, bytes32 salt) external",
  "function confirmRecovery(bytes32 salt) external",
  "function executeRecovery() external",
  "function cancelRecovery(bytes32 freshCommitmentHash) external",
  "function recoveryRequestTime() external view returns (uint256)",
  "function pendingNewOwner() external view returns (address)",
  "event BiometricRegistered(address indexed owner, bytes32 commitmentHash, uint256 timestamp)",
  "event SessionKeyRegistered(address indexed sessionKey, uint256 expiry)",
  "event TransactionExecuted(address indexed executor, address indexed to, uint256 value, bytes data)",
  "event RecoveryRequested(uint256 requestTime, uint256 executeAfter)",
  "event RecoveryExecuted(address indexed oldOwner, address indexed newOwner)",
];

export function getVoxVaultContract(
  addressOrSigner: string | ethers.Signer,
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  const contractAddress =
    typeof addressOrSigner === "string" ? addressOrSigner : "";
  const signerOrProviderArg = typeof addressOrSigner === "string" ? signerOrProvider : addressOrSigner;

  if (!contractAddress && typeof addressOrSigner !== "string") {
    throw new Error("Contract address must be provided");
  }

  if (!signerOrProviderArg) {
    throw new Error("Signer or provider must be provided");
  }

  return new ethers.Contract(
    contractAddress,
    CONTRACT_ABI,
    signerOrProviderArg
  );
}

export async function registerBiometric(
  contract: ethers.Contract,
  commitmentHash: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.registerBiometric(commitmentHash);
    return tx;
  } catch (error) {
    console.error("Failed to register biometric:", error);
    throw error;
  }
}

export async function reVerifyBiometric(
  contract: ethers.Contract,
  commitmentHash: string
): Promise<boolean> {
  try {
    const result = await contract.reVerifyBiometric(commitmentHash);
    return result;
  } catch (error) {
    console.error("Failed to re-verify biometric:", error);
    throw error;
  }
}

export async function registerSessionKey(
  contract: ethers.Contract,
  sessionKeyAddress: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.registerSessionKey(sessionKeyAddress);
    return tx;
  } catch (error) {
    console.error("Failed to register session key:", error);
    throw error;
  }
}

export async function revokeSessionKey(
  contract: ethers.Contract,
  sessionKeyAddress: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.revokeSessionKey(sessionKeyAddress);
    return tx;
  } catch (error) {
    console.error("Failed to revoke session key:", error);
    throw error;
  }
}

export async function getSessionKeyInfo(
  contract: ethers.Contract,
  sessionKeyAddress: string
): Promise<{ expiry: bigint; revoked: boolean }> {
  try {
    const info = await contract.sessionKeys(sessionKeyAddress);
    return {
      expiry: info[0],
      revoked: info[1],
    };
  } catch (error) {
    console.error("Failed to get session key info:", error);
    throw error;
  }
}

export async function executeTransaction(
  contract: ethers.Contract,
  to: string,
  value: bigint,
  data: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.execute(to, value, data);
    return tx;
  } catch (error) {
    console.error("Failed to execute transaction:", error);
    throw error;
  }
}

export async function addGuardian(
  contract: ethers.Contract,
  guardianCommitment: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.addGuardian(guardianCommitment);
    return tx;
  } catch (error) {
    console.error("Failed to add guardian:", error);
    throw error;
  }
}

export async function removeGuardian(
  contract: ethers.Contract,
  guardianCommitment: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.removeGuardian(guardianCommitment);
    return tx;
  } catch (error) {
    console.error("Failed to remove guardian:", error);
    throw error;
  }
}

export async function requestRecovery(
  contract: ethers.Contract,
  proposedNewOwner: string,
  salt: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.requestRecovery(proposedNewOwner, salt);
    return tx;
  } catch (error) {
    console.error("Failed to request recovery:", error);
    throw error;
  }
}

export async function confirmRecovery(
  contract: ethers.Contract,
  salt: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.confirmRecovery(salt);
    return tx;
  } catch (error) {
    console.error("Failed to confirm recovery:", error);
    throw error;
  }
}

export async function executeRecovery(
  contract: ethers.Contract
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.executeRecovery();
    return tx;
  } catch (error) {
    console.error("Failed to execute recovery:", error);
    throw error;
  }
}

export async function cancelRecovery(
  contract: ethers.Contract,
  commitmentHash: string
): Promise<ethers.ContractTransactionResponse | null> {
  try {
    const tx = await contract.cancelRecovery(commitmentHash);
    return tx;
  } catch (error) {
    console.error("Failed to cancel recovery:", error);
    throw error;
  }
}

export async function getOwner(contract: ethers.Contract): Promise<string> {
  try {
    return await contract.owner();
  } catch (error) {
    console.error("Failed to get owner:", error);
    throw error;
  }
}

export async function getBiometricCommitmentHash(
  contract: ethers.Contract
): Promise<string> {
  try {
    return await contract.biometricCommitmentHash();
  } catch (error) {
    console.error("Failed to get biometric commitment hash:", error);
    throw error;
  }
}

export async function isGuardian(
  contract: ethers.Contract,
  commitment: string
): Promise<boolean> {
  try {
    return await contract.guardianCommitments(commitment);
  } catch (error) {
    console.error("Failed to check if guardian:", error);
    throw error;
  }
}

export async function getRecoveryStatus(
  contract: ethers.Contract
): Promise<{
  requestTime: bigint;
  pendingNewOwner: string;
  isActive: boolean;
}> {
  try {
    const requestTime = await contract.recoveryRequestTime();
    const pendingNewOwner = await contract.pendingNewOwner();
    return {
      requestTime,
      pendingNewOwner,
      isActive: requestTime > BigInt(0),
    };
  } catch (error) {
    console.error("Failed to get recovery status:", error);
    throw error;
  }
}
