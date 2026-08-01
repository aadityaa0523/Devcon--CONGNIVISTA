import { useState } from "react";
import { useBiometrics } from "../hooks/BiometricContext";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import { getCompressionStats } from "../lib/quantization";
import { FEATURE_DIMS } from "../lib/biometrics";
import { FeatureHeatmap } from "./FeatureHeatmap";
import { describeTxError } from "../lib/errors";

const compression = getCompressionStats(FEATURE_DIMS);

/**
 * Enrolment, verification, and the threshold measurement tooling.
 *
 * The threshold slider and raw distance readout are deliberately visible rather
 * than hidden behind a pass/fail badge: whether this can actually tell two
 * speakers apart is an empirical question about the microphone and the room, and
 * the honest thing is to show the numbers it is deciding on.
 */
export function BiometricPanel() {
  const {
    hasEnrolment,
    enrolment,
    isCapturing,
    status,
    error,
    lastOutcome,
    lastVector,
    threshold,
    setThreshold,
    enrol,
    verify,
    clearEnrolment,
  } = useBiometrics();

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
      setTxError(describeTxError(err));
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
      setTxError(describeTxError(err));
      setTxStatus(null);
    }
  };

  return (
    <section className="panel panel--voice">
      <div className="eyebrow">
        <span className={isCapturing ? "dot live" : "dot"} />
        Voice biometric
      </div>
      <h2>Enrol and verify</h2>
      <p>
        Say the same short passphrase each time. Audio is analysed in this tab and
        never uploaded — only a SHA-256 commitment goes on-chain.
      </p>

      <div className="row">
        <button onClick={handleEnrol} disabled={isCapturing}>
          {hasEnrolment ? "Re-enrol" : "Enrol"}
        </button>
        <button
          className="ghost"
          onClick={handleVerify}
          disabled={isCapturing || !hasEnrolment}
        >
          Verify
        </button>
        {hasEnrolment && (
          <button className="ghost" onClick={clearEnrolment} disabled={isCapturing}>
            Clear
          </button>
        )}
      </div>

      {isCapturing && (
        <p className="notice info">● {status ?? "Recording…"}</p>
      )}
      {!isCapturing && status && <p className="hint">{status}</p>}

      {hasEnrolment && enrolment && (
        <p className="hint">
          Enrolled {new Date(enrolment.enrolledAt).toLocaleTimeString()} ·{" "}
          {FEATURE_DIMS} dims · <code>{short(enrolment.commitment)}</code>
        </p>
      )}

      {lastVector && (
        <FeatureHeatmap features={lastVector} label="Feature vector" />
      )}

      {lastOutcome && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Hamming distance</div>
              <div className="stat-value accent">
                {lastOutcome.comparison.hammingDistance} /{" "}
                {lastOutcome.comparison.totalBits} bits
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Differing</div>
              <div className="stat-value">
                {(lastOutcome.comparison.normalisedHamming * 100).toFixed(1)}%
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Cosine similarity</div>
              <div className="stat-value accent">
                {lastOutcome.comparison.cosineSimilarity.toFixed(4)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Voiced frames</div>
              <div className="stat-value">{lastOutcome.voicedFrameCount}</div>
            </div>
          </div>

          <div className={`verdict ${lastOutcome.passed ? "pass" : "fail"}`}>
            <p className="verdict-title">
              {lastOutcome.passed ? "Match" : "No match"}
            </p>
            <p className="hint" style={{ margin: 0 }}>
              Cosine similarity is computed on the full-precision vector and
              discriminates better than Hamming distance; Hamming is shown because
              it is what survives the 32x compression.
            </p>
          </div>
        </>
      )}

      <fieldset>
        <legend>Accept threshold</legend>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={threshold}
          onChange={(e) => setThreshold(Number.parseFloat(e.target.value))}
        />
        <p className="hint" style={{ marginTop: 10 }}>
          Accept when under <strong>{(threshold * 100).toFixed(0)}%</strong> of
          bits differ. A starting guess, not a tuned value — record yourself a few
          times, then have someone else try, and set it between the two clusters.
          If they overlap, these features cannot separate you and the honest thing
          is to say so.
        </p>
      </fieldset>

      <details>
        <summary>Compression</summary>
        <p className="hint">
          {FEATURE_DIMS} float32 dims = {compression.originalBytes} bytes →{" "}
          {compression.int8Bytes} bytes at INT8 ({compression.int8Ratio}) →{" "}
          {compression.binaryBytes} bytes binary ({compression.binaryRatio}). The
          on-chain commitment is a 32-byte hash regardless; the compression
          matters for what the hash is taken over and for the client-side
          comparison.
        </p>
      </details>

      {txStatus && <p className="hint">{txStatus}</p>}
      {(error || txError) && (
        <p className="notice error">{error ?? txError}</p>
      )}
    </section>
  );
}

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
