export interface WalletState {
  address: string | null;
  chainId: number;
  isConnected: boolean;
  isSepoliaNetwork: boolean;
}

export interface BiometricState {
  isCapturing: boolean;
  hasEnrolled: boolean;
  enrollmentHash: string | null;
  lastVerificationMatch: boolean;
  error: string | null;
}

export interface SessionKeyState {
  isActive: boolean;
  address: string | null;
  remainingSeconds: number;
  createdAt: number | null;
}

export interface ContractState {
  isLoading: boolean;
  owner: string | null;
  biometricCommitmentHash: string | null;
  error: string | null;
}

export interface TransactionState {
  isLoading: boolean;
  txHash: string | null;
  error: string | null;
  lastTxTime: number | null;
}

export interface GuardianState {
  guardianCommitments: string[];
  salt: string | null;
  isLoading: boolean;
}

export interface RecoveryState {
  isActive: boolean;
  pendingNewOwner: string | null;
  requestTime: number | null;
  timeUntilExecute: number | null;
}
