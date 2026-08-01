import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import * as walletLib from "../lib/wallet";
import type { WalletState } from "../types";

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: 0,
    isConnected: false,
    isSepoliaNetwork: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await walletLib.connectWallet();
      setState({
        address: result.address,
        chainId: result.chainId,
        isConnected: true,
        isSepoliaNetwork: result.chainId === walletLib.SEPOLIA_CHAIN_ID,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchToSepolia = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await walletLib.switchToSepolia();
      setState((prev) => ({
        ...prev,
        isSepoliaNetwork: true,
        chainId: walletLib.SEPOLIA_CHAIN_ID,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network switch failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check if already connected on mount
    walletLib.getCurrentAccount().then((account) => {
      if (account) {
        walletLib.getChainId().then((chainId) => {
          setState({
            address: account,
            chainId,
            isConnected: true,
            isSepoliaNetwork: chainId === walletLib.SEPOLIA_CHAIN_ID,
          });
        });
      }
    });

    // Listen for account/chain changes
    walletLib.listenForAccountChanges((accounts) => {
      if (accounts.length === 0) {
        setState({
          address: null,
          chainId: 0,
          isConnected: false,
          isSepoliaNetwork: false,
        });
      } else {
        setState((prev) => ({ ...prev, address: accounts[0] }));
      }
    });

    walletLib.listenForChainChanges((chainId) => {
      const chainIdNum = parseInt(chainId, 16);
      setState((prev) => ({
        ...prev,
        chainId: chainIdNum,
        isSepoliaNetwork: chainIdNum === walletLib.SEPOLIA_CHAIN_ID,
      }));
    });
  }, []);

  return {
    ...state,
    connect,
    switchToSepolia,
    isLoading,
    error,
  };
}
