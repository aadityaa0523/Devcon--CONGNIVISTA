import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  getVoxVaultContract,
  getOwner,
  getBiometricCommitment,
  getRecoveryStatus,
  getRecoveryTimelock,
  getChallengeState,
  type RecoveryStatus,
  type ChallengeState,
} from "../lib/contract";
import { describeTxError } from "../lib/errors";
import { useWallet } from "./useWallet";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as string;

export function useVoxVaultContract() {
  const { address, isConnected, isSepoliaNetwork } = useWallet();

  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [timelock, setTimelock] = useState<bigint | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the contract instance whenever the connected account changes. Doing
  // this in an effect rather than useMemo because getting a signer is async.
  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (!isConnected || !window.ethereum) {
        setContract(null);
        return;
      }
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        if (cancelled) return;
        setContract(getVoxVaultContract(CONTRACT_ADDRESS, signer));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setContract(null);
        setError(describeTxError(err));
      }
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const refresh = useCallback(async () => {
    if (!contract) return;
    setIsLoading(true);
    setError(null);
    try {
      const [
        nextOwner,
        nextCommitment,
        nextRecovery,
        nextTimelock,
        nextChallenge,
      ] = await Promise.all([
        getOwner(contract),
        getBiometricCommitment(contract),
        getRecoveryStatus(contract),
        getRecoveryTimelock(contract),
        getChallengeState(contract),
      ]);
      setOwner(nextOwner);
      setCommitment(nextCommitment);
      setRecovery(nextRecovery);
      setTimelock(nextTimelock);
      setChallenge(nextChallenge);
    } catch (err) {
      setError(
        `Could not read the contract — is VITE_CONTRACT_ADDRESS pointing at a deployed VoxVault on this network? (${
          describeTxError(err)
        })`
      );
    } finally {
      setIsLoading(false);
    }
  }, [contract]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Wrap a write call so transactions are awaited and errors surface as text. */
  const send = useCallback(
    async (
      run: (c: ethers.Contract) => Promise<ethers.ContractTransactionResponse>
    ): Promise<ethers.ContractTransactionReceipt | null> => {
      if (!contract) throw new Error("Wallet not connected");
      setError(null);
      const tx = await run(contract);
      const receipt = await tx.wait();
      await refresh();
      return receipt;
    },
    [contract, refresh]
  );

  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  return {
    contract,
    contractAddress: CONTRACT_ADDRESS,
    owner,
    commitment,
    recovery,
    timelock,
    challenge,
    isOwner,
    isConnected,
    isSepoliaNetwork,
    isLoading,
    error,
    refresh,
    send,
  };
}
