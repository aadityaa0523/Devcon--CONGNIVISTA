# VoxVault

**Prove it's you. Reveal nothing.**

A smart wallet you authorise with your voice. Audio is analysed in the browser and
never uploaded; only a 32-byte commitment reaches the chain.

Built for the Ethereum Build Sprint, NIT Trichy. **Sepolia testnet only.**

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Track: Privacy & Security](https://img.shields.io/badge/track-Privacy%20%26%20Security-8b5cf6.svg)](#track-privacy--security)
[![Network: Sepolia](https://img.shields.io/badge/network-Sepolia-627EEA.svg)](https://sepolia.etherscan.io/address/0xEaAcab7C3A8771651987FAa0142E1Cef59BFF62B#code)
[![Contract tests: 37](https://img.shields.io/badge/contract%20tests-37-brightgreen.svg)](contracts/test/VoxVault.test.ts)

## Team

<!-- TODO: replace with real names and roll numbers before submitting -->
| Name | Roll number |
|---|---|
| _(pending)_ | _(pending)_ |

## Deployed contracts (Sepolia, both verified)

| Instance | Address | Config |
|---|---|---|
| main | [`0xEaAcab7C3A8771651987FAa0142E1Cef59BFF62B`](https://sepolia.etherscan.io/address/0xEaAcab7C3A8771651987FAa0142E1Cef59BFF62B#code) | 30-min sessions, 48h timelock |
| demo | [`0x4e93fAEE4D9A5eFa0a53C21c40e1Cb0605308a29`](https://sepolia.etherscan.io/address/0x4e93fAEE4D9A5eFa0a53C21c40e1Cb0605308a29#code) | 2-min sessions, 3-min timelock |

Further reading: [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md) ·
[DEMO_PITCH_SCRIPT.md](DEMO_PITCH_SCRIPT.md) · [vault/](vault/) (Obsidian graph of
the design reasoning)

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

## Track: Privacy & Security

The project exists to answer one question — *can you authenticate with a biometric
without anyone, including the chain, ever holding that biometric?* Everything else
in the build follows from it.

**Nothing but a hash leaves the device.** Capture, feature extraction, quantisation
and matching all run in the browser. The 48-dimensional vector is never
transmitted, and the 32-byte SHA-256 commitment it hashes to does not invert back
into it.

**We rejected the design that would have looked stronger on-chain.** Storing the
6-byte binary vector and computing Hamming distance in Solidity would make on-chain
fuzzy matching genuinely work, in about forty lines. It also publishes a replayable
biometric template — and unlike a password, you cannot rotate your voice. Rejected
deliberately, and the reasoning is a comment at the top of the contract rather than
buried in a commit message.

**Guardian addresses stay out of storage and calldata**, held as salted hashes, so
building a recovery set does not leak your social graph to anyone reading the chain.

**The replay defence is real and enforced in Solidity.** Challenge single-use and
five-minute expiry are contract-side, with tests either side of both boundaries —
not asserted in a README.

And the security posture is stated rather than implied. The section immediately
below exists because a privacy claim you cannot poke holes in yourself is not worth
making — every place where the guarantee is weaker than the pitch is written down,
including the one where audio *does* leave the device.

---

## Read this before you read the code

Four things about this project are weaker than the pitch might suggest. They are
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

Self-consistency measured at **2.1% differing bits** on real hardware — but
consistency is not discrimination, and no false-accept rate has been measured
across a population. The UI therefore shows the raw Hamming distance and cosine
similarity on every attempt, with an adjustable threshold, instead of hiding behind
a pass/fail badge. **Measure it on your own hardware before believing any
accept/reject claim.**

---

## Running it

Requires **Node 20+** and a browser with MetaMask. Chrome or Edge — Firefox has no
Web Speech API, so the liveness challenge will not transcribe.

```bash
git clone https://github.com/aadityaa0523/Devcon--CONGNIVISTA.git
cd Devcon--CONGNIVISTA
npm install

npm run compile -w contracts   # also copies the ABI into the frontend
npm run test -w contracts      # 37 tests
```

### Fastest path — point at the deployment above

```bash
cp frontend/.env.example frontend/.env.local
# VITE_CONTRACT_ADDRESS=0xEaAcab7C3A8771651987FAa0142E1Cef59BFF62B
npm run dev -w frontend
```

Open `http://localhost:5173`. You can enrol, verify and watch the distance metrics
against any deployment — that path is entirely local and needs no wallet at all.
The on-chain writes (`registerBiometric`, session keys, guardians) are `onlyOwner`,
so to exercise those, deploy your own instance below.

The microphone requires a secure context — `localhost` works, a plain-HTTP LAN
address does not.

### Deploying your own

Put credentials in `contracts/.env` first — a **burner key** is strongly advised:

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0x...          # burner. never a key holding real funds.
ETHERSCAN_API_KEY=...      # optional, for source verification
```

```bash
npm run deploy -w contracts
```

This deploys two instances of identical bytecode:

| Instance | Session key | Recovery timelock | Purpose |
|---|---|---|---|
| `main` | 30 min | 48 hours | The real configuration |
| `demo` | 2 min | 3 min | So request → wait → execute can be shown live |

Addresses are written to `contracts/deployments/sepolia.json`. Put the one you
want in `frontend/.env.local`, then fund the vault from the UI
(**Fund vault 0.01 ETH**) before trying session-key transfers — the vault spends
its own balance. Free Sepolia ETH:
[Alchemy faucet](https://www.alchemy.com/faucets/ethereum-sepolia).

Demonstrating recovery needs a **second funded Sepolia account** for the guardian
role, since `requestRecovery` hashes `msg.sender`.

---

## The design, as a graph

Every non-obvious decision has a note in [`vault/`](vault/) — 32 of them, densely
cross-linked, written as the build happened. Every limitation above has one
explaining what it costs.

![The VoxVault vault as a linked graph](docs/obsidian-graph.png)

GitHub cannot run Obsidian's live graph, so the same structure is rendered natively
below. This one is interactive in the GitHub viewer:

```mermaid
graph LR
    IDX(["VoxVault Index"])

    subgraph Problem["The problem"]
        PP["Privacy Paradox"]
        TM["Trust Model"]
    end

    subgraph Pipeline["Voice pipeline"]
        DP["Deterministic Pipeline"]
        VFE["Voice Feature Extraction"]
        RMS["RMS Energy"]
        ZCR["Zero Crossing Rate"]
        SC["Spectral Centroid"]
        FFT["FFT Implementation"]
        OSA["Order Statistics"]
        VAD["Voice Activity Detection"]
    end

    subgraph Matching["Compression and matching"]
        Q["Quantisation"]
        SN["Scale Normalisation"]
        HD["Hamming Distance"]
        CS["Cosine Similarity"]
        TT["Threshold Tuning"]
    end

    subgraph Chain["On-chain"]
        VC["VoxVault Contract"]
        BC["Biometric Commitment"]
        LC["Liveness Challenge"]
        SK["Session Keys"]
        SR["Social Recovery"]
        GP["Guardian Privacy"]
        RT["Recovery Timelock"]
    end

    subgraph Decisions["Decisions and limits"]
        ZK["Why Not ZK Proofs"]
        WVO["Why Voice Only"]
        WCG["Why The Commitment<br/>Gates Nothing"]
        KL["Known Limitations"]
    end

    IDX --> PP
    IDX --> DP
    IDX --> Q
    IDX --> VC
    IDX --> ZK

    PP --> TM
    TM --> WCG

    DP --> VFE
    VFE --> RMS
    VFE --> ZCR
    VFE --> SC
    SC --> FFT
    VFE --> OSA
    VFE --> VAD

    VFE --> Q
    Q --> SN
    Q --> HD
    Q --> CS
    HD --> TT
    CS --> TT

    VC --> BC
    VC --> LC
    VC --> SK
    VC --> SR
    SR --> GP
    SR --> RT

    BC --> WCG
    WCG --> KL
    ZK --> KL
    WVO --> KL
    TT --> KL

    classDef limit fill:#3b1f24,stroke:#c05a6a,color:#f4d4da
    class WCG,KL,ZK limit
```

To browse it properly, open `vault/` as an Obsidian vault — the `[[wikilinks]]`
resolve there and the graph becomes navigable. GitHub renders the notes as plain
Markdown, so those links show as literal text.

**Regenerating the image:** Obsidian → graph view → screenshot → save as
`docs/obsidian-graph.png`. It is a static export by necessity; GitHub Markdown
cannot execute the live graph, which is why the Mermaid version exists alongside it.

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

| Form | Size | Reduction |
|---|---|---|
| float32 | 192 bytes | — |
| INT8 | 48 bytes | 4× |
| binary, 1 bit per dimension | **6 bytes** | **32×** |

---

## Layout

```
contracts/
  contracts/VoxVault.sol      ownership, commitment, session keys, recovery
  test/VoxVault.test.ts       37 tests
  scripts/deploy.ts           two-instance deploy + Etherscan verification
frontend/src/
  lib/biometrics.ts           capture, FFT, feature extraction
  lib/quantization.ts         scale normalisation, INT8/binary, distances
  lib/hashing.ts              SHA-256 commitments via ethers
  lib/sessionKey.ts           ephemeral keypair in sessionStorage
  lib/speech.ts               Web Speech API transcription for the challenge
  lib/contract.ts             typed contract access, guardian commitments
  components/                 biometric, challenge, session key, recovery panels
vault/                        32 linked design notes (open as an Obsidian vault)
```

---

## Testing

`npm run test -w contracts` — 37 tests covering session key expiry and revocation, recovery
timelock boundaries either side of the deadline via time travel, guardian salt
verification (right salt, wrong salt, non-guardian), the liveness challenge
(single-use consumption, stale challenge values, expiry, and logging of failed
attempts), and the `cancelRecovery` regression described above.

There are no frontend tests. Given the time budget, contract correctness was
worth more than component coverage — the contract is what holds funds.

---

## What is broken or unfinished

| | Status |
|---|---|
| **Motion and touch biometrics** | **Cut.** `DeviceMotionEvent` does not fire on desktop and touch events do not fire on trackpads, so on the demo machine both would have returned zeros. Cut rather than faked — the "multi-modal" framing in early planning docs did not survive contact with the hardware. |
| **Multi-guardian thresholds** | **Partial.** `confirmRecovery` and `guardianThreshold` exist in the contract and are tested, but `guardianThreshold` is hardcoded to 1 in the constructor and the UI does not expose M-of-N. |
| **`_invalidateAllSessionKeys`** | **A no-op.** Invalidating every key on ownership change needs an enumerable set of active keys. Revoke manually via `revokeSessionKey` for now. |
| **Session key custody** | **Weak by design.** The private key sits in `sessionStorage`, readable by any XSS. Acceptable only because this is testnet with a ~0.003 ETH gas float. |
| **Gas sponsorship** | **Absent.** Session keys remove signing prompts, not gas. There is no paymaster and no ERC-4337 bundler — this is a plain contract wallet, not a full AA account. |
| **Frontend tests** | **None.** See above; the contract is what holds funds. |
| **Accuracy measurement** | **Not done.** No false-accept/false-reject rates across a population — only whatever you measure yourself with the threshold slider. |
| **Zero-knowledge proofs** | **Not attempted.** A Groth16 circuit proving "the fresh capture is within threshold distance of the enrolment" would fix the first limitation in this README, and most of the others follow from it. Days of work, not hours. |

---

## Licence

MIT — see [LICENSE](LICENSE).
