# VoxVault

A smart wallet you authorise with your voice. Audio is analysed in the browser and
never uploaded; only a 32-byte commitment reaches the chain.

Built for the Ethereum Build Sprint, NIT Trichy. **Sepolia testnet only.**

---

## What it actually does

1. **Enrol.** You say a short passphrase. The browser extracts a 48-dimensional
   feature vector from the audio, hashes it, and publishes only the hash.
2. **Verify.** You say it again. The new vector is compared against the stored one
   *in the browser*. A pass unlocks actions in the UI.
3. **Liveness challenge.** The contract issues a four-digit number. You must say
   it aloud along with your passphrase; the browser transcribes it and mixes it
   into the commitment. A recording made before the number existed cannot contain
   it, so a replayed sample fails.
4. **Session keys.** One passing verification registers a throwaway keypair
   on-chain with an expiry. Until it expires you can transact with no signing
   prompts at all.
5. **Social recovery.** Guardians are stored as `keccak256(address, salt)`, so
   adding one does not publish their address. A guardian can open a recovery; a
   timelock delays it; the owner can cancel in the meantime.

---

## Read this before you read the code

Three things about this project are weaker than the pitch might suggest. They are
design limits, not bugs, and pretending otherwise would be worse than saying so.

### The on-chain commitment does not gate anything

Two recordings of the same voice never produce the same feature vector, so their
hashes never match. Any `require(freshHash == storedHash)` would either always
revert, or "pass" only because the caller read the stored value — public chain
state — and handed it straight back, which authenticates nothing.

So **authorisation is enforced by ordinary ECDSA signatures**: `onlyOwner`, or an
unexpired session key. Voice matching happens in the browser and decides what the
UI is willing to attempt. What lands on-chain is a tamper-evident record that an
enrolment happened and that verification attempts were made.

An earlier revision did gate `cancelRecovery` on hash equality. That meant the
owner could never have stopped a malicious recovery. There is now a regression
test pinning the corrected behaviour.

The alternative — storing the quantised vector on-chain and computing Hamming
distance in Solidity — would make on-chain fuzzy matching genuinely work. It was
rejected: it publishes a replayable biometric template, which defeats the point.

### Guardian privacy is "hidden until they act", not anonymity

Storing `keccak256(address, salt)` keeps guardian addresses out of calldata and
storage. But the instant a guardian calls `requestRecovery`, their `msg.sender` is
on-chain forever. Real sender anonymity needs a relayer, which is out of scope.

### The liveness challenge is half enforced on-chain, half not

The contract genuinely enforces that a challenge is **single-use** and **expires
after five minutes** — answering twice reverts, and there are tests for both.
That is a real replay defence.

What it cannot enforce is that you *said* the number, or that the voice was
yours. There is no audio on-chain. Both checks happen in the browser and arrive
at the contract as claims recorded in the event log. So the challenge defeats a
**stale recording**; it does not defeat someone who can make you speak on demand,
and the randomness is `prevrandao`-derived, which a proposer can bias.

Also worth stating plainly: Chrome's `SpeechRecognition` **uploads audio to
Google** to transcribe. Only the challenge digits matter for that check, but it
is a genuine departure from "nothing leaves the device" and applies to this
feature alone — the feature extraction and matching remain entirely local.

### Voice matching quality is unproven, and the UI shows you why

Features are RMS energy, zero-crossing rate and spectral centroid — loudness,
roughly pitch, and brightness. That is a real signal, and far weaker than the MFCC
or speaker-embedding approaches production systems use. Whether it can separate
two people depends on the microphone and the room.

The UI therefore shows the raw Hamming distance and cosine similarity on every
attempt, with an adjustable threshold, instead of hiding behind a pass/fail badge.
**Measure it on your own hardware before believing any accept/reject claim.**

---

## Running it

Requires Node 20+ and a browser with MetaMask.

```bash
npm install
npm run compile -w contracts   # also copies the ABI into the frontend
npm run test -w contracts      # 29 tests
```

