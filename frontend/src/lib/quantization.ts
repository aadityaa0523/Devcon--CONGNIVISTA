/**
 * Feature vector compression and comparison.
 *
 * Two jobs:
 *   1. Compress the 48-dim float vector for a compact on-chain commitment
 *      (INT8 = 4x smaller, binary = 32x smaller).
 *   2. Compare two captures well enough to decide whether the same person spoke.
 *
 * SCALE NORMALISATION MATTERS. The raw dimensions live on wildly different
 * scales — RMS and zero-crossing rate sit in [0, 1] while spectral centroid runs
 * to several thousand hertz. Mean-threshold binary quantisation over raw values
 * would be decided almost entirely by the centroid dimensions and would discard
 * everything else. So every comparison path normalises by fixed per-dimension
 * divisors first. The divisors are constants, not fitted to data, which keeps the
 * whole pipeline deterministic and reproducible.
 */

import { FEATURE_DIMS } from "./biometrics";

/**
 * Per-dimension divisors, matching the layout emitted by `extractVoiceFeatures`:
 *
 *   dims  0-7   RMS stats              (natural range ~0-1)
 *   dims  8-15  ZCR stats              (natural range ~0-1)
 *   dims 16-23  spectral centroid      (hertz, ~0-8000)
 *   dims 24-31  RMS deltas             (small, ~0-0.5)
 *   dims 32-39  ZCR deltas             (small, ~0-0.5)
 *   dims 40-47  centroid deltas        (hertz, ~0-4000)
 */
const DIMENSION_SCALES: number[] = [
  ...new Array(8).fill(1), // rms
  ...new Array(8).fill(1), // zcr
  ...new Array(8).fill(8000), // centroid (Hz)
  ...new Array(8).fill(0.5), // rms delta
  ...new Array(8).fill(0.5), // zcr delta
  ...new Array(8).fill(4000), // centroid delta (Hz)
];

/**
 * Bring every dimension onto a comparable scale. Must be applied before any
 * quantisation or distance computation.
 */
export function normaliseScale(vector: Float32Array): Float32Array {
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const divisor = DIMENSION_SCALES[i] ?? 1;
    out[i] = vector[i] / divisor;
  }
  return out;
}

/**
 * Quantise to 8 bits per dimension via min-max scaling. 4x smaller than float32.
 * Lossy but order-preserving within the vector.
 */
export function quantizeToInt8(vector: Float32Array): Uint8Array {
  if (vector.length === 0) {
    throw new Error("Cannot quantise an empty feature vector");
  }

  const scaled = normaliseScale(vector);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < scaled.length; i++) {
    if (scaled[i] < min) min = scaled[i];
    if (scaled[i] > max) max = scaled[i];
  }
  const range = max - min || 1; // guard against a constant vector

  const out = new Uint8Array(scaled.length);
  for (let i = 0; i < scaled.length; i++) {
    const v = Math.round(((scaled[i] - min) / range) * 255);
    out[i] = Math.max(0, Math.min(255, v));
  }
  return out;
}

/**
 * Quantise to 1 bit per dimension: is this dimension above the vector's mean?
 * 48 dims collapse to 6 bytes — a 32x reduction.
 */
export function quantizeToBinary(vector: Float32Array): Uint8Array {
  if (vector.length === 0) {
    throw new Error("Cannot quantise an empty feature vector");
  }

  const scaled = normaliseScale(vector);

  let sum = 0;
  for (let i = 0; i < scaled.length; i++) sum += scaled[i];
  const mean = sum / scaled.length;

  const bits = new Uint8Array(Math.ceil(scaled.length / 8));
  for (let i = 0; i < scaled.length; i++) {
    if (scaled[i] > mean) {
      bits[i >> 3] |= 1 << (i & 7);
    }
  }
  return bits;
}

/** Population count of a byte. */
function popcount8(byte: number): number {
  let n = byte;
  n = n - ((n >> 1) & 0x55);
  n = (n & 0x33) + ((n >> 2) & 0x33);
  return (n + (n >> 4)) & 0x0f;
}

/**
 * Number of differing bits between two binary-quantised vectors.
 * Lower means more similar; 0 means identical.
 */
export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Binary vectors must be the same length (got ${a.length} and ${b.length})`
    );
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    distance += popcount8(a[i] ^ b[i]);
  }
  return distance;
}

/**
 * Cosine similarity over the scale-normalised float vectors, in [-1, 1].
 *
 * More discriminating than Hamming distance because no information is thrown
 * away. The UI shows both: Hamming demonstrates that the compressed
 * representation still carries signal, cosine is the better matcher.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vectors must be the same length (got ${a.length} and ${b.length})`
    );
  }

  const x = normaliseScale(a);
  const y = normaliseScale(b);

  let dot = 0;
  let normX = 0;
  let normY = 0;
  for (let i = 0; i < x.length; i++) {
    dot += x[i] * y[i];
    normX += x[i] * x[i];
    normY += y[i] * y[i];
  }

  const magnitude = Math.sqrt(normX) * Math.sqrt(normY);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export interface ComparisonResult {
  /** Differing bits between the binary-quantised vectors. */
  hammingDistance: number;
  /** Total bits compared, so the distance can be read as a fraction. */
  totalBits: number;
  /** Hamming distance as a fraction of total bits, in [0, 1]. */
  normalisedHamming: number;
  /** Cosine similarity over the scale-normalised floats, in [-1, 1]. */
  cosineSimilarity: number;
}

/** Compute every comparison metric between an enrolled and a fresh capture. */
export function compareFeatures(
  enrolled: Float32Array,
  fresh: Float32Array
): ComparisonResult {
  const enrolledBits = quantizeToBinary(enrolled);
  const freshBits = quantizeToBinary(fresh);
  const distance = hammingDistance(enrolledBits, freshBits);
  const totalBits = enrolledBits.length * 8;

  return {
    hammingDistance: distance,
    totalBits,
    normalisedHamming: totalBits === 0 ? 0 : distance / totalBits,
    cosineSimilarity: cosineSimilarity(enrolled, fresh),
  };
}

export interface CompressionStats {
  originalBytes: number;
  int8Bytes: number;
  binaryBytes: number;
  int8Ratio: string;
  binaryRatio: string;
}

/** Compression figures for the given vector length, for display in the UI. */
export function getCompressionStats(
  dimensions: number = FEATURE_DIMS
): CompressionStats {
  const originalBytes = dimensions * 4; // float32
  const int8Bytes = dimensions;
  const binaryBytes = Math.ceil(dimensions / 8);

  return {
    originalBytes,
    int8Bytes,
    binaryBytes,
    int8Ratio: `${(originalBytes / int8Bytes).toFixed(1)}x`,
    binaryRatio: `${(originalBytes / binaryBytes).toFixed(1)}x`,
  };
}
