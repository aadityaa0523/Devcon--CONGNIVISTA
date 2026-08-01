import { useCallback, useEffect, useState } from "react";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import { useBiometrics } from "../hooks/BiometricContext";
import { captureVoiceWithChallenge, VoiceCaptureError } from "../lib/biometrics";
import { compareFeatures, type ComparisonResult } from "../lib/quantization";
import { commitmentFromFeaturesAndChallenge } from "../lib/hashing";
import { isSpeechRecognitionSupported } from "../lib/speech";
import { CountdownRing } from "./CountdownRing";
import { describeTxError } from "../lib/errors";

interface Outcome {
  comparison: ComparisonResult;
  voiceMatched: boolean;
  challengeMatched: boolean;
  transcript: string;
  commitment: string;
  challenge: string;
  transcriptionAvailable: boolean;
}

/**
 * Liveness challenge — the anti-replay feature.
 *
 * The contract issues a four-digit number the owner must speak aloud with their
 * passphrase. A recording made before the number was issued cannot contain it,
 * so a captured sample cannot answer a fresh challenge.
 */
export function ChallengePanel() {
  const { challenge, isOwner, isConnected, send, refresh } =
    useVoxVaultContract();
  const { enrolment, hasEnrolment, threshold } = useBiometrics();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => window.clearInterval(id);
  }, []);

  const speechSupported = isSpeechRecognitionSupported();
  const active = challenge?.isActive ?? false;
  const secondsLeft = challenge?.expiresAt
    ? Number(challenge.expiresAt) - now
    : 0;

  const issue = useCallback(async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setStatus("Requesting a challenge from the contract…");
    try {
      await send((c) => c.issueChallenge());
      setStatus(null);
    } catch (err) {
      setError(describeTxError(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [send]);

  const answer = useCallback(async () => {
    if (!challenge || !enrolment) return;
    const target = challenge.challenge.toString();

    setBusy(true);
    setError(null);
    setStatus(`Recording — say your passphrase, then "${spaced(target)}"`);
    try {
      const capture = await captureVoiceWithChallenge(target, 5000);
      const enrolled = Float32Array.from(enrolment.features);
      const comparison = compareFeatures(enrolled, capture.features);
      const voiceMatched = comparison.normalisedHamming <= threshold;
      const commitment = commitmentFromFeaturesAndChallenge(
        capture.features,
        target
      );

      setOutcome({
        comparison,
        voiceMatched,
        challengeMatched: capture.challengeMatched,
        transcript: capture.transcript,
        commitment,
        challenge: target,
        transcriptionAvailable: capture.transcriptionAvailable,
      });

      setStatus("Consuming the challenge on-chain…");
      await send((c) =>
        c.answerChallenge(
          challenge.challenge,
          commitment,
          voiceMatched,
          capture.challengeMatched
        )
      );
      setStatus("Challenge consumed — it cannot be answered again.");
      await refresh();
    } catch (err) {
      setError(
        err instanceof VoiceCaptureError ? err.message : describeTxError(err)
      );
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [challenge, enrolment, refresh, send, threshold]);

  const bothPassed =
    outcome?.voiceMatched === true && outcome?.challengeMatched === true;

  return (
    <section className="panel panel--challenge">
      <div className="eyebrow">
        <span className={busy ? "dot live" : "dot"} />
        Liveness challenge
      </div>
      <h2>Speak the number</h2>
      <p>
        The contract issues a number you must say out loud. A recording captured
        before the number existed cannot contain it, so a replayed sample fails.
        The number is also mixed into the commitment, making each answer unique.
      </p>

      {!speechSupported && (
        <p className="notice warn">
          This browser has no Web Speech API, so the spoken number cannot be
          checked. Use Chrome or Edge for this feature.
        </p>
      )}

      {!hasEnrolment && (
        <p className="notice warn">Enrol a voice sample first.</p>
      )}

      {active && challenge ? (
        <div className="challenge-stage">
          <p className="hint" style={{ margin: 0 }}>
            Say your passphrase, then:
          </p>
          <div className="challenge-digits">
            {challenge.challenge.toString()}
          </div>
          <p className="challenge-say">
            "{spaced(challenge.challenge.toString())}"
          </p>
          <div style={{ display: "grid", placeItems: "center", margin: "14px 0" }}>
            <CountdownRing
              remaining={Math.max(0, secondsLeft)}
              total={300}
              label={secondsLeft > 0 ? formatDuration(secondsLeft) : "expired"}
              colour="var(--cyan)"
              size={84}
            />
          </div>
          <button
            onClick={answer}
            disabled={busy || !hasEnrolment || secondsLeft <= 0}
          >
            {busy ? "Listening…" : "Answer challenge (5s)"}
          </button>
        </div>
      ) : (
        <button onClick={issue} disabled={busy || !isConnected || !isOwner}>
          {busy ? "Working…" : "Request a challenge"}
        </button>
      )}

      {outcome && (
        <div className={`verdict ${bothPassed ? "pass" : "fail"}`}>
          <p className="verdict-title">
            {bothPassed ? "Live speaker verified" : "Challenge failed"}
          </p>
          <ul className="checklist">
            <li>
              {outcome.voiceMatched ? "✓" : "✗"} Voice matches enrolment —{" "}
              {(outcome.comparison.normalisedHamming * 100).toFixed(1)}% of bits
              differ
            </li>
            <li>
              {outcome.challengeMatched ? "✓" : "✗"} Spoke the number{" "}
              {outcome.challenge}
              {!outcome.transcriptionAvailable && " (transcription unavailable)"}
            </li>
          </ul>
          {outcome.transcript && (
            <p className="hint" style={{ marginTop: 10 }}>
              Heard: <em>"{outcome.transcript}"</em>
            </p>
          )}
          <p className="hint" style={{ margin: 0 }}>
            Commitment <code>{outcome.commitment.slice(0, 18)}…</code> — bound to
            challenge {outcome.challenge}, so the same audio answering a different
            challenge produces an entirely different hash.
          </p>
        </div>
      )}

      {status && <p className="hint">{status}</p>}
      {error && <p className="notice error">{error}</p>}

      <details>
        <summary>What this does and does not prove</summary>
        <p className="hint">
          The contract enforces that a challenge is <strong>single-use</strong>{" "}
          and expires after five minutes — answer it twice and the second call
          reverts. It cannot verify that you said the number or that the voice was
          yours; both are checked in the browser and recorded in the event log as
          claims. Note also that Chrome's speech recognition uploads audio to
          Google to transcribe, unlike the rest of the pipeline which stays local.
        </p>
      </details>
    </section>
  );
}

/** "4829" -> "4 8 2 9", so it is read digit by digit rather than as a quantity. */
function spaced(digits: string): string {
  return digits.split("").join(" ");
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
