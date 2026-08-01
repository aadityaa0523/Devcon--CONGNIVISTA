import { ethers } from "ethers";

/**
 * Convert a Uint8Array to a bytes32 hex string compatible with Solidity
 */
export function uint8ArrayToBytes32(data: Uint8Array): string {
  if (data.length !== 32) {
    throw new Error(`Expected 32 bytes, got ${data.length}`);
  }
  return "0x" + Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 commitment hash from a Uint8Array
 * Uses ethers.js sha256 which is browser-compatible
 */
export function sha256Commitment(data: Uint8Array): string {
  // Convert Uint8Array to 0x-prefixed hex string for ethers.sha256
  const hexString = "0x" + Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ethers.sha256(hexString);
}

/**
 * Hash a feature vector for on-chain commitment
 */
export function hashFeatureVector(quantizedVector: Uint8Array): string {
  return sha256Commitment(quantizedVector);
}

/**
 * Verify that a fresh capture matches an enrollment (simple equality check)
 * Note: This is deterministic SHA-256 matching, which is fragile in practice
 * for real biometric matching. In production, use fuzzy matching (Hamming distance)
 * on the client-side before calling this.
 */
export function verifyExactMatch(enrollmentHash: string, freshHash: string): boolean {
  return enrollmentHash.toLowerCase() === freshHash.toLowerCase();
}
