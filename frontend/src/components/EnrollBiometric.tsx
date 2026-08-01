import React, { useState } from "react";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import * as biometricsLib from "../lib/biometrics";
import * as quantizationLib from "../lib/quantization";
import * as hashingLib from "../lib/hashing";

export function EnrollBiometric() {
  const { registerBiometric, isLoading, error, isOwner } = useVoxVaultContract();
  const [isCapturing, setIsCapturing] = useState(false);
  const [enrollmentHash, setEnrollmentHash] = useState<string | null>(null);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<any>(null);

  const handleEnroll = async () => {
    if (!isOwner) {
      setEnrollmentError("Only wallet owner can enroll");
      return;
    }

    setIsCapturing(true);
    setEnrollmentError(null);

    try {
      // Capture voice, motion, touch
      const voiceFeatures = await biometricsLib.captureVoiceSample({ voiceDurationMs: 3000 });
      const motionFeatures = await biometricsLib.captureMotionSample({ motionDurationMs: 3000 });
      const touchElement = document.getElementById("touch-capture-area");
      const touchFeatures = await biometricsLib.captureTouchSample(
        touchElement,
        { touchDurationMs: 3000 }
      );

      // Build 308-dim feature vector
      const featureVector = biometricsLib.buildFeatureVector(voiceFeatures, motionFeatures, touchFeatures);

      // Quantize to INT8
      const quantized = quantizationLib.quantizeToInt8(featureVector);

      // Compute SHA-256 commitment hash
      const commitment = hashingLib.hashFeatureVector(quantized);

      // Show compression stats
      const stats = quantizationLib.getCompressionStats(featureVector);
      setCompressionStats(stats);

      // Register biometric on-chain
      const tx = await registerBiometric(commitment);
      if (tx) {
        setEnrollmentHash(commitment);
        console.log("Enrollment successful, tx:", tx.hash);
      }
    } catch (err) {
      setEnrollmentError(err instanceof Error ? err.message : "Enrollment failed");
      console.error("Enrollment error:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px" }}>
      <h2>Enroll Biometric</h2>

      {!isOwner && <p style={{ color: "orange" }}>Note: Only owner can enroll</p>}

      <p>
        This will capture your voice, motion, and touch for ~3 seconds each. Your data never leaves
        your device—only a SHA-256 commitment hash is stored on-chain.
      </p>

      <button onClick={handleEnroll} disabled={isCapturing || isLoading || !isOwner}>
        {isCapturing ? "Capturing..." : "Start Enrollment"}
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
        <p>Please touch this area during enrollment...</p>
      </div>

      {enrollmentHash && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#e8f5e9" }}>
          <p><strong>Enrollment Successful!</strong></p>
          <p>Commitment Hash: <code>{enrollmentHash.substring(0, 20)}...</code></p>
          {compressionStats && (
            <details>
              <summary>Compression Stats</summary>
              <ul>
                <li>Original: {compressionStats.originalBytes} bytes</li>
                <li>INT8 Quantized: {compressionStats.int8Bytes} bytes ({compressionStats.int8Ratio} reduction)</li>
                <li>Binary Quantized: {compressionStats.binaryBytes} bytes ({compressionStats.binaryRatio} reduction)</li>
              </ul>
            </details>
          )}
        </div>
      )}

      {(error || enrollmentError) && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#ffebee", color: "#c62828" }}>
          <p>Error: {enrollmentError || error}</p>
        </div>
      )}
    </div>
  );
}
