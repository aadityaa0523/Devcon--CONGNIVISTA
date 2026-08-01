import type { Eip1193Provider } from "ethers";

/**
 * MetaMask (and other injected wallets) expose an EIP-1193 provider on window.
 * `on`/`removeListener` are not part of Eip1193Provider in ethers' types but are
 * part of the EIP-1193 spec and are what we use for account/chain change events.
 */
declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, handler: (...args: never[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: never[]) => void
      ) => void;
    };
  }
}

export {};
