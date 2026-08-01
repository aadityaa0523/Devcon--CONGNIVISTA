/**
 * Commitment hashing.
 *
 * Uses `ethers.sha256` rather than Node's `crypto`, which does not bundle into a
 * browser build under Vite without a polyfill. The output is a 0x-prefixed
 * 32-byte hex string, directly usable as a Solidity `bytes32`.
 *
 * What this hash is FOR: a tamper-evident record that an enrolment happened.
 * What it is NOT for: verification. Two recordings never hash alike, so nothing
 * on-chain compares hashes for equality. See the trust model note in VoxVault.sol.
 */

import { ethers } from "ethers";
import { quantizeToBinary, quantizeToInt8 } from "./quantization";

/** Convert bytes to the 0x-prefixed hex string ethers expects. */
export function toHex(data: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < data.length; i++) {
    hex += data[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** SHA-256 over raw bytes, returned as a bytes32 hex string. */
export function sha256Commitment(data: Uint8Array): string {
  if (data.length === 0) {
    throw new Error("Refusing to hash an empty buffer");
  }
  return ethers.sha256(toHex(data));
}

/**
 * Commitment for on-chain storage, derived from the INT8-quantised vector.
 *
 * INT8 rather than binary because it retains more of the original signal, and the
 * hash costs the same 32 bytes on-chain either way.
 */
export function commitmentFromFeatures(features: Float32Array): string {
  return sha256Commitment(quantizeToInt8(features));
}

/**
 * Commitment over the binary-quantised vector — 48 dims collapse to 6 bytes
 * before hashing. Shown in the UI to make the compression story concrete.
 */
export function binaryCommitmentFromFeatures(features: Float32Array): string {
  return sha256Commitment(quantizeToBinary(features));
}

/**
 * Commitment binding the voice to a specific liveness challenge.
 *
 * Hashing the quantised vector together with the challenge means the value
 * published on-chain is unique to that challenge. Two answers to two different
 * challenges produce unrelated commitments even from identical audio, so an
 * observer cannot tell that the same recording was submitted twice — and a
 * commitment captured from one round is meaningless in the next.
 */
export function commitmentFromFeaturesAndChallenge(
  features: Float32Array,
  challenge: number | string
): string {
  const quantised = quantizeToInt8(features);
  const challengeBytes = ethers.toUtf8Bytes(String(challenge));

  const combined = new Uint8Array(quantised.length + challengeBytes.length);
  combined.set(quantised, 0);
  combined.set(challengeBytes, quantised.length);

  return sha256Commitment(combined);
}
