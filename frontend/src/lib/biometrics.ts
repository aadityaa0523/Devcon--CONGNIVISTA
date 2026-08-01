/**
 * VoxVault — voice feature extraction.
 *
 * Voice only. `DeviceMotionEvent` does not fire on desktops and touch events do
 * not fire on trackpads, so motion and touch are not part of the working path;
 * see README for why that scope call was made.
 *
 * Everything here is DETERMINISTIC. The same audio in always produces the same
 * vector out — there is no randomness anywhere in this file. That property is
 * what makes enrolment and verification comparable at all.
 *
 * Pipeline:
 *   record → downmix to mono → peak-normalise → trim silence (VAD)
 *   → split into overlapping frames
 *   → per frame: RMS energy, zero-crossing rate, spectral centroid
 *   → aggregate each series (and its frame-to-frame delta) into 8 order statistics
 *   → 3 features x 2 series x 8 stats = 48 dimensions
 *
 * Aggregation is alignment-free on purpose: two recordings of the same phrase are
 * never the same length or speed, so any frame-by-frame comparison would fail.
 * Order statistics over the whole utterance sidestep alignment entirely.
 */

// ============ Tunable constants ============

/** Frame length in samples. At 16 kHz this is 64 ms. */
export const FRAME_SIZE = 1024;
/** Frame advance in samples — 50% overlap. */
export const HOP_SIZE = 512;
/** Frames quieter than this fraction of peak RMS are treated as silence. */
export const VAD_THRESHOLD = 0.12;
/** Dimensionality of the emitted feature vector. */
export const FEATURE_DIMS = 48;

const STATS_PER_SERIES = 8;

// ============ Public types ============

export interface RecordedAudio {
  samples: Float32Array;
  sampleRate: number;
}

export interface VoiceCaptureResult {
  features: Float32Array;
  sampleRate: number;
  /** Frames surviving the silence gate. Very low values mean a bad capture. */
  voicedFrameCount: number;
  durationSeconds: number;
}

export class VoiceCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceCaptureError";
  }
}

// ============ FFT (iterative radix-2 Cooley-Tukey, in-place) ============

/**
 * In-place complex FFT. `re`/`im` must both have the same power-of-two length.
 */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Periodic Hann window, cached per length. */
const hannCache = new Map<number, Float64Array>();
function hannWindow(length: number): Float64Array {
  const cached = hannCache.get(length);
  if (cached) return cached;
  const w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / length));
  }
  hannCache.set(length, w);
  return w;
}

// ============ Per-frame features ============

/** Root-mean-square energy — loudness of the frame. */
export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

/**
 * Zero-crossing rate — how often the waveform changes sign. Correlates loosely
 * with pitch and strongly separates voiced from unvoiced (fricative) sounds.
 */
export function frameZcr(frame: Float32Array): number {
  if (frame.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (frame.length - 1);
}

/**
 * Spectral centroid in Hz — the "centre of mass" of the magnitude spectrum,
 * perceptually the brightness of the sound.
 */
export function frameSpectralCentroid(
  frame: Float32Array,
  sampleRate: number
): number {
  const n = frame.length;
  const window = hannWindow(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = frame[i] * window[i];
  }

  fft(re, im);

  // Only the first half of the spectrum is meaningful for a real input signal.
  const bins = n / 2;
  let weighted = 0;
  let total = 0;
  for (let k = 0; k < bins; k++) {
    const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    const frequency = (k * sampleRate) / n;
    weighted += frequency * magnitude;
    total += magnitude;
  }

  return total === 0 ? 0 : weighted / total;
}

// ============ Statistics ============

/** Linear-interpolated quantile over an already-sorted array. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Collapse a variable-length series into 8 fixed order statistics:
 * mean, population std, min, max, median, range, p25, p75.
 */
export function stats8(values: number[]): number[] {
  if (values.length === 0) {
    return new Array(STATS_PER_SERIES).fill(0);
  }

  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;

  let variance = 0;
  for (const v of values) variance += (v - mean) * (v - mean);
  variance /= values.length;

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return [
    mean,
    Math.sqrt(variance),
    min,
    max,
    quantileSorted(sorted, 0.5),
    max - min,
    quantileSorted(sorted, 0.25),
    quantileSorted(sorted, 0.75),
  ];
}

/** Frame-to-frame first difference — captures how the feature moves over time. */
function deltas(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] - values[i - 1]);
  }
  return out;
}

