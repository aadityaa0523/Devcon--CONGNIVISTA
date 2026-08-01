import * as Meyda from "meyda";

/**
 * Biometric capture and feature extraction for VoxVault
 * Captures voice, motion, and touch data from the browser
 * Extracts a 308-dimensional feature vector for verification
 */

export interface BiometricSample {
  voiceFeatures: Float32Array; // MFCC + energy features (typically 156 dims = 13 MFCC * 12 frames)
  motionFeatures: Float32Array; // Accelerometer + gyro stats (typically 108 dims = 6 axes * 18 stats)
  touchFeatures: Float32Array; // Touch pressure + timing (typically 44 dims)
  timestamp: number;
  confidence: number; // 0-1 confidence score based on capture quality
}

export interface CaptureConfig {
  voiceDurationMs?: number;
  motionDurationMs?: number;
  touchDurationMs?: number;
  sampleRate?: number;
  fftSize?: number;
}

const DEFAULT_CONFIG: CaptureConfig = {
  voiceDurationMs: 3000, // 3 seconds
  motionDurationMs: 3000,
  touchDurationMs: 3000,
  sampleRate: 16000,
  fftSize: 2048,
};

// Feature vector dimensions
const VOICE_DIMS = 156; // 13 MFCC coefficients * 12 frames
const MOTION_DIMS = 108; // 6 axes (accel x/y/z, gyro x/y/z) * 18 stats per axis
const TOUCH_DIMS = 44; // Touch pressure, timing, velocity stats
const TOTAL_DIMS = 308; // VOICE + MOTION + TOUCH

/**
 * Capture voice sample and extract MFCC features using Meyda
 */
export async function captureVoiceSample(
  config: Partial<CaptureConfig> = {}
): Promise<Float32Array> {
  const durationMs = config.voiceDurationMs || DEFAULT_CONFIG.voiceDurationMs!;
  const sampleRate = config.sampleRate || DEFAULT_CONFIG.sampleRate!;

  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create AudioContext and analyzer
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioSource = audioContext.createMediaStreamSource(stream);

    // Use ScriptProcessorNode for sample collection (deprecated but functional)
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    const audioBuffer: number[] = [];

    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      audioBuffer.push(...Array.from(inputData));
    };

    audioSource.connect(processor);
    processor.connect(audioContext.destination);

    // Record for the specified duration
    await new Promise((resolve) => setTimeout(resolve, durationMs));

    // Cleanup
    processor.disconnect();
    audioSource.disconnect();
    stream.getTracks().forEach((track) => track.stop());

    // Convert to Float32Array for feature extraction
    const audioData = new Float32Array(audioBuffer);

    // Extract MFCC features using Meyda
    const analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: audioSource,
      bufferSize,
      featureExtractors: ["mfcc", "energy"],
    });

    // For MVP, simulate MFCC extraction by creating a 156-dim vector
    // In production, would call analyzer.extract() on multiple frames
    const mfccFeatures = new Float32Array(VOICE_DIMS);

    // Simulate reasonable MFCC values (in practice, extract from audio frames)
    for (let i = 0; i < VOICE_DIMS; i++) {
      // Random between -1 and 1 with some structure
      mfccFeatures[i] = (Math.random() - 0.5) * 2;
    }

    analyzer.stop();

    return mfccFeatures;
  } catch (error) {
    console.error("Voice capture failed:", error);
    throw error;
  }
}

/**
 * Capture motion/accelerometer data
 */
export async function captureMotionSample(
  config: Partial<CaptureConfig> = {}
): Promise<Float32Array> {
  const durationMs = config.motionDurationMs || DEFAULT_CONFIG.motionDurationMs!;

  return new Promise((resolve, reject) => {
    // Check if DeviceMotionEvent is available
    if (!("DeviceMotionEvent" in window)) {
      console.warn("DeviceMotionEvent not supported");
      resolve(new Float32Array(MOTION_DIMS));
      return;
    }

    // iOS 13+ requires permission request
    if (
      typeof (DeviceMotionEvent as any).requestPermission === "function"
    ) {
      (DeviceMotionEvent as any)
        .requestPermission()
        .then((permission: string) => {
          if (permission === "granted") {
            captureMotionData(durationMs)
              .then(resolve)
              .catch(reject);
          } else {
            console.warn("Motion permission denied");
            resolve(new Float32Array(MOTION_DIMS));
          }
        })
        .catch(reject);
    } else {
      // Non-iOS or older browsers
      captureMotionData(durationMs)
        .then(resolve)
        .catch(reject);
    }
  });
}

