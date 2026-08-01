import { useState } from "react";
import { useBiometricCapture } from "../hooks/useBiometricCapture";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import { getCompressionStats } from "../lib/quantization";
import { FEATURE_DIMS } from "../lib/biometrics";

const compression = getCompressionStats(FEATURE_DIMS);

/**
 * Enrolment, verification, and the threshold measurement tooling.
 *
 * The threshold slider and the raw distance readout are deliberately visible
 * rather than hidden behind a pass/fail badge: whether this thing can actually
 * tell two speakers apart is an empirical question about the microphone and the
 * room, and the honest thing is to show the numbers it is deciding on.
 */
export function BiometricPanel() {
  const {
    hasEnrolment,
    enrolment,
    isCapturing,
    status,
    error,
    lastOutcome,
    threshold,
    setThreshold,
    enrol,
    verify,
    clearEnrolment,
  } = useBiometricCapture();

  const { isOwner, isConnected, send } = useVoxVaultContract();
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const handleEnrol = async () => {
    setTxError(null);
    setTxStatus(null);
    const result = await enrol();
    if (!result) return;

    if (!isConnected || !isOwner) {
      setTxStatus(
        "Enrolled locally. Connect as the contract owner to publish the commitment."
      );
      return;
    }

    try {
      setTxStatus("Publishing commitment…");
      const receipt = await send((c) => c.registerBiometric(result.commitment));
      setTxStatus(`Commitment published in block ${receipt?.blockNumber}`);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
      setTxStatus(null);
    }
  };

  const handleVerify = async () => {
    setTxError(null);
    setTxStatus(null);
    const outcome = await verify();
    if (!outcome) return;

    if (!isConnected || !isOwner) return;

    try {
      setTxStatus("Recording the attempt on-chain…");
      const receipt = await send((c) =>
        c.recordVerificationAttempt(outcome.commitment, outcome.passed)
      );
      setTxStatus(`Attempt logged in block ${receipt?.blockNumber}`);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
      setTxStatus(null);
    }
  };

  return (
    <section style={panel}>
      <h2>Voice biometric</h2>
      <p style={muted}>
        Say the same short passphrase each time. Audio is analysed in this tab and
        never uploaded — only a SHA-256 commitment goes on-chain.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={handleEnrol} disabled={isCapturing}>
          {hasEnrolment ? "Re-enrol" : "Enrol"}
        </button>
        <button onClick={handleVerify} disabled={isCapturing || !hasEnrolment}>
          Verify
        </button>
        {hasEnrolment && (
          <button onClick={clearEnrolment} disabled={isCapturing}>
            Clear enrolment
          </button>
        )}
      </div>

      {isCapturing && <p style={{ fontWeight: 600 }}>● {status ?? "Recording…"}</p>}
      {!isCapturing && status && <p style={muted}>{status}</p>}

      {hasEnrolment && enrolment && (
        <p style={muted}>
          Enrolled {new Date(enrolment.enrolledAt).toLocaleTimeString()} ·{" "}
          {FEATURE_DIMS} dims · commitment <code>{short(enrolment.commitment)}</code>
        </p>
      )}

      <fieldset style={box}>
        <legend>Accept threshold</legend>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={threshold}
          onChange={(e) => setThreshold(Number.parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <p style={muted}>
          Accept when under <strong>{(threshold * 100).toFixed(0)}%</strong> of bits
          differ. This value is a starting guess, not a tuned one — record yourself
          a few times, then have someone else try, and set it between the two
          clusters. If they overlap, these features cannot separate you and the
          honest thing is to say so.
        </p>
      </fieldset>

      {lastOutcome && (
        <div
          style={{
            ...box,
            borderLeft: `4px solid ${lastOutcome.passed ? "#2e7d32" : "#c62828"}`,
          }}
        >
          <p style={{ fontWeight: 600, margin: 0 }}>
            {lastOutcome.passed ? "Match" : "No match"}
          </p>
          <table style={{ borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              <Row
                label="Hamming distance"
                value={`${lastOutcome.comparison.hammingDistance} / ${lastOutcome.comparison.totalBits} bits`}
              />
              <Row
                label="Differing"
                value={`${(lastOutcome.comparison.normalisedHamming * 100).toFixed(1)}%`}
              />
              <Row
                label="Cosine similarity"
                value={lastOutcome.comparison.cosineSimilarity.toFixed(4)}
              />
              <Row
                label="Voiced frames"
                value={String(lastOutcome.voicedFrameCount)}
              />
            </tbody>
          </table>
          <p style={muted}>
            Cosine similarity is computed on the full-precision vector and
            discriminates better than Hamming distance; Hamming is shown because it
            is what survives the 32x compression.
          </p>
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary>Compression</summary>
        <p style={muted}>
          {FEATURE_DIMS} float32 dims = {compression.originalBytes} bytes →{" "}
          {compression.int8Bytes} bytes at INT8 ({compression.int8Ratio}) →{" "}
          {compression.binaryBytes} bytes binary ({compression.binaryRatio}). The
          on-chain commitment is a 32-byte hash regardless; the compression matters
          for what the hash is taken over and for the client-side comparison.
        </p>
      </details>

      {txStatus && <p style={muted}>{txStatus}</p>}
      {(error || txError) && <p style={errorText}>{error ?? txError}</p>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ paddingRight: 16, color: "#555" }}>{label}</td>
      <td style={{ fontFamily: "monospace" }}>{value}</td>
    </tr>
  );
}

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

const panel: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const box: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: 12,
  marginTop: 12,
};

const muted: React.CSSProperties = { color: "#666", fontSize: "0.9em" };
const errorText: React.CSSProperties = { color: "#c62828" };
