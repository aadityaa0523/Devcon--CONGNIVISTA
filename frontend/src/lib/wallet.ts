import { ethers, BrowserProvider } from "ethers";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

export interface ConnectWalletResult {
  address: string;
  chainId: number;
  provider: BrowserProvider;
  signer: ethers.Signer;
}

export async function connectWallet(): Promise<ConnectWalletResult> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const address = accounts[0];
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Check network
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    // Switch to Sepolia if not on it
    if (chainId !== SEPOLIA_CHAIN_ID) {
      await switchToSepolia();
    }

    return {
      address,
      chainId,
      provider,
      signer,
    };
  } catch (error) {
    throw new Error(`Failed to connect wallet: ${error}`);
  }
}

export async function switchToSepolia(): Promise<void> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }

  try {
    // Try to switch to Sepolia
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    // If chain not added, add it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID_HEX,
              chainName: "Sepolia Testnet",
              rpcUrls: [
                "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
                "https://1rpc.io/sep",
              ],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
              nativeCurrency: {
                name: "ETH",
                symbol: "ETH",
                decimals: 18,
              },
            },
          ],
        });
      } catch (addError) {
        throw new Error(`Failed to add Sepolia network: ${addError}`);
      }
    } else {
      throw new Error(`Failed to switch to Sepolia: ${error}`);
    }
  }
}

export function listenForAccountChanges(callback: (accounts: string[]) => void): void {
  // `on` is part of EIP-1193 but optional in ethers' Eip1193Provider type, and
  // genuinely absent in some injected wallets — so it is checked, not asserted.
  window.ethereum?.on?.("accountsChanged", callback as (...args: never[]) => void);
}

export function listenForChainChanges(callback: (chainId: string) => void): void {
  window.ethereum?.on?.("chainChanged", callback as (...args: never[]) => void);
}

export async function getCurrentAccount(): Promise<string | null> {
  if (!window.ethereum) {
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_accounts",
    });
    return accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error("Failed to get current account:", error);
    return null;
  }
}

export async function getChainId(): Promise<number> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }

  const chainIdHex = await window.ethereum.request({
    method: "eth_chainId",
  });

  return parseInt(chainIdHex, 16);
}