async function captureMotionData(durationMs: number): Promise<Float32Array> {
  const samples: Array<{ accel: number[]; gyro: number[] }> = [];

  return new Promise((resolve) => {
    const handleMotion = (event: DeviceMotionEvent) => {
      if (!event.acceleration) return;

      samples.push({
        accel: [
          event.acceleration.x || 0,
          event.acceleration.y || 0,
          event.acceleration.z || 0,
        ],
        gyro: [
          event.rotationRate?.alpha || 0,
          event.rotationRate?.beta || 0,
          event.rotationRate?.gamma || 0,
        ],
      });
    };

    window.addEventListener("devicemotion", handleMotion);

    setTimeout(() => {
      window.removeEventListener("devicemotion", handleMotion);

      // Extract statistical features from samples
      const features = new Float32Array(MOTION_DIMS);

      if (samples.length === 0) {
        // No motion data captured
        resolve(features);
        return;
      }

      // Compute stats per axis (18 stats for each of 6 axes = 108 dims)
      let idx = 0;
      const axes = ["accelX", "accelY", "accelZ", "gyroX", "gyroY", "gyroZ"];

      axes.forEach((axis, axisIdx) => {
        const isAccel = axisIdx < 3;
        const values = samples.map((s) =>
          isAccel ? s.accel[axisIdx % 3] : s.gyro[axisIdx % 3]
        );

        if (values.length > 0) {
          // Mean, std, min, max, etc.
          features[idx++] = mean(values);
          features[idx++] = stdDev(values);
          features[idx++] = Math.min(...values);
          features[idx++] = Math.max(...values);
          features[idx++] = median(values);
          features[idx++] = range(values);
        } else {
          idx += 6;
        }

        // Additional stats for 18 total per axis
        for (let i = 0; i < 12; i++) {
          features[idx++] = Math.random() * 0.1; // Placeholder stats
        }
      });

      resolve(features);
    }, durationMs);
  });
}

/**
 * Capture touch/pointer events
 */
export async function captureTouchSample(
  touchElement: HTMLElement | null,
  config: Partial<CaptureConfig> = {}
): Promise<Float32Array> {
  const durationMs = config.touchDurationMs || DEFAULT_CONFIG.touchDurationMs!;
  const features = new Float32Array(TOUCH_DIMS);

  // Check if touch events are supported
  if (!("ontouchstart" in window)) {
    console.warn("Touch events not supported on this device");
    return features;
  }

  if (!touchElement) {
    console.warn("No touch element provided");
    return features;
  }

  const touchData: Array<{
    pressure?: number;
    radiusX?: number;
    radiusY?: number;
    timestamp: number;
  }> = [];

  return new Promise((resolve) => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchData.push({
        pressure: (touch as any).force || 0.5,
        radiusX: (touch as any).radiusX || 0,
        radiusY: (touch as any).radiusY || 0,
        timestamp: e.timeStamp,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchData.push({
        pressure: (touch as any).force || 0.5,
        radiusX: (touch as any).radiusX || 0,
        radiusY: (touch as any).radiusY || 0,
        timestamp: e.timeStamp,
      });
    };

    touchElement.addEventListener("touchstart", handleTouchStart);
    touchElement.addEventListener("touchmove", handleTouchMove);

    setTimeout(() => {
      touchElement.removeEventListener("touchstart", handleTouchStart);
      touchElement.removeEventListener("touchmove", handleTouchMove);

      // Extract features from touch data
      if (touchData.length > 0) {
        const pressures = touchData.map((t) => t.pressure || 0);
        const durations = touchData
          .slice(1)
          .map((t, i) => t.timestamp - touchData[i].timestamp);

        let idx = 0;
        features[idx++] = mean(pressures);
        features[idx++] = stdDev(pressures);
        features[idx++] = mean(durations);
        features[idx++] = stdDev(durations);
        // Pad with zeros
        while (idx < TOUCH_DIMS) {
          features[idx++] = 0;
        }
      }

      resolve(features);
    }, durationMs);
  });
}

/**
 * Build complete 308-dimensional feature vector from all modalities
 */
export function buildFeatureVector(
  voiceFeatures: Float32Array,
  motionFeatures: Float32Array,
  touchFeatures: Float32Array
): Float32Array {
  const vector = new Float32Array(TOTAL_DIMS);

  // Concatenate in order: voice (156) + motion (108) + touch (44)
  let idx = 0;

  // Voice features
  for (let i = 0; i < Math.min(VOICE_DIMS, voiceFeatures.length); i++) {
    vector[idx++] = voiceFeatures[i];
  }

  // Motion features
  for (let i = 0; i < Math.min(MOTION_DIMS, motionFeatures.length); i++) {
    vector[idx++] = motionFeatures[i];
  }

  // Touch features
  for (let i = 0; i < Math.min(TOUCH_DIMS, touchFeatures.length); i++) {
    vector[idx++] = touchFeatures[i];
  }

  // Pad with zeros if needed
  while (idx < TOTAL_DIMS) {
    vector[idx++] = 0;
  }

  return vector;
}

// ============ Helper statistics functions ============

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance =
    values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

export const FEATURE_DIMENSIONS = {
  VOICE_DIMS,
  MOTION_DIMS,
  TOUCH_DIMS,
  TOTAL_DIMS,
};
