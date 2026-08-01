import { useState, useMemo, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import * as contractLib from "../lib/contract";
import { useWallet } from "./useWallet";
import type { ContractState } from "../types";

export function useVoxVaultContract() {
  const { address, isConnected } = useWallet();
  const [state, setState] = useState<ContractState>({
    isLoading: false,
    owner: null,
    biometricCommitmentHash: null,
    error: null,
  });

  // Contract address from env
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string;

  // Get provider from window
  const provider = useMemo(() => {
    if (!window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  // Get signer
  const signer = useMemo(async () => {
    if (!provider) return null;
    try {
      return await provider.getSigner();
    } catch {
      return null;
    }
  }, [provider]);

  // Contract instance
  const contract = useMemo(() => {
    if (!contractAddress || !signer) return null;
    try {
      return contractLib.getVoxVaultContract(contractAddress, signer as any);
    } catch (err) {
      console.error("Failed to instantiate contract:", err);
      return null;
    }
  }, [contractAddress, signer]);

  // Fetch owner and biometric commitment hash
  const refreshContractState = useCallback(async () => {
    if (!contract) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const owner = await contractLib.getOwner(contract);
      const commitmentHash = await contractLib.getBiometricCommitmentHash(contract);

      setState({
        isLoading: false,
        owner,
        biometricCommitmentHash: commitmentHash,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch contract state",
      }));
    }
  }, [contract]);

  // Refresh on component mount and when contract changes
  useEffect(() => {
    refreshContractState();
  }, [refreshContractState]);

  // Wrapper functions
  const registerBiometric = useCallback(
    async (commitmentHash: string) => {
      if (!contract) throw new Error("Contract not available");
      return contractLib.registerBiometric(contract, commitmentHash);
    },
    [contract]
  );

  const reVerifyBiometric = useCallback(
    async (commitmentHash: string) => {
      if (!contract) throw new Error("Contract not available");
      return contractLib.reVerifyBiometric(contract, commitmentHash);
    },
    [contract]
  );

  const registerSessionKey = useCallback(
    async (sessionKeyAddress: string) => {
      if (!contract) throw new Error("Contract not available");
      return contractLib.registerSessionKey(contract, sessionKeyAddress);
    },
    [contract]
  );

  const executeTransaction = useCallback(
    async (to: string, value: bigint, data: string) => {
      if (!contract) throw new Error("Contract not available");
      return contractLib.executeTransaction(contract, to, value, data);
    },
    [contract]
  );

  return {
    ...state,
    contract,
    contractAddress,
    isConnected,
    isOwner: address?.toLowerCase() === state.owner?.toLowerCase(),
    refreshContractState,
    registerBiometric,
    reVerifyBiometric,
    registerSessionKey,
    executeTransaction,
  };
}
