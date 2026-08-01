/**
 * Spoken-challenge transcription.
 *
 * The contract issues a four-digit number; the user must say it aloud along with
 * their passphrase. This module transcribes what was said and decides whether the
 * number is present.
 *
 * Uses the Web Speech API, which is free and built into the browser but is
 * Chromium-only in practice — Firefox does not implement it. Callers must handle
 * `isSpeechRecognitionSupported() === false` rather than assuming a transcript.
 *
 * NOTE ON PRIVACY: unlike the rest of the pipeline, Chrome's SpeechRecognition
 * sends audio to Google for transcription. Only the challenge digits matter here,
 * never the passphrase itself — but it is a real departure from "nothing leaves
 * the device" and is disclosed in the UI and README rather than glossed over.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  length: number;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

// ---------------------------------------------------------------------------
// Turning spoken words into digits
// ---------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, o: 0, nought: 0,
  one: 1, won: 1,
  two: 2, to: 2, too: 2,
  three: 3, tree: 3,
  four: 4, for: 4, fore: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8, ate: 8,
  nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Reduce a transcript to the digit string it represents.
 *
 * Handles the three ways people read a number aloud, and the three ways the
 * recogniser reports them:
 *   "4829"                        -> "4829"
 *   "four eight two nine"         -> "4829"
 *   "forty eight twenty nine"     -> "4829"
 *
 * Compound forms like "forty eight" become "48" by adding the following unit to
 * the tens value, which is why the tens branch looks ahead one token.
 */
export function transcriptToDigits(transcript: string): string {
  const tokens = transcript
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let digits = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (/^\d+$/.test(token)) {
      digits += token;
      continue;
    }
    if (token in UNITS) {
      digits += String(UNITS[token]);
      continue;
    }
    if (token in TEENS) {
      digits += String(TEENS[token]);
      continue;
    }
    if (token in TENS) {
      const next = tokens[i + 1];
      if (next && next in UNITS && UNITS[next] !== 0) {
        digits += String(TENS[token] + UNITS[next]);
        i++; // the unit has been consumed by the tens value
      } else {
        digits += String(TENS[token]);
      }
      continue;
    }
    if (token === "hundred" || token === "thousand" || token === "and") {
      continue; // filler in "four thousand eight hundred and twenty nine"
    }
  }

  return digits;
}

/** True when the challenge digits appear anywhere in what was said. */
export function transcriptContainsChallenge(
  transcript: string,
  challenge: number | string
): boolean {
  const target = String(challenge);
  const spoken = transcriptToDigits(transcript);
  return spoken.includes(target);
}

// ---------------------------------------------------------------------------
// Live transcription
// ---------------------------------------------------------------------------

export interface TranscriptionHandle {
  /** Stop listening and return everything heard. */
  stop: () => Promise<string>;
}

/**
 * Begin transcribing immediately, returning a handle that resolves with the full
 * transcript when stopped.
 *
 * Errors are swallowed into an empty transcript rather than thrown: a failed
 * transcription must degrade to "challenge not confirmed", never take down the
 * voice capture running alongside it.
 */
export function startTranscription(): TranscriptionHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return { stop: async () => "" };
  }

  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let transcript = "";
  let ended = false;
  let resolveEnd: (() => void) | null = null;

  recognition.onresult = (event) => {
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      // Keep every alternative: the recogniser often puts the digits in a
      // lower-ranked reading, especially for strings of single numbers.
      for (let j = 0; j < result.length; j++) {
        const alt = (result as unknown as Record<number, SpeechRecognitionAlternativeLike>)[j];
        if (alt?.transcript) transcript += " " + alt.transcript;
      }
    }
  };

  recognition.onerror = () => {
    // no-op: absence of a transcript is handled by the caller
  };

  recognition.onend = () => {
    ended = true;
    resolveEnd?.();
  };

  try {
    recognition.start();
  } catch {
    return { stop: async () => "" };
  }

  return {
    stop: async () => {
      if (!ended) {
        const finished = new Promise<void>((resolve) => {
          resolveEnd = resolve;
          // Do not hang the capture flow if onend never fires.
          setTimeout(resolve, 1500);
        });
        try {
          recognition.stop();
        } catch {
          /* already stopped */
        }
        await finished;
      }
      return transcript.trim();
    },
  };
}
