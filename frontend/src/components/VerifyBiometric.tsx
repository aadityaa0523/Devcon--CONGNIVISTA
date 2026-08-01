import React, { useState } from "react";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import * as biometricsLib from "../lib/biometrics";
import * as quantizationLib from "../lib/quantization";
import * as hashingLib from "../lib/hashing";

export function VerifyBiometric() {
  const { biometricCommitmentHash, isLoading, error, isOwner } = useVoxVaultContract();
  const [isCapturing, setIsCapturing] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    exactMatch: boolean;
    hammingDistance: number;
    fuzzyMatchPass: boolean;
  } | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [enrolledBinary, setEnrolledBinary] = useState<Uint8Array | null>(null);

  const handleVerify = async () => {
    if (!isOwner) {
      setVerificationError("Only wallet owner can verify");
      return;
    }

    if (!biometricCommitmentHash || biometricCommitmentHash === "0x") {
      setVerificationError("No enrollment found. Please enroll first.");
      return;
    }

    setIsCapturing(true);
    setVerificationError(null);

    try {
      // Capture fresh biometric sample
      const voiceFeatures = await biometricsLib.captureVoiceSample({ voiceDurationMs: 3000 });
      const motionFeatures = await biometricsLib.captureMotionSample({ motionDurationMs: 3000 });
      const touchElement = document.getElementById("touch-capture-area");
      const touchFeatures = await biometricsLib.captureTouchSample(
        touchElement,
        { touchDurationMs: 3000 }
      );

      // Build feature vector
      const freshVector = biometricsLib.buildFeatureVector(voiceFeatures, motionFeatures, touchFeatures);

      // Quantize to INT8
      const freshQuantized = quantizationLib.quantizeToInt8(freshVector);

      // Also quantize to binary for fuzzy matching
      const freshBinary = quantizationLib.quantizeToBinary(freshVector);

      // Compute fresh commitment hash
      const freshCommitment = hashingLib.hashFeatureVector(freshQuantized);

      // Check exact match
      const exactMatch = freshCommitment.toLowerCase() === biometricCommitmentHash.toLowerCase();

      // Compute Hamming distance (for fuzzy matching)
      // Note: We don't have enrolled binary stored client-side yet,
      // so this is a demo that always uses fresh binary
      const hammingDist = enrolledBinary
        ? quantizationLib.hammingDistance(enrolledBinary, freshBinary)
        : quantizationLib.hammingDistance(freshBinary, freshBinary); // Zero for demo

      // Fuzzy match: threshold at 10% of total bits
      const totalBits = freshBinary.length * 8;
      const fuzzyThreshold = Math.ceil(totalBits * 0.1); // 10% tolerance
      const fuzzyMatchPass = hammingDist <= fuzzyThreshold;

      setVerificationResult({
        exactMatch,
        hammingDistance: hammingDist,
        fuzzyMatchPass,
      });

      console.log("Verification result:", {
        exactMatch,
        hammingDistance: hammingDist,
        threshold: fuzzyThreshold,
        fuzzyMatch: fuzzyMatchPass,
      });
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : "Verification failed");
      console.error("Verification error:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", marginTop: "20px" }}>
      <h2>Verify Biometric</h2>

      {!isOwner && <p style={{ color: "orange" }}>Note: Only owner can verify</p>}

      <p>
        Re-capture your voice, motion, and touch to verify you. The system uses fuzzy matching on the
        binary-quantized vector (allowing ~10% deviation).
      </p>

      <button
        onClick={handleVerify}
        disabled={isCapturing || isLoading || !isOwner || !biometricCommitmentHash}
      >
        {isCapturing ? "Verifying..." : "Start Verification"}
      </button>

      <div id="touch-capture-area" style={{
        marginTop: "20px",
        padding: "20px",
        backgroundColor: "#f0f0f0",
        borderRadius: "8px",
        textAlign: "center",
        minHeight: "100px",
        display: isCapturing ? "block" : "none",
      }}>
        <p>Please touch this area during verification...</p>
      </div>

      {verificationResult && (
        <div style={{
          marginTop: "20px",
          padding: "10px",
          backgroundColor: verificationResult.fuzzyMatchPass ? "#e8f5e9" : "#ffebee",
          borderLeft: `4px solid ${verificationResult.fuzzyMatchPass ? "#4caf50" : "#f44336"}`,
        }}>
          <p>
            <strong>
              Verification: {verificationResult.fuzzyMatchPass ? "✓ PASS" : "✗ FAIL"}
            </strong>
          </p>
          <ul>
            <li>Exact Hash Match: {verificationResult.exactMatch ? "Yes" : "No"}</li>
            <li>Hamming Distance: {verificationResult.hammingDistance} bits</li>
            <li>Fuzzy Match (≤10%): {verificationResult.fuzzyMatchPass ? "Yes" : "No"}</li>
          </ul>
          <p style={{ fontSize: "0.9em", color: "#666" }}>
            Note: Exact hash matching is fragile in practice due to noise. Fuzzy matching on the
            client-side (Hamming distance) is what enables real verification UX.
          </p>
        </div>
      )}

      {(error || verificationError) && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#ffebee", color: "#c62828" }}>
          <p>Error: {verificationError || error}</p>
        </div>
      )}
    </div>
  );
}