// ============ Signal conditioning ============

/** Average multi-channel audio down to a single channel. */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / channels;
    }
  }
  return mono;
}

/**
 * Scale so the loudest sample sits at 1.0. Without this, features track how far
 * you sat from the microphone rather than how you sound.
 */
export function peakNormalise(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] / peak;
  }
  return out;
}

/** Split into overlapping frames, discarding any trailing partial frame. */
export function frameSignal(samples: Float32Array): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    frames.push(samples.subarray(start, start + FRAME_SIZE));
  }
  return frames;
}

// ============ Feature extraction ============

/**
 * Turn raw audio into the 48-dimensional feature vector.
 *
 * Pure and synchronous — feed it the same samples twice and you get byte-identical
 * output, which is what the unit tests rely on.
 */
export function extractVoiceFeatures(
  samples: Float32Array,
  sampleRate: number
): { features: Float32Array; voicedFrameCount: number } {
  const normalised = peakNormalise(samples);
  const frames = frameSignal(normalised);

  if (frames.length === 0) {
    throw new VoiceCaptureError(
      "Recording too short to analyse — speak for at least one second."
    );
  }

  // Energy gate: drop frames that are essentially room tone, so the statistics
  // describe speech rather than the length of the surrounding silence.
  const rmsAll = frames.map(frameRms);
  const peakRms = Math.max(...rmsAll);
  const gate = peakRms * VAD_THRESHOLD;

  const rms: number[] = [];
  const zcr: number[] = [];
  const centroid: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    if (rmsAll[i] < gate) continue;
    rms.push(rmsAll[i]);
    zcr.push(frameZcr(frames[i]));
    centroid.push(frameSpectralCentroid(frames[i], sampleRate));
  }

  if (rms.length < 4) {
    throw new VoiceCaptureError(
      "Almost no speech detected. Check the microphone and speak louder."
    );
  }

  // 3 base series + their 3 delta series, 8 stats each = 48.
  const features = Float32Array.from([
    ...stats8(rms),
    ...stats8(zcr),
    ...stats8(centroid),
    ...stats8(deltas(rms)),
    ...stats8(deltas(zcr)),
    ...stats8(deltas(centroid)),
  ]);

  if (features.length !== FEATURE_DIMS) {
    throw new VoiceCaptureError(
      `Internal error: expected ${FEATURE_DIMS} dims, produced ${features.length}`
    );
  }

  return { features, voicedFrameCount: rms.length };
}

// ============ Recording ============

/**
 * Record from the default microphone for `durationMs` and decode to raw PCM.
 *
 * Requires a secure context (https or localhost) and a user gesture.
 */
export async function recordAudio(durationMs: number): Promise<RecordedAudio> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new VoiceCaptureError(
      "Microphone access unavailable. This page must be served over https or localhost."
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new VoiceCaptureError(
      `Microphone permission denied or no input device found (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  try {
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () =>
        reject(new VoiceCaptureError("Recording failed unexpectedly."));
    });

    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    recorder.stop();
    await finished;

    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    const arrayBuffer = await blob.arrayBuffer();

    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      return {
        samples: downmixToMono(decoded),
        sampleRate: decoded.sampleRate,
      };
    } finally {
      await audioContext.close();
    }
  } finally {
    // Always release the microphone, so the browser's recording indicator clears
    // even when extraction throws.
    stream.getTracks().forEach((track) => track.stop());
  }
}

/**
 * Record and extract in one step — the entry point the UI calls.
 */
export async function captureVoiceSample(
  durationMs = 3000
): Promise<VoiceCaptureResult> {
  const { samples, sampleRate } = await recordAudio(durationMs);
  const { features, voicedFrameCount } = extractVoiceFeatures(
    samples,
    sampleRate
  );
  return {
    features,
    sampleRate,
    voicedFrameCount,
    durationSeconds: samples.length / sampleRate,
  };
}
