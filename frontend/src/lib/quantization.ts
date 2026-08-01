/**
 * Quantization utilities for feature vector compression
 * Reduces 308-dim float32 vector to INT8 (4x) or binary (32x) for on-chain efficiency
 */

/**
 * Quantize a Float32Array to INT8 using min-max scaling
 * @param vector - 308-dimensional feature vector (Float32Array)
 * @returns Uint8Array of same length with values in [0, 255]
 */
export function quantizeToInt8(vector: Float32Array): Uint8Array {
  if (vector.length === 0) {
    throw new Error("Empty feature vector");
  }

  const min = Math.min(...vector);
  const max = Math.max(...vector);
  const range = max - min === 0 ? 1 : max - min; // Avoid division by zero

  const quantized = new Uint8Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    // Scale to [0, 255]
    const scaled = ((vector[i] - min) / range) * 255;
    quantized[i] = Math.round(Math.max(0, Math.min(255, scaled)));
  }

  return quantized;
}

/**
 * Quantize a Float32Array to binary (1-bit per dimension) using mean thresholding
 * @param vector - 308-dimensional feature vector (Float32Array)
 * @returns Uint8Array where each bit represents whether the dimension is above mean (39 bytes for 308 dims)
 */
export function quantizeToBinary(vector: Float32Array): Uint8Array {
  if (vector.length === 0) {
    throw new Error("Empty feature vector");
  }

  const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
  const byteCount = Math.ceil(vector.length / 8);
  const bits = new Uint8Array(byteCount);

  for (let i = 0; i < vector.length; i++) {
    if (vector[i] > mean) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      bits[byteIndex] |= 1 << bitIndex;
    }
  }

  return bits;
}

/**
 * Compute Hamming distance between two binary-quantized vectors
 * Used for client-side fuzzy matching before on-chain verification
 * @param binary1 - First binary-quantized vector
 * @param binary2 - Second binary-quantized vector
 * @returns Number of differing bits
 */
export function hammingDistance(binary1: Uint8Array, binary2: Uint8Array): number {
  if (binary1.length !== binary2.length) {
    throw new Error("Binary vectors must be same length");
  }

  let distance = 0;
  for (let i = 0; i < binary1.length; i++) {
    const xor = binary1[i] ^ binary2[i];
    // Count set bits using Brian Kernighan's algorithm
    for (let bit = 0; bit < 8; bit++) {
      if ((xor & (1 << bit)) !== 0) {
        distance++;
      }
    }
  }

  return distance;
}

/**
 * Compute cosine similarity between two float32 vectors (for comparison/testing)
 * Returns similarity in [0, 1] where 1 is perfect match
 */
export function cosineSimilarity(vec1: Float32Array, vec2: Float32Array): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must be same length");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Get compression statistics for a feature vector
 */
export function getCompressionStats(original: Float32Array): {
  originalBytes: number;
  int8Bytes: number;
  binaryBytes: number;
  int8Ratio: string;
  binaryRatio: string;
} {
  const originalBytes = original.length * 4; // Float32 = 4 bytes
  const int8Bytes = original.length; // Uint8 = 1 byte
  const binaryBytes = Math.ceil(original.length / 8);

  return {
    originalBytes,
    int8Bytes,
    binaryBytes,
    int8Ratio: `${(originalBytes / int8Bytes).toFixed(1)}x`,
    binaryRatio: `${(originalBytes / binaryBytes).toFixed(1)}x`,
  };
}
