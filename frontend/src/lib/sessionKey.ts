import { ethers } from "ethers";

/**
 * Session key management for VoxVault
 * Stores ephemeral keypairs for signature-free transactions
 * Uses sessionStorage (not localStorage) to minimize XSS exposure window
 */

const SESSION_KEY_STORAGE_KEY = "voxvault_session_key";
const SESSION_EXPIRY_STORAGE_KEY = "voxvault_session_expiry";

export interface SessionKeyData {
  address: string;
  privateKey: string;
  expiry: number;
  createdAt: number;
}

/**
 * Generate a new random session key
 */
export function generateSessionKey(): { wallet: ethers.Wallet; address: string } {
  const wallet = ethers.Wallet.createRandom();
  return {
    wallet,
    address: wallet.address,
  };
}

/**
 * Save session key to sessionStorage (ephemeral, cleared on tab close)
 */
export function saveSessionKey(
  privateKey: string,
  expiryTime: number
): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    throw new Error("sessionStorage not available");
  }

  const data: SessionKeyData = {
    address: ethers.Wallet.fromPrivateKey(privateKey).address,
    privateKey,
    expiry: expiryTime,
    createdAt: Date.now(),
  };

  window.sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Load session key from sessionStorage
 */
export function loadSessionKey(): SessionKeyData | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }

  const stored = window.sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as SessionKeyData;
  } catch (error) {
    console.error("Failed to parse stored session key:", error);
    return null;
  }
}

/**
 * Check if a stored session key is still valid (not expired)
 */
export function isSessionKeyValid(): boolean {
  const sessionKey = loadSessionKey();
  if (!sessionKey) {
    return false;
  }

  // Check if expiry time has passed
  const now = Math.floor(Date.now() / 1000); // Convert to seconds
  return sessionKey.expiry > now;
}

/**
 * Get remaining time on session key in seconds
 */
export function getSessionKeyRemainingTime(): number {
  const sessionKey = loadSessionKey();
  if (!sessionKey) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = sessionKey.expiry - now;
  return Math.max(0, remaining);
}

/**
 * Clear stored session key
 */
export function clearSessionKey(): void {
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
  }
}

/**
 * Get a signer from the stored session key
 */
export function getSessionKeySigner(provider: ethers.Provider): ethers.Wallet | null {
  const sessionKey = loadSessionKey();
  if (!sessionKey || !isSessionKeyValid()) {
    return null;
  }

  try {
    return new ethers.Wallet(sessionKey.privateKey, provider);
  } catch (error) {
    console.error("Failed to create wallet from session key:", error);
    return null;
  }
}

/**
 * Format remaining time as a human-readable string
 */
export function formatSessionKeyExpiry(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

/**
 * Get session key statistics (debugging only, never show private key to user)
 */
export function getSessionKeyStats(): {
  address: string | null;
  isValid: boolean;
  remainingSeconds: number;
  createdAtTime: string | null;
} {
  const sessionKey = loadSessionKey();

  if (!sessionKey) {
    return {
      address: null,
      isValid: false,
      remainingSeconds: 0,
      createdAtTime: null,
    };
  }

  return {
    address: sessionKey.address,
    isValid: isSessionKeyValid(),
    remainingSeconds: getSessionKeyRemainingTime(),
    createdAtTime: new Date(sessionKey.createdAt).toLocaleTimeString(),
  };
}

/**
 * Security note for developers:
 * - sessionStorage is cleared when the browser tab is closed
 * - It is NOT safe to store private keys long-term
 * - This implementation is acceptable ONLY for testnet demo purposes
 * - Production implementations should use:
 *   - Hardware wallets (Ledger, Trezor)
 *   - Secure enclave (iOS/Android)
 *   - Message signing schemes without storing private keys
 */
