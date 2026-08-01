import { useCallback, useEffect, useState } from "react";
import {
  captureVoiceSample,
  FEATURE_DIMS,
  VoiceCaptureError,
} from "../lib/biometrics";
import { compareFeatures, type ComparisonResult } from "../lib/quantization";
import { commitmentFromFeatures } from "../lib/hashing";

/**
 * Enrolment lives in localStorage and never leaves the device — that is the whole
 * privacy premise. Only the SHA-256 commitment is ever sent to the chain.
 */
const ENROLMENT_KEY = "voxvault_enrolment_v1";
const THRESHOLD_KEY = "voxvault_threshold_v1";

/**
 * Default accept threshold, as a fraction of differing bits.
 *
 * Deliberately a starting point, not a tuned value. Real separation between
 * speakers has to be measured on the actual demo hardware and microphone before
 * any accept/reject claim is credible — the UI exposes a slider for exactly that.
 */
export const DEFAULT_THRESHOLD = 0.25;

export interface Enrolment {
  features: number[];
  commitment: string;
  enrolledAt: number;
}

export interface VerificationOutcome {
  comparison: ComparisonResult;
  commitment: string;
  passed: boolean;
  voicedFrameCount: number;
}

function loadEnrolment(): Enrolment | null {
  try {
    const raw = window.localStorage.getItem(ENROLMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Enrolment;
    if (!Array.isArray(parsed.features) || parsed.features.length !== FEATURE_DIMS) {
      // Stored under an older feature layout — treat as absent.
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useBiometricCapture() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<VerificationOutcome | null>(null);
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);

  useEffect(() => {
    setEnrolment(loadEnrolment());
    const stored = window.localStorage.getItem(THRESHOLD_KEY);
    if (stored) {
      const parsed = Number.parseFloat(stored);
      if (Number.isFinite(parsed)) setThresholdState(parsed);
    }
  }, []);

  const setThreshold = useCallback((value: number) => {
    setThresholdState(value);
    window.localStorage.setItem(THRESHOLD_KEY, String(value));
  }, []);

  const describeError = (err: unknown): string => {
    if (err instanceof VoiceCaptureError) return err.message;
    return err instanceof Error ? err.message : String(err);
  };

  /** Record a sample and store it as the reference for future comparisons. */
  const enrol = useCallback(
    async (durationMs = 3000): Promise<{ commitment: string } | null> => {
      setIsCapturing(true);
      setError(null);
      setStatus("Recording — say your passphrase now");
      try {
        const result = await captureVoiceSample(durationMs);
        const commitment = commitmentFromFeatures(result.features);

        const record: Enrolment = {
          features: Array.from(result.features),
          commitment,
          enrolledAt: Date.now(),
        };
        window.localStorage.setItem(ENROLMENT_KEY, JSON.stringify(record));
        setEnrolment(record);
        setLastOutcome(null);
        setStatus(
          `Enrolled from ${result.voicedFrameCount} voiced frames of ${result.durationSeconds.toFixed(1)}s audio`
        );
        return { commitment };
      } catch (err) {
        setError(describeError(err));
        setStatus(null);
        return null;
      } finally {
        setIsCapturing(false);
      }
    },
    []
  );

  /** Record a fresh sample and compare it against the stored enrolment. */
  const verify = useCallback(
    async (durationMs = 3000): Promise<VerificationOutcome | null> => {
      const stored = loadEnrolment();
      if (!stored) {
        setError("Nothing enrolled yet on this device.");
        return null;
      }

      setIsCapturing(true);
      setError(null);
      setStatus("Recording — say the same passphrase");
      try {
        const result = await captureVoiceSample(durationMs);
        const enrolled = Float32Array.from(stored.features);
        const comparison = compareFeatures(enrolled, result.features);

        const outcome: VerificationOutcome = {
          comparison,
          commitment: commitmentFromFeatures(result.features),
          passed: comparison.normalisedHamming <= threshold,
          voicedFrameCount: result.voicedFrameCount,
        };

        setLastOutcome(outcome);
        setStatus(null);
        return outcome;
      } catch (err) {
        setError(describeError(err));
        setStatus(null);
        return null;
      } finally {
        setIsCapturing(false);
      }
    },
    [threshold]
  );

  const clearEnrolment = useCallback(() => {
    window.localStorage.removeItem(ENROLMENT_KEY);
    setEnrolment(null);
    setLastOutcome(null);
    setStatus(null);
  }, []);

  return {
    enrolment,
    hasEnrolment: enrolment !== null,
    isCapturing,
    status,
    error,
    lastOutcome,
    threshold,
    setThreshold,
    enrol,
    verify,
    clearEnrolment,
  };
}
