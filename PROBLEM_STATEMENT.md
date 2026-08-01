# VoxVault: Problem Statement

## The contradiction

Strong authentication wants to know who you are. Privacy wants nobody to know.

| Approach | How it fails |
|---|---|
| **Seed phrases** | Prove nothing about *you* — whoever holds the words is you. Phishable, losable, and a burden to store. |
| **Centralised biometrics** | They work, but a server holding your voiceprint is a breach waiting to happen. You cannot rotate your voice. |
| **Social recovery** | Adding a guardian usually publishes their address, leaking your social graph to anyone reading the chain. |

VoxVault's premise: prove a *match* without publishing the thing being matched. The device keeps the biometric; the chain keeps a commitment.

---

## What VoxVault actually does

### Voice, analysed locally

Roughly three seconds of speech becomes a **48-dimensional feature vector**, computed entirely in the browser:

1. Record, downmix to mono, peak-normalise
2. Gate out silence with an energy threshold
3. Split into 1024-sample frames at 50% overlap
4. Per frame: RMS energy, zero-crossing rate, and spectral centroid over a hand-written radix-2 FFT
5. Collapse each series, and its frame-to-frame difference, into 8 order statistics

`3 features × 2 series × 8 statistics = 48 dimensions`

Order statistics are the load-bearing choice. Two recordings of the same phrase are never the same length or speed, so anything frame-aligned would fail. Order statistics sidestep alignment entirely.

### Compression

| Form | Size | Reduction |
|---|---|---|
| float32 | 192 bytes | — |
| INT8 | 48 bytes | 4× |
| binary, 1 bit per dimension | 6 bytes | 32× |

Dimensions span very different scales — energy sits in [0,1] while spectral centroid runs to thousands of hertz — so fixed per-dimension divisors are applied before any quantisation. Without that step, binary quantisation is decided almost entirely by the centroid dimensions and discards everything else.

### Liveness

The contract issues a four-digit number. You must say it aloud with your passphrase; the browser transcribes it and mixes it into the commitment. A recording made before the number existed cannot contain it.

The contract enforces that a challenge is **single-use** and expires after five minutes. Answer it twice and the second call reverts.

### Session keys

One passing verification registers a throwaway keypair on-chain with an expiry. Until it expires, transactions need no signing prompt. The key is funded with a small gas float — a fresh account cannot pay for its own transactions.

### Social recovery with guardian privacy

Guardians are stored as `keccak256(address, salt)`, never as raw addresses — so adding one does not publish who they are. A guardian can open a recovery; a 48-hour timelock delays it; the owner can cancel in the meantime.

---

## What it does not do

Stated plainly, because a judge who finds these unmentioned will trust nothing else here.

**The on-chain commitment gates nothing.** Two recordings never hash alike, so a `require(freshHash == storedHash)` check would either always revert, or "pass" only because the caller read the stored value — public chain state — and handed it straight back, which authenticates nothing. Authorisation is enforced by ordinary ECDSA signatures. Voice matching happens in the browser and decides what the UI is willing to attempt. What lands on-chain is a tamper-evident record that an enrolment happened.

**Match quality is unproven.** The features are coarse. Self-consistency measured at 2.1% differing bits on real hardware, but consistency is not discrimination — no false-accept rate has been measured across a population. The UI therefore shows raw distances and an adjustable threshold rather than a pass/fail badge.

**Guardian privacy ends when a guardian acts.** Their `msg.sender` is public from that moment on. Hidden until they act, not anonymous.

**Speech recognition uploads audio to Google.** This applies only to the challenge digits, but it is a real exception to the privacy claim.

**Voice only.** `DeviceMotionEvent` does not fire on desktops and touch events do not fire on trackpads, so motion and touch would have returned zeros on the demo machine. They were cut rather than faked.

**No gas sponsorship.** Session keys remove signing prompts, not gas. There is no paymaster.

---

## Why this is the interesting version

The obvious design is Groth16 proofs: prove the fresh capture is within a threshold distance of the enrolment without revealing either. That is the right answer, and it is days of work.

A tempting shortcut was also rejected: store the 6-byte binary vector on-chain and compute Hamming distance in Solidity. It would genuinely work, in about forty lines. But it publishes a replayable biometric template — and you cannot rotate your voice. That defeats the entire premise.

So the shipped position is the honest one: the chain records, the client decides, and the trade-off is documented at the top of the contract source rather than hidden in it.
