# Liveness Challenge

The anti-replay feature. The contract issues a four-digit number; you must say it aloud with your passphrase.

A recording captured *before* the number existed cannot contain it, so a stale sample cannot answer. The number is also mixed into the [[Biometric Commitment]], so the same audio answering two different challenges produces unrelated hashes.

**What the chain genuinely enforces:** the challenge is single-use and expires after five minutes. Answer twice and the second call reverts, because the challenge is cleared before the event is emitted. There are tests for both.

**What it cannot enforce:** that you said the number, or that the voice was yours. Both are browser-side claims recorded in the event log — consistent with [[Trust Model]]. Randomness is `prevrandao`-derived and a proposer can bias it; that is acceptable because predicting the number alone buys nothing.

Transcription uses the [[Web Speech API]].

Related: [[VoxVault Contract]], [[Known Limitations]]