Deploy to Sepolia — put credentials in `contracts/.env` first (see
`.env.example`; a **burner key** is strongly advised):

```bash
npm run deploy -w contracts
```

This deploys two instances of identical bytecode:

| Instance | Session key | Recovery timelock | Purpose |
|---|---|---|---|
| `main` | 30 min | 48 hours | The real configuration |
| `demo` | 2 min | 3 min | So request → wait → execute can be shown live |

Addresses are written to `contracts/deployments/sepolia.json`. Put the one you
want in `frontend/.env.local`:

```bash
cp frontend/.env.example frontend/.env.local
# VITE_CONTRACT_ADDRESS=0x...
npm run dev -w frontend
```

The microphone requires a secure context — `localhost` works, a plain-HTTP LAN
address does not.

---

## How the voice pipeline works

`frontend/src/lib/biometrics.ts`, deterministic end to end — the same audio always
yields the same vector.

1. Record, downmix to mono, scale so the peak sample is 1.0. Without that
   normalisation the features track how far you sat from the microphone.
2. Split into 1024-sample frames at 50% overlap.
3. Drop frames below 12% of peak RMS, so statistics describe speech rather than
   the length of the surrounding silence.
4. Per frame compute RMS energy, zero-crossing rate, and spectral centroid over a
   hand-written radix-2 FFT.
5. Collapse each series, and its frame-to-frame difference, into 8 order
   statistics (mean, std, min, max, median, range, p25, p75).

3 features × 2 series × 8 statistics = **48 dimensions**.

Aggregating into order statistics is what makes this work at all: two readings of
the same phrase are never the same length or speed, so anything frame-aligned
would fail. Order statistics sidestep alignment entirely.

Dimensions live on very different scales — RMS is ~0–1, spectral centroid runs to
thousands of hertz — so `quantization.ts` applies fixed per-dimension divisors
before any quantisation or distance computation. Without that step, mean-threshold
binary quantisation is decided almost entirely by the centroid dimensions.

Compression: 48 float32 dims = 192 bytes → 48 bytes at INT8 → **6 bytes binary**.

---

## Layout

```
contracts/
  contracts/VoxVault.sol      ownership, commitment, session keys, recovery
  test/VoxVault.test.ts       29 tests
  scripts/deploy.ts           two-instance deploy + Etherscan verification
frontend/src/
  lib/biometrics.ts           capture, FFT, feature extraction
  lib/quantization.ts         scale normalisation, INT8/binary, distances
  lib/hashing.ts              SHA-256 commitments via ethers
  lib/sessionKey.ts           ephemeral keypair in sessionStorage
  lib/contract.ts             typed contract access, guardian commitments
  components/                 biometric, session key and recovery panels
```

---

## Testing

`npm run test -w contracts` covers session key expiry and revocation, recovery
timelock boundaries either side of the deadline via time travel, guardian salt
verification (right salt, wrong salt, non-guardian), and the `cancelRecovery`
regression described above.

There are no frontend tests. Given the time budget, contract correctness was
worth more than component coverage — the contract is what holds funds.

---

## What is unfinished

- **Motion and touch.** `DeviceMotionEvent` does not fire on desktop and touch
  events do not fire on trackpads, so on the demo machine both would have returned
  zeros. Cut rather than faked.
- **Multi-guardian thresholds.** `confirmRecovery` and `guardianThreshold` exist
  in the contract, but `guardianThreshold` is fixed at 1 and the UI does not
  expose M-of-N.
- **`_invalidateAllSessionKeys` is a no-op.** Invalidating every key on ownership
  change needs an enumerable set of active keys. Revoke manually for now.
- **Session key custody.** The private key sits in `sessionStorage`, readable by
  any XSS. Acceptable only because this is testnet with a small gas float.
- **No frontend tests**, and no false-accept/false-reject measurement across a
  population — only whatever you measure yourself with the threshold slider.

---

## Licence

MIT.
